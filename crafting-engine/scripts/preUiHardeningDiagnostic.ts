import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ClusterModRepository } from '../src/data/loadClusterMods.ts';
import type { AcquisitionOption } from '../src/solver/expectedCost.ts';
import { ModPool } from '../src/domain/ModPool.ts';
import { PriceBook } from '../src/domain/PriceBook.ts';
import type { ItemState } from '../src/domain/ItemState.ts';
import {
  getPhysicalStateSignature,
  normalizeItemState,
} from '../src/domain/ItemState.ts';
import type { TargetDefinition } from '../src/domain/TargetDefinition.ts';
import {
  getAllTargetModRequirements,
  satisfiesTarget,
} from '../src/domain/TargetDefinition.ts';
import { toRolledMod } from '../src/domain/Mod.ts';
import { createRandomSource } from '../src/probability/random.ts';
import { getCanonicalStateKey } from '../src/rules/actionDiscovery.ts';
import {
  CRAFT_MECHANICS,
  createHarvestReforgeMechanics,
  type AcquisitionPortfolioCandidate,
} from '../src/rules/actionRegistry.ts';
import { getEligibleMods } from '../src/rules/modEligibility.ts';
import {
  GenericSearchEngine,
  type GenericSearchOptions,
  type GenericSearchResult,
} from '../src/solver/genericSearch.ts';
import { OptimizerService } from '../src/service/optimizerService.ts';
import {
  generateStartingStateCandidates,
  type StartingStateCandidate,
} from '../src/solver/strategyDiscovery.ts';

const repo = new ClusterModRepository();
const priceBook = new PriceBook();
const shieldCluster = '12% increased Attack Damage while holding a Shield';
const shieldPool = ModPool.forCluster(repo, 'Large Cluster Jewel', shieldCluster);
const context = { pool: shieldPool, priceBook };

function outputPath(fileName: string): string {
  return fileURLToPath(new URL(`../../${fileName}`, import.meta.url));
}

function finiteCost(value: number): string {
  return Number.isFinite(value) ? `${value.toFixed(3)}c` : 'UNRESOLVED';
}

function findTierOne(group: string) {
  const mod = shieldPool.findModsByGroup(group).find((candidate) => candidate.tier === 1);
  if (!mod) throw new Error(`Missing T1 mod for ${group}`);
  return mod;
}

function virtualAcquisitionState(template: ItemState): ItemState {
  return {
    ...template,
    rarity: 'normal',
    prefixes: [],
    suffixes: [],
    fracturedModIds: [],
    flags: { acquisitionMenu: true },
  };
}

function acquisitionConfidence(option: AcquisitionOption): 'known' | 'research-fallback' {
  return option.type === 'market' && option.confidence === 'deterministic'
    ? 'known'
    : 'research-fallback';
}

function portfolioFromStarts(starts: StartingStateCandidate[]): AcquisitionPortfolioCandidate[] {
  return starts.map((candidate, candidateIndex) => ({
    id: `candidate_${candidateIndex}`,
    label: candidate.label,
    physicalState: normalizeItemState(candidate.state),
    methods: candidate.acquisitions.map((method, methodIndex) => ({
      id: `${method.type}_${methodIndex}`,
      label: `${method.type}: ${candidate.label}`,
      acquisitionCostChaos: method.costChaos,
      confidence: acquisitionConfidence(method),
      provenance: `${method.type} acquisition (${method.confidence})`,
    })),
  }));
}

function resultLines(label: string, result: GenericSearchResult): string[] {
  return [
    `${label}:`,
    `  states expanded: ${result.searchSummary.statesExpanded}/${result.searchSummary.maxStates}`,
    `  cumulative expansion work: ${result.searchSummary.cumulativeExpansionWork}`,
    `  elapsed: ${result.searchSummary.elapsedMs}ms; rounds: ${result.searchSummary.expansionRounds}/${result.searchSummary.maxExpansionRounds}`,
    `  budget exhausted: ${result.searchSummary.budgetExhausted ? 'YES' : 'NO'} (state=${result.searchSummary.stateBudgetExhausted}, wall=${result.searchSummary.wallTimeBudgetExhausted}, rounds=${result.searchSummary.roundBudgetExhausted})`,
    `  on-policy states: ${result.onPolicyGraph.onPolicyReachableStates}`,
    `  unresolved on-policy probability: ${(result.onPolicyGraph.onPolicyUnresolvedProbabilityMass * 100).toFixed(6)}%`,
    `  terminal absorption: ${(result.onPolicyGraph.terminalAbsorptionProbability * 100).toFixed(6)}%`,
    `  Bellman: ${result.convergence.converged ? 'CONVERGED' : 'NOT CONVERGED'} in ${result.convergence.iterations} iterations`,
    `  occupancy: ${result.reconciliation.visitConverged ? 'CONVERGED' : 'NOT CONVERGED'} in ${result.reconciliation.visitIterations} iterations`,
    `  EV action sum / Bellman: ${finiteCost(result.reconciliation.sumExpectedActionCostChaos)} / ${finiteCost(result.reconciliation.reportedDownstreamEVChaos)}`,
    `  EV reconciliation: ${finiteCost(result.reconciliation.differenceChaos)} (${result.reconciliation.isReconciled ? 'RECONCILED' : 'NOT RECONCILED'})`,
    `  unresolved competitive candidates: ${result.optimalityProof.potentiallyCompetitiveUnresolvedCount}`,
    `  selected policy: ${result.optimalityProof.selectedPolicyStatus}`,
    `  proof: ${result.optimalityProof.proofLevel}`,
    `  GLOBAL OPTIMALITY: ${result.optimalityProof.globalOptimality}`,
    `  expected currencies: ${JSON.stringify(result.expectedCurrencies)}`,
    `  price warnings: ${result.priceConfidence.warnings.length > 0 ? result.priceConfidence.warnings.join(' | ') : 'NONE'}`,
    `  mechanics warnings: ${result.mechanicsConfidence.warnings.length > 0 ? result.mechanicsConfidence.warnings.join(' | ') : 'NONE'}`,
  ];
}

const t1Int = shieldPool.findModById('AfflictionJewelSmallPassivesGrantInt3');
const t1Es = findTierOne('AfflictionJewelSmallPassivesGrantES');
const effect35 = shieldPool.findModById('AfflictionJewelSmallPassivesHaveIncreasedEffect2');
if (!t1Int || !effect35) throw new Error('Missing pre-UI fixture mods');

const baseState: ItemState = {
  baseType: 'Large Cluster Jewel',
  clusterType: shieldCluster,
  itemLevel: 84,
  passiveCount: 12,
  rarity: 'normal',
  prefixes: [],
  suffixes: [],
  fracturedModIds: [],
};
const fourModBase: ItemState = {
  ...baseState,
  rarity: 'rare',
  prefixes: [toRolledMod(t1Es), toRolledMod(effect35)],
  suffixes: [toRolledMod(t1Int)],
};
const fillerSuffix = getEligibleMods(fourModBase, shieldPool.getAllMods(), { requiredGenType: 'Suffix' })[0];
if (!fillerSuffix) throw new Error('Missing suffix fixture');
fourModBase.suffixes.push(toRolledMod(fillerSuffix));

const lines: string[] = [];
lines.push('='.repeat(110));
lines.push('PRE-UI PRODUCTION SEARCH HARDENING RUNTIME DIAGNOSTIC');
lines.push('='.repeat(110));

const fracture = CRAFT_MECHANICS.find((mechanic) => mechanic.id === 'fracturing_orb');
if (!fracture) throw new Error('Missing shared Fracturing mechanic');
const influenced = normalizeItemState({ ...fourModBase, flags: { influenced: true } });
const synthesised = normalizeItemState({ ...fourModBase, flags: { synthesised: true } });
const ordinary = normalizeItemState(fourModBase);
lines.push('\nSTATE IDENTITY AND NORMALIZATION:');
lines.push(`  influenced key differs from ordinary: ${getCanonicalStateKey(influenced) !== getCanonicalStateKey(ordinary) ? 'YES' : 'NO'}`);
lines.push(`  synthesised key differs from ordinary: ${getCanonicalStateKey(synthesised) !== getCanonicalStateKey(ordinary) ? 'YES' : 'NO'}`);
lines.push(`  Fracturing legality ordinary/influenced/synthesised: ${fracture.isLegal(ordinary, { requiredMods: [] }, context)}/${fracture.isLegal(influenced, { requiredMods: [] }, context)}/${fracture.isLegal(synthesised, { requiredMods: [] }, context)}`);
lines.push(`  physical signature respects influenced flag: ${getPhysicalStateSignature(influenced) !== getPhysicalStateSignature(ordinary) ? 'YES' : 'NO'}`);
const contradictory = normalizeItemState({
  ...fourModBase,
  prefixes: [toRolledMod(t1Es, { isFractured: true }), toRolledMod(effect35)],
  fracturedModIds: [effect35.modId],
});
lines.push(`  contradictory fracture input normalized: ids=[${contradictory.fracturedModIds.join(',')}] authoritative flag=${contradictory.prefixes[0].isFractured ? 'YES' : 'NO'}`);
const normalizedTargetFixture: TargetDefinition = {
  requiredMods: [{ modId: t1Int.modId }],
  outcomeBranches: [{ name: 'ES branch', requiredMods: [{ modId: t1Es.modId }] }],
  acceptableAnyOf: [[{ modId: effect35.modId }]],
};
lines.push(`  normalized flattened target requirements: ${getAllTargetModRequirements(normalizedTargetFixture).length} (expected 3)`);

const boundedPool = new ModPool([t1Int, t1Es, effect35, fillerSuffix]);
const boundedContext = { pool: boundedPool, priceBook };
const fracIntState: ItemState = normalizeItemState({
  ...baseState,
  rarity: 'magic',
  suffixes: [toRolledMod(t1Int, { isFractured: true })],
});
const duplicateAwarePortfolio: AcquisitionPortfolioCandidate[] = [
  {
    id: 'clean',
    label: 'Clean Base',
    physicalState: baseState,
    methods: [
      { id: 'market', label: 'Buy Clean Base', acquisitionCostChaos: 0.1, confidence: 'known', provenance: 'market fixture' },
      { id: 'self', label: 'Self-Acquire Clean Base', acquisitionCostChaos: 0.2, confidence: 'research-fallback', provenance: 'self-acquisition fixture' },
    ],
  },
  {
    id: 'frac_int',
    label: 'Fractured T1 Int',
    physicalState: fracIntState,
    methods: [
      { id: 'market', label: 'Buy Fractured T1 Int', acquisitionCostChaos: 2, confidence: 'known', provenance: 'market fixture' },
    ],
  },
];
const simpleTarget: TargetDefinition = { requiredMods: [{ modId: t1Int.modId }] };
const acquisitionOptions: GenericSearchOptions = {
  acquisitionPortfolio: duplicateAwarePortfolio,
  maxStates: 600,
  maxIterations: 3000,
};
const acquisitionEngine = new GenericSearchEngine(boundedContext, simpleTarget, acquisitionOptions);
const acquisitionMenu = virtualAcquisitionState(baseState);
const acquisitionResult = acquisitionEngine.search(acquisitionMenu);
const initialDecision = acquisitionResult.policyMap.get(getCanonicalStateKey(acquisitionMenu, simpleTarget));
const wrongFractured = normalizeItemState({
  ...baseState,
  rarity: 'rare',
  suffixes: [toRolledMod(fillerSuffix, { isFractured: true })],
});
const restartAResult = acquisitionEngine.search(wrongFractured);
const restartADecision = restartAResult.policyMap.get(getCanonicalStateKey(wrongFractured, simpleTarget));
const continueState = normalizeItemState(baseState);
const continueResult = acquisitionEngine.search(continueState);
const continueDecision = continueResult.policyMap.get(getCanonicalStateKey(continueState, simpleTarget));
const normalizedAtSolverEntry = acquisitionEngine.search({
  ...wrongFractured,
  suffixes: [toRolledMod(fillerSuffix)],
  fracturedModIds: [fillerSuffix.modId],
}).startingState;
lines.push('\nACQUISITION / REACQUISITION PORTFOLIO — BOUNDED MECHANICS FIXTURE — NOT PRODUCTION ECONOMICS:');
for (const candidate of duplicateAwarePortfolio) {
  lines.push(`  ${candidate.label} -> ${candidate.methods.map((method) => `${method.label}=${method.acquisitionCostChaos.toFixed(1)}c (${method.confidence})`).join(' | ')}`);
}
lines.push(`  methods / distinct physical destinations: 3 / ${new Set(duplicateAwarePortfolio.map((candidate) => getPhysicalStateSignature(candidate.physicalState))).size}`);
lines.push(`  virtual initial selection: ${initialDecision?.bestActionName ?? 'NONE'} (${finiteCost(initialDecision?.optimalValueChaos ?? Infinity)})`);
lines.push(`  restart-to-A winning state selection: ${restartADecision?.bestActionName ?? 'NONE'}`);
lines.push(`  continue-winning state selection: ${continueDecision?.bestActionName ?? 'NONE'}`);
lines.push(`  solver-entry fracture normalization ignored stale id: ${normalizedAtSolverEntry.fracturedModIds.length === 0 ? 'YES' : 'NO'}`);

const harvestTarget: TargetDefinition = { requiredMods: [{ modId: t1Es.modId }] };
const harvestMechanic = createHarvestReforgeMechanics(boundedContext, ['defences'])[0];
if (!harvestMechanic?.getTransitions || !harvestMechanic.sampleTransition) {
  throw new Error('Shared executable Harvest Defence mechanic unavailable');
}
const harvestState = normalizeItemState({
  ...baseState,
  rarity: 'rare',
  prefixes: [toRolledMod(effect35, { isFractured: true })],
  suffixes: [toRolledMod(fillerSuffix)],
});
const harvestDistribution = harvestMechanic.getTransitions(harvestState, harvestTarget, boundedContext);
const harvestProbabilitySum = harvestDistribution.outcomes.reduce((sum, outcome) => sum + outcome.probability, 0);
const harvestAnalyticalSuccess = harvestDistribution.outcomes
  .filter((outcome) => satisfiesTarget(outcome.state, harvestTarget))
  .reduce((sum, outcome) => sum + outcome.probability, 0);
const harvestTrials = 5000;
const harvestRng = createRandomSource(8675309);
let harvestSamplesSucceeded = 0;
const harvestedSampleStates = new Map<string, number>();
for (let trial = 0; trial < harvestTrials; trial++) {
  const sampled = harvestMechanic.sampleTransition(harvestState, harvestTarget, boundedContext, harvestRng);
  const sampledKey = getPhysicalStateSignature(sampled);
  harvestedSampleStates.set(sampledKey, (harvestedSampleStates.get(sampledKey) ?? 0) + 1);
  if (satisfiesTarget(sampled, harvestTarget)) {
    harvestSamplesSucceeded++;
  }
}
const harvestSearch = new GenericSearchEngine(boundedContext, harvestTarget, {
  acquisitionPortfolio: duplicateAwarePortfolio,
  includeHarvest: true,
  harvestTags: ['defences'],
  maxStates: 1000,
  maxIterations: 5000,
}).search(harvestState);
const harvestDecision = harvestSearch.policyMap.get(getCanonicalStateKey(harvestState, harvestTarget));
lines.push('\nSHARED EXECUTABLE HARVEST:');
lines.push(`  action: ${harvestMechanic.name}`);
lines.push(`  analytical outcomes: ${harvestDistribution.outcomes.length}; probability sum=${harvestProbabilitySum.toFixed(8)}`);
lines.push(`  analytical target probability: ${(harvestAnalyticalSuccess * 100).toFixed(4)}%`);
lines.push(`  seeded target probability: ${((harvestSamplesSucceeded / harvestTrials) * 100).toFixed(4)}% (${harvestTrials} trials)`);
lines.push(`  seeded sampled distribution: ${harvestedSampleStates.size} unique physical outcomes across ${harvestTrials} trials`);
const harvestCost = harvestMechanic.getCost(boundedContext);
lines.push(`  price: ${harvestCost.costChaos.toFixed(4)}c (${harvestCost.confidence}; ${harvestCost.provenance})`);
lines.push(`  mechanics confidence: ${harvestMechanic.mechanicsConfidence}`);
lines.push(`  mechanics provenance: ${harvestMechanic.mechanicsProvenance}`);
for (const candidate of harvestDecision?.candidateQValues ?? []) {
  lines.push(`  candidate ${candidate.actionName}: ${candidate.status}, Q=${finiteCost(candidate.totalQValueChaos)}, LB=${candidate.lowerBoundChaos.toFixed(3)}c`);
}

function runFullPool(
  label: string,
  pool: ModPool,
  clusterType: string,
  passiveCount: number,
  itemLevel: number,
  target: TargetDefinition,
  harvestTags: string[]
): { result: GenericSearchResult; starts: StartingStateCandidate[] } {
  const fullContext = { pool, priceBook };
  const starts = generateStartingStateCandidates(
    target,
    'Large Cluster Jewel',
    clusterType,
    itemLevel,
    { pool, priceBook, cleanBaseCostChaos: 10 },
    passiveCount
  );
  const portfolio = portfolioFromStarts(starts);
  const virtualState = virtualAcquisitionState({
    baseType: 'Large Cluster Jewel',
    clusterType,
    itemLevel,
    passiveCount,
    rarity: 'normal',
    prefixes: [],
    suffixes: [],
    fracturedModIds: [],
  });
  const result = new GenericSearchEngine(fullContext, target, {
    acquisitionPortfolio: portfolio,
    includeHarvest: true,
    harvestTags,
    prioritizeTargetProgress: true,
    maxStates: 3000,
    maxWallTimeMs: 30_000,
    maxExpansionRounds: 3,
    maxIterations: 3000,
    maxMarkovIterations: 3000,
  }).search(virtualState);
  lines.push(`\n${label}:`);
  lines.push(`  target: ${JSON.stringify(target)}`);
  lines.push(`  full real pool size: ${pool.getAllMods().length}`);
  lines.push(`  starting candidates: ${starts.map((start) => `${start.label}[${start.acquisitions.map((method) => `${method.type}:${method.costChaos.toFixed(1)}c`).join(',')}]`).join(' | ')}`);
  lines.push(`  enabled actions: ${Object.values(result.graphBuild.actionAttribution).map((entry) => entry.actionName).join(' | ')}`);
  lines.push(...resultLines('  solve', result).map((line) => `  ${line}`));
  lines.push(`  terminal states found / graph cycles: ${result.graphBuild.terminalStatesFound} / ${result.graphBuild.hasCycles ? 'YES' : 'NO'}`);
  lines.push(`  missing graph edges / queued unexpanded: ${result.graphBuild.transitionsToUnexpandedStates} / ${result.graphBuild.queuedButUnexpandedStates}`);
  const startDecision = result.policyMap.get(getCanonicalStateKey(virtualState, target));
  const menuNode = result.graphBuild.nodes.get(getCanonicalStateKey(virtualState, target));
  const acquisitionRoutes = (startDecision?.candidateQValues ?? [])
    .filter((candidate) => candidate.actionId.startsWith('acquire_'))
    .sort((left, right) => left.totalQValueChaos - right.totalQValueChaos);
  const bestResolved = acquisitionRoutes.find((candidate) => candidate.status === 'RESOLVED' && Number.isFinite(candidate.totalQValueChaos));
  lines.push(`  best resolved acquisition route: ${bestResolved?.actionName ?? 'NONE'} at ${finiteCost(bestResolved?.totalQValueChaos ?? Infinity)}`);
  lines.push(`  alternative acquisition routes: ${acquisitionRoutes.length > 0 ? acquisitionRoutes.map((candidate) => `${candidate.actionName} [${candidate.status}; Q=${finiteCost(candidate.totalQValueChaos)}; LB=${candidate.lowerBoundChaos.toFixed(3)}c]`).join(' | ') : 'NONE'}`);
  for (const candidate of portfolio) {
    const physicalKey = getCanonicalStateKey(candidate.physicalState, target);
    const decision = result.policyMap.get(physicalKey);
    const portfolioEdge = [...(menuNode?.actions.values() ?? [])]
      .flatMap((action) => action.transitions)
      .find((transition) => transition.targetKey === physicalKey);
    lines.push(`  downstream ${candidate.label} (node=${result.graphBuild.nodes.has(physicalKey)}, menu-edge=${portfolioEdge !== undefined}): ${decision?.candidateQValues.map((action) => `${action.actionName}[${action.status};missing=${action.unresolvedTargetCount};Q=${finiteCost(action.totalQValueChaos)}]`).join(' | ') ?? 'NO POLICY'}`);
  }
  const harvestSelections = Object.values(result.graphBuild.actionAttribution)
    .filter((entry) => entry.actionId.startsWith('harvest_reforge_'))
    .reduce((sum, entry) => sum + entry.onPolicyStatesSelectingAction, 0);
  lines.push(`  generic Harvest on-policy selections: ${harvestSelections}`);
  return { result, starts };
}

const fullPoolTarget: TargetDefinition = {
  requiredRarity: 'rare',
  requiredMods: [{ modId: t1Int.modId }, { modId: t1Es.modId }],
};
runFullPool(
  'FULL-POOL GENERIC TWO-MOD SMOKE TEST - PRODUCTION POOL',
  shieldPool,
  shieldCluster,
  12,
  84,
  fullPoolTarget,
  ['defences']
);

const serviceResult = new OptimizerService(repo).optimize({
  baseType: 'Large Cluster Jewel',
  clusterType: shieldCluster,
  itemLevel: 84,
  passiveCount: 12,
  target: { requiredMods: [{ modId: t1Es.modId }] },
  harvestTags: ['defences'],
  prices: { cleanBaseCostChaos: 10 },
  searchBudget: { maxStates: 300, maxWallTimeMs: 5_000, maxExpansionRounds: 1 },
});
const serializedServiceResult = JSON.stringify(serviceResult);
lines.push('\nSERIALIZABLE OPTIMIZER SERVICE CONTRACT:');
lines.push(`  JSON round trip: ${JSON.stringify(JSON.parse(serializedServiceResult)) === serializedServiceResult ? 'PASS' : 'FAIL'}`);
lines.push(`  raw Map fields exposed: ${serializedServiceResult.includes('policyMap') ? 'YES' : 'NO'}`);
lines.push(`  result fields: ${Object.keys(serviceResult).join(', ')}`);
lines.push(`  recommendation / proof: ${serviceResult.recommended?.name ?? 'NONE'} / ${serviceResult.proof.proofLevel}`);
lines.push(`  selected price warnings survive: ${serviceResult.priceConfidence.selectedPolicy.warnings.length}`);
lines.push(`  considered price warnings survive: ${serviceResult.priceConfidence.consideredSearchSpace.warnings.length}`);
lines.push(`  selected mechanics warnings survive: ${serviceResult.mechanicsConfidence.selectedPolicy.warnings.length}`);
lines.push(`  considered mechanics warnings survive: ${serviceResult.mechanicsConfidence.consideredSearchSpace.warnings.length}`);

const coldCluster = '12% increased Cold Damage';
const coldPool = ModPool.forCluster(repo, 'Large Cluster Jewel', coldCluster);
const craftBTarget: TargetDefinition = {
  requiredMods: [
    { name: 'Blanketed Snow' },
    { name: 'Prismatic Heart' },
    { name: 'Widespread Destruction' },
  ],
};
runFullPool(
  'CRAFT B FULL-POOL GENERIC DISCOVERY - NOT BOUNDED FIXTURE ECONOMICS',
  coldPool,
  coldCluster,
  8,
  83,
  craftBTarget,
  ['cold']
);

lines.push('\nBOUNDED FIXTURE POLICY:');
lines.push('  All reduced-pool diagnostics are labeled BOUNDED MECHANICS FIXTURE — NOT PRODUCTION ECONOMICS.');

const output = `${lines.join('\n')}\n`;
writeFileSync(outputPath('output-pre-ui-hardening.txt'), output, 'utf8');
console.log(output);
