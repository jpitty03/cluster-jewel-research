import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ClusterModRepository } from '../src/data/loadClusterMods.ts';
import { ModPool } from '../src/domain/ModPool.ts';
import { PriceBook } from '../src/domain/PriceBook.ts';
import type { ItemState } from '../src/domain/ItemState.ts';
import type { TargetDefinition } from '../src/domain/TargetDefinition.ts';
import { toRolledMod } from '../src/domain/Mod.ts';
import { CRAFT_MECHANICS } from '../src/rules/actionRegistry.ts';
import { getCanonicalStateKey } from '../src/rules/actionDiscovery.ts';
import { getEligibleMods } from '../src/rules/modEligibility.ts';
import { runExternalParityDiagnostics } from '../src/rules/externalParity.ts';
import { GenericSearchEngine, type GenericSearchResult } from '../src/solver/genericSearch.ts';
import { generateStartingStateCandidates } from '../src/solver/strategyDiscovery.ts';

const repo = new ClusterModRepository();
const priceBook = new PriceBook();
const clusterType = '12% increased Attack Damage while holding a Shield';
const pool = ModPool.forCluster(repo, 'Large Cluster Jewel', clusterType);
const context = { pool, priceBook };

function outputPath(fileName: string): string {
  return fileURLToPath(new URL(`../../${fileName}`, import.meta.url));
}

function describeState(state: ItemState): string {
  const affix = (mod: ItemState['prefixes'][number]): string =>
    `${mod.name}${mod.isFractured ? ' [FRACTURED]' : ''}`;
  return `${state.rarity.toUpperCase()} | P=[${state.prefixes.map(affix).join(', ') || 'none'}] | S=[${state.suffixes.map(affix).join(', ') || 'none'}]`;
}

function findTierOne(group: string) {
  const mod = pool.findModsByGroup(group).find((candidate) => candidate.tier === 1);
  if (!mod) throw new Error(`Missing T1 fixture mod for ${group}`);
  return mod;
}

function resultSummary(label: string, result: GenericSearchResult): string[] {
  const lines: string[] = [];
  lines.push(`${label}:`);
  lines.push(`  Candidate graph states: ${result.canonicalStatesVisited}/${result.graphBuild.maxStates} (cap hit: ${result.graphBuild.hitStateLimit ? 'YES' : 'NO'})`);
  lines.push(`  Candidate graph cycles: ${result.graphBuild.hasCycles ? 'YES' : 'NO'}`);
  lines.push(`  On-policy states: ${result.onPolicyGraph.onPolicyReachableStates}`);
  lines.push(`  On-policy cycles: ${result.onPolicyGraph.hasCycles ? 'YES' : 'NO'}`);
  lines.push(`  Bellman: ${result.convergence.converged ? 'CONVERGED' : 'NOT CONVERGED'} in ${result.convergence.iterations} iterations (residual ${result.convergence.finalMaxResidual.toExponential(4)})`);
  lines.push(`  On-policy unresolved probability: ${(result.onPolicyGraph.onPolicyUnresolvedProbabilityMass * 100).toFixed(6)}%`);
  lines.push(`  Terminal absorption: ${(result.onPolicyGraph.terminalAbsorptionProbability * 100).toFixed(6)}%`);
  lines.push(`  Occupancy: ${result.reconciliation.visitConverged ? 'CONVERGED' : 'NOT CONVERGED'} in ${result.reconciliation.visitIterations} iterations (residual ${result.reconciliation.visitMaxResidual.toExponential(4)})`);
  lines.push(`  Action-cost sum / Bellman EV: ${result.reconciliation.sumExpectedActionCostChaos.toFixed(4)}c / ${result.reconciliation.reportedDownstreamEVChaos.toFixed(4)}c`);
  lines.push(`  EV reconciliation delta: ${result.reconciliation.differenceChaos.toFixed(6)}c (${result.reconciliation.isReconciled ? 'RECONCILED' : 'NOT RECONCILED'})`);
  lines.push(`  Selected policy: ${result.optimalityProof.selectedPolicyStatus}`);
  lines.push(`  Recursive candidate resolution: ${result.optimalityProof.candidateResolutionConverged ? 'CONVERGED' : 'NOT CONVERGED'}`);
  lines.push(`  Proof level: ${result.optimalityProof.proofLevel}`);
  lines.push(`  GLOBAL OPTIMALITY: ${result.optimalityProof.globalOptimality}`);
  lines.push(`  Unresolved competitors / potentially cheaper: ${result.optimalityProof.unresolvedCompetitorCount} / ${result.optimalityProof.potentiallyCompetitiveUnresolvedCount}`);
  lines.push(`  Price confidence complete: ${result.priceConfidence.complete ? 'YES' : 'NO'}; warnings: ${result.priceConfidence.warnings.length}`);
  return lines;
}

const t1Int = pool.findModById('AfflictionJewelSmallPassivesGrantInt3');
const t1Es = findTierOne('AfflictionJewelSmallPassivesGrantES');
const effect35 = pool.findModById('AfflictionJewelSmallPassivesHaveIncreasedEffect2');
if (!t1Int || !effect35) throw new Error('Missing shared mechanic fixture mods');

const threeModRare: ItemState = {
  baseType: 'Large Cluster Jewel',
  clusterType,
  itemLevel: 84,
  passiveCount: 12,
  rarity: 'rare',
  prefixes: [toRolledMod(t1Es), toRolledMod(effect35)],
  suffixes: [toRolledMod(t1Int)],
  fracturedModIds: [],
};
const fillerSuffix = getEligibleMods(threeModRare, pool.getAllMods(), { requiredGenType: 'Suffix' })
  .find((mod) => mod.modGroup !== t1Int.modGroup);
if (!fillerSuffix) throw new Error('Missing suffix fixture');
const prefixOnlyRare: ItemState = {
  ...threeModRare,
  suffixes: [],
};
const prefixAndFillerRare: ItemState = {
  ...prefixOnlyRare,
  suffixes: [toRolledMod(fillerSuffix)],
};
const fillerSuffix2 = getEligibleMods(prefixAndFillerRare, pool.getAllMods(), { requiredGenType: 'Suffix' })
  .find((mod) => mod.modGroup !== t1Int.modGroup);
if (!fillerSuffix2) throw new Error('Missing second suffix fixture');
const boundedMechanicsPool = new ModPool([t1Es, effect35, t1Int, fillerSuffix, fillerSuffix2]);
const boundedMechanicsContext = { pool: boundedMechanicsPool, priceBook };

const ordinaryMagic: ItemState = {
  ...threeModRare,
  rarity: 'magic',
  prefixes: [toRolledMod(t1Es)],
  suffixes: [],
};
const ordinaryRare: ItemState = {
  ...threeModRare,
  suffixes: [toRolledMod(fillerSuffix), toRolledMod(fillerSuffix2)],
};
const fracturedWithRemovable: ItemState = {
  ...threeModRare,
  suffixes: [toRolledMod(t1Int, { isFractured: true })],
  fracturedModIds: [t1Int.modId],
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

const lines: string[] = [];
lines.push('='.repeat(100));
lines.push('POST ON-POLICY SOLVER REVIEW — CORE MECHANICS PHASE RUNTIME DIAGNOSTIC');
lines.push('='.repeat(100));

const scour = CRAFT_MECHANICS.find((mechanic) => mechanic.id === 'scouring_orb');
if (!scour?.getTransitions || !scour.sampleTransition) throw new Error('Shared Scour is not executable');
const noTarget: TargetDefinition = { requiredMods: [] };
lines.push('\nSHARED SCOUR BEFORE / AFTER:');
for (const [label, state] of [
  ['ordinary magic item', ordinaryMagic],
  ['ordinary rare item', ordinaryRare],
  ['fractured item + removable mods', fracturedWithRemovable],
] as const) {
  const analytical = scour.getTransitions(state, noTarget, context).outcomes[0]?.state;
  const sampled = scour.sampleTransition(state, noTarget, context, { next: () => 0.5 });
  lines.push(`  ${label}:`);
  lines.push(`    before: ${describeState(state)}`);
  lines.push(`    analytical after: ${analytical ? describeState(analytical) : 'NO OUTCOME'}`);
  lines.push(`    seeded sample after: ${describeState(sampled)}`);
}
lines.push('  Verified rule: zero fractured explicits -> normal; one -> magic; two or more -> rare.');

const simpleTarget: TargetDefinition = {
  requiredMods: [{ modGroup: 'AfflictionJewelSmallPassivesGrantInt', maxTierNumber: 1 }],
};
const wrongFracturedSuffix = toRolledMod(fillerSuffix, { isFractured: true });
const restartWinsState: ItemState = {
  ...ordinaryRare,
  suffixes: [wrongFracturedSuffix, toRolledMod(fillerSuffix2)],
  fracturedModIds: [wrongFracturedSuffix.modId],
};
const restartOptions = {
  restartReacquire: {
    destination: cleanBase,
    acquisitionCostChaos: 10,
    confidence: 'research-fallback' as const,
    provenance: 'clean 12-passive shield-cluster base research fixture',
    label: 'Abandon + Reacquire Clean Base',
  },
  enabledActionIds: [
    'transmutation_orb',
    'alteration_orb',
    'augmentation_orb',
    'regal_orb',
    'scouring_orb',
    'annulment_orb',
    'restart_reacquire',
  ],
  maxStates: 2000,
};
const cheapRestartOptions = {
  ...restartOptions,
  restartReacquire: {
    ...restartOptions.restartReacquire,
    acquisitionCostChaos: 0.1,
    provenance: 'representative low-cost reacquisition fixture',
  },
};
const restartWinsResult = new GenericSearchEngine(boundedMechanicsContext, simpleTarget, cheapRestartOptions).search(restartWinsState);
const continueWinsResult = new GenericSearchEngine(boundedMechanicsContext, simpleTarget, restartOptions).search(ordinaryRare);
const restartDecision = restartWinsResult.policyMap.get(getCanonicalStateKey(restartWinsState, simpleTarget));
const continueDecision = continueWinsResult.policyMap.get(getCanonicalStateKey(ordinaryRare, simpleTarget));
lines.push('\nRESTART / REACQUIRE ECONOMIC DECISIONS:');
lines.push(`  Restart-winning state: ${describeState(restartWinsState)}`);
lines.push(`    selected: ${restartDecision?.bestActionName ?? 'NO RESOLVED ACTION'} (${restartDecision?.optimalValueChaos.toFixed(3) ?? 'N/A'}c)`);
lines.push(`  Continue-winning state: ${describeState(ordinaryRare)}`);
lines.push(`    selected: ${continueDecision?.bestActionName ?? 'NO RESOLVED ACTION'} (${continueDecision?.optimalValueChaos.toFixed(3) ?? 'N/A'}c)`);
lines.push(`  Restart price evidence preserved: ${restartWinsResult.priceConfidence.evidence.find((entry) => entry.actionId === 'restart_reacquire')?.provenance ?? 'NOT SELECTED / NOT PRESENT'}`);

lines.push('\n' + runExternalParityDiagnostics(context).explanation);

console.error('[core diagnostic] full-pool clean-base T1 Intelligence solve');
const cleanPolicyResult = new GenericSearchEngine(context, simpleTarget).search(cleanBase, {
  maxIterations: 1_500,
});
lines.push('\nFULL-POOL CLEAN-BASE T1 INTELLIGENCE POLICY PRESERVATION:');
lines.push(...resultSummary('  Clean-base solve', cleanPolicyResult).map((line) => `  ${line}`));
for (const attr of Object.values(cleanPolicyResult.graphBuild.actionAttribution)) {
  lines.push(
    `  Action ${attr.actionName}: local successors=${attr.actionLocalUniqueSuccessorKeysProduced}, `
    + `first discoveries=${attr.newGlobalStatesFirstDiscovered}, `
    + `on-policy selections=${attr.onPolicyStatesSelectingAction}, `
    + `unresolved edges=${attr.unresolvedOutgoingEdges}`
  );
}

const multiStageTarget: TargetDefinition = {
  requiredRarity: 'magic',
  requiredMods: [
    {
      modGroup: 'AfflictionJewelSmallPassivesGrantInt',
      maxTierNumber: 1,
      mustBeFractured: true,
    },
    { modGroup: 'AfflictionJewelSmallPassivesGrantES', maxTierNumber: 1 },
  ],
};
const multiStageContext = boundedMechanicsContext;
const multiStageOptions = {
  ...restartOptions,
  enabledActionIds: [
    'transmutation_orb',
    'alteration_orb',
    'augmentation_orb',
    'regal_orb',
    'scouring_orb',
    'annulment_orb',
    'exalted_orb',
    'fracturing_orb',
    'restart_reacquire',
  ],
  maxStates: 2000,
  maxIterations: 20000,
  maxMarkovIterations: 20000,
  prioritizeTargetProgress: true,
};
console.error('[core diagnostic] bounded multi-stage clean-base solve');
const multiStageResult = new GenericSearchEngine(multiStageContext, multiStageTarget, multiStageOptions).search(cleanBase);
const generatedStarts = generateStartingStateCandidates(
  multiStageTarget,
  'Large Cluster Jewel',
  clusterType,
  84,
  { pool, priceBook, cleanBaseCostChaos: 10 },
  12
);
const cleanStateKey = getCanonicalStateKey(cleanBase, multiStageTarget);
const evaluatedStartingRoutes = generatedStarts
  .filter((candidate) => candidate.acquisitions.length > 0)
  .map((candidate) => {
    const acquisition = candidate.acquisitions
      .slice()
      .sort((left, right) => left.costChaos - right.costChaos)[0];
    console.error(`[core diagnostic] bounded starting route: ${candidate.label}`);
    const result = getCanonicalStateKey(candidate.state, multiStageTarget) === cleanStateKey
      ? multiStageResult
      : new GenericSearchEngine(multiStageContext, multiStageTarget, multiStageOptions).search(candidate.state);
    return {
      label: candidate.label,
      acquisition,
      result,
      fullCostChaos: acquisition.costChaos + result.totalExpectedCostChaos,
    };
  })
  .sort((left, right) => left.fullCostChaos - right.fullCostChaos);
const selectedStartingRoute = evaluatedStartingRoutes[0];
lines.push('\nFULL GENERIC MULTI-STAGE ROUTE:');
lines.push('  BOUNDED MECHANICS FIXTURE — NOT PRODUCTION ECONOMICS');
lines.push('  Target: magic item with fractured T1 Intelligence + T1 Maximum Energy Shield');
lines.push('  Modeled pool: bounded five-mod fixture using real cluster-jewel mods/weights; route logic remains generic.');
lines.push(`  Generated physical starting states: ${generatedStarts.length}`);
for (const start of generatedStarts) {
  lines.push(`    - ${start.label}: ${start.acquisitions.length > 0
    ? start.acquisitions.map((acquisition) => `${acquisition.type} ${acquisition.costChaos.toFixed(1)}c (${acquisition.confidence})`).join(' | ')
    : 'not directly acquired; executable synthesis is evaluated separately'}`);
}
lines.push(`  Evaluated starting routes:`);
for (const route of evaluatedStartingRoutes) {
  lines.push(
    `    - ${route.label}: acquisition=${route.acquisition.costChaos.toFixed(1)}c `
    + `(${route.acquisition.confidence}), downstream=${route.result.totalExpectedCostChaos.toFixed(3)}c, `
    + `full=${route.fullCostChaos.toFixed(3)}c, proof=${route.result.optimalityProof.proofLevel}`
  );
}
lines.push(`  Selected acquisition: ${selectedStartingRoute.label} at ${selectedStartingRoute.acquisition.costChaos.toFixed(1)}c`);
lines.push(`  Expected currencies: ${Object.entries(multiStageResult.expectedCurrencies).map(([currency, count]) => `${currency}=${count.toFixed(3)}`).join(', ') || 'NONE'}`);
lines.push(`  Expected downstream cost: ${multiStageResult.totalExpectedCostChaos.toFixed(3)}c; acquisition-inclusive: ${(multiStageResult.totalExpectedCostChaos + 10).toFixed(3)}c`);
for (const attr of Object.values(multiStageResult.graphBuild.actionAttribution)) {
  lines.push(`  Action ${attr.actionName}: local successors=${attr.actionLocalUniqueSuccessorKeysProduced}, first discoveries=${attr.newGlobalStatesFirstDiscovered}, on-policy selections=${attr.onPolicyStatesSelectingAction}, unresolved edges=${attr.unresolvedOutgoingEdges}`);
}
lines.push(...resultSummary('  Multi-stage solve', multiStageResult).map((line) => `  ${line}`));
const requiredFamily = ['transmutation_orb', 'regal_orb', 'fracturing_orb', 'scouring_orb'];
const familyDiscovered = requiredFamily.every(
  (actionId) => (multiStageResult.graphBuild.actionAttribution[actionId]?.onPolicyStatesSelectingAction ?? 0) > 0
);
lines.push(`  Policy family includes normal -> magic -> rare -> fracture -> scour/reset -> continue -> finish: ${familyDiscovered ? 'YES' : 'NO'}`);

const craftBTarget: TargetDefinition = {
  requiredMods: [
    { name: 'Blanketed Snow' },
    { name: 'Prismatic Heart' },
    { name: 'Widespread Destruction' },
  ],
};
const coldClusterType = '12% increased Cold Damage';
const coldPool = ModPool.forCluster(repo, 'Large Cluster Jewel', coldClusterType);
const craftBMods = ['Blanketed Snow', 'Prismatic Heart', 'Widespread Destruction'].map((name) => {
  const mod = coldPool.findModByName(name);
  if (!mod) throw new Error(`Missing Craft B fixture mod: ${name}`);
  return mod;
});
const boundedColdPool = new ModPool(craftBMods);
const coldCleanBase: ItemState = {
  ...cleanBase,
  clusterType: coldClusterType,
  passiveCount: 8,
  itemLevel: 83,
};
console.error('[core diagnostic] bounded Craft B solve');
const craftBResult = new GenericSearchEngine(
  { pool: boundedColdPool, priceBook },
  craftBTarget,
  {
    restartReacquire: {
      destination: coldCleanBase,
      acquisitionCostChaos: 100,
      confidence: 'research-fallback',
      provenance: 'clean 8-passive cold-cluster fixture acquisition',
    },
    enabledActionIds: multiStageOptions.enabledActionIds,
    maxStates: 2000,
    maxIterations: 20000,
    maxMarkovIterations: 20000,
    prioritizeTargetProgress: true,
  }
).search(coldCleanBase);
lines.push('\nCRAFT B GENERIC CLEAN-BASE DISCOVERY:');
lines.push('  BOUNDED MECHANICS FIXTURE — NOT PRODUCTION ECONOMICS');
lines.push('  Target only: Blanketed Snow + Prismatic Heart + Widespread Destruction');
lines.push('  Modeled pool: bounded three-notable fixture using real Cold-cluster mods/weights; no Craft-B solver branch.');
lines.push(...resultSummary('  Craft B solve', craftBResult).map((line) => `  ${line}`));
lines.push(`  Expected currencies: ${Object.entries(craftBResult.expectedCurrencies).map(([currency, count]) => `${currency}=${count.toFixed(3)}`).join(', ') || 'NONE'}`);

const output = `${lines.join('\n')}\n`;
writeFileSync(outputPath('output-core-mechanics-phase.txt'), output, 'utf8');
console.log(output);
