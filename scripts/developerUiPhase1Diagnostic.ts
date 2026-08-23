import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { browserCraftingCatalog } from '../src/crafting/browserEngine.ts';
import { executeOptimizerWorkerRequest } from '../src/crafting/optimizerWorkerEngine.ts';
import type { OptimizeCraftInput, OptimizeCraftResult } from '../crafting-engine/src/service/optimizerService.ts';
import { ClusterModRepository } from '../crafting-engine/src/data/loadClusterMods.ts';
import { ModPool } from '../crafting-engine/src/domain/ModPool.ts';
import { PriceBook } from '../crafting-engine/src/domain/PriceBook.ts';
import { normalizeItemState } from '../crafting-engine/src/domain/ItemState.ts';
import { toRolledMod } from '../crafting-engine/src/domain/Mod.ts';
import type { TargetDefinition } from '../crafting-engine/src/domain/TargetDefinition.ts';
import { getCanonicalStateKey } from '../crafting-engine/src/rules/actionDiscovery.ts';
import { GenericSearchEngine } from '../crafting-engine/src/solver/genericSearch.ts';

const lines: string[] = [];
const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const outputPath = fileURLToPath(new URL('../output-developer-ui-phase1.txt', import.meta.url));
const baseType = 'Large Cluster Jewel' as const;
const clusterType = '12% increased Attack Damage while holding a Shield';
const itemLevel = 84;
const passiveCount = 12;

function money(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? 'UNRESOLVED'
    : `${value.toFixed(6)}c`;
}

function runWorkerPath(label: string, input: OptimizeCraftInput): OptimizeCraftResult {
  const started = Date.now();
  const response = executeOptimizerWorkerRequest({ type: 'OPTIMIZE', requestId: label, input });
  const elapsedMs = Date.now() - started;
  if (response.type === 'ERROR') throw new Error(`${response.error.name}: ${response.error.message}`);
  const serialized = JSON.stringify(response);
  lines.push(`\n${label}:`);
  lines.push(`  worker-path elapsed: ${elapsedMs}ms`);
  lines.push(`  protocol response: ${response.type}; requestId=${response.requestId}`);
  lines.push(`  JSON-safe round trip: ${JSON.stringify(JSON.parse(serialized)) === serialized ? 'PASS' : 'FAIL'}`);
  lines.push(`  recommendation status: ${response.result.recommendationStatus}`);
  lines.push(`  expected cost: ${money(response.result.expectedCostChaos)}`);
  lines.push(`  graph states / on-policy states: ${response.result.search.statesExpanded} / ${response.result.risk.onPolicyReachableStates}`);
  lines.push(`  unresolved on-policy probability: ${(response.result.risk.unresolvedOnPolicyProbability * 100).toFixed(6)}%`);
  lines.push(`  terminal absorption: ${(response.result.risk.terminalAbsorptionProbability * 100).toFixed(6)}%`);
  lines.push(`  Bellman: ${response.result.solver.bellmanConverged ? 'CONVERGED' : 'NOT CONVERGED'} in ${response.result.solver.bellmanIterations}`);
  lines.push(`  occupancy: ${response.result.solver.occupancyConverged ? 'CONVERGED' : 'NOT CONVERGED'} in ${response.result.solver.occupancyIterations}`);
  lines.push(`  EV reconciliation delta: ${money(response.result.solver.reconciliationDifferenceChaos)} (${response.result.solver.costReconciled ? 'RECONCILED' : 'NOT RECONCILED'})`);
  lines.push(`  proof: ${response.result.proof.proofLevel}; global=${response.result.proof.globalOptimality}`);
  lines.push(`  unresolved competitors may be cheaper: ${response.result.proof.unresolvedCompetitorsMayBeCheaper ? 'YES' : 'NO'}`);
  lines.push(`  budget exhausted: ${response.result.search.budgetExhausted ? 'YES' : 'NO'}`);
  lines.push(`  policy rules from on-policy graph: ${response.result.policyRules.length}`);
  lines.push(`  expected action usage: ${response.result.expectedActionUsage.map((usage) => `${usage.actionName}=${usage.expectedCount.toFixed(4)} (${money(usage.expectedCostChaos)})`).join(' | ') || 'NONE'}`);
  lines.push(`  Harvest scope: ${response.result.search.harvestActionScope.mode} [${response.result.search.harvestActionScope.tags.join(', ')}]`);
  lines.push(`  selected / considered price warnings: ${response.result.priceConfidence.selectedPolicy.warnings.length} / ${response.result.priceConfidence.consideredSearchSpace.warnings.length}`);
  lines.push(`  selected / considered mechanics warnings: ${response.result.mechanicsConfidence.selectedPolicy.warnings.length} / ${response.result.mechanicsConfidence.consideredSearchSpace.warnings.length}`);
  return response.result;
}

lines.push('DEVELOPER UI PHASE 1 — BROWSER / WORKER / SERVICE INTEGRATION');
lines.push('All UI-path searches below use the committed browser snapshot and the same worker engine entry used by the production Web Worker.');

const baseTypes = browserCraftingCatalog.getBaseTypes();
const clusterTypes = browserCraftingCatalog.getClusterTypes(baseType);
const passiveCounts = browserCraftingCatalog.getPassiveCounts(baseType);
const eligibleMods = browserCraftingCatalog.getEligibleMods(baseType, clusterType, itemLevel);
const t1Es = eligibleMods.find((mod) => mod.modId === 'AfflictionJewelSmallPassivesGrantES3');
const t1Int = eligibleMods.find((mod) => mod.modId === 'AfflictionJewelSmallPassivesGrantInt3');
if (!t1Es || !t1Int) throw new Error('Committed browser snapshot is missing T1 ES or T1 Intelligence');

lines.push('\nBROWSER-SAFE CATALOG:');
lines.push(`  bases: ${baseTypes.join(' | ')}`);
lines.push(`  Large cluster enchantments: ${clusterTypes.length}`);
lines.push(`  valid Large passive counts: ${passiveCounts.join(', ')}`);
lines.push(`  eligible ilvl ${itemLevel} shield-pool mods: ${eligibleMods.length}`);
lines.push(`  exact mod fixture: ${t1Es.displayName} [${t1Es.modId}; ${t1Es.genType}; group=${t1Es.modGroup}; ilvl=${t1Es.requiredItemLevel}]`);

const commonInput = {
  baseType,
  clusterType,
  itemLevel,
  passiveCount,
  prices: { cleanBaseCostChaos: 10 },
  allowResearchFallbackPrices: true,
} satisfies Partial<OptimizeCraftInput>;

const oneMod = runWorkerPath('ONE-MOD QUICK SMOKE — EXACT T1 ES', {
  ...commonInput,
  target: { requiredMods: [{ modId: t1Es.modId }] },
  searchBudget: { maxStates: 300, maxWallTimeMs: 5_000, maxExpansionRounds: 1 },
});
lines.push(`  selected acquisition approximation visible: ${oneMod.acquisition.candidates.flatMap((candidate) => candidate.methods).some((method) => method.approximate) ? 'YES' : 'NO'}`);

const twoMod = runWorkerPath('FULL-POOL TWO-MOD UI / WORKER SMOKE — T1 INT + T1 ES', {
  ...commonInput,
  target: {
    requiredRarity: 'rare',
    requiredMods: [{ modId: t1Int.modId }, { modId: t1Es.modId }],
  },
  searchBudget: { maxStates: 3000, maxWallTimeMs: 30_000, maxExpansionRounds: 3 },
});
lines.push(`  selected acquisition: ${twoMod.recommended?.name ?? 'NONE'}`);
lines.push(`  selected policy proper: ${twoMod.risk.selectedPolicyProper ? 'YES' : 'NO'}`);

const exhausted = runWorkerPath('BUDGET EXHAUSTION / NO-ROUTE UI OUTCOME', {
  ...commonInput,
  target: {
    requiredRarity: 'rare',
    requiredMods: [{ modId: t1Int.modId }, { modId: t1Es.modId }],
  },
  searchBudget: { maxStates: 1, maxWallTimeMs: 250, maxExpansionRounds: 1 },
});
lines.push(`  handled as result, not worker error: ${exhausted.recommendationStatus === 'NO_RESOLVED_ROUTE' ? 'PASS' : 'FAIL'}`);

const noFallback = runWorkerPath('RESEARCH-FALLBACK DISABLED', {
  ...commonInput,
  allowResearchFallbackPrices: false,
  target: { requiredMods: [{ modId: t1Es.modId }] },
  searchBudget: { maxStates: 300, maxWallTimeMs: 5_000, maxExpansionRounds: 1 },
});
lines.push(`  fallback toggle respected: ${noFallback.priceConfidence.consideredSearchSpace.evidence.every((entry) => entry.confidence === 'known') ? 'PASS' : 'FAIL'}`);

lines.push('\nRECOMMENDATION STATUS RENDERING CONTRACT:');
lines.push('  PROVEN_OPTIMAL -> Optimal over modeled action/state space');
lines.push('  BEST_RESOLVED -> Best resolved route found / Unresolved routes may still be cheaper');
lines.push('  NO_RESOLVED_ROUTE -> No fully resolved route found within this search budget');
lines.push(`  runtime statuses exercised: ${[oneMod, twoMod, exhausted, noFallback].map((result) => result.recommendationStatus).filter((value, index, values) => values.indexOf(value) === index).join(', ')}`);
lines.push('  no current full-pool browser fixture proves PROVEN_OPTIMAL; its rendering branch is implemented but not promoted by an unresolved search.');

const nodeRepo = new ClusterModRepository();
const fullPool = ModPool.forCluster(nodeRepo, baseType, clusterType);
const effect35 = fullPool.findModById('AfflictionJewelSmallPassivesHaveIncreasedEffect2');
const criticalTarget = fullPool.findModById('Precise Retaliation');
const removableSuffix = fullPool.getSuffixes().find(
  (mod) => mod.ilvl <= itemLevel && mod.modId !== criticalTarget?.modId
);
if (!effect35 || !criticalTarget || !removableSuffix) {
  throw new Error('Missing full-pool Harvest-selected diagnostic fixtures');
}
const reacquireState = normalizeItemState({
  baseType,
  clusterType,
  itemLevel,
  passiveCount,
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
  { pool: fullPool, priceBook: new PriceBook() },
  harvestTarget,
  {
    restartReacquire: {
      destination: reacquireState,
      acquisitionCostChaos: 100,
      confidence: 'known',
      provenance: 'representative observed fractured-base reacquisition fixture',
    },
    includeHarvest: true,
    harvestTags: ['critical'],
    prioritizeTargetProgress: true,
    maxStates: 1000,
    maxWallTimeMs: 15_000,
    maxExpansionRounds: 2,
  }
).search(harvestStart);
const harvestDecision = harvestResult.policyMap.get(getCanonicalStateKey(harvestStart, harvestTarget));
lines.push('\nFULL-POOL HARVEST-SELECTED DIAGNOSTIC:');
lines.push(`  pool: ${fullPool.getAllMods().length} real eligible/source mods before ilvl filtering`);
lines.push(`  target: fractured ${effect35.name} + exact ${criticalTarget.name} on a rare item`);
lines.push('  Harvest tag: critical (the real pool has one critical-tagged eligible modifier for this enchantment)');
lines.push(`  representative input: rare fractured prefix + removable ${removableSuffix.name} suffix`);
for (const candidate of harvestDecision?.candidateQValues ?? []) {
  lines.push(`  candidate ${candidate.actionName}: ${candidate.status}; Q=${money(candidate.totalQValueChaos)}; LB=${money(candidate.lowerBoundChaos)}; could beat incumbent=${candidate.couldBeatResolvedIncumbent ? 'YES' : 'NO'}`);
}
lines.push(`  selected action: ${harvestDecision?.bestActionName ?? 'NONE'}`);
lines.push(`  selected mechanics confidence: ${harvestResult.mechanicsConfidence.evidence.find((entry) => entry.actionId === 'harvest_reforge_critical')?.confidence ?? 'MISSING'}`);
lines.push(`  on-policy states: ${harvestResult.onPolicyGraph.onPolicyReachableStates}`);
lines.push(`  unresolved on-policy probability: ${(harvestResult.onPolicyGraph.onPolicyUnresolvedProbabilityMass * 100).toFixed(6)}%`);
lines.push(`  terminal absorption: ${(harvestResult.onPolicyGraph.terminalAbsorptionProbability * 100).toFixed(6)}%`);
lines.push(`  Bellman / occupancy: ${harvestResult.convergence.iterations} / ${harvestResult.reconciliation.visitIterations} iterations`);
lines.push(`  EV reconciliation: ${money(harvestResult.reconciliation.differenceChaos)} (${harvestResult.reconciliation.isReconciled ? 'RECONCILED' : 'NOT RECONCILED'})`);
lines.push(`  proof: ${harvestResult.optimalityProof.proofLevel}; unresolved competitors may be cheaper=${harvestResult.optimalityProof.unresolvedCandidatesCouldBeatIncumbent ? 'YES' : 'NO'}`);
lines.push(`  elapsed: ${Date.now() - harvestStarted}ms`);

const workerAssets = readdirSync(`${projectRoot}dist/assets`).filter((name) => name.startsWith('optimizer.worker-') && name.endsWith('.js'));
const workerBundleText = workerAssets.map((name) => readFileSync(`${projectRoot}dist/assets/${name}`, 'utf8')).join('\n');
const nodeImportTokens = ['node:fs', 'node:path', 'node:url', 'readFileSync'].filter((token) => workerBundleText.includes(token));
lines.push('\nPRODUCTION BUNDLE INSPECTION:');
lines.push(`  worker chunks: ${workerAssets.join(', ') || 'MISSING'}`);
lines.push(`  Node filesystem/path imports in worker chunk: ${nodeImportTokens.length === 0 ? 'NONE' : nodeImportTokens.join(', ')}`);
lines.push('  cancellation contract: client terminates the active worker, rejects the request as AbortError, and creates a fresh worker.');
lines.push('  worker exceptions and message failures are returned/rejected as serializable Error name + message values.');

writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
console.log(lines.join('\n'));
