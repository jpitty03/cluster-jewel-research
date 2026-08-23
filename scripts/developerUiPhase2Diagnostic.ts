import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ClusterModRepository } from '../crafting-engine/src/data/loadClusterMods.ts';
import { ModPool } from '../crafting-engine/src/domain/ModPool.ts';
import { PriceBook, type PriceConfidence } from '../crafting-engine/src/domain/PriceBook.ts';
import { normalizeItemState, type ItemState } from '../crafting-engine/src/domain/ItemState.ts';
import { getAllAffixes } from '../crafting-engine/src/domain/ItemState.ts';
import { toRolledMod } from '../crafting-engine/src/domain/Mod.ts';
import { satisfiesTarget, type TargetDefinition } from '../crafting-engine/src/domain/TargetDefinition.ts';
import type {
  AcquisitionMethodDefinition,
  AcquisitionPortfolioCandidate,
} from '../crafting-engine/src/rules/actionRegistry.ts';
import { createHarvestReforgeMechanics } from '../crafting-engine/src/rules/actionRegistry.ts';
import { getCanonicalStateKey } from '../crafting-engine/src/rules/actionDiscovery.ts';
import {
  GenericSearchEngine,
  type CandidateActionQValue,
  type StatePolicyDecision,
} from '../crafting-engine/src/solver/genericSearch.ts';
import {
  generateStartingStateCandidates,
  type StartingStateCandidate,
} from '../crafting-engine/src/solver/strategyDiscovery.ts';
import { Mulberry32RandomSource } from '../crafting-engine/src/probability/random.ts';
import { OptimizerService } from '../crafting-engine/src/service/optimizerService.ts';

const lines: string[] = [];
const outputPath = fileURLToPath(new URL('../output-developer-ui-phase2.txt', import.meta.url));
const baseType = 'Large Cluster Jewel' as const;
const clusterType = '12% increased Attack Damage while holding a Shield';
const itemLevel = 84;
const passiveCount = 12;
const cleanBaseCostChaos = 10;
const target: TargetDefinition = {
  requiredMods: [{ modId: 'AfflictionJewelSmallPassivesGrantES3' }],
};

function money(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? 'UNRESOLVED'
    : `${value.toFixed(6)}c`;
}

function methodConfidence(start: StartingStateCandidate, methodIndex: number): PriceConfidence {
  const method = start.acquisitions[methodIndex];
  if (method.type === 'market' || method.type === 'clean-base') return 'known';
  return 'research-fallback';
}

function acquisitionPortfolio(starts: StartingStateCandidate[]): AcquisitionPortfolioCandidate[] {
  return starts.map((start, candidateIndex) => ({
    id: `candidate_${candidateIndex}`,
    label: start.label,
    physicalState: normalizeItemState(start.state),
    methods: start.acquisitions.map((method, methodIndex): AcquisitionMethodDefinition => ({
      id: `${method.type}_${methodIndex}`,
      label: method.type === 'self-fracture'
        ? `Approximate self-fracture: ${start.label}`
        : `${method.type}: ${start.label}`,
      acquisitionCostChaos: method.costChaos,
      confidence: methodConfidence(start, methodIndex),
      provenance: method.type === 'clean-base'
        ? 'developer UI Phase 2 diagnostic clean-base input'
        : method.type === 'self-fracture'
          ? 'research fallback self-fracture estimate'
          : 'diagnostic acquisition input',
    })),
  }));
}

function virtualAcquisitionState(): ItemState {
  return normalizeItemState({
    baseType,
    clusterType,
    itemLevel,
    passiveCount,
    rarity: 'normal',
    prefixes: [],
    suffixes: [],
    fracturedModIds: [],
    flags: { acquisitionMenu: true },
  });
}

function candidateLine(candidate: CandidateActionQValue): string {
  return `    ${candidate.actionName}: ${candidate.status}; Q=${money(candidate.totalQValueChaos)}; ` +
    `LB=${money(candidate.lowerBoundChaos)}; unresolved=${candidate.unresolvedTargetCount}; ` +
    `could beat incumbent=${candidate.couldBeatResolvedIncumbent ? 'YES' : 'NO'}`;
}

function printDecision(label: string, decision: StatePolicyDecision | undefined): void {
  lines.push(`\n${label}:`);
  if (!decision) {
    lines.push('  MISSING');
    return;
  }
  lines.push(`  selected: ${decision.bestActionName}; V=${money(decision.optimalValueChaos)}`);
  for (const candidate of decision.candidateQValues) lines.push(candidateLine(candidate));
}

lines.push('DEVELOPER UI PHASE 2A — SIMPLE-CRAFT SEARCH DIAGNOSTIC');
lines.push('Exact live fixture: Large shield cluster, ilvl 84, 12 passives, exact T1 Glowing, clean base 10c.');
lines.push('\nROOT CAUSE OF THE BASELINE ~1534c RECOMMENDATION:');
lines.push('  The clean acquisition was classified from its proper selected continuation, which abandoned into self-fracture.');
lines.push('  Competitive expansion only traversed the global selected route, so it did not recurse into the off-policy clean acquisition.');
lines.push('  Transmutation had cheap unresolved descendants, but that value uncertainty was not propagated back to the clean acquisition/menu proof.');
lines.push('  The queue therefore stopped after one round and incorrectly reported that no unresolved candidate could beat the incumbent.');

const repository = new ClusterModRepository();
const pool = ModPool.forCluster(repository, baseType, clusterType);
const priceBook = new PriceBook();
const starts = generateStartingStateCandidates(
  target,
  baseType,
  clusterType,
  itemLevel,
  { pool, priceBook, cleanBaseCostChaos },
  passiveCount
);
const portfolio = acquisitionPortfolio(starts);
const searchStart = virtualAcquisitionState();
const started = Date.now();
const result = new GenericSearchEngine(
  { pool, priceBook },
  target,
  {
    acquisitionPortfolio: portfolio,
    includeHarvest: true,
    harvestTags: ['defences', 'energy_shield'],
    prioritizeTargetProgress: true,
    allowResearchFallbackPrices: true,
    maxStates: 5_000,
    maxWallTimeMs: 30_000,
    maxExpansionRounds: 3,
  }
).search(searchStart);

const menuKey = getCanonicalStateKey(searchStart, target);
const cleanState = normalizeItemState(starts[0].state);
const cleanKey = getCanonicalStateKey(cleanState, target);
const menuDecision = result.policyMap.get(menuKey);
const cleanDecision = result.policyMap.get(cleanKey);
printDecision('ACQUISITION MENU', menuDecision);
lines.push(`\nCLEAN-BASE DOWNSTREAM STATE KEY:\n  ${cleanKey}`);
printDecision('CLEAN NORMAL STATE', cleanDecision);

const cleanNode = result.graphBuild.nodes.get(cleanKey);
const transmutation = cleanNode?.actions.get('transmutation_orb');
if (transmutation) {
  const successProbability = transmutation.transitions.reduce(
    (sum, transition) => sum + (satisfiesTarget(transition.nextState, target) ? transition.probability : 0),
    0
  );
  lines.push('\nTRANSMUTATION BRANCH:');
  lines.push(`  successors: ${transmutation.transitions.length}`);
  lines.push(`  immediate exact-target probability: ${(successProbability * 100).toFixed(6)}%`);
  const representativeMiss = [...transmutation.transitions]
    .filter((transition) => !satisfiesTarget(transition.nextState, target))
    .sort((left, right) => right.probability - left.probability)[0];
  if (representativeMiss) {
    lines.push(`  representative miss: ${representativeMiss.label ?? representativeMiss.targetKey}`);
    printDecision('REPRESENTATIVE MAGIC MISS', result.policyMap.get(representativeMiss.targetKey));
  }
}

lines.push('\nSEARCH RESULT:');
lines.push(`  elapsed: ${Date.now() - started}ms`);
lines.push(`  graph states: ${result.graphBuild.nodes.size}`);
lines.push(`  selected route: ${result.selectedRouteName}`);
lines.push(`  downstream EV: ${money(result.totalExpectedCostChaos)}`);
lines.push(`  proof: ${result.optimalityProof.proofLevel}`);
lines.push(`  unresolved candidates may be cheaper: ${result.optimalityProof.unresolvedCandidatesCouldBeatIncumbent ? 'YES' : 'NO'}`);
lines.push(`  on-policy states: ${result.onPolicyGraph.onPolicyReachableStates}`);
lines.push(`  absorption: ${(result.onPolicyGraph.terminalAbsorptionProbability * 100).toFixed(6)}%`);
lines.push(`  unresolved on-policy probability: ${(result.onPolicyGraph.onPolicyUnresolvedProbabilityMass * 100).toFixed(6)}%`);
lines.push(`  Bellman / occupancy: ${result.convergence.iterations} / ${result.reconciliation.visitIterations}`);
lines.push(`  reconciliation delta: ${money(result.reconciliation.differenceChaos)}`);
lines.push(`  budget exhausted: ${result.searchSummary.budgetExhausted ? 'YES' : 'NO'}`);

const optimizerService = new OptimizerService(repository);
function runSimpleServiceFixture(label: string, modId: string): void {
  const fixtureStarted = Date.now();
  const serviceResult = optimizerService.optimize({
    baseType,
    clusterType,
    itemLevel,
    passiveCount,
    target: { requiredMods: [{ modId }] },
    prices: { cleanBaseCostChaos, cleanBasePriceSource: 'manual' },
    allowResearchFallbackPrices: true,
    searchBudget: { maxStates: 5_000, maxWallTimeMs: 10_000, maxExpansionRounds: 3 },
  });
  lines.push(`\n${label}:`);
  lines.push(`  selected acquisition: ${serviceResult.recommended?.name ?? 'NONE'}`);
  lines.push(`  expected cost: ${money(serviceResult.expectedCostChaos)}`);
  lines.push(`  actions: ${serviceResult.expectedActionUsage.map((usage) => usage.actionName).join(' -> ') || 'NONE'}`);
  lines.push(`  on-policy states: ${serviceResult.risk.onPolicyReachableStates}`);
  lines.push(`  absorption: ${(serviceResult.risk.terminalAbsorptionProbability * 100).toFixed(6)}%`);
  lines.push(`  Bellman: ${serviceResult.solver.bellmanConverged ? 'CONVERGED' : 'NOT CONVERGED'} in ${serviceResult.solver.bellmanIterations}`);
  lines.push(`  occupancy: ${serviceResult.solver.occupancyConverged ? 'CONVERGED' : 'NOT CONVERGED'} in ${serviceResult.solver.occupancyIterations}`);
  lines.push(`  reconciliation: ${money(serviceResult.solver.reconciliationDifferenceChaos)} (${serviceResult.solver.costReconciled ? 'PASS' : 'FAIL'})`);
  lines.push(`  unresolved competitors may be cheaper: ${serviceResult.proof.unresolvedCompetitorsMayBeCheaper ? 'YES' : 'NO'} (${serviceResult.proof.unresolvedCompetitiveCandidates})`);
  lines.push(`  runtime: ${Date.now() - fixtureStarted}ms`);
}

runSimpleServiceFixture('FULL-POOL ONE-MOD SANITY — T1 INTELLIGENCE', 'AfflictionJewelSmallPassivesGrantInt3');
runSimpleServiceFixture('FULL-POOL ONE-MOD SANITY — PRECISE RETALIATION', 'Precise Retaliation');

const harvestMechanic = createHarvestReforgeMechanics(
  { pool, priceBook },
  ['critical']
).find((mechanic) => mechanic.id === 'harvest_reforge_critical');
const fracturedFixtureMod = pool.findModById('AfflictionJewelSmallPassivesGrantInt3');
if (!harvestMechanic?.getTransitions || !harvestMechanic.sampleTransition || !fracturedFixtureMod) {
  throw new Error('Missing Harvest critical or fractured fixture mechanic data');
}
const unfracturedRare = normalizeItemState({
  baseType,
  clusterType,
  itemLevel,
  passiveCount,
  rarity: 'rare',
  prefixes: [],
  suffixes: [],
  fracturedModIds: [],
});
const oneFractureRare = normalizeItemState({
  ...unfracturedRare,
  prefixes: [toRolledMod(fracturedFixtureMod, { isFractured: true })],
  fracturedModIds: [fracturedFixtureMod.modId],
});
const harvestTarget: TargetDefinition = { requiredMods: [] };

function harvestAffixHistogram(state: ItemState): { analytical: string; seeded: string } {
  const distribution = harvestMechanic!.getTransitions!(state, harvestTarget, { pool, priceBook });
  const analytical = new Map<number, number>();
  for (const outcome of distribution.outcomes) {
    const count = getAllAffixes(outcome.state).length;
    analytical.set(count, (analytical.get(count) ?? 0) + outcome.probability);
  }
  const rng = new Mulberry32RandomSource(20260823);
  const seeded = new Map<number, number>();
  const trials = 10_000;
  for (let index = 0; index < trials; index++) {
    const sampled = harvestMechanic!.sampleTransition!(state, harvestTarget, { pool, priceBook }, rng);
    const count = getAllAffixes(sampled).length;
    seeded.set(count, (seeded.get(count) ?? 0) + 1);
  }
  const formatAnalytical = [...analytical].sort(([left], [right]) => left - right)
    .map(([count, probability]) => `${count} affixes=${(probability * 100).toFixed(4)}%`).join(' | ');
  const formatSeeded = [...seeded].sort(([left], [right]) => left - right)
    .map(([count, samples]) => `${count} affixes=${((samples / trials) * 100).toFixed(4)}%`).join(' | ');
  return { analytical: formatAnalytical, seeded: formatSeeded };
}

lines.push('\nHARVEST TOTAL-AFFIX APPROXIMATION:');
lines.push('  model: preserve fractures + guaranteed tagged mod + roll to 3/4 total explicit affixes (50% each)');
const unfracturedHistogram = harvestAffixHistogram(unfracturedRare);
lines.push(`  unfractured analytical: ${unfracturedHistogram.analytical}`);
lines.push(`  unfractured seeded: ${unfracturedHistogram.seeded}`);
const fracturedHistogram = harvestAffixHistogram(oneFractureRare);
lines.push(`  one-fracture analytical: ${fracturedHistogram.analytical}`);
lines.push(`  one-fracture seeded: ${fracturedHistogram.seeded}`);
lines.push(`  confidence label: ${harvestMechanic.mechanicsConfidence}`);
lines.push('  external compound parity: CLOSE / APPROXIMATE — ENGINE ~19% OPTIMISTIC (external observation remains fixture data, not hardcoded engine output)');

writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
console.log(lines.join('\n'));
