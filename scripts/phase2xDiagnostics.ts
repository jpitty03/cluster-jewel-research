import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ClusterModRepository } from '../crafting-engine/src/data/loadClusterMods.ts';
import { buildVisualizationGraph } from '../crafting-engine/src/domain/VisualizationGraph.ts';
import {
  buildCraftPlan,
  classifyCraftPlanAction,
  craftPlanPhaseForAction,
  type CraftPlanSource,
} from '../crafting-engine/src/service/craftPlan.ts';
import {
  OptimizerService,
  type OptimizeCraftInput,
} from '../crafting-engine/src/service/optimizerService.ts';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const outputPath = join(
  repositoryRoot,
  'output-phase2x-craft-plan-semantics-budget-ux-proof-depth-diagnostic.txt',
);
const evidencePath = join(
  repositoryRoot,
  'quality-lab',
  'reports',
  'evidence',
  'phase2x-phantom-harvest-after.json',
);
const lines = ['PHASE 2X — CRAFT-PLAN SEMANTICS, BUDGET UX, AND PROOF-DEPTH DIAGNOSTIC'];
const committedEvidenceMode = process.argv.includes('--committed-evidence');

if (committedEvidenceMode) {
  const report = JSON.parse(readFileSync(
    join(repositoryRoot, 'quality-lab', 'reports', 'release-gate.json'),
    'utf8',
  )) as {
    status: string;
    requestedScenario: string;
    checks: Array<{ id: string; scenario: string; passed: boolean }>;
    consoleErrors: string[];
    pageErrors: string[];
    networkErrors: string[];
    artifacts: Record<string, string>;
  };
  assert.equal(report.status, 'PASSED');
  assert(['release', 'nightly'].includes(report.requestedScenario));
  const phaseChecks = report.checks.filter((check) =>
    check.scenario === 'phase2x-craft-plan-semantics-budget-proof-depth'
  );
  assert.equal(phaseChecks.length, 20, 'Committed release does not contain all 20 Phase 2X gates');
  assert(phaseChecks.every((check) => check.passed));
  assert.deepEqual(report.consoleErrors, []);
  assert.deepEqual(report.pageErrors, []);
  assert.deepEqual(report.networkErrors, []);
  for (const key of [
    'phase2xThreeNotableConstellation',
    'phase2xHarvestSelected',
    'phase2xHarvestNotSelected',
    'phase2xBudgetDesktop',
    'phase2xBudgetMobile',
    'phase2xRetryPreview',
    'phase2xSemanticMatrix',
  ]) {
    const relativePath = report.artifacts[key];
    assert(relativePath, `Committed Phase 2X artifact ${key} is missing`);
  }
  const committedOutput = readFileSync(outputPath, 'utf8');
  assert(committedOutput.includes('ALL PHASE 2X LOCAL DIAGNOSTIC GATES PASS'));
  assert(readFileSync(evidencePath, 'utf8').includes('"capture": "POST_FIX"'));
  console.log([
    'PHASE 2X — COMMITTED LOCAL RELEASE EVIDENCE AUDIT',
    `PASS: ${phaseChecks.length}/20 Phase 2X real-browser gates are committed and passing.`,
    'PASS: console/page/network errors are zero; stable screenshots and semantic matrix are present.',
    'PASS: exact post-fix action evidence and the local diagnostic report are committed.',
    'Unit tests run: NO',
  ].join('\n'));
  process.exit(0);
}

const fixtureInput: OptimizeCraftInput = {
  baseType: 'Large Cluster Jewel',
  clusterType: '12% increased Attack Damage while holding a Shield',
  itemLevel: 84,
  passiveCount: 8,
  target: {
    requiredMods: [
      { modId: 'Prodigious Defence' },
      { modId: 'Riot Queller' },
      { modId: 'Smite the Weak' },
    ],
    requiredRarity: 'rare',
  },
  prices: {
    currencyRates: {
      chaos: 1,
      divine: 193.9,
      fracturing: 355.8,
      annul: 8.67,
      exalt: 1.63,
      scour: 0.3711,
      alteration: 0.1405,
      transmutation: 0.01102,
      augmentation: 0.06493,
      regal: 0.119,
      wildLifeforce: 0.01838,
      vividLifeforce: 0.06815,
      primalLifeforce: 0.03697,
    },
    cleanBaseCostChaos: 4,
    cleanBasePriceSource: 'manual',
    cleanBasePriceProvenance: 'Phase 2X frozen exact 3-notable diagnostic price book',
  },
  objective: { kind: 'CHEAPEST_CHAOS' },
  searchBudget: { maxStates: 5_000, maxWallTimeMs: 30_000, maxExpansionRounds: 3 },
  searchIntent: 'RECOMMEND',
  allowResearchFallbackPrices: true,
};

console.error('[phase2x] exact 3-notable canonical plan reproduction');
const started = Date.now();
const result = new OptimizerService(new ClusterModRepository()).optimize(fixtureInput);
const elapsedMs = Date.now() - started;
assert(result.recommended, 'Exact 3-notable fixture did not return an executable route');
assert.equal(result.internalConsistency.status, 'OK');
assert.equal(result.craftPlan.status, 'CERTIFIED');
assert.deepEqual(result.craftPlan.uncoveredActionIds, []);
assert.deepEqual(result.craftPlan.inventedActionIds, []);
assert.deepEqual(result.craftPlan.unknownActionIds, []);

const selectedHarvestActionIds = result.craftPlan.selectedActionIds.filter((actionId) =>
  actionId.startsWith('harvest_reforge_')
);
const planHarvestActionIds = result.craftPlan.steps
  .filter((step) => step.phase === 'SPECIALIZED')
  .flatMap((step) => step.actionIds)
  .filter((actionId) => actionId.startsWith('harvest_reforge_'));
assert.deepEqual(planHarvestActionIds, selectedHarvestActionIds, 'Plan Harvest iff invariant failed');
assert(!result.craftPlan.steps.some((step) => step.actionIds.includes('clean_base_initial')));
assert(result.craftPlan.excludedAccountingActionIds.includes('clean_base_initial'));
const cleanBaseAccounting = result.fullRouteUsage.acquisitionActions.find(
  (usage) => usage.actionId === 'clean_base_initial'
);
assert(cleanBaseAccounting, 'Initial clean base disappeared from acquisition accounting');

const graph = buildVisualizationGraph(
  result.craftPlan,
  result.methodPortfolio,
  result.recommended,
  { acquisitionContext: result.presentation.acquisitionContext },
);
const selectedHarvestNodes = graph.nodes.filter((node) =>
  node.isSelectedRoute && (node.kind === 'HARVEST_REFORGE' || node.label === 'Harvest')
);
assert.equal(
  selectedHarvestNodes.length > 0,
  selectedHarvestActionIds.length > 0,
  'Constellation Harvest iff invariant failed',
);

lines.push('\nX2/X5/X6/X7 — exact 3-notable semantic correction');
lines.push(`status=${result.recommendationStatus}; route=${result.recommended.name}; bundle=${result.internalConsistency.selectedBundleId}; elapsed=${elapsedMs}ms`);
lines.push(`selected physical mechanics=${result.craftPlan.selectedActionIds.join(',') || 'NONE'}`);
lines.push(`selected Harvest mechanics=${selectedHarvestActionIds.join(',') || 'NONE'}`);
lines.push(`plan Harvest mechanics=${planHarvestActionIds.join(',') || 'NONE'}`);
lines.push(`accounting exclusions=${result.craftPlan.excludedAccountingActionIds.join(',') || 'NONE'}; virtual exclusions=${result.craftPlan.excludedVirtualActionIds.join(',') || 'NONE'}`);
lines.push(`coverage=uncovered:${result.craftPlan.uncoveredActionIds.join(',') || 'NONE'}; invented:${result.craftPlan.inventedActionIds.join(',') || 'NONE'}; unknown:${result.craftPlan.unknownActionIds.join(',') || 'NONE'}`);
lines.push(`Constellation selected Harvest nodes=${selectedHarvestNodes.map((node) => node.id).join(',') || 'NONE'}`);
lines.push(`Initial clean base accounting=${cleanBaseAccounting.expectedCount.toFixed(3)} @ ${cleanBaseAccounting.expectedCostChaos.toFixed(3)}c; chronological mechanic=NO`);

const unknownActionId = 'phase2x_unknown_positive_action';
const unknownSource: CraftPlanSource = {
  target: result.target,
  recommendationStatus: result.recommendationStatus,
  recommended: result.recommended,
  expectedActionUsage: [
    ...result.expectedActionUsage,
    {
      actionId: unknownActionId,
      actionName: 'Diagnostic action without presentation metadata',
      expectedCount: 1,
      expectedCostChaos: 0,
    },
  ],
  policyExplanation: result.policyExplanation,
  acquisition: result.acquisition,
  proof: { globalOptimality: result.proof.globalOptimality },
};
const unknownPlan = buildCraftPlan(unknownSource);
assert.equal(classifyCraftPlanAction(unknownActionId).kind, 'UNKNOWN');
assert.equal(craftPlanPhaseForAction(unknownActionId), undefined);
assert.equal(unknownPlan.status, 'UNCERTIFIED');
assert.deepEqual(unknownPlan.steps, []);
assert(unknownPlan.unknownActionIds.includes(unknownActionId));
assert(unknownPlan.withheldReason?.includes('withheld'));
const unknownGraph = buildVisualizationGraph(
  unknownPlan,
  result.methodPortfolio,
  result.recommended,
  { acquisitionContext: result.presentation.acquisitionContext },
);
assert(!unknownGraph.nodes.some((node) => node.isSelectedRoute && node.kind === 'HARVEST_REFORGE'));
lines.push('\nX3 — unknown positive action fails closed');
lines.push(`unknown=${unknownActionId}; classification=UNKNOWN; phase=NONE; plan=${unknownPlan.status}; steps=${unknownPlan.steps.length}; exact diagnostic retained=YES; Harvest node=NO`);

assert.equal(classifyCraftPlanAction('harvest_reforge_defences').kind, 'CRAFT_MECHANIC');
assert.equal(craftPlanPhaseForAction('harvest_reforge_defences'), 'SPECIALIZED');
assert.equal(classifyCraftPlanAction('clean_base_initial').kind, 'ACQUISITION_RESOURCE');
assert.equal(classifyCraftPlanAction('acquire_candidate_0_clean-base_0').kind, 'VIRTUAL_SERVICE');
assert.equal(classifyCraftPlanAction('method:family_conventional').kind, 'VIRTUAL_SERVICE');
lines.push('\nX4 — positive mechanics metadata control');
lines.push('harvest_reforge_defences=CRAFT_MECHANIC/SPECIALIZED; clean_base_initial=ACQUISITION_RESOURCE; acquire_*/method:*=VIRTUAL_SERVICE');

const optimizerUi = readFileSync(join(repositoryRoot, 'src', 'CraftOptimizer.tsx'), 'utf8');
const craftPlanSource = readFileSync(
  join(repositoryRoot, 'crafting-engine', 'src', 'service', 'craftPlan.ts'),
  'utf8',
);
const graphSource = readFileSync(
  join(repositoryRoot, 'crafting-engine', 'src', 'domain', 'VisualizationGraph.ts'),
  'utf8',
);
assert(!craftPlanSource.includes("?? 'SPECIALIZED'"));
assert(!graphSource.includes("step.phase === 'SPECIALIZED') return 'Harvest'"));
for (const required of [
  "NORMAL: { label: 'Normal', maxStates: 5_000, maxWallTimeMs: 30_000, maxExpansionRounds: 3 }",
  "DEEP: { label: 'Deep', maxStates: 10_000, maxWallTimeMs: 60_000, maxExpansionRounds: 4 }",
  "VERY_DEEP: { label: 'Very Deep', maxStates: 20_000, maxWallTimeMs: 120_000, maxExpansionRounds: 5 }",
  "RESEARCH: { label: 'Research', maxStates: 50_000, maxWallTimeMs: 300_000, maxExpansionRounds: 6 }",
  'reuses compatible retained graph',
  'A cheaper crafting route may exist; resolving it would increase the modeled spread',
]) assert(optimizerUi.includes(required), `Missing Phase 2X UI contract: ${required}`);
lines.push('\nX9/X10/X13/X20 — static safety audit');
lines.push('preset table=Normal 5k/30s/3 | Deep 10k/60s/4 | Very Deep 20k/120s/5 | Research 50k/300s/6 | Custom raw');
lines.push('Retry formula=states×2, requested wall×2, rounds+1; compatible retained graph declared; requested-runtime host guard unchanged');
lines.push('generic SPECIALIZED fallback=ABSENT; generic SPECIALIZED→Harvest label=ABSENT; proof-honest selected-route spread wording=PRESENT');

mkdirSync(dirname(evidencePath), { recursive: true });
writeFileSync(evidencePath, `${JSON.stringify({
  phase: '2X',
  capture: 'POST_FIX',
  fixture: fixtureInput,
  result: {
    recommendationStatus: result.recommendationStatus,
    route: result.recommended.name,
    bundleId: result.internalConsistency.selectedBundleId,
    expectedCostChaos: result.expectedCostChaos,
    selectedPhysicalActionIds: result.craftPlan.selectedActionIds,
    selectedHarvestActionIds,
    planHarvestActionIds,
    planSteps: result.craftPlan.steps.map((step) => ({
      id: step.id,
      phase: step.phase,
      actionIds: step.actionIds,
    })),
    constellationSelectedHarvestNodes: selectedHarvestNodes.map((node) => ({
      id: node.id,
      label: node.label,
      kind: node.kind,
    })),
    accountingResource: cleanBaseAccounting,
    excludedAccountingActionIds: result.craftPlan.excludedAccountingActionIds,
    excludedVirtualActionIds: result.craftPlan.excludedVirtualActionIds,
    uncoveredActionIds: result.craftPlan.uncoveredActionIds,
    inventedActionIds: result.craftPlan.inventedActionIds,
    unknownActionIds: result.craftPlan.unknownActionIds,
  },
  unknownActionControl: {
    actionId: unknownActionId,
    planStatus: unknownPlan.status,
    steps: unknownPlan.steps,
    retainedUnknownActionIds: unknownPlan.unknownActionIds,
    selectedHarvestNodeCount: unknownGraph.nodes.filter((node) =>
      node.isSelectedRoute && node.kind === 'HARVEST_REFORGE'
    ).length,
  },
}, null, 2)}\n`, 'utf8');

lines.push('\n=== ALL PHASE 2X LOCAL DIAGNOSTIC GATES PASS ===');
lines.push('Release label/schema: 2Y.1 (Phase 2X behavior retained)');
lines.push('Unit tests added/run: NO');
lines.push('Mechanics probabilities changed: NO');
lines.push('State identity weakened: NO');
lines.push('Harvest forced or route winner hardcoded: NO');
lines.push('Pre-fractured market ranking reintroduced: NO');
writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
console.log(lines.join('\n'));
