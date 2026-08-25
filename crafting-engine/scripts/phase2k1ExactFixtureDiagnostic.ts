import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ClusterModRepository } from '../src/data/loadClusterMods.ts';
import type { ItemState } from '../src/domain/ItemState.ts';
import { ModPool } from '../src/domain/ModPool.ts';
import { PriceBook } from '../src/domain/PriceBook.ts';
import {
  createGenericSearchContinuationSession,
  GenericSearchEngine,
  type GenericSearchResult,
} from '../src/solver/genericSearch.ts';
import {
  describeOptimizerSearchSessionIdentity,
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
  new URL('../../output-phase2k1-exact-fixture-diagnostic.txt', import.meta.url)
);
const repo = new ClusterModRepository();
const tolerance = 1e-6;

function requireGate(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function finite(value: number | null | undefined): string {
  return value === undefined || value === null || !Number.isFinite(value)
    ? 'NONE'
    : `${value.toFixed(6)}c`;
}

function health(result: OptimizeCraftResult): string {
  return [
    `proper=${result.risk.selectedPolicyProper}`,
    `absorption=${result.risk.terminalAbsorptionProbability.toFixed(12)}`,
    `Bellman=${result.solver.bellmanConverged}`,
    `occupancy=${result.solver.occupancyConverged}`,
    `reconciled=${result.solver.costReconciled}`,
    `reconciliationDiff=${result.solver.reconciliationDifferenceChaos.toExponential(3)}`,
    `unresolvedOnPolicy=${result.risk.unresolvedOnPolicyProbability.toExponential(3)}`,
  ].join('; ');
}

function proofHealthy(result: OptimizeCraftResult): boolean {
  return result.recommended !== null &&
    result.risk.selectedPolicyProper &&
    result.risk.terminalAbsorptionProbability >= 1 - 1e-8 &&
    result.risk.unresolvedOnPolicyProbability <= 1e-10 &&
    result.solver.bellmanConverged &&
    result.solver.occupancyConverged &&
    result.solver.costReconciled;
}

interface RecordedRun {
  result: OptimizeCraftResult;
  progress: OptimizerProgressSnapshot[];
  elapsedMs: number;
}

function runOptimizer(
  service: OptimizerService,
  input: OptimizeCraftInput,
  telemetry: boolean
): RecordedRun {
  const progress: OptimizerProgressSnapshot[] = [];
  const started = performance.now();
  const result = service.optimize(
    input,
    telemetry
      ? (snapshot) => {
          progress.push(structuredClone(snapshot));
        }
      : undefined
  );
  return { result, progress, elapsedMs: performance.now() - started };
}

function selectedAcquisitionUpperBound(result: OptimizeCraftResult): number | undefined {
  const selected = result.acquisition.candidates.find(
    (candidate) => candidate.id === result.acquisition.selectedCandidateId
  );
  return selected?.methods.find((method) => method.executable)?.costChaos ??
    selected?.synthesis?.expectedCostChaos;
}

function candidateTable(run: RecordedRun): string[] {
  const terminal = run.progress.at(-1);
  return run.result.acquisition.candidates.map((candidate) => {
    const live = terminal?.candidates.find((entry) => entry.label === candidate.label);
    const acquisitionU = candidate.methods.find((method) => method.executable)?.costChaos ??
      candidate.synthesis?.expectedCostChaos;
    const lowerBound = candidate.synthesis?.lowerBoundChaos ?? live?.lowerBoundChaos ??
      candidate.methods[0]?.costChaos;
    return [
      `  ${candidate.label}:`,
      `L=${finite(lowerBound)}`,
      `acquisitionU=${finite(acquisitionU)}`,
      `downstreamU=${finite(live?.downstreamUpperBoundChaos)}`,
      `fullRouteU=${finite(live?.fullRouteUpperBoundChaos)}`,
      `status=${live?.status ?? candidate.synthesis?.status ?? 'CLEAN'}`,
      `selected=${candidate.id === run.result.acquisition.selectedCandidateId}`,
      `proof=${candidate.synthesis?.proof?.modeledActionOptimalityProven ?? 'N/A'}`,
    ].join(' ');
  });
}

function resultSemantics(result: OptimizeCraftResult): string {
  return JSON.stringify({
    selected: {
      actionId: result.recommended?.actionId,
      candidateId: result.acquisition.selectedCandidateId,
      methodId: result.acquisition.selectedMethodId,
      expectedCostChaos: result.expectedCostChaos,
    },
    health: {
      risk: result.risk,
      solver: result.solver,
      proof: result.proof,
      recommendationStatus: result.recommendationStatus,
      policyRefinement: {
        status: result.policyRefinement.status,
        finalUpperBoundChaos: result.policyRefinement.finalUpperBoundChaos,
        stopReason: result.policyRefinement.stopReason,
      },
    },
    acquisition: {
      selectedCandidateId: result.acquisition.selectedCandidateId,
      selectedMethodId: result.acquisition.selectedMethodId,
      selectionSafe: result.acquisition.selectionSafe,
      resolvedIncumbentUpperBoundChaos: result.acquisition.resolvedIncumbentUpperBoundChaos,
      bestUnresolvedLowerBoundChaos: result.acquisition.bestUnresolvedLowerBoundChaos,
      candidates: result.acquisition.candidates.map((candidate) => ({
        id: candidate.id,
        methods: candidate.methods.map((method) => ({
          id: method.id,
          costChaos: method.costChaos,
          executable: method.executable,
        })),
        synthesis: candidate.synthesis && {
          status: candidate.synthesis.status,
          expectedCostChaos: candidate.synthesis.expectedCostChaos,
          lowerBoundChaos: candidate.synthesis.lowerBoundChaos,
          modeledActionOptimalityProven:
            candidate.synthesis.proof?.modeledActionOptimalityProven,
        },
      })),
    },
    ranking: [result.recommended, ...result.alternatives].filter(Boolean).map((route) => ({
      actionId: route?.actionId,
      expectedTotalCostChaos: route?.expectedTotalCostChaos,
      lowerBoundChaos: route?.lowerBoundChaos,
      status: route?.status,
      couldBeatResolvedIncumbent: route?.couldBeatResolvedIncumbent,
    })),
    policy: result.policyRules.map((rule) => ({
      stateKey: rule.stateKey,
      selectedActionId: rule.selectedActionId,
      totalCostChaos: rule.totalCostChaos,
    })),
    graphDecisionSemantics: {
      expansionMode: result.search.expansionMode,
      refinementStopReason: result.search.refinementStopReason,
      minimumFeasibleRarity: result.search.minimumFeasibleRarity,
      acquisitionFeasibility: result.search.acquisitionFeasibility,
    },
  });
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function cleanTotal(result: GenericSearchResult): number | undefined {
  return Number.isFinite(result.totalExpectedCostChaos)
    ? 10 + result.totalExpectedCostChaos
    : undefined;
}

function genericPolicyHealthy(result: GenericSearchResult): boolean {
  return result.optimalityProof.selectedPolicyStatus ===
      'FULLY RESOLVED / PROPER / ABSORBING / COST-RECONCILED' &&
    result.onPolicyGraph.isProper &&
    result.onPolicyGraph.terminalAbsorptionProbability >= 1 - 1e-8 &&
    result.convergence.converged &&
    result.reconciliation.visitConverged &&
    result.reconciliation.isReconciled;
}

console.error('[phase2k1] K1 exact frozen RWE cold request');
const exactInput = createPhase2k1ExactFixture();
requireGate(exactInput.baseType === 'Large Cluster Jewel', 'K1 base type drifted');
requireGate(exactInput.clusterType === '10% increased Attack Damage', 'K1 enchantment drifted');
requireGate(exactInput.itemLevel === 84 && exactInput.passiveCount === 12, 'K1 item metadata drifted');
requireGate(exactInput.target.requiredRarity === 'rare', 'K1 required rarity drifted');
requireGate(
  exactInput.target.finalStateConstraints?.maxUnmatchedAffixes === undefined,
  'K1 must allow extra affixes'
);
requireGate(
  JSON.stringify(exactInput.target.requiredMods.map((requirement) => requirement.modId)) ===
    JSON.stringify(PHASE2K1_TARGET_MOD_IDS),
  'K1 exact target IDs drifted'
);
requireGate(
  exactInput.prices?.marketFracturedPricesChaos === undefined,
  'K1 must not include market-fractured purchase prices'
);

const exactService = new OptimizerService(repo);
const cold = runOptimizer(exactService, exactInput, true);
const coldTerminal = cold.progress.at(-1);
console.error('[phase2k1] cold candidate telemetry', JSON.stringify(
  coldTerminal?.candidates.map((candidate) => ({
    label: candidate.label,
    status: candidate.status,
    states: candidate.statesExpanded,
    acquisitionU: candidate.acquisitionUpperBoundChaos,
    downstreamU: candidate.downstreamUpperBoundChaos,
    fullRouteU: candidate.fullRouteUpperBoundChaos,
  }))
));
requireGate(proofHealthy(cold.result), 'K1 exact cold fixture did not return a healthy executable policy');
requireGate(cold.progress[0]?.sessionReuseStatus === 'COLD', 'K2 initial request was not COLD');
requireGate(coldTerminal?.phase === 'COMPLETE', 'K4 cold terminal progress was not COMPLETE');
requireGate(
  coldTerminal.bestUnresolvedLowerBoundChaos ===
      cold.result.acquisition.bestUnresolvedLowerBoundChaos &&
    coldTerminal.potentialGapChaos === cold.result.acquisition.potentialGapChaos,
  'K4 terminal telemetry did not preserve the authoritative result bounds'
);
requireGate(
  coldTerminal.candidates.every((candidate) => candidate.status !== 'PROBING'),
  'K4 terminal telemetry left a candidate in PROBING status'
);
requireGate(
  coldTerminal.candidates.some((candidate) =>
    candidate.kind === 'self-fracture' && candidate.fullRouteUpperBoundChaos !== undefined
  ),
  'K1 no executable self-fracture full route resolved'
);
requireGate(coldTerminal.candidates.length === 5, 'K1 candidate table did not contain Clean + four fractures');

console.error('[phase2k1] K2 same-worker exact resumed request');
const resumedInput = createPhase2k1ExactFixture({
  searchBudget: { maxStates: 10_000, maxWallTimeMs: 30_000, maxExpansionRounds: 4 },
  searchIntent: 'DEEPEN',
});
const resumed = runOptimizer(exactService, resumedInput, true);
const resumedTerminal = resumed.progress.at(-1);
console.error('[phase2k1] cold/resumed selection', JSON.stringify({
  cold: {
    selected: cold.result.recommended?.name,
    cost: cold.result.expectedCostChaos,
  },
  resumed: {
    selected: resumed.result.recommended?.name,
    cost: resumed.result.expectedCostChaos,
    reuse: resumed.result.search.sessionReuse,
    candidates: resumedTerminal?.candidates,
  },
}));
requireGate(proofHealthy(resumed.result), 'K2 resumed fixture did not return a healthy executable policy');
requireGate(resumed.progress[0]?.sessionReuseStatus === 'RESUMED', 'K2 progress did not begin RESUMED');
requireGate(resumed.result.search.sessionReuse.status === 'RESUMED', 'K2 result did not report RESUMED');
requireGate(resumed.result.search.sessionReuse.retainedStates > 0, 'K2 resumed request retained no states');
requireGate(resumedTerminal?.phase === 'COMPLETE', 'K4 resumed terminal progress was not COMPLETE');
requireGate(
  (resumed.result.expectedCostChaos ?? Infinity) <= (cold.result.expectedCostChaos ?? Infinity) + tolerance,
  'K2 resumed selected route regressed relative to the cold route'
);
const coldAcquisitionU = selectedAcquisitionUpperBound(cold.result);
const resumedAcquisitionU = selectedAcquisitionUpperBound(resumed.result);
if (
  cold.result.acquisition.selectedCandidateId === resumed.result.acquisition.selectedCandidateId &&
  coldAcquisitionU !== undefined && resumedAcquisitionU !== undefined
) {
  requireGate(
    resumedAcquisitionU <= coldAcquisitionU + tolerance,
    'K2 resumed acquisition upper bound regressed for the same selected candidate'
  );
}

console.error('[phase2k1] K2 mechanics/economics identity invalidation');
const invalidationBudget = { maxStates: 1, maxWallTimeMs: 250, maxExpansionRounds: 1 };
const economicChange = createPhase2k1ExactFixture({ searchBudget: invalidationBudget });
economicChange.prices = { ...economicChange.prices, cleanBaseCostChaos: 11 };
const economicInvalidated = runOptimizer(exactService, economicChange, true);
requireGate(
  economicInvalidated.progress[0]?.sessionReuseStatus === 'INVALIDATED' &&
    economicInvalidated.result.search.sessionReuse.retainedStates === 0,
  'K2 economic identity change reused prior-request states'
);
const mechanicsChange = createPhase2k1ExactFixture({ searchBudget: invalidationBudget });
mechanicsChange.passiveCount = 11;
const mechanicsInvalidated = runOptimizer(exactService, mechanicsChange, true);
requireGate(
  mechanicsInvalidated.progress[0]?.sessionReuseStatus === 'INVALIDATED' &&
    mechanicsInvalidated.result.search.sessionReuse.retainedStates === 0,
  'K2 mechanics identity change reused prior-request states'
);
const exactRecovered = runOptimizer(
  exactService,
  createPhase2k1ExactFixture(),
  true
);
requireGate(
  exactRecovered.progress[0]?.sessionReuseStatus === 'RESUMED' &&
    exactRecovered.result.search.sessionReuse.status === 'RESUMED' &&
    exactRecovered.result.search.sessionReuse.retainedStates > 0,
  'K2 A -> B -> A did not resume the retained exact-context session'
);

const baselineIdentity = describeOptimizerSearchSessionIdentity(exactInput, []).identityHash;
const identityVariants: OptimizeCraftInput[] = [
  { ...exactInput, passiveCount: 11 },
  { ...exactInput, itemLevel: 85 },
  { ...exactInput, harvestTags: ['attack'] },
  { ...exactInput, allowResearchFallbackPrices: false },
  {
    ...exactInput,
    target: { ...exactInput.target, finalStateConstraints: { maxUnmatchedAffixes: 0 } },
  },
  {
    ...exactInput,
    prices: {
      ...exactInput.prices,
      currencyRates: { ...exactInput.prices?.currencyRates, alteration: 0.12 },
    },
  },
];
requireGate(
  identityVariants.every(
    (input) => describeOptimizerSearchSessionIdentity(input, input.harvestTags ?? []).identityHash !==
      baselineIdentity
  ),
  'K2 an exact-context mechanics/economics identity variant failed to invalidate'
);

console.error('[phase2k1] K5 telemetry ON/OFF equivalence and median overhead');
const telemetryFixture: OptimizeCraftInput = {
  baseType: 'Medium Cluster Jewel',
  clusterType: '10% increased Damage while affected by a Herald',
  itemLevel: 84,
  passiveCount: 4,
  target: {
    requiredMods: [{ modId: 'Endbringer' }],
    finalStateConstraints: { maxUnmatchedAffixes: 0 },
  },
  prices: {
    currencyRates: { ...PHASE2K1_FROZEN_CURRENCY_RATES },
    cleanBaseCostChaos: 10,
    cleanBasePriceSource: 'manual',
    cleanBasePriceProvenance: 'Phase 2K.1 frozen telemetry benchmark PriceBook',
  },
  allowResearchFallbackPrices: false,
  searchBudget: { maxStates: 3_000, maxWallTimeMs: 10_000, maxExpansionRounds: 2 },
  searchIntent: 'RECOMMEND',
};

// Warm both code paths before measuring fresh, cold services.
runOptimizer(new OptimizerService(repo), telemetryFixture, false);
runOptimizer(new OptimizerService(repo), telemetryFixture, true);
const telemetryOffSamples: number[] = [];
const telemetryOnSamples: number[] = [];
let telemetryEventCount = 0;
for (let repetition = 0; repetition < 7; repetition++) {
  const onFirst = repetition % 2 === 1;
  const first = runOptimizer(new OptimizerService(repo), telemetryFixture, onFirst);
  const second = runOptimizer(new OptimizerService(repo), telemetryFixture, !onFirst);
  const off = onFirst ? second : first;
  const on = onFirst ? first : second;
  telemetryOffSamples.push(off.elapsedMs);
  telemetryOnSamples.push(on.elapsedMs);
  telemetryEventCount = on.progress.length;
  requireGate(on.progress.at(-1)?.phase === 'COMPLETE', 'K5 telemetry ON did not finish at COMPLETE');
  requireGate(
    resultSemantics(off.result) === resultSemantics(on.result),
    `K5 telemetry changed optimizer semantics in repetition ${repetition + 1}`
  );
}
const telemetryOffMedianMs = median(telemetryOffSamples);
const telemetryOnMedianMs = median(telemetryOnSamples);
const telemetryOverheadPercent = 100 *
  (telemetryOnMedianMs - telemetryOffMedianMs) / telemetryOffMedianMs;
requireGate(
  telemetryOverheadPercent <= 5,
  `K5 telemetry median overhead ${telemetryOverheadPercent.toFixed(3)}% exceeded 5%`
);

console.error('[phase2k1] K6 current-depth Clean U versus mature clean-only U');
const pool = ModPool.forCluster(repo, exactInput.baseType, exactInput.clusterType);
const priceBook = new PriceBook(PHASE2K1_FROZEN_CURRENCY_RATES, {});
const cleanHarvestTags = cold.result.search.harvestActionScope.tags;
const includeCleanHarvest = cleanHarvestTags.length > 0;
const allowCleanFallbackPrices = exactInput.allowResearchFallbackPrices ?? true;
const cleanState: ItemState = {
  baseType: exactInput.baseType,
  clusterType: exactInput.clusterType,
  itemLevel: exactInput.itemLevel,
  passiveCount: exactInput.passiveCount,
  rarity: 'normal',
  prefixes: [],
  suffixes: [],
  fracturedModIds: [],
};
const cleanContinuation = createGenericSearchContinuationSession();
const cleanSeedStarted = performance.now();
const cleanSeed = new GenericSearchEngine(
  { pool, priceBook },
  exactInput.target,
  {
    includeHarvest: includeCleanHarvest,
    harvestTags: cleanHarvestTags,
    prioritizeTargetProgress: true,
    allowResearchFallbackPrices: allowCleanFallbackPrices,
    maxStates: 5_000,
    // K6 compares the first certified clean control with the portfolio allocation.
    // Give slower CI runners enough wall time to finish that expansion round, then
    // return the certificate instead of starting a machine-dependent refinement.
    // The retained DEEPEN probes below own the larger-state comparison.
    maxWallTimeMs: 120_000,
    maxExpansionRounds: 3,
    searchIntent: 'RECOMMEND',
    persistentExpansion: true,
    continuationSession: cleanContinuation,
    recommendationRefinementRounds: 0,
    restartReacquire: {
      destination: cleanState,
      acquisitionCostChaos: 10,
      confidence: 'known',
      provenance: 'Phase 2K.1 frozen clean-only restart',
    },
  }
).search(cleanState);
const cleanSeedElapsedMs = performance.now() - cleanSeedStarted;
const matureSeedStates = cleanContinuation.expansion.nodes.size;
const matureCleanStarted = performance.now();
const matureClean = new GenericSearchEngine(
  { pool, priceBook },
  exactInput.target,
  {
    includeHarvest: includeCleanHarvest,
    harvestTags: cleanHarvestTags,
    prioritizeTargetProgress: true,
    allowResearchFallbackPrices: allowCleanFallbackPrices,
    maxStates: 20_000,
    maxWallTimeMs: 40_000,
    maxExpansionRounds: 6,
    searchIntent: 'DEEPEN',
    persistentExpansion: true,
    continuationSession: cleanContinuation,
    recommendationRefinementRounds: 4,
    restartReacquire: {
      destination: cleanState,
      acquisitionCostChaos: 10,
      confidence: 'known',
      provenance: 'Phase 2K.1 frozen clean-only restart',
    },
  }
).search(cleanState);
const matureCleanElapsedMs = performance.now() - matureCleanStarted;
const finalMatureCleanStarted = performance.now();
const finalMatureClean = new GenericSearchEngine(
  { pool, priceBook },
  exactInput.target,
  {
    includeHarvest: includeCleanHarvest,
    harvestTags: cleanHarvestTags,
    prioritizeTargetProgress: true,
    allowResearchFallbackPrices: allowCleanFallbackPrices,
    maxStates: 40_000,
    maxWallTimeMs: 90_000,
    maxExpansionRounds: 8,
    searchIntent: 'DEEPEN',
    persistentExpansion: true,
    continuationSession: cleanContinuation,
    recommendationRefinementRounds: 4,
    restartReacquire: {
      destination: cleanState,
      acquisitionCostChaos: 10,
      confidence: 'known',
      provenance: 'Phase 2K.1 frozen clean-only restart',
    },
  }
).search(cleanState);
const finalMatureCleanElapsedMs = performance.now() - finalMatureCleanStarted;
const currentDepthCleanU = cold.result.acquisition.stage.cleanCertification?.expectedTotalCostChaos;
const healthyCleanOnlyResults = [cleanSeed, matureClean, finalMatureClean]
  .filter(genericPolicyHealthy)
  .filter((candidate) => cleanTotal(candidate) !== undefined)
  .sort((left, right) => cleanTotal(left)! - cleanTotal(right)!);
const certifiedMatureClean = healthyCleanOnlyResults[0];
const matureCleanU = certifiedMatureClean && cleanTotal(certifiedMatureClean);
console.error('[phase2k1] clean-only health', JSON.stringify({
  seed: {
    U: cleanTotal(cleanSeed),
    policy: cleanSeed.optimalityProof.selectedPolicyStatus,
    proper: cleanSeed.onPolicyGraph.isProper,
    absorption: cleanSeed.onPolicyGraph.terminalAbsorptionProbability,
    Bellman: cleanSeed.convergence.converged,
    occupancy: cleanSeed.reconciliation.visitConverged,
    reconciled: cleanSeed.reconciliation.isReconciled,
    stop: cleanSeed.searchSummary.refinementStopReason,
  },
  deepen: {
    U: cleanTotal(matureClean),
    policy: matureClean.optimalityProof.selectedPolicyStatus,
    proper: matureClean.onPolicyGraph.isProper,
    absorption: matureClean.onPolicyGraph.terminalAbsorptionProbability,
    Bellman: matureClean.convergence.converged,
    occupancy: matureClean.reconciliation.visitConverged,
    reconciled: matureClean.reconciliation.isReconciled,
    stop: matureClean.searchSummary.refinementStopReason,
  },
  finalDeepen: {
    U: cleanTotal(finalMatureClean),
    policy: finalMatureClean.optimalityProof.selectedPolicyStatus,
    proper: finalMatureClean.onPolicyGraph.isProper,
    absorption: finalMatureClean.onPolicyGraph.terminalAbsorptionProbability,
    Bellman: finalMatureClean.convergence.converged,
    occupancy: finalMatureClean.reconciliation.visitConverged,
    reconciled: finalMatureClean.reconciliation.isReconciled,
    stop: finalMatureClean.searchSummary.refinementStopReason,
  },
}));
requireGate(currentDepthCleanU !== undefined, 'K6 portfolio did not expose a current-depth Clean U');
requireGate(
  certifiedMatureClean !== undefined && matureCleanU !== undefined,
  'K6 clean-only search did not certify a healthy executable policy'
);
requireGate(
  matureCleanU <= currentDepthCleanU + tolerance,
  'K6 mature clean-only U was worse than the portfolio current-depth Clean U'
);
requireGate(
  coldTerminal.candidates.some((candidate) =>
    candidate.kind === 'self-fracture' &&
      (candidate.fullRouteUpperBoundChaos ?? Infinity) < currentDepthCleanU
  ),
  'K6 portfolio did not resolve a fracture route below the allocated-depth Clean U'
);

const lines = [
  'PHASE 2K.1 EXACT-FIXTURE / TELEMETRY HARDENING DIAGNOSTIC',
  '',
  'K1 EXACT FROZEN RWE FIXTURE',
  `  base=${exactInput.baseType}; enchant=${exactInput.clusterType}; ilvl=${exactInput.itemLevel}; passives=${exactInput.passiveCount}; rarity=${exactInput.target.requiredRarity}; extraAffixes=ALLOWED`,
  `  targets=${JSON.stringify(exactInput.target.requiredMods.map((requirement) => requirement.modId))}`,
  `  frozenRates=${JSON.stringify(exactInput.prices?.currencyRates)}; cleanBase=${finite(exactInput.prices?.cleanBaseCostChaos)}; marketFracturedPurchase=DISABLED`,
  `  cold runtime=${cold.elapsedMs.toFixed(3)}ms; status=${cold.result.recommendationStatus}; selected=${cold.result.recommended?.name}; U=${finite(cold.result.expectedCostChaos)}`,
  `  health: ${health(cold.result)}`,
  `  acquisition safety=${cold.result.acquisition.selectionSafe}; incumbentU=${finite(cold.result.acquisition.resolvedIncumbentUpperBoundChaos)}; unresolvedL=${finite(cold.result.acquisition.bestUnresolvedLowerBoundChaos)}; potentialGap=${finite(cold.result.acquisition.potentialGapChaos)}; proof=${JSON.stringify(cold.result.proof)}`,
  '  candidate table:',
  ...candidateTable(cold),
  '',
  'K2 COLD / SAME-WORKER RESUMED / INVALIDATION',
  `  cold progress=${cold.progress[0]?.sessionReuseStatus} -> ${coldTerminal?.phase}; snapshots=${cold.progress.length}; selected=${cold.result.recommended?.name}; U=${finite(cold.result.expectedCostChaos)}`,
  `  resumed progress=${resumed.progress[0]?.sessionReuseStatus} -> ${resumedTerminal?.phase}; resultReuse=${resumed.result.search.sessionReuse.status}; retainedStates=${resumed.result.search.sessionReuse.retainedStates}; retainedTransitions=${resumed.result.search.sessionReuse.retainedTransitionDistributions}; snapshots=${resumed.progress.length}; runtime=${resumed.elapsedMs.toFixed(3)}ms; selected=${resumed.result.recommended?.name}; U=${finite(resumed.result.expectedCostChaos)}`,
  `  selected acquisition U cold/resumed=${finite(coldAcquisitionU)} / ${finite(resumedAcquisitionU)}; equivalentOrImproved=${(resumed.result.expectedCostChaos ?? Infinity) <= (cold.result.expectedCostChaos ?? Infinity) + tolerance}`,
  `  economic identity change: progress=${economicInvalidated.progress[0]?.sessionReuseStatus}; retained=${economicInvalidated.result.search.sessionReuse.retainedStates}; identity=${economicInvalidated.result.search.sessionReuse.identityHash}`,
  `  mechanics identity change: progress=${mechanicsInvalidated.progress[0]?.sessionReuseStatus}; retained=${mechanicsInvalidated.result.search.sessionReuse.retainedStates}; identity=${mechanicsInvalidated.result.search.sessionReuse.identityHash}`,
  `  A -> B -> A exact-context recovery: progress=${exactRecovered.progress[0]?.sessionReuseStatus}; result=${exactRecovered.result.search.sessionReuse.status}; retained=${exactRecovered.result.search.sessionReuse.retainedStates}`,
  `  exact identity variants independently differ=${identityVariants.length}/${identityVariants.length}`,
  '',
  'K4 TERMINAL TELEMETRY',
  `  cold last phase=${coldTerminal?.phase}; focus=${coldTerminal?.currentFocus}; bestU=${finite(coldTerminal?.bestExecutableUpperBoundChaos)}; unresolvedL=${finite(coldTerminal?.bestUnresolvedLowerBoundChaos)}; potentialGap=${finite(coldTerminal?.potentialGapChaos)}; lingeringPROBING=${coldTerminal?.candidates.filter((candidate) => candidate.status === 'PROBING').length}; selectedCandidates=${coldTerminal?.candidates.filter((candidate) => candidate.status === 'SELECTED').map((candidate) => candidate.label).join(', ')}`,
  `  resumed last phase=${resumedTerminal?.phase}; focus=${resumedTerminal?.currentFocus}; bestU=${finite(resumedTerminal?.bestExecutableUpperBoundChaos)}; unresolvedL=${finite(resumedTerminal?.bestUnresolvedLowerBoundChaos)}; potentialGap=${finite(resumedTerminal?.potentialGapChaos)}`,
  '',
  'K5 TELEMETRY ON/OFF EQUIVALENCE AND OVERHEAD',
  `  repetitions=7 after warmup; eventsPerOnRun=${telemetryEventCount}`,
  `  OFF samples ms=${telemetryOffSamples.map((sample) => sample.toFixed(3)).join(', ')}`,
  `  ON samples ms=${telemetryOnSamples.map((sample) => sample.toFixed(3)).join(', ')}`,
  `  OFF median=${telemetryOffMedianMs.toFixed(3)}ms; ON median=${telemetryOnMedianMs.toFixed(3)}ms; overhead=${telemetryOverheadPercent.toFixed(3)}%; target<=5%=PASS`,
  '  equality=PASS: acquisition/action, expected cost, health, proof, candidate ranking, policy decisions, and graph/search decision semantics',
  '',
  'K6 CURRENT-DEPTH CLEAN U VERSUS MATURE CLEAN-ONLY U',
  `  matched action set: Harvest=${includeCleanHarvest}; tags=${JSON.stringify(cleanHarvestTags)}; allowResearchFallbackPrices=${allowCleanFallbackPrices}`,
  `  portfolio current-depth Clean U=${finite(currentDepthCleanU)}; clean probe states=${cold.result.acquisition.stage.cleanCertification?.statesExpanded}; elapsed=${cold.result.acquisition.stage.cleanCertification?.elapsedMs}ms`,
  `  mature certified clean-only U=${finite(matureCleanU)}; source=${certifiedMatureClean === finalMatureClean ? 'final DEEPEN' : certifiedMatureClean === matureClean ? 'first DEEPEN' : 'clean-only seed'}; states=${certifiedMatureClean?.searchSummary.statesExpanded}; rounds=${certifiedMatureClean?.searchSummary.expansionRounds}; policy=${certifiedMatureClean?.optimalityProof.selectedPolicyStatus}; proper=${certifiedMatureClean?.onPolicyGraph.isProper}; absorption=${certifiedMatureClean?.onPolicyGraph.terminalAbsorptionProbability.toFixed(12)}; Bellman=${certifiedMatureClean?.convergence.converged}; occupancy=${certifiedMatureClean?.reconciliation.visitConverged}; reconciled=${certifiedMatureClean?.reconciliation.isReconciled}`,
  `  clean-only seed: U=${finite(cleanTotal(cleanSeed))}; retained states=${matureSeedStates}; stop=${cleanSeed.searchSummary.refinementStopReason}; runtime=${cleanSeedElapsedMs.toFixed(3)}ms`,
  `  exploratory DEEPEN: U=${finite(cleanTotal(matureClean))}; certified=${genericPolicyHealthy(matureClean)}; states=${matureClean.searchSummary.statesExpanded}; rounds=${matureClean.searchSummary.expansionRounds}; stop=${matureClean.searchSummary.refinementStopReason}; runtime=${matureCleanElapsedMs.toFixed(3)}ms; an uncertified incumbent is not reported as executable`,
  `  final DEEPEN: U=${finite(cleanTotal(finalMatureClean))}; certified=${genericPolicyHealthy(finalMatureClean)}; states=${finalMatureClean.searchSummary.statesExpanded}; rounds=${finalMatureClean.searchSummary.expansionRounds}; stop=${finalMatureClean.searchSummary.refinementStopReason}; runtime=${finalMatureCleanElapsedMs.toFixed(3)}ms`,
  `  portfolio selected U=${finite(cold.result.expectedCostChaos)}; scheduler evidence=the generic complex-target clean allocation was bounded before fracture evaluation, then remaining budget evaluated ${cold.result.acquisition.stage.attemptedCandidates}/${cold.result.acquisition.stage.candidateCount} acquisition candidates and resolved a fracture route below current-depth Clean U`,
  '  interpretation=Clean is an executable upper bound at allocated portfolio depth, not a mature clean-policy estimate; the mature comparison uses the same action set.',
  '',
  'ALL PHASE 2K.1 K1/K2/K4/K5/K6 DIAGNOSTIC GATES: PASS',
  'Unit tests run: NO',
];

writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
console.log(lines.join('\n'));
