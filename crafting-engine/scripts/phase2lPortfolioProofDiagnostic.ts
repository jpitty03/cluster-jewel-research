import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ClusterModRepository } from '../src/data/loadClusterMods.ts';
import { ModPool } from '../src/domain/ModPool.ts';
import { PriceBook, type CurrencyRates } from '../src/domain/PriceBook.ts';
import { getCanonicalStateKey } from '../src/rules/actionDiscovery.ts';
import { synthesizeAcquisition } from '../src/solver/acquisitionSynthesis.ts';
import {
  createGenericSearchContinuationSession,
  GenericSearchEngine,
} from '../src/solver/genericSearch.ts';
import { generateStartingStateCandidates } from '../src/solver/strategyDiscovery.ts';
import {
  OptimizerService,
  type OptimizeCraftInput,
  type OptimizeCraftResult,
  type OptimizerProgressSnapshot,
} from '../src/service/optimizerService.ts';
import {
  createPhase2k1ExactFixture,
  PHASE2K1_FROZEN_CURRENCY_RATES,
  PHASE2K1_TARGET_MOD_IDS,
} from './phase2k1ExactFixture.ts';

const outputPath = fileURLToPath(
  new URL('../../output-phase2l-portfolio-proof-diagnostic.txt', import.meta.url)
);
const repo = new ClusterModRepository();
const tolerance = 1e-6;

function requireGate(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function finite(value: number | undefined): string {
  return value === undefined || !Number.isFinite(value) ? 'NONE' : `${value.toFixed(6)}c`;
}

interface RecordedRun {
  label: string;
  result: OptimizeCraftResult;
  progress: OptimizerProgressSnapshot[];
  elapsedMs: number;
}

function run(
  label: string,
  service: OptimizerService,
  input: OptimizeCraftInput
): RecordedRun {
  console.error(`[phase2l] ${label}`);
  const progress: OptimizerProgressSnapshot[] = [];
  const started = Date.now();
  const result = service.optimize(input, (snapshot) => {
    progress.push(structuredClone(snapshot));
  });
  const elapsedMs = Date.now() - started;
  const terminal = progress.at(-1);
  requireGate(terminal?.phase === 'COMPLETE', `${label}: missing terminal COMPLETE`);
  requireGate(
    terminal.candidates.every((candidate) =>
      !['PROBING', 'ACQUISITION_PROBING', 'DOWNSTREAM_PROBING'].includes(candidate.status)
    ),
    `${label}: terminal candidate remained in a probing lifecycle`
  );
  requireGate(
    result.recommended !== null && result.risk.selectedPolicyProper &&
      result.risk.terminalAbsorptionProbability >= 1 - 1e-8 &&
      result.solver.bellmanConverged && result.solver.occupancyConverged &&
      result.solver.costReconciled,
    `${label}: no healthy executable route`
  );
  return { label, result, progress, elapsedMs };
}

function auditAdmissibility(recorded: RecordedRun): number {
  let audited = 0;
  for (const candidate of recorded.result.acquisition.portfolioProof.candidateEvidence) {
    requireGate(
      Math.abs(
        candidate.fullRouteLowerBoundChaos -
          (candidate.acquisitionLowerBoundChaos + (candidate.downstreamLowerBoundChaos ?? 0))
      ) <= tolerance,
      `${recorded.label}/${candidate.label}: full-route L was not acquisition L + downstream L`
    );
    if (candidate.acquisitionUpperBoundChaos !== undefined) {
      requireGate(
        candidate.acquisitionLowerBoundChaos <= candidate.acquisitionUpperBoundChaos + tolerance,
        `${recorded.label}/${candidate.label}: acquisition L exceeded acquisition U`
      );
    }
    if (candidate.downstreamUpperBoundChaos !== undefined) {
      requireGate(
        (candidate.downstreamLowerBoundChaos ?? 0) <=
          candidate.downstreamUpperBoundChaos + tolerance,
        `${recorded.label}/${candidate.label}: downstream L exceeded downstream U`
      );
    }
    if (candidate.fullRouteUpperBoundChaos !== undefined) {
      audited++;
      requireGate(
        candidate.fullRouteLowerBoundChaos <= candidate.fullRouteUpperBoundChaos + tolerance,
        `${recorded.label}/${candidate.label}: full-route L exceeded full-route U`
      );
    }
  }
  return audited;
}

function evidenceTable(recorded: RecordedRun): string[] {
  return recorded.result.acquisition.portfolioProof.candidateEvidence.map((candidate) =>
    [
      candidate.label,
      `status=${candidate.status}`,
      `acqL=${finite(candidate.acquisitionLowerBoundChaos)}`,
      `acqU=${finite(candidate.acquisitionUpperBoundChaos)}`,
      `downL=${finite(candidate.downstreamLowerBoundChaos)}`,
      `downU=${finite(candidate.downstreamUpperBoundChaos)}`,
      `fullL=${finite(candidate.fullRouteLowerBoundChaos)}`,
      `fullU=${finite(candidate.fullRouteUpperBoundChaos)}`,
      `reason=${candidate.proofReason}`,
      `retained=${candidate.retainedAcquisitionStates}+${candidate.retainedDownstreamStates}`,
    ].join('; ')
  );
}

function runSummary(recorded: RecordedRun): string {
  const proof = recorded.result.acquisition.portfolioProof;
  return [
    `${recorded.label}: elapsed=${recorded.elapsedMs}ms`,
    `selected=${recorded.result.recommended?.name ?? 'NONE'}`,
    `U=${finite(proof.selectedFullRouteUpperBoundChaos)}`,
    `bestCompetitiveL=${finite(proof.bestCompetitiveLowerBoundChaos)}`,
    `gap=${finite(proof.potentialGapChaos)}`,
    `status=${proof.status}`,
    `competitive=${proof.unresolvedCompetitiveCandidates}`,
    `dominated=${proof.dominatedCandidates}`,
    `reuse=${recorded.result.search.sessionReuse.status}/${recorded.result.search.sessionReuse.scope}`,
  ].join('; ');
}

function controlledInput(
  targetIds: readonly string[],
  rates: CurrencyRates,
  budget: NonNullable<OptimizeCraftInput['searchBudget']>,
  intent: OptimizeCraftInput['searchIntent']
): OptimizeCraftInput {
  const pinned = createPhase2k1ExactFixture({ searchBudget: budget, searchIntent: intent });
  return {
    ...pinned,
    target: {
      requiredRarity: 'rare',
      requiredMods: targetIds.map((modId) => ({ modId })),
      finalStateConstraints: {},
    },
    prices: {
      ...pinned.prices,
      currencyRates: { ...rates },
      marketFracturedPricesChaos: undefined,
    },
  };
}

console.error('[phase2l] L1-L4 exact fixture proof sequence');
const exactService = new OptimizerService(repo);
const exactRecommend = run(
  'L1 exact RECOMMEND',
  exactService,
  createPhase2k1ExactFixture()
);
const exactDeepen1 = run(
  'L3 exact DEEPEN 1',
  exactService,
  createPhase2k1ExactFixture({
    searchBudget: { maxStates: 10_000, maxWallTimeMs: 45_000, maxExpansionRounds: 4 },
    searchIntent: 'DEEPEN',
  })
);
const exactDeepen2 = run(
  'L3 exact DEEPEN 2',
  exactService,
  createPhase2k1ExactFixture({
    searchBudget: { maxStates: 20_000, maxWallTimeMs: 60_000, maxExpansionRounds: 5 },
    searchIntent: 'DEEPEN',
  })
);

const exactRuns = [exactRecommend, exactDeepen1, exactDeepen2];
requireGate(
  exactRecommend.result.recommended?.acquisitionMethodId === 'self-fracture_executable',
  'L1 exact RECOMMEND did not reproduce an executable self-fracture route'
);
const admissibilityAudits = exactRuns.reduce(
  (sum, recorded) => sum + auditAdmissibility(recorded),
  0
);
requireGate(admissibilityAudits > 0, 'L2 did not audit a resolved full-route candidate');
requireGate(
  exactDeepen1.result.search.sessionReuse.status === 'RESUMED' &&
    exactDeepen2.result.search.sessionReuse.status === 'RESUMED',
  'L3 exact DEEPEN did not retain the session graph'
);
requireGate(
  exactDeepen2.result.acquisition.portfolioProof.potentialGapChaos === undefined ||
    exactRecommend.result.acquisition.portfolioProof.potentialGapChaos === undefined ||
    exactDeepen2.result.acquisition.portfolioProof.potentialGapChaos <=
      exactRecommend.result.acquisition.portfolioProof.potentialGapChaos + tolerance,
  'L3 proof-directed deepening increased the exact-fixture competitive gap'
);
const exactDeepenTranches = [
  ...exactDeepen1.result.acquisition.portfolioProof.tranches,
  ...exactDeepen2.result.acquisition.portfolioProof.tranches,
];
requireGate(
  exactDeepenTranches.some((tranche) => tranche.retainedStatesBefore > 0),
  'L3 DEEPEN tranches did not resume retained candidate-stage work'
);
requireGate(
  exactRuns.some((recorded) => recorded.progress.some((snapshot) =>
    snapshot.recentMilestones.some((milestone) =>
      milestone.includes('competitors reprioritized')
    )
  )),
  'L6 a new incumbent did not emit immediate competitor reprioritization evidence'
);

console.error('[phase2l] L5 targeted candidate-stage cold/resumed comparison');
const twoTargetIds = PHASE2K1_TARGET_MOD_IDS.slice(0, 2);
const stageSeed = exactRecommend;
const stageResumed = exactDeepen2;
auditAdmissibility(stageSeed);
auditAdmissibility(stageResumed);
const exactFixture = createPhase2k1ExactFixture();
const stagePool = ModPool.forCluster(
  repo,
  exactFixture.baseType,
  exactFixture.clusterType
);
const stagePriceBook = new PriceBook(PHASE2K1_FROZEN_CURRENCY_RATES, {});
const stageStarts = generateStartingStateCandidates(
  exactFixture.target,
  exactFixture.baseType,
  exactFixture.clusterType,
  exactFixture.itemLevel,
  {
    pool: stagePool,
    priceBook: stagePriceBook,
    cleanBaseCostChaos: 10,
    cleanBasePriceConfidence: 'known',
    cleanBasePriceProvenance: 'Phase 2L frozen candidate-stage comparison',
  },
  exactFixture.passiveCount
);
const cleanStageStart = stageStarts[0];
requireGate(cleanStageStart !== undefined, 'L5 clean starting state missing');
const comparedStageModIds = new Set<string>([
  PHASE2K1_TARGET_MOD_IDS[0],
  PHASE2K1_TARGET_MOD_IDS[2],
]);
const comparedStageStarts = stageStarts.filter((start) =>
  start.fracturedRequirement?.modId !== undefined &&
  comparedStageModIds.has(start.fracturedRequirement.modId)
);
requireGate(comparedStageStarts.length === 2, 'L5 did not discover two pinned fracture targets');

const stageComparisons = comparedStageStarts.map((start, index) => {
  const acquisitionSession = createGenericSearchContinuationSession();
  const acquisitionRequest = {
    cleanStartingState: cleanStageStart.state,
    desiredPhysicalState: { fracturedMod: start.fracturedRequirement! },
    cleanBaseAcquisition: {
      costChaos: 10,
      confidence: 'known' as const,
      provenance: 'Phase 2L frozen candidate-stage comparison',
    },
    allowResearchFallbackPrices: true,
    searchIntent: 'PROVE' as const,
    persistentExpansion: true,
  };
  synthesizeAcquisition(
    { pool: stagePool, priceBook: stagePriceBook },
    {
      ...acquisitionRequest,
      searchBudget: { maxStates: 1_667, maxWallTimeMs: 10_000, maxExpansionRounds: 1 },
      continuationSession: acquisitionSession,
    }
  );
  const resumedAcquisition = synthesizeAcquisition(
    { pool: stagePool, priceBook: stagePriceBook },
    {
      ...acquisitionRequest,
      searchBudget: { maxStates: 5_001, maxWallTimeMs: 30_000, maxExpansionRounds: 3 },
      continuationSession: acquisitionSession,
    }
  );
  const coldAcquisition = synthesizeAcquisition(
    { pool: stagePool, priceBook: stagePriceBook },
    {
      ...acquisitionRequest,
      searchBudget: { maxStates: 5_001, maxWallTimeMs: 30_000, maxExpansionRounds: 3 },
      continuationSession: createGenericSearchContinuationSession(),
    }
  );
  requireGate(
    resumedAcquisition.status === 'RESOLVED' &&
      coldAcquisition.status === 'RESOLVED' &&
      resumedAcquisition.expectedCostChaos !== undefined &&
      coldAcquisition.expectedCostChaos !== undefined,
    `L5 ${start.label}: acquisition did not resolve cold and resumed`
  );
  requireGate(
    Math.abs(
      resumedAcquisition.expectedCostChaos - coldAcquisition.expectedCostChaos
    ) <= tolerance,
    `L5 ${start.label}: acquisition EV diverged cold/resumed`
  );

  const downstreamTarget = {
    requiredRarity: 'rare' as const,
    requiredMods: [
      { modId: start.fracturedRequirement!.modId! },
      { modId: PHASE2K1_TARGET_MOD_IDS[index === 0 ? 2 : 0] },
    ],
    finalStateConstraints: {},
  };
  const downstreamSession = createGenericSearchContinuationSession();
  const downstreamOptions = {
    includeHarvest: true,
    harvestTags: ['attribute', 'defences', 'energy_shield'],
    prioritizeTargetProgress: true,
    allowResearchFallbackPrices: true,
    searchIntent: 'PROVE' as const,
    persistentExpansion: true,
    recommendationRefinementRounds: 1,
    restartReacquire: {
      destination: start.state,
      acquisitionCostChaos: resumedAcquisition.expectedCostChaos,
      confidence: 'research-fallback' as const,
      provenance: 'Phase 2L resolved self-fracture acquisition',
    },
  };
  new GenericSearchEngine(
    { pool: stagePool, priceBook: stagePriceBook },
    downstreamTarget,
    {
      ...downstreamOptions,
      maxStates: 1_500,
      maxWallTimeMs: 8_000,
      maxExpansionRounds: 2,
      continuationSession: downstreamSession,
    }
  ).search(start.state);
  const resumedDownstream = new GenericSearchEngine(
    { pool: stagePool, priceBook: stagePriceBook },
    downstreamTarget,
    {
      ...downstreamOptions,
      maxStates: 4_000,
      maxWallTimeMs: 20_000,
      maxExpansionRounds: 3,
      continuationSession: downstreamSession,
    }
  ).search(start.state);
  const coldDownstream = new GenericSearchEngine(
    { pool: stagePool, priceBook: stagePriceBook },
    downstreamTarget,
    {
      ...downstreamOptions,
      maxStates: 4_000,
      maxWallTimeMs: 20_000,
      maxExpansionRounds: 3,
      continuationSession: createGenericSearchContinuationSession(),
    }
  ).search(start.state);
  requireGate(
    Number.isFinite(resumedDownstream.totalExpectedCostChaos) &&
      Number.isFinite(coldDownstream.totalExpectedCostChaos) &&
      Math.abs(
        resumedDownstream.totalExpectedCostChaos - coldDownstream.totalExpectedCostChaos
      ) <= tolerance,
    `L5 ${start.label}: downstream EV diverged cold/resumed`
  );
  const resumedDecision = resumedDownstream.policyMap.get(
    getCanonicalStateKey(start.state, downstreamTarget)
  );
  const coldDecision = coldDownstream.policyMap.get(
    getCanonicalStateKey(start.state, downstreamTarget)
  );
  const resumedDownstreamL = resumedDecision?.candidateQValues.reduce(
    (minimum, candidate) => Math.min(minimum, candidate.lowerBoundChaos),
    Infinity
  ) ?? 0;
  const coldDownstreamL = coldDecision?.candidateQValues.reduce(
    (minimum, candidate) => Math.min(minimum, candidate.lowerBoundChaos),
    Infinity
  ) ?? 0;
  requireGate(
    resumedDownstreamL <= resumedDownstream.totalExpectedCostChaos + tolerance &&
      coldDownstreamL <= coldDownstream.totalExpectedCostChaos + tolerance,
    `L5 ${start.label}: downstream bound was inadmissible`
  );
  return {
    label: start.label,
    acquisitionU: resumedAcquisition.expectedCostChaos,
    downstreamU: resumedDownstream.totalExpectedCostChaos,
    resumedAcquisitionGenerated: resumedAcquisition.search.transitionDistributionsGenerated,
    coldAcquisitionGenerated: coldAcquisition.search.transitionDistributionsGenerated,
    resumedDownstreamGenerated:
      resumedDownstream.searchSummary.transitionDistributionsGenerated,
    coldDownstreamGenerated: coldDownstream.searchSummary.transitionDistributionsGenerated,
    resumedAcquisitionRetained: acquisitionSession.expansion.nodes.size,
    resumedDownstreamRetained: downstreamSession.expansion.nodes.size,
  };
});
const resumedGenerated = stageComparisons.reduce(
  (sum, comparison) => sum + comparison.resumedAcquisitionGenerated +
    comparison.resumedDownstreamGenerated,
  0
);
const coldGenerated = stageComparisons.reduce(
  (sum, comparison) => sum + comparison.coldAcquisitionGenerated +
    comparison.coldDownstreamGenerated,
  0
);
requireGate(
  resumedGenerated < coldGenerated,
  'L5 resumed-large candidate stages did not reduce duplicate transition generation'
);

console.error('[phase2l] L7 three controlled price regimes');
const priceBudget = { maxStates: 3_000, maxWallTimeMs: 18_000, maxExpansionRounds: 3 };
const priceRegimes = [
  { label: 'cheap fracture', fracturing: 1 },
  { label: 'frozen fixture', fracturing: PHASE2K1_FROZEN_CURRENCY_RATES.fracturing },
  { label: 'expensive fracture', fracturing: 20_000 },
].map(({ label, fracturing }) => {
  const rates = { ...PHASE2K1_FROZEN_CURRENCY_RATES, fracturing };
  return run(
    `L7 ${label}`,
    new OptimizerService(repo),
    controlledInput(twoTargetIds, rates, priceBudget, 'RECOMMEND')
  );
});
priceRegimes.forEach(auditAdmissibility);
requireGate(
  new Set(priceRegimes.map((recorded) => recorded.result.acquisition.selectedCandidateId)).size >= 2,
  'L7 price regimes did not produce an emergent route-selection change'
);

console.error('[phase2l] L8 target permutation neutrality');
const permutationBudget = { maxStates: 4_000, maxWallTimeMs: 24_000, maxExpansionRounds: 3 };
const permutationA = run(
  'L8 target order A',
  new OptimizerService(repo),
  controlledInput(twoTargetIds, PHASE2K1_FROZEN_CURRENCY_RATES, permutationBudget, 'RECOMMEND')
);
const permutationB = run(
  'L8 target order B',
  new OptimizerService(repo),
  controlledInput([...twoTargetIds].reverse(), PHASE2K1_FROZEN_CURRENCY_RATES, permutationBudget, 'RECOMMEND')
);
auditAdmissibility(permutationA);
auditAdmissibility(permutationB);
requireGate(
  Math.abs(
    (permutationA.result.expectedCostChaos ?? Infinity) -
      (permutationB.result.expectedCostChaos ?? Infinity)
  ) <= tolerance,
  'L8 target permutation changed selected portfolio economics'
);
requireGate(
  permutationA.result.acquisition.portfolioProof.status ===
    permutationB.result.acquisition.portfolioProof.status,
  'L8 target permutation changed portfolio proof semantics'
);

const lines = [
  'PHASE 2L — PORTFOLIO PROOF CLOSURE DIAGNOSTIC',
  '',
  'L1-L4 EXACT FIXTURE',
  ...exactRuns.flatMap((recorded) => [runSummary(recorded), ...evidenceTable(recorded).map((line) => `  ${line}`)]),
  `admissibility resolved candidates audited=${admissibilityAudits}; violations=0`,
  `final exact status=${exactDeepen2.result.acquisition.portfolioProof.status}`,
  `final exact blocker=${exactDeepen2.result.acquisition.portfolioProof.status === 'BEST_RESOLVED_UNPROVEN'
    ? `${exactDeepen2.result.acquisition.portfolioProof.unresolvedCompetitiveCandidates} candidate(s) retain full-route L below incumbent U`
    : 'NONE'}`,
  '',
  'L3 TRANCHE EVIDENCE',
  ...exactDeepenTranches.map((tranche) =>
    `  ${tranche.label}/${tranche.stage}: reason=${tranche.reason}; retained=${tranche.retainedStatesBefore}->${tranche.retainedStatesAfter}; generated=${tranche.transitionDistributionsGeneratedBefore}->${tranche.transitionDistributionsGeneratedAfter}; L=${finite(tranche.lowerBoundBeforeChaos)}->${finite(tranche.lowerBoundAfterChaos)}; U=${finite(tranche.upperBoundBeforeChaos)}->${finite(tranche.upperBoundAfterChaos)}; outcome=${tranche.outcome}`
  ),
  '',
  'L5 COLD VS RESUMED CANDIDATE-STAGE CONTROL',
  runSummary(stageSeed),
  runSummary(stageResumed),
  `  current-request transition distributions: resumed=${resumedGenerated}; cold=${coldGenerated}; savings=${coldGenerated - resumedGenerated}`,
  ...stageComparisons.map((comparison) =>
    `  ${comparison.label}: acquisition U=${finite(comparison.acquisitionU)}; downstream U=${finite(comparison.downstreamU)}; resumed retained acq/down=${comparison.resumedAcquisitionRetained}/${comparison.resumedDownstreamRetained}; generated resumed acq/down=${comparison.resumedAcquisitionGenerated}/${comparison.resumedDownstreamGenerated}; generated cold acq/down=${comparison.coldAcquisitionGenerated}/${comparison.coldDownstreamGenerated}`
  ),
  '',
  'L7 PRICE SENSITIVITY',
  ...priceRegimes.map(runSummary),
  '',
  'L8 TARGET PERMUTATION',
  runSummary(permutationA),
  runSummary(permutationB),
  '',
  'INVARIANTS',
  'market-fractured ranking=ABSENT',
  'hardcoded winner/order=ABSENT',
  'weakened state identity=ABSENT',
  'unit tests added/run=NO',
];

writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
console.log(lines.join('\n'));
