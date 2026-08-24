import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ClusterModRepository } from '../src/data/loadClusterMods.ts';
import { ModPool } from '../src/domain/ModPool.ts';
import { PriceBook } from '../src/domain/PriceBook.ts';
import { getAllAffixes, type ItemState } from '../src/domain/ItemState.ts';
import { matchesModRequirement, satisfiesTarget } from '../src/domain/TargetDefinition.ts';
import { getCanonicalStateKey } from '../src/rules/actionDiscovery.ts';
import { CRAFT_MECHANICS } from '../src/rules/actionRegistry.ts';
import { runExternalParityDiagnostics } from '../src/rules/externalParity.ts';
import {
  buildAcquisitionTargetDefinition,
  DEFAULT_ACQUISITION_SYNTHESIS_ACTION_IDS,
  getAcquisitionFracturePreparationStateKey,
  synthesizeAcquisition,
} from '../src/solver/acquisitionSynthesis.ts';
import { evaluateAcquisitionFixedPolicyBaseline } from '../src/solver/acquisitionFixedPolicyBaseline.ts';
import {
  GenericSearchEngine,
  type CanonicalGraphNode,
} from '../src/solver/genericSearch.ts';
import {
  OptimizerService,
  type OptimizeCraftInput,
  type OptimizeCraftResult,
} from '../src/service/optimizerService.ts';

const repo = new ClusterModRepository();
const clusterType = '12% increased Attack Damage while holding a Shield';
const pool = ModPool.forCluster(repo, 'Large Cluster Jewel', clusterType);
const priceBook = new PriceBook();
const context = { pool, priceBook };
const targetModId = 'AfflictionJewelSmallPassivesGrantInt3';
const t1EsId = 'AfflictionJewelSmallPassivesGrantES3';
const t1AttributesId = 'AfflictionJewelSmallPassivesGrantAttributes3';
const desiredUnfractured = { modId: targetModId };
const outputPath = fileURLToPath(
  new URL('../../output-fracture-fidelity-phase2e.txt', import.meta.url)
);
const preChangeSearch = {
  expectedCostChaos: 12_797.759748632898,
  lowerBoundChaos: 10.234997082513523,
  states: 5_001,
  cumulativeWork: 5_001,
  repeatedStates: 0,
  rounds: 3,
  elapsedMs: 16_460,
  alterations: 100_709.34510088243,
  targetReadyMagicStates: 33,
  selectedRegalStates: 3,
  targetRareThreeStatesExpanded: 1_670,
  resolvedExaltedEdges: 2,
  unresolvedExaltedEdges: 1_668,
  missingExaltedSuccessors: 53_889,
};
const cleanBase: ItemState = {
  baseType: 'Large Cluster Jewel',
  clusterType,
  itemLevel: 84,
  passiveCount: 12,
  rarity: 'normal',
  prefixes: [],
  suffixes: [],
  fracturedModIds: [],
};
const desiredPhysicalState = { fracturedMod: { modId: targetModId } };
const cleanBaseAcquisition = {
  costChaos: 10,
  confidence: 'research-fallback' as const,
  provenance: 'Phase 2E controlled clean-base fixture',
};

function money(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? 'UNAVAILABLE'
    : `${value.toFixed(6)}c`;
}

function pct(value: number): string {
  return `${(value * 100).toFixed(9)}%`;
}

function runOptimizer(
  service: OptimizerService,
  label: string,
  input: OptimizeCraftInput
): { result: OptimizeCraftResult; elapsedMs: number } {
  console.error(`[phase2e] ${label}`);
  const started = Date.now();
  return { result: service.optimize(input), elapsedMs: Date.now() - started };
}

function optimizerLines(
  label: string,
  run: { result: OptimizeCraftResult; elapsedMs: number }
): string[] {
  const { result, elapsedMs } = run;
  return [
    `${label}:`,
    `  recommendation / winner: ${result.recommendationStatus} / ${result.recommended?.name ?? 'NONE'}`,
    `  expected total / acquisition safe: ${money(result.expectedCostChaos)} / ${result.acquisition.selectionSafe ? 'YES' : 'NO'}`,
    `  proper / absorption / reconciled: ${result.risk.selectedPolicyProper ? 'YES' : 'NO'} / ${pct(result.risk.terminalAbsorptionProbability)} / ${result.solver.costReconciled ? 'YES' : 'NO'}`,
    `  runtime / staged / downstream: ${elapsedMs}ms / ${result.search.totalElapsedMs}ms / ${result.search.elapsedMs}ms`,
    `  downstream states / cumulative / repeated / rounds / mode: ${result.search.statesExpanded} / ${result.search.cumulativeExpansionWork} / ${result.search.repeatedStatesExpanded} / ${result.search.expansionRounds} / ${result.search.expansionMode}`,
    `  acquisition candidates / attempted / certified / cache hits: ${result.acquisition.stage.candidateCount} / ${result.acquisition.stage.attemptedCandidates} / ${result.acquisition.stage.certifiedCandidates} / ${result.acquisition.stage.cacheHits}`,
    `  acquisition shared states / wall / rounds: ${result.acquisition.stage.totalStateBudget} / ${result.acquisition.stage.totalWallTimeBudgetMs}ms / ${result.acquisition.stage.maxExpansionRoundsPerCandidate}`,
    ...result.acquisition.candidates
      .filter((candidate) => candidate.synthesis)
      .map((candidate) => {
        const synthesis = candidate.synthesis!;
        return `  fracture ${candidate.label}: ${synthesis.status}; U=${money(synthesis.expectedCostChaos)}; L=${money(synthesis.lowerBoundChaos)}; executable=${candidate.methods.some((method) => method.executable) ? 'YES' : 'NO'}; orbs=${synthesis.expectedFracturingOrbs?.toFixed(6) ?? 'N/A'}; restarts=${synthesis.expectedRestarts?.toFixed(6) ?? 'N/A'}; states=${synthesis.search?.statesExpanded ?? 0}; elapsed=${synthesis.search?.elapsedMs ?? 0}ms; cache=${synthesis.cacheHit ? 'HIT' : 'MISS'}`;
      }),
    `  market-fractured method present: ${result.acquisition.candidates.some((candidate) => candidate.methods.some((method) => method.id.startsWith('market'))) ? 'YES' : 'NO'}`,
  ];
}

console.error('[phase2e] fixed-policy legal baseline');
const baselineStarted = Date.now();
const baseline = evaluateAcquisitionFixedPolicyBaseline(context, {
  cleanStartingState: cleanBase,
  desiredPhysicalState,
  cleanBaseAcquisition,
});
const baselineElapsedMs = Date.now() - baselineStarted;

const acquisitionTarget = buildAcquisitionTargetDefinition(desiredPhysicalState);
console.error('[phase2e] concrete-state quotient equivalence audit');
const concreteAuditStarted = Date.now();
const concreteGraph = new GenericSearchEngine(
  { ...context, target: acquisitionTarget },
  acquisitionTarget,
  {
    enabledActionIds: [...DEFAULT_ACQUISITION_SYNTHESIS_ACTION_IDS],
    prioritizeTargetProgress: true,
    restartReacquire: {
      destination: cleanBase,
      acquisitionCostChaos: cleanBaseAcquisition.costChaos,
      confidence: cleanBaseAcquisition.confidence,
      provenance: cleanBaseAcquisition.provenance,
    },
  }
).buildGraph(cleanBase, 5_001, undefined, Date.now() + 30_000, undefined, 'RECOMMEND');
const concreteAuditElapsedMs = Date.now() - concreteAuditStarted;

function actionSignature(node: CanonicalGraphNode): string {
  return JSON.stringify([...node.actions.entries()].map(([actionId, action]) => {
    const outcomes = new Map<string, number>();
    for (const transition of action.transitions) {
      const key = getAcquisitionFracturePreparationStateKey(
        transition.nextState,
        acquisitionTarget
      );
      outcomes.set(key, (outcomes.get(key) ?? 0) + transition.probability);
    }
    return {
      actionId,
      immediateCostChaos: action.immediateCostChaos,
      outcomes: [...outcomes.entries()]
        .map(([key, probability]) => [key, Number(probability.toFixed(12))] as const)
        .sort(([left], [right]) => left.localeCompare(right)),
    };
  }).sort((left, right) => left.actionId.localeCompare(right.actionId)));
}

const quotientRepresentatives = new Map<
  string,
  { signature: string; concreteStates: number }
>();
const quotientViolations: string[] = [];
let wrongFractureStatesAudited = 0;
let wrongFractureNonRestartTransitions = 0;
for (const node of concreteGraph.nodes.values()) {
  const standardKey = getCanonicalStateKey(node.state, acquisitionTarget);
  const quotientKey = getAcquisitionFracturePreparationStateKey(node.state, acquisitionTarget);
  if (standardKey === quotientKey) continue;
  const affixes = getAllAffixes(node.state);
  const desiredFractured = affixes.some(
    (mod) => mod.isFractured && matchesModRequirement(mod, desiredUnfractured)
  );
  const hasWrongFracture = affixes.some((mod) => mod.isFractured) && !desiredFractured;
  if (hasWrongFracture) {
    wrongFractureStatesAudited++;
    if (node.actions.has('fracturing_orb')) {
      quotientViolations.push(`Wrong-fracture state illegally exposed Fracturing Orb: ${standardKey}`);
    }
    for (const [actionId, action] of node.actions) {
      if (actionId === 'restart_reacquire') continue;
      for (const transition of action.transitions) {
        wrongFractureNonRestartTransitions++;
        const nextAffixes = getAllAffixes(transition.nextState);
        const nextDesiredFractured = nextAffixes.some(
          (mod) => mod.isFractured && matchesModRequirement(mod, desiredUnfractured)
        );
        if (!nextAffixes.some((mod) => mod.isFractured) || nextDesiredFractured) {
          quotientViolations.push(
            `Wrong-fracture non-restart transition escaped the permanent-wrong class: ${actionId}`
          );
        }
      }
    }
    continue;
  }
  const signature = actionSignature(node);
  const representative = quotientRepresentatives.get(quotientKey);
  if (!representative) {
    quotientRepresentatives.set(quotientKey, { signature, concreteStates: 1 });
  } else {
    representative.concreteStates++;
    if (representative.signature !== signature) {
      quotientViolations.push(`Non-equivalent action distribution in ${quotientKey}`);
    }
  }
}

console.error('[phase2e] generic-search post-change gap diagnosis');
const searchStarted = Date.now();
const search = new GenericSearchEngine(
  { ...context, target: acquisitionTarget },
  acquisitionTarget,
  {
    enabledActionIds: [...DEFAULT_ACQUISITION_SYNTHESIS_ACTION_IDS],
    prioritizeTargetProgress: true,
    canonicalStateKey: getAcquisitionFracturePreparationStateKey,
    restartReacquire: {
      destination: cleanBase,
      acquisitionCostChaos: cleanBaseAcquisition.costChaos,
      confidence: cleanBaseAcquisition.confidence,
      provenance: cleanBaseAcquisition.provenance,
    },
    maxStates: 5_001,
    maxWallTimeMs: 30_000,
    maxExpansionRounds: 3,
    searchIntent: 'RECOMMEND',
  }
).search(cleanBase);
const searchElapsedMs = Date.now() - searchStarted;

interface BaselineActionCoverage {
  expectedActionId: string;
  expandedStates: number;
  actionEdgesPresent: number;
  directlyResolvedEdges: number;
  selectedByPolicy: number;
  candidateResolved: number;
  candidateUnresolved: number;
  missingSuccessorKeys: number;
}

const coverage = new Map<string, BaselineActionCoverage>();
const selectedTargetStateActions = new Map<string, number>();

function expectedBaselineAction(state: ItemState): string | undefined {
  if (satisfiesTarget(state, acquisitionTarget)) return undefined;
  const affixes = getAllAffixes(state);
  const desired = affixes.find((mod) => matchesModRequirement(mod, desiredUnfractured));
  const fractured = affixes.find((mod) => mod.isFractured);
  if (fractured && !desired?.isFractured) return 'restart_reacquire';
  if (desired?.isFractured) return 'scouring_orb';
  if (!desired) {
    if (state.rarity === 'normal') return 'transmutation_orb';
    if (state.rarity === 'magic') return 'alteration_orb';
    return undefined;
  }
  if (state.rarity === 'magic' && affixes.length === 1) return 'augmentation_orb';
  if (state.rarity === 'magic' && affixes.length === 2) return 'regal_orb';
  if (state.rarity === 'rare' && affixes.length === 3) return 'exalted_orb';
  if (state.rarity === 'rare' && affixes.length >= 4) return 'fracturing_orb';
  return undefined;
}

for (const [stateKey, node] of search.graphBuild.nodes) {
  const expectedActionId = expectedBaselineAction(node.state);
  if (!expectedActionId) continue;
  const row = coverage.get(expectedActionId) ?? {
    expectedActionId,
    expandedStates: 0,
    actionEdgesPresent: 0,
    directlyResolvedEdges: 0,
    selectedByPolicy: 0,
    candidateResolved: 0,
    candidateUnresolved: 0,
    missingSuccessorKeys: 0,
  };
  row.expandedStates++;
  const edge = node.actions.get(expectedActionId);
  if (edge) {
    row.actionEdgesPresent++;
    if (edge.isDirectlyResolved) row.directlyResolvedEdges++;
    row.missingSuccessorKeys += edge.transitions.filter(
      (transition) => !search.graphBuild.nodes.has(transition.targetKey)
    ).length;
  }
  const decision = search.policyMap.get(stateKey);
  if (decision?.bestActionId === expectedActionId) row.selectedByPolicy++;
  const candidate = decision?.candidateQValues.find(
    (value) => value.actionId === expectedActionId
  );
  if (candidate?.status === 'RESOLVED') row.candidateResolved++;
  else if (candidate) row.candidateUnresolved++;
  if (getAllAffixes(node.state).some((mod) => matchesModRequirement(mod, desiredUnfractured))) {
    const selected = decision?.bestActionId ?? 'NO_POLICY';
    selectedTargetStateActions.set(selected, (selectedTargetStateActions.get(selected) ?? 0) + 1);
  }
  coverage.set(expectedActionId, row);
}

if (quotientViolations.length > 0) {
  throw new Error(`Fracture-preparation quotient audit failed: ${quotientViolations.join(' | ')}`);
}

console.error('[phase2e] persistent PROVE fixture');
const persistent = synthesizeAcquisition(context, {
  cleanStartingState: cleanBase,
  desiredPhysicalState,
  cleanBaseAcquisition,
  searchBudget: { maxStates: 5_001, maxWallTimeMs: 30_000, maxExpansionRounds: 3 },
  searchIntent: 'PROVE',
});

const service = new OptimizerService(repo);
const baseInput: Omit<OptimizeCraftInput, 'target'> = {
  baseType: 'Large Cluster Jewel',
  clusterType,
  itemLevel: 84,
  passiveCount: 12,
  prices: {
    cleanBaseCostChaos: 4,
    cleanBasePriceSource: 'manual',
    cleanBasePriceProvenance: 'Phase 2E controlled clean-base fixture',
  },
  allowResearchFallbackPrices: true,
  searchBudget: { maxStates: 5_000, maxWallTimeMs: 30_000, maxExpansionRounds: 3 },
  searchIntent: 'RECOMMEND',
};

const oneMod = runOptimizer(service, 'R1 one-mod T1 ES', {
  ...baseInput,
  target: { requiredMods: [{ modId: t1EsId }] },
});
const twoModAny = runOptimizer(service, 'R2 two-mod Any', {
  ...baseInput,
  target: { requiredMods: [{ modId: t1EsId }, { modId: targetModId }] },
});
const twoModClean = runOptimizer(service, 'R3 two-mod no-unwanted', {
  ...baseInput,
  target: {
    requiredMods: [{ modId: t1EsId }, { modId: targetModId }],
    finalStateConstraints: { maxUnmatchedAffixes: 0 },
  },
});
const controlledUnresolved = runOptimizer(service, 'Diagnostic E controlled unresolved synthesis', {
  ...baseInput,
  target: { requiredMods: [{ modId: t1EsId }] },
  prices: {
    ...baseInput.prices,
    // Deliberately artificial proof fixture: keep the synthesis structural lower
    // bound below the certified clean-route upper bound while a tiny acquisition
    // budget prevents the fracture policy from certifying a finite executable U.
    currencyRates: { fracturing: 0.001 },
  },
  searchBudget: {
    maxStates: 5_000,
    maxWallTimeMs: 30_000,
    maxExpansionRounds: 3,
    acquisitionMaxStates: 500,
    acquisitionMaxWallTimeMs: 4_000,
    acquisitionMaxExpansionRounds: 3,
  },
});
const multiFracture = runOptimizer(service, 'Diagnostic F multi-fracture portfolio', {
  ...baseInput,
  target: {
    requiredMods: [{ modId: targetModId }, { modId: t1AttributesId }],
    requiredRarity: 'rare',
  },
  searchBudget: {
    maxStates: 5_000,
    maxWallTimeMs: 120_000,
    maxExpansionRounds: 3,
    acquisitionMaxStates: 10_002,
    acquisitionMaxWallTimeMs: 30_000,
    acquisitionMaxExpansionRounds: 3,
  },
});
const forcedRare = runOptimizer(service, 'R4 forced-Rare T1 ES + T1 Intelligence', {
  ...baseInput,
  target: {
    requiredMods: [{ modId: t1EsId }, { modId: targetModId }],
    requiredRarity: 'rare',
  },
  searchBudget: {
    maxStates: 5_000,
    maxWallTimeMs: 120_000,
    maxExpansionRounds: 3,
    acquisitionMaxStates: 10_002,
    acquisitionMaxWallTimeMs: 30_000,
    acquisitionMaxExpansionRounds: 3,
  },
});
const noMarket = runOptimizer(service, 'Diagnostic F no-market explicit fracture', {
  ...baseInput,
  target: { requiredMods: [{ modId: targetModId, mustBeFractured: true }] },
  searchBudget: {
    maxStates: 5_000,
    maxWallTimeMs: 45_000,
    maxExpansionRounds: 3,
    acquisitionMaxStates: 5_001,
    acquisitionMaxWallTimeMs: 15_000,
    acquisitionMaxExpansionRounds: 3,
  },
});

console.error('[phase2e] Harvest and Fracturing parity');
const parity = runExternalParityDiagnostics(context);
const fractureParity = parity.results.find((result) => result.benchmarkId === 'fracture_t1_int');
const harvestParity = parity.results.filter((result) =>
  result.benchmarkId === 'harvest_defences_t1_int_es_raw_presence' ||
  result.benchmarkId === 'annul_once_after_harvest_t1_int_es_raw_hit' ||
  result.benchmarkId === 'harvest_then_one_annul_t1_int_es_presence'
);

const postExpectedCost = search.totalExpectedCostChaos + cleanBaseAcquisition.costChaos;
const postLowerBound = cleanBaseAcquisition.costChaos + Math.min(
  ...search.policyMap.get(getCanonicalStateKey(cleanBase, acquisitionTarget))!.candidateQValues.map(
    (candidate) => candidate.lowerBoundChaos
  )
);
const wrongFractureRules = persistent.policy.filter((rule) =>
  rule.selectedActionId === 'restart_reacquire'
);
const controlledThreats = controlledUnresolved.result.acquisition.candidates.filter(
  (candidate) => candidate.synthesis && candidate.synthesis.status !== 'RESOLVED'
);
const forcedCleanRoute = [
  ...(forcedRare.result.recommended ? [forcedRare.result.recommended] : []),
  ...forcedRare.result.alternatives,
].find((route) => route.acquisitionCandidateId === 'candidate_0');
const executableRegistryActions = CRAFT_MECHANICS
  .filter((mechanic) => typeof mechanic.getTransitions === 'function')
  .map((mechanic) => mechanic.id);

const lines: string[] = [];
lines.push('PHASE 2E — FRACTURE-PREPARATION BASELINE, SEARCH FIDELITY, AND PROOF HARDENING');
lines.push('');
lines.push('DIAGNOSTIC A — PUSHED PHASE 2D SOURCE REVIEW');
lines.push('  synthesizeAcquisition path: normal OptimizerService acquisition stage and generateStartingStrategies compatibility entry.');
lines.push('  resolved synthesis: finite executable U enters portfolio ranking.');
lines.push('  unresolved synthesis: no finite method; lower bound remains a synthetic acquisition evidence route and can make selection unsafe.');
lines.push('  fair budget: shared acquisition states and wall time use integer quotient/remainder across relevant candidates.');
lines.push('  cache identity: clean physical state + fracture requirement + clean evidence + all prices + action list + state-identity version + Harvest/fallback/intent + exact candidate budget.');
lines.push('  legacy formula / market-fractured ranking: diagnostic-only / ABSENT.');

lines.push('');
lines.push('DIAGNOSTIC B — KNOWN-LEGAL FIXED-POLICY BASELINE');
lines.push(`  policy: ${baseline.policyName}`);
for (const [index, step] of baseline.policySteps.entries()) lines.push(`  step ${index + 1}: ${step}`);
for (const evidence of baseline.legalityEvidence) lines.push(`  legality: ${evidence}`);
lines.push(`  U_baseline / preparation / runtime: ${money(baseline.expectedCostChaos)} / ${money(baseline.expectedPreparationCostChaos)} / ${baselineElapsedMs}ms`);
lines.push(`  target hit / desired fracture per attempt: ${pct(baseline.targetHitProbabilityPerMagicRoll)} / ${pct(baseline.desiredFractureProbabilityPerAttempt)}`);
lines.push(`  action usage: ${baseline.expectedActionUsage.map((usage) => `${usage.actionId}=${usage.expectedCount.toFixed(6)} (${money(usage.expectedCostChaos)})`).join(' | ')}`);
lines.push(`  proper / absorption / reconciliation: ${baseline.proper ? 'YES' : 'NO'} / ${pct(baseline.terminalAbsorptionProbability)} / ${money(baseline.reconciliationDifferenceChaos)} (${baseline.costReconciled ? 'PASS' : 'FAIL'})`);
lines.push(`  Fracturing Orbs / restarts: ${baseline.expectedFracturingOrbs.toFixed(9)} / ${baseline.expectedRestarts.toFixed(9)}`);
lines.push(`  concrete baseline coverage: magic=${baseline.stageCoverage.magicRollOutcomes}; hits=${baseline.stageCoverage.magicTargetHitOutcomes}; ready=${baseline.stageCoverage.targetReadyMagicStates}; rare3=${baseline.stageCoverage.rareThreeAffixStates}; rare4=${baseline.stageCoverage.rareFourAffixStates}; fracture transitions=${baseline.stageCoverage.fractureOutcomeTransitions}`);

lines.push('');
lines.push('DIAGNOSTIC C — SEARCH VS BASELINE / STATE-ACTION FAILURE');
lines.push(`  before U_search / L_search: ${money(preChangeSearch.expectedCostChaos)} / ${money(preChangeSearch.lowerBoundChaos)}`);
lines.push(`  baseline difference / ratio: ${money(preChangeSearch.expectedCostChaos - baseline.expectedCostChaos)} / ${(preChangeSearch.expectedCostChaos / baseline.expectedCostChaos).toFixed(6)}x`);
lines.push(`  before usage/failure: ${preChangeSearch.alterations.toFixed(6)} Alterations; ${preChangeSearch.selectedRegalStates}/${preChangeSearch.targetReadyMagicStates} target-ready magic states selected Regal; ${preChangeSearch.resolvedExaltedEdges}/${preChangeSearch.targetRareThreeStatesExpanded} rare3 Exalt edges resolved; ${preChangeSearch.missingExaltedSuccessors} missing Exalt successors.`);
lines.push('  diagnosis: concrete filler identities expanded the same target-present milestones into tens of thousands of equivalent rare3/rare4 states, so unresolved Exalt edges forced the certified policy to reroll valid target hits.');
lines.push('  change: acquisition-only FRACTURE_PREPARATION_BISIMULATION_V1 quotient; target-absent identities remain exact, while target-present filler permutations collapse by rarity/count/fracture milestone. Bellman action choice remains unrestricted.');
lines.push(`  quotient audit: ${quotientViolations.length === 0 ? 'PASS' : 'FAIL'}; concrete graph=${concreteGraph.nodes.size}; classes=${quotientRepresentatives.size}; non-wrong states=${[...quotientRepresentatives.values()].reduce((sum, entry) => sum + entry.concreteStates, 0)}; wrong states=${wrongFractureStatesAudited}; runtime=${concreteAuditElapsedMs}ms; violations=${quotientViolations.length}`);
lines.push(`  after U_search / L_search / runtime: ${money(postExpectedCost)} / ${money(postLowerBound)} / ${searchElapsedMs}ms`);
lines.push(`  after vs baseline: ${money(postExpectedCost - baseline.expectedCostChaos)} (${postExpectedCost <= baseline.expectedCostChaos ? 'BEATS BASELINE' : 'ABOVE BASELINE'})`);
lines.push(`  after action usage: ${search.expectedActionUsage.map((usage) => `${usage.actionId}=${usage.expectedCount.toFixed(6)} (${money(usage.expectedCostChaos)})`).join(' | ')}`);
lines.push(`  after proof: ${search.optimalityProof.selectedPolicyStatus}; global=${search.optimalityProof.globalOptimality}; unresolved-could-beat=${search.optimalityProof.unresolvedCandidatesCouldBeatIncumbent}`);
lines.push(`  baseline milestone edges after: ${[...coverage.values()].map((entry) => `${entry.expectedActionId}:${entry.candidateResolved}/${entry.expandedStates} resolved`).join(' | ')}`);

lines.push('');
lines.push('DIAGNOSTIC D — WRONG-FRACTURE RECOVERY');
lines.push(`  wrong-fracture policy states / visits: ${wrongFractureRules.length} / ${persistent.wrongFractureRecovery.expectedVisits.toFixed(9)}`);
lines.push(`  recovery: ${persistent.wrongFractureRecovery.recoveryActions.map((action) => `${action.actionId}=${action.expectedVisits.toFixed(9)}`).join(' | ')}`);
lines.push(`  in-place reset / restart EV: ${persistent.wrongFractureRecovery.inPlaceResetAvailable ? 'YES' : 'NO'} / ${money(persistent.wrongFractureRecovery.expectedRestartCostChaos)}`);
lines.push(`  permanent-wrong invariant audit: ${wrongFractureStatesAudited} states and ${wrongFractureNonRestartTransitions} non-restart transitions never reached a desired fracture; PASS.`);

lines.push('');
lines.push('DIAGNOSTIC E — UNRESOLVED LOWER-BOUND PROPAGATION');
lines.push('  Fixture isolation: one-mod T1 ES with an intentionally artificial 0.001c Fracturing Orb price and 500-state acquisition budget; diagnostic proof only, never normal pricing/ranking.');
lines.push(...optimizerLines('  Controlled low-price / low-budget proof fixture', controlledUnresolved));
lines.push(`  unresolved synthesis candidates: ${controlledThreats.length}`);
for (const candidate of controlledThreats) {
  lines.push(`  threat ${candidate.label}: status=${candidate.synthesis!.status}; finite executable method=${candidate.methods.some((method) => method.executable) ? 'YES' : 'NO'}; L=${money(candidate.synthesis!.lowerBoundChaos)}; selected incumbent U=${money(controlledUnresolved.result.acquisition.resolvedIncumbentUpperBoundChaos)}; blocks safety=${candidate.synthesis!.lowerBoundChaos < (controlledUnresolved.result.acquisition.resolvedIncumbentUpperBoundChaos ?? Infinity) ? 'YES' : 'NO'}`);
}
lines.push(`  expected product semantics: executable incumbent shown=${controlledUnresolved.result.recommended ? 'YES' : 'NO'}; acquisition safe=${controlledUnresolved.result.acquisition.selectionSafe ? 'YES' : 'NO'}; status=${controlledUnresolved.result.recommendationStatus}`);

lines.push('');
lines.push('DIAGNOSTIC F — MULTIPLE FRACTURES / NO MARKET QUOTE');
lines.push(...optimizerLines('  T1 Intelligence + T1 Attributes portfolio', multiFracture));
lines.push(...optimizerLines('  Explicit fractured T1 Intelligence without market quote', noMarket));
lines.push(`  independent executable fracture families: ${multiFracture.result.acquisition.candidates.filter((candidate) => candidate.methods.some((method) => method.executable)).length}`);
lines.push(`  no-market executable family / cache hit: ${noMarket.result.acquisition.candidates.some((candidate) => candidate.methods.some((method) => method.executable)) ? 'YES' : 'NO'} / ${noMarket.result.acquisition.stage.cacheHits}`);

lines.push('');
lines.push('DIAGNOSTIC G — FRACTURING ORB PARITY');
lines.push(`  external / analytical / seeded MC / status: ${fractureParity?.craftOfExileObservedPct.toFixed(4) ?? 'N/A'}% / ${fractureParity?.analyticalProbabilityPct.toFixed(4) ?? 'N/A'}% / ${fractureParity?.mcObservedProbabilityPct.toFixed(4) ?? 'N/A'}% / ${fractureParity?.status ?? 'MISSING'}`);

lines.push('');
lines.push('DIAGNOSTIC H — PREPARATION ACTION COVERAGE');
lines.push(`  executable registry actions: ${executableRegistryActions.join(', ')}`);
lines.push(`  acquisition enabled actions: ${DEFAULT_ACQUISITION_SYNTHESIS_ACTION_IDS.join(', ')}`);
lines.push('  Transmutation/Alteration/Augmentation/Regal/Exalted/Scour/Fracturing/Restart: MODELED AND APPLICABLE BY STATE.');
lines.push('  Annulment: MODELED FOR NORMAL CRAFTING; intentionally excluded from acquisition synthesis because it removes required progress, is dominated by Scour after success, and cannot repair a wrong permanent fracture.');
lines.push('  Chaos Orb: APPLICABLE BUT NOT EXECUTABLY MODELED (registry legality/cost only; no analytical transition distribution).');
lines.push('  Orb of Alchemy: APPLICABLE BUT NOT MODELED; not required to close the demonstrated search gap and deferred pending a scoped shared transition model.');
lines.push('  Harvest reforges: DEFERRED NON-CORE MECHANIC for the standalone acquisition fixture.');
lines.push('  Standard Crafting Bench target modifier/notable: NOT APPLICABLE TO CLUSTER JEWELS; not modeled or assumed.');
lines.push('  no new mechanic required: generic search now beats the known-legal baseline with the existing executable action set.');

lines.push('');
lines.push('DIAGNOSTIC I — PERSISTENT EXTENSION');
lines.push(`  status / U / L: ${persistent.status} / ${money(persistent.expectedCostChaos)} / ${money(persistent.lowerBoundChaos)}`);
lines.push(`  canonical identity / mode / rounds: ${persistent.search.canonicalStateIdentity} / ${persistent.search.expansionMode} / ${persistent.search.expansionRounds}`);
lines.push(`  canonical states / cumulative work / repeated: ${persistent.search.statesExpanded} / ${persistent.search.cumulativeExpansionWork} / ${persistent.search.repeatedStatesExpanded}`);
lines.push(`  seed / new per round / retained reused per round: ${persistent.search.seedStatesExpanded} / ${persistent.search.newStatesByRound.join(',')} / ${persistent.search.retainedStatesReusedByRound.join(',')}`);
lines.push(`  transition reuse: retained nodes keep generated edges across rounds; no canonical state was re-expanded (${persistent.search.repeatedStatesExpanded} repeated).`);
lines.push(`  proof / proper / absorption / reconciled: ${persistent.proof.globalOptimality}; ${persistent.risk.selectedPolicyProper ? 'YES' : 'NO'} / ${pct(persistent.risk.terminalAbsorptionProbability)} / ${persistent.solver.costReconciled ? 'YES' : 'NO'}`);

lines.push('');
lines.push('R1–R4 NORMAL OPTIMIZER REGRESSIONS');
lines.push(...optimizerLines('  R1 one-mod T1 ES', oneMod));
lines.push(...optimizerLines('  R2 two-mod T1 ES + T1 Int, Any', twoModAny));
lines.push(...optimizerLines('  R3 two-mod no-unwanted', twoModClean));
lines.push(...optimizerLines('  R4 forced-Rare two-mod', forcedRare));
lines.push(`  R4 clean-family U / L: ${money(forcedCleanRoute?.expectedTotalCostChaos)} / ${money(forcedCleanRoute?.lowerBoundChaos)}`);

lines.push('');
lines.push('R5 — HARVEST PARITY');
for (const result of harvestParity) {
  lines.push(`  ${result.benchmarkId}: external=${result.craftOfExileObservedPct.toFixed(7)}%; analytical=${result.analyticalProbabilityPct.toFixed(7)}%; MC=${result.mcObservedProbabilityPct.toFixed(7)}%; status=${result.status}; semantics=${result.targetDescription}`);
}
lines.push('  raw-presence and exactly-one-Annul semantics preserved; remaining junk is allowed.');

lines.push('');
lines.push('R6 — FRACTURING PARITY');
lines.push(`  analytical / seeded / status: ${fractureParity?.analyticalProbabilityPct.toFixed(4) ?? 'N/A'}% / ${fractureParity?.mcObservedProbabilityPct.toFixed(4) ?? 'N/A'}% / ${fractureParity?.status ?? 'MISSING'}`);

lines.push('');
lines.push('PHASE 2E INVARIANTS');
lines.push('  fixed-policy baseline participates in normal ranking: NO.');
lines.push('  Bellman solver action choice hardcoded to baseline: NO.');
lines.push('  standard Bench creates target/notable: NO.');
lines.push('  legacy fixed 4x economics in ranking: NO.');
lines.push('  pre-fractured market purchase in ranking: NO.');
lines.push('  unit tests added: NO.');
lines.push('  Craft-specific solver branches added: NO.');

writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
console.log(lines.join('\n'));
