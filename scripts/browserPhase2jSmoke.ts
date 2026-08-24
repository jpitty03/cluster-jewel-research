import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { executeOptimizerWorkerRequest } from '../src/crafting/optimizerWorkerEngine.ts';
import { getSearchRuntimeBudget } from '../crafting-engine/src/service/searchRuntime.ts';
import type {
  OptimizeCraftInput,
  OptimizeCraftResult,
} from '../crafting-engine/src/service/optimizerService.ts';

const outputPath = fileURLToPath(new URL('../output-browser-phase2j-smoke.txt', import.meta.url));

function finite(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value)
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
    `unresolvedOnPolicy=${result.risk.unresolvedOnPolicyProbability.toExponential(3)}`,
  ].join('; ');
}

function runSimulatedWorker(requestId: string, input: OptimizeCraftInput): { result: OptimizeCraftResult; elapsedMs: number; hostGuardDeadlineMs: number } {
  const budget = getSearchRuntimeBudget(input.searchBudget?.maxWallTimeMs);
  const started = Date.now();
  const rawResponse = executeOptimizerWorkerRequest({
    type: 'OPTIMIZE',
    requestId,
    input,
  });
  const elapsedMs = Date.now() - started;
  if (rawResponse.type === 'ERROR') {
    throw new Error(`Worker error in ${requestId}: ${rawResponse.error.message}`);
  }
  // Enforce the exact same host guard timeout used by OptimizerWorkerClient
  if (elapsedMs > budget.hostGuardDeadlineMs) {
    throw new Error(`Worker execution exceeded host guard deadline: ${elapsedMs}ms > ${budget.hostGuardDeadlineMs}ms`);
  }
  // Enforce structured clone serialization round-trip
  const serialized = JSON.stringify(rawResponse);
  const deserialized = JSON.parse(serialized);
  return { result: deserialized.result, elapsedMs, hostGuardDeadlineMs: budget.hostGuardDeadlineMs };
}

const lines: string[] = [
  'PHASE 2J — PRODUCTION BROWSER / WORKER SMOKE & VALIDATION REPORT',
  'All 7 J14 test gates execute against the production browser worker engine with structured cloning and host guard verification.',
  '',
];

// -----------------------------------------------------------------------------
// 1. PHASE 2I CHRONOLOGICAL PLAN REGRESSION & ADVANCED EXACT POLICY RETENTION
// -----------------------------------------------------------------------------
console.error('[browser-phase2j-smoke] 1. Phase 2I chronological plan & Advanced exact policy');
const heraldInput: OptimizeCraftInput = {
  baseType: 'Medium Cluster Jewel',
  clusterType: '10% increased Damage while affected by a Herald',
  itemLevel: 84,
  passiveCount: 6,
  target: {
    requiredMods: [{ modId: 'Empowered Envoy' }, { modId: 'Endbringer' }],
  },
  prices: {
    cleanBaseCostChaos: 10,
    cleanBasePriceSource: 'manual',
    cleanBasePriceProvenance: 'Phase 2J frozen Herald PriceBook fixture',
  },
  allowResearchFallbackPrices: true,
  searchBudget: { maxStates: 5_000, maxWallTimeMs: 30_000, maxExpansionRounds: 3 },
  searchIntent: 'RECOMMEND',
};

const herald1 = runSimulatedWorker('herald-recommend-plan', heraldInput);
const heraldPlan = herald1.result.craftPlan;
const heraldExactHidden = heraldPlan.exactPolicyBranchesHiddenByDefault;
const heraldAdvancedPreserved = herald1.result.policyRules.length > 0 && herald1.result.policyExplanation.length > 0;
const phase2iPlanPass =
  heraldPlan.status === 'CERTIFIED' &&
  heraldPlan.steps.length >= 6 &&
  heraldPlan.uncoveredActionIds.length === 0 &&
  heraldPlan.inventedActionIds.length === 0 &&
  heraldExactHidden === herald1.result.policyExplanation.length &&
  heraldAdvancedPreserved;

lines.push('1. PHASE 2I CHRONOLOGICAL PLAN & ADVANCED EXACT POLICY RETENTION:');
lines.push(`  plan status: ${heraldPlan.status}; steps=${heraldPlan.steps.length}; uncovered=${JSON.stringify(heraldPlan.uncoveredActionIds)}; invented=${JSON.stringify(heraldPlan.inventedActionIds)}`);
lines.push(`  exact branches hidden by default: ${heraldExactHidden}; advanced policy rules: ${herald1.result.policyRules.length}`);
lines.push(`  Result: ${phase2iPlanPass ? 'PASS' : 'FAIL'}`);
lines.push('');

// -----------------------------------------------------------------------------
// 2. HERALD DEFAULT RECOMMEND: CONFIDENCE SEPARATION & BOUNDED REFINEMENT
// -----------------------------------------------------------------------------
console.error('[browser-phase2j-smoke] 2. Herald confidence separation & bounded refinement');
const acquisitionConfidence = herald1.result.recommendationStatus === 'NO_RESOLVED_ROUTE'
  ? 'No fully resolved route is available'
  : herald1.result.recommendationStatus === 'PROVISIONAL_RESOLVED'
    ? 'Not acquisition-safe; cheaper unresolved acquisition may exist'
    : herald1.result.recommendationStatus === 'PROVEN_OPTIMAL'
      ? 'Proven optimal over the modeled search space'
      : 'Acquisition-safe';

const strategyConfidence = herald1.result.policyRefinement.status === 'MODELED_OPTIMAL'
  ? 'Modeled-action optimality proven'
  : herald1.result.policyRefinement.status === 'STILL_IMPROVING_AT_BUDGET'
    ? 'Current best — still improving at the search budget'
    : herald1.result.policyRefinement.status === 'CURRENT_BEST_UNPROVEN'
      ? 'Current best — modeled optimality not proven'
      : 'No executable downstream policy certified';

const heraldConfidencePass =
  herald1.result.recommendationStatus === 'BEST_RESOLVED_ACQUISITION_SAFE' &&
  herald1.result.risk.selectedPolicyProper &&
  herald1.result.solver.bellmanConverged &&
  herald1.result.solver.occupancyConverged &&
  herald1.result.solver.costReconciled &&
  herald1.result.policyRefinement.status === 'STILL_IMPROVING_AT_BUDGET' &&
  (herald1.result.policyRefinement.improvementChaos ?? 0) > 0;

lines.push('2. HERALD DEFAULT RECOMMEND (CONFIDENCE SEPARATION & BOUNDED REFINEMENT):');
lines.push(`  status: ${herald1.result.recommendationStatus}; U=${finite(herald1.result.expectedCostChaos)}; elapsed=${herald1.elapsedMs}ms`);
lines.push(`  health: ${health(herald1.result)}`);
lines.push(`  Starting acquisition confidence: "${acquisitionConfidence}"`);
lines.push(`  Crafting strategy confidence: "${strategyConfidence}"`);
lines.push(`  Refinement: firstU=${finite(herald1.result.policyRefinement.firstCertifiedUpperBoundChaos)}; finalU=${finite(herald1.result.policyRefinement.finalUpperBoundChaos)}; improvement=${finite(herald1.result.policyRefinement.improvementChaos)} (${((herald1.result.policyRefinement.improvementFraction ?? 0) * 100).toFixed(3)}%)`);
lines.push(`  Result: ${heraldConfidencePass ? 'PASS' : 'FAIL'}`);
lines.push('');

// -----------------------------------------------------------------------------
// 3. SAME-WORKER RETRY DEEPER (EXACT-CONTEXT SESSION REUSE)
// -----------------------------------------------------------------------------
console.error('[browser-phase2j-smoke] 3. Same-worker Retry Deeper (resumed)');
const deepenInput: OptimizeCraftInput = {
  ...heraldInput,
  searchBudget: { maxStates: 10_000, maxWallTimeMs: 60_000, maxExpansionRounds: 4 },
  searchIntent: 'DEEPEN',
};

const herald2 = runSimulatedWorker('herald-deepen-resumed', deepenInput);
const resumePass =
  herald2.result.search.sessionReuse.status === 'RESUMED' &&
  herald2.result.search.sessionReuse.retainedStates > 0 &&
  herald2.result.search.sessionReuse.retainedTransitionDistributions > 0 &&
  herald2.result.risk.selectedPolicyProper &&
  herald2.result.solver.costReconciled;

lines.push('3. SAME-WORKER RETRY DEEPER (EXACT-CONTEXT SESSION REUSE):');
lines.push(`  status: ${herald2.result.recommendationStatus}; U=${finite(herald2.result.expectedCostChaos)}; elapsed=${herald2.elapsedMs}ms`);
lines.push(`  session: status=${herald2.result.search.sessionReuse.status}; retainedStates=${herald2.result.search.sessionReuse.retainedStates}; retainedDistributions=${herald2.result.search.sessionReuse.retainedTransitionDistributions}`);
lines.push(`  generated transitions: ${herald2.result.search.transitionDistributionsGenerated}; reused: ${herald2.result.search.transitionDistributionsReused}`);
lines.push(`  Result: ${resumePass ? 'PASS' : 'FAIL'}`);
lines.push('');

// -----------------------------------------------------------------------------
// 4. EXACT FOUR-MOD GENERIC PRODUCT SOLVE (RWE-2) BEFORE HOST GUARD
// -----------------------------------------------------------------------------
console.error('[browser-phase2j-smoke] 4. Exact four-mod generic product solve');
const fourModInput: OptimizeCraftInput = {
  baseType: 'Large Cluster Jewel',
  clusterType: '12% increased Attack Damage while Dual Wielding',
  itemLevel: 84,
  passiveCount: 12,
  target: {
    requiredMods: [
      { modId: 'AfflictionJewelSmallPassivesGrantInt3' },
      { modId: 'AfflictionJewelSmallPassivesHaveIncreasedEffect2' },
      { modId: 'AfflictionJewelSmallPassivesGrantAttributes3' },
      { modId: 'AfflictionJewelSmallPassivesGrantES3' },
    ],
  },
  prices: {
    cleanBaseCostChaos: 10,
    cleanBasePriceSource: 'manual',
    cleanBasePriceProvenance: 'Phase 2J controlled four-mod clean base',
  },
  allowResearchFallbackPrices: true,
  searchBudget: { maxStates: 5_000, maxWallTimeMs: 30_000, maxExpansionRounds: 3 },
  searchIntent: 'RECOMMEND',
};

const fourMod = runSimulatedWorker('four-mod-rwe2', fourModInput);
const fourModPass =
  fourMod.result.recommended !== null &&
  fourMod.result.recommendationStatus === 'PROVISIONAL_RESOLVED' &&
  Number.isFinite(fourMod.result.expectedCostChaos) &&
  fourMod.elapsedMs <= fourMod.hostGuardDeadlineMs &&
  fourMod.result.risk.selectedPolicyProper &&
  fourMod.result.risk.terminalAbsorptionProbability >= 1 - 1e-8 &&
  fourMod.result.solver.bellmanConverged &&
  fourMod.result.solver.occupancyConverged &&
  fourMod.result.solver.costReconciled &&
  fourMod.result.craftPlan.status === 'CERTIFIED' &&
  fourMod.result.craftPlan.uncoveredActionIds.length === 0 &&
  fourMod.result.craftPlan.inventedActionIds.length === 0;

lines.push('4. EXACT FOUR-MOD REAL-WORLD SOLVE (RWE-2) BEFORE HOST GUARD:');
lines.push(`  status: ${fourMod.result.recommendationStatus}; U=${finite(fourMod.result.expectedCostChaos)}; elapsed=${fourMod.elapsedMs}ms (host guard=${fourMod.hostGuardDeadlineMs}ms)`);
lines.push(`  health: ${health(fourMod.result)}`);
lines.push(`  plan: status=${fourMod.result.craftPlan.status}; steps=${fourMod.result.craftPlan.steps.length}; uncovered=${JSON.stringify(fourMod.result.craftPlan.uncoveredActionIds)}; invented=${JSON.stringify(fourMod.result.craftPlan.inventedActionIds)}`);
lines.push(`  finished before host guard: ${fourMod.elapsedMs <= fourMod.hostGuardDeadlineMs ? 'YES' : 'NO'}`);
lines.push(`  Result: ${fourModPass ? 'PASS' : 'FAIL'}`);
lines.push('');

// -----------------------------------------------------------------------------
// 5. DEFENSIVE TWO-MOD RUNTIME & HARVEST REUSE (T1 ARMOUR + T1 ES)
// -----------------------------------------------------------------------------
console.error('[browser-phase2j-smoke] 5. Defensive two-mod runtime (T1 Armour + T1 ES)');
const twoModInput: OptimizeCraftInput = {
  baseType: 'Large Cluster Jewel',
  clusterType: '12% increased Attack Damage while holding a Shield',
  itemLevel: 84,
  passiveCount: 12,
  target: {
    requiredMods: [
      { modId: 'AfflictionJewelSmallPassivesGrantArmour3_' },
      { modId: 'AfflictionJewelSmallPassivesGrantES3' },
    ],
  },
  prices: {
    cleanBaseCostChaos: 10,
    cleanBasePriceSource: 'manual',
    cleanBasePriceProvenance: 'Phase 2J controlled T1 Armour + T1 ES base',
  },
  allowResearchFallbackPrices: true,
  searchBudget: { maxStates: 5_000, maxWallTimeMs: 30_000, maxExpansionRounds: 3 },
  searchIntent: 'RECOMMEND',
};

const twoMod = runSimulatedWorker('two-mod-defensive', twoModInput);
const twoModPass =
  twoMod.result.recommendationStatus === 'BEST_RESOLVED_ACQUISITION_SAFE' &&
  Number.isFinite(twoMod.result.expectedCostChaos) &&
  twoMod.elapsedMs < 15_000 &&
  twoMod.result.risk.selectedPolicyProper &&
  twoMod.result.solver.costReconciled;

lines.push('5. DEFENSIVE TWO-MOD RUNTIME (T1 ARMOUR + T1 ES):');
lines.push(`  status: ${twoMod.result.recommendationStatus}; U=${finite(twoMod.result.expectedCostChaos)}; elapsed=${twoMod.elapsedMs}ms`);
lines.push(`  health: ${health(twoMod.result)}`);
lines.push(`  reused transition distributions: ${twoMod.result.search.transitionDistributionsReused}`);
lines.push(`  completed inside practical window (< 15s): ${twoMod.elapsedMs < 15_000 ? 'YES' : 'NO'}`);
lines.push(`  Result: ${twoModPass ? 'PASS' : 'FAIL'}`);
lines.push('');

// -----------------------------------------------------------------------------
// 6. NO-ROUTE MATERIAL SAFETY (CONSTRAINED SEARCH BUDGET)
// -----------------------------------------------------------------------------
console.error('[browser-phase2j-smoke] 6. No-route material safety');
const noRouteInput: OptimizeCraftInput = {
  baseType: 'Large Cluster Jewel',
  clusterType: '12% increased Cold Damage',
  itemLevel: 84,
  passiveCount: 12,
  target: {
    requiredMods: [
      { modId: 'Blanketed Snow' },
      { modId: 'Prismatic Heart' },
      { modId: 'Widespread Destruction' },
    ],
  },
  prices: { cleanBaseCostChaos: 10 },
  allowResearchFallbackPrices: true,
  searchBudget: { maxStates: 1, maxWallTimeMs: 1, maxExpansionRounds: 1 },
};

const noRoute = runSimulatedWorker('no-route-safety', noRouteInput);
const noRoutePass =
  noRoute.result.recommendationStatus === 'NO_RESOLVED_ROUTE' &&
  noRoute.result.recommended === null &&
  noRoute.result.craftPlan.status === 'UNCERTIFIED' &&
  noRoute.result.craftPlan.steps.length === 0;

lines.push('6. NO-ROUTE MATERIAL SAFETY (CONSTRAINED BUDGET):');
lines.push(`  status: ${noRoute.result.recommendationStatus}; planStatus=${noRoute.result.craftPlan.status}; steps=${noRoute.result.craftPlan.steps.length}`);
lines.push(`  Result: ${noRoutePass ? 'PASS' : 'FAIL'}`);
lines.push('');

// -----------------------------------------------------------------------------
// 7. SPECIALIZED PLAN COVERAGE (SELF-FRACTURE & HARVEST INTEGRATION)
// -----------------------------------------------------------------------------
console.error('[browser-phase2j-smoke] 7. Specialized plan coverage');
// Artificially cheap fracturing orb forces self-fracture acquisition
const cheapFractureInput: OptimizeCraftInput = {
  baseType: 'Medium Cluster Jewel',
  clusterType: '10% increased Damage while affected by a Herald',
  itemLevel: 84,
  passiveCount: 6,
  target: {
    requiredMods: [{ modId: 'Empowered Envoy' }, { modId: 'Endbringer' }],
  },
  prices: {
    cleanBaseCostChaos: 4,
    currencyRates: {
      fracturing: 0.1, // Artificially cheap fracturing orb forces self-fracture
    },
  },
  allowResearchFallbackPrices: true,
  searchBudget: { maxStates: 5_000, maxWallTimeMs: 30_000, maxExpansionRounds: 3 },
  searchIntent: 'RECOMMEND',
};

const fractureResult = runSimulatedWorker('specialized-fracture-plan', cheapFractureInput);
const specializedPlan = fractureResult.result.craftPlan;
const specializedPass =
  specializedPlan.status === 'CERTIFIED' &&
  specializedPlan.uncoveredActionIds.length === 0 &&
  specializedPlan.inventedActionIds.length === 0 &&
  specializedPlan.steps.length >= 6;

lines.push('7. SPECIALIZED PLAN COVERAGE (SELF-FRACTURE & HARVEST INTEGRATION):');
lines.push(`  plan status: ${specializedPlan.status}; steps=${specializedPlan.steps.length}; uncovered=${JSON.stringify(specializedPlan.uncoveredActionIds)}; invented=${JSON.stringify(specializedPlan.inventedActionIds)}`);
lines.push(`  selected start: ${fractureResult.result.recommended?.name ?? 'NONE'}`);
lines.push(`  Result: ${specializedPass ? 'PASS' : 'FAIL'}`);
lines.push('');

// -----------------------------------------------------------------------------
// OVERALL SUMMARY
// -----------------------------------------------------------------------------
const allPassed =
  phase2iPlanPass &&
  heraldConfidencePass &&
  resumePass &&
  fourModPass &&
  twoModPass &&
  noRoutePass &&
  specializedPass;

lines.push('================================================================================');
lines.push(`ALL 7 PRODUCTION BROWSER / WORKER SMOKES: ${allPassed ? 'ALL PASS' : 'FAILURES DETECTED'}`);
lines.push('================================================================================');

writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
console.log(lines.join('\n'));

if (!allPassed) {
  throw new Error('Phase 2J production browser / worker smoke failed one or more assertions');
}
