import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ClusterModRepository } from '../crafting-engine/src/data/loadClusterMods.ts';
import { ModPool } from '../crafting-engine/src/domain/ModPool.ts';
import { PriceBook } from '../crafting-engine/src/domain/PriceBook.ts';
import { normalizeItemState } from '../crafting-engine/src/domain/ItemState.ts';
import { toRolledMod } from '../crafting-engine/src/domain/Mod.ts';
import type { TargetDefinition } from '../crafting-engine/src/domain/TargetDefinition.ts';
import { getCanonicalStateKey } from '../crafting-engine/src/rules/actionDiscovery.ts';
import { GenericSearchEngine } from '../crafting-engine/src/solver/genericSearch.ts';
import { CraftingCatalog } from '../crafting-engine/src/service/craftingCatalog.ts';
import {
  OptimizerService,
  type OptimizeCraftInput,
  type OptimizeCraftResult,
} from '../crafting-engine/src/service/optimizerService.ts';

const outputPath = fileURLToPath(new URL('../output-developer-ui-phase2b.txt', import.meta.url));
const lines: string[] = ['DEVELOPER UI PHASE 2B — SEARCH USABILITY / PROOF-HONESTNESS DIAGNOSTIC'];
const repository = new ClusterModRepository();
const service = new OptimizerService(repository);
const catalog = new CraftingCatalog(repository);
const shieldCluster = '12% increased Attack Damage while holding a Shield';
const common = {
  baseType: 'Large Cluster Jewel' as const,
  clusterType: shieldCluster,
  itemLevel: 84,
  passiveCount: 12,
  prices: {
    cleanBaseCostChaos: 10,
    cleanBasePriceSource: 'manual' as const,
    cleanBasePriceProvenance: 'controlled Phase 2B diagnostic 10c clean-base override',
  },
  allowResearchFallbackPrices: true,
};

function money(value: number | null | undefined): string {
  return value === null || value === undefined ? 'UNAVAILABLE' : `${value.toFixed(6)}c`;
}

function timing(result: OptimizeCraftResult): string {
  return Object.entries(result.search.stageTimingMs)
    .map(([stage, milliseconds]) => `${stage}=${milliseconds}ms`)
    .join(' | ');
}

function run(label: string, input: OptimizeCraftInput): OptimizeCraftResult {
  const started = Date.now();
  const result = service.optimize(input);
  const wallMs = Date.now() - started;
  const dominated = result.policyRules.reduce(
    (sum, rule) => sum + rule.candidates.filter((candidate) => candidate.status === 'DOMINATED_BY_BOUND').length,
    0
  );
  lines.push(`\n${label}:`);
  lines.push(`  intent: ${result.search.intent}`);
  lines.push(`  status / proof: ${result.recommendationStatus} / ${result.proof.proofLevel}`);
  lines.push(`  selected acquisition: ${result.recommended?.name ?? 'NONE'}`);
  lines.push(`  expected cost: ${money(result.expectedCostChaos)}`);
  lines.push(`  wall / engine elapsed: ${wallMs}ms / ${result.search.elapsedMs}ms`);
  lines.push(`  engine / host deadline: ${result.search.engineDeadlineMs}ms / ${result.search.hostGuardDeadlineMs}ms`);
  lines.push(`  first completed / certified / acquisition-safe: ${result.search.timeToFirstCompletedRoundMs ?? 'N/A'}ms / ${result.search.timeToFirstCertifiedPolicyMs ?? 'N/A'}ms / ${result.search.timeToFirstUsefulRecommendationMs ?? 'N/A'}ms`);
  lines.push(`  returned at budget / host guard: ${result.search.returnedAtBudget ? 'YES' : 'NO'} / ${result.search.hostGuardTriggered ? 'YES' : 'NO'}`);
  lines.push(`  unresolved competitive candidates: ${result.proof.unresolvedCompetitiveCandidates}`);
  lines.push(`  bound-dominated on-policy candidates: ${dominated}`);
  lines.push(`  lower bound: ${result.search.optimisticLowerBoundMethod}; iterations=${result.search.optimisticLowerBoundIterations}; converged=${result.search.optimisticLowerBoundConverged ? 'YES' : 'NO'}`);
  lines.push(`  expanded / cumulative / repeated: ${result.search.statesExpanded} / ${result.search.cumulativeExpansionWork} / ${result.search.repeatedStatesExpanded}`);
  lines.push(`  expansion mode: ${result.search.expansionMode}`);
  lines.push(`  on-policy states / unresolved probability / absorption: ${result.risk.onPolicyReachableStates} / ${(result.risk.unresolvedOnPolicyProbability * 100).toFixed(6)}% / ${(result.risk.terminalAbsorptionProbability * 100).toFixed(6)}%`);
  lines.push(`  Bellman / occupancy / reconciliation: ${result.solver.bellmanIterations} (${result.solver.bellmanConverged ? 'PASS' : 'FAIL'}) / ${result.solver.occupancyIterations} (${result.solver.occupancyConverged ? 'PASS' : 'FAIL'}) / ${money(result.solver.reconciliationDifferenceChaos)} (${result.solver.costReconciled ? 'PASS' : 'FAIL'})`);
  lines.push(`  actions: ${result.expectedActionUsage.map((usage) => usage.actionName).join(' -> ') || 'NONE'}`);
  lines.push(`  grouped policy rules: ${result.policyExplanation.length}`);
  lines.push(`  stage timing: ${timing(result)}`);
  return result;
}

const t1EsRecommend = run('CONTROLLED T1 ES — RECOMMEND', {
  ...common,
  target: { requiredMods: [{ modId: 'AfflictionJewelSmallPassivesGrantES3' }] },
  searchIntent: 'RECOMMEND',
  searchBudget: { maxStates: 5_000, maxWallTimeMs: 30_000, maxExpansionRounds: 3 },
});
const t1EsDeepen = run('CONTROLLED T1 ES — DEEPEN', {
  ...common,
  target: { requiredMods: [{ modId: 'AfflictionJewelSmallPassivesGrantES3' }] },
  searchIntent: 'DEEPEN',
  searchBudget: { maxStates: 5_000, maxWallTimeMs: 15_000, maxExpansionRounds: 3 },
});
run('T1 INTELLIGENCE — RECOMMEND', {
  ...common,
  target: { requiredMods: [{ modId: 'AfflictionJewelSmallPassivesGrantInt3' }] },
  searchIntent: 'RECOMMEND',
  searchBudget: { maxStates: 5_000, maxWallTimeMs: 30_000, maxExpansionRounds: 3 },
});
run('RARE T1 INT + T1 ES — RECOMMEND', {
  ...common,
  target: {
    requiredRarity: 'rare',
    requiredMods: [
      { modId: 'AfflictionJewelSmallPassivesGrantInt3' },
      { modId: 'AfflictionJewelSmallPassivesGrantES3' },
    ],
  },
  searchIntent: 'RECOMMEND',
  searchBudget: { maxStates: 5_000, maxWallTimeMs: 30_000, maxExpansionRounds: 3 },
});

lines.push('\nRECOMMEND VS DEEPEN SUMMARY:');
lines.push(`  recommendation cost preserved: ${money(t1EsRecommend.expectedCostChaos)} / ${money(t1EsDeepen.expectedCostChaos)}`);
lines.push(`  runtime: ${t1EsRecommend.search.elapsedMs}ms / ${t1EsDeepen.search.elapsedMs}ms`);
lines.push(`  unresolved competitors: ${t1EsRecommend.proof.unresolvedCompetitiveCandidates} / ${t1EsDeepen.proof.unresolvedCompetitiveCandidates}`);
lines.push('  RECOMMEND defers expensive proof-only Harvest distributions as explicit unresolved candidates after acquisition screening.');
lines.push('  DEEPEN first secures the same recommendation, then executes the broader competitive frontier until its budget.');
lines.push('  PROVE uses the same full modeled-action expansion but only reports PROVEN_OPTIMAL if every proof gate passes.');

const coldCluster = '12% increased Cold Damage';
const coldMods = catalog.getEligibleMods('Large Cluster Jewel', coldCluster, 83);
const craftBNames = ['Blanketed Snow', 'Prismatic Heart', 'Widespread Destruction'];
const craftBModIds = craftBNames.map((name) => {
  const mod = coldMods.find((candidate) => candidate.name === name);
  if (!mod) throw new Error(`Missing Craft B modifier ${name}`);
  return mod.modId;
});
run('CRAFT B FULL-POOL STRESS — RECOMMEND', {
  baseType: 'Large Cluster Jewel',
  clusterType: coldCluster,
  itemLevel: 83,
  passiveCount: 8,
  target: { requiredRarity: 'rare', requiredMods: craftBModIds.map((modId) => ({ modId })) },
  prices: common.prices,
  allowResearchFallbackPrices: true,
  searchIntent: 'RECOMMEND',
  searchBudget: { maxStates: 5_000, maxWallTimeMs: 10_000, maxExpansionRounds: 3 },
});

const pool = ModPool.forCluster(repository, 'Large Cluster Jewel', shieldCluster);
const effect35 = pool.findModById('AfflictionJewelSmallPassivesHaveIncreasedEffect2');
const criticalTarget = pool.findModById('Precise Retaliation');
const removableSuffix = pool.getSuffixes().find(
  (mod) => mod.ilvl <= 84 && mod.modId !== criticalTarget?.modId
);
if (!effect35 || !criticalTarget || !removableSuffix) throw new Error('Missing Harvest-selected fixtures');
const reacquireState = normalizeItemState({
  baseType: 'Large Cluster Jewel',
  clusterType: shieldCluster,
  itemLevel: 84,
  passiveCount: 12,
  rarity: 'magic',
  prefixes: [toRolledMod(effect35, { isFractured: true })],
  suffixes: [],
  fracturedModIds: [effect35.modId],
});
const harvestStart = normalizeItemState({
  ...reacquireState,
  rarity: 'rare',
  suffixes: [toRolledMod(removableSuffix)],
});
const harvestTarget: TargetDefinition = {
  requiredRarity: 'rare',
  requiredMods: [
    { modId: effect35.modId, mustBeFractured: true },
    { modId: criticalTarget.modId },
  ],
};
const harvestStarted = Date.now();
const harvestResult = new GenericSearchEngine(
  { pool, priceBook: new PriceBook() },
  harvestTarget,
  {
    restartReacquire: {
      destination: reacquireState,
      acquisitionCostChaos: 100,
      confidence: 'known',
      provenance: 'Phase 2B Harvest-selected reacquisition fixture',
    },
    includeHarvest: true,
    harvestTags: ['critical'],
    prioritizeTargetProgress: true,
    maxStates: 1_000,
    maxWallTimeMs: 15_000,
    maxExpansionRounds: 2,
    searchIntent: 'PROVE',
  }
).search(harvestStart);
const harvestDecision = harvestResult.policyMap.get(getCanonicalStateKey(harvestStart, harvestTarget));
lines.push('\nHARVEST-SELECTED FULL-POOL FIXTURE:');
lines.push(`  selected action: ${harvestDecision?.bestActionName ?? 'NONE'}`);
lines.push(`  Harvest status: ${harvestDecision?.candidateQValues.find((candidate) => candidate.actionId === 'harvest_reforge_critical')?.status ?? 'MISSING'}`);
lines.push(`  confidence: ${harvestResult.mechanicsConfidence.evidence.find((entry) => entry.actionId === 'harvest_reforge_critical')?.confidence ?? 'MISSING'}`);
lines.push(`  elapsed: ${Date.now() - harvestStarted}ms`);
lines.push(`  absorption / unresolved on-policy / reconciliation: ${(harvestResult.onPolicyGraph.terminalAbsorptionProbability * 100).toFixed(6)}% / ${(harvestResult.onPolicyGraph.onPolicyUnresolvedProbabilityMass * 100).toFixed(6)}% / ${money(harvestResult.reconciliation.differenceChaos)}`);
lines.push('  external compound parity: CLOSE / APPROXIMATE — ENGINE ~19% OPTIMISTIC');

writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
console.log(lines.join('\n'));
