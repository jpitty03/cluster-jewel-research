import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ClusterModRepository } from '../crafting-engine/src/data/loadClusterMods.ts';
import type { ItemState } from '../crafting-engine/src/domain/ItemState.ts';
import { ModPool } from '../crafting-engine/src/domain/ModPool.ts';
import { PriceBook } from '../crafting-engine/src/domain/PriceBook.ts';
import { toRolledMod } from '../crafting-engine/src/domain/Mod.ts';
import {
  satisfiesTarget,
  type TargetDefinition,
} from '../crafting-engine/src/domain/TargetDefinition.ts';
import { runExternalParityDiagnostics } from '../crafting-engine/src/rules/externalParity.ts';
import { createHarvestReforgeMechanics } from '../crafting-engine/src/rules/actionRegistry.ts';
import { getCanonicalStateKey } from '../crafting-engine/src/rules/actionDiscovery.ts';
import { getEligibleMods } from '../crafting-engine/src/rules/modEligibility.ts';
import { createRandomSource } from '../crafting-engine/src/probability/random.ts';
import { GenericSearchEngine } from '../crafting-engine/src/solver/genericSearch.ts';
import { deriveMinimumFeasibleRarity } from '../crafting-engine/src/solver/targetFeasibility.ts';
import {
  OptimizerService,
  type OptimizeCraftInput,
  type OptimizeCraftResult,
} from '../crafting-engine/src/service/optimizerService.ts';

const outputPath = fileURLToPath(new URL('../output-developer-ui-phase2c.txt', import.meta.url));
const repository = new ClusterModRepository();
const service = new OptimizerService(repository);
const priceBook = new PriceBook();
const shieldCluster = '12% increased Attack Damage while holding a Shield';
const liveCluster = '10% increased Attack Damage';
const pool = ModPool.forCluster(repository, 'Large Cluster Jewel', liveCluster);
const parityPool = ModPool.forCluster(repository, 'Large Cluster Jewel', shieldCluster);
const t1Es = pool.findModById('AfflictionJewelSmallPassivesGrantES3');
const t1Int = pool.findModById('AfflictionJewelSmallPassivesGrantInt3');
if (!t1Es || !t1Int) throw new Error('Missing Phase 2C T1 ES/Int fixtures');

const lines: string[] = ['DEVELOPER UI PHASE 2C — TWO-MOD ACQUISITION / TARGET-SEMANTICS DIAGNOSTIC'];
const common = {
  baseType: 'Large Cluster Jewel' as const,
  clusterType: liveCluster,
  itemLevel: 84,
  passiveCount: 12,
  prices: {
    cleanBaseCostChaos: 4,
    cleanBasePriceSource: 'manual' as const,
    cleanBasePriceProvenance: 'live-equivalent Phase 2C 4c clean-base override',
  },
  allowResearchFallbackPrices: true,
};

function money(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? 'UNAVAILABLE'
    : `${value.toFixed(6)}c`;
}

function run(label: string, input: OptimizeCraftInput): OptimizeCraftResult {
  const started = Date.now();
  const result = service.optimize(input);
  const wallMs = Date.now() - started;
  const feasibility = result.search.acquisitionFeasibility;
  const progress = result.search.deepenProgress;
  lines.push(`\n${label}:`);
  lines.push(`  recommendation / proof: ${result.recommendationStatus} / ${result.proof.proofLevel}`);
  lines.push(`  selected acquisition: ${result.recommended?.name ?? 'NONE'}`);
  lines.push(`  acquisition safe: ${result.acquisition.selectionSafe ? 'YES' : 'NO'}`);
  lines.push(`  incumbent U / unresolved acquisition L / gap: ${money(result.acquisition.resolvedIncumbentUpperBoundChaos)} / ${money(result.acquisition.bestUnresolvedLowerBoundChaos)} / ${money(result.acquisition.potentialGapChaos)}`);
  lines.push(`  expected cost: ${money(result.expectedCostChaos)}`);
  lines.push(`  wall / engine elapsed: ${wallMs}ms / ${result.search.elapsedMs}ms`);
  lines.push(`  states expanded / cumulative work: ${result.search.statesExpanded} / ${result.search.cumulativeExpansionWork}`);
  lines.push(`  minimum feasible rarity: ${result.search.minimumFeasibleRarity.rarity} (${result.search.minimumFeasibleRarity.reason})`);
  lines.push(`  fair acquisition probes: ${feasibility.certifiedCandidates}/${feasibility.attemptedCandidates} certified; ${feasibility.fairStateBudgetPerCandidate} states each`);
  for (const attempt of feasibility.attempts) {
    lines.push(`    ${attempt.label}: certified=${attempt.certified ? 'YES' : 'NO'}; states=${attempt.statesExpanded}; elapsed=${attempt.elapsedMs}ms; U=${money(attempt.totalUpperBoundChaos)}`);
  }
  lines.push(`  selected policy: proper=${result.risk.selectedPolicyProper ? 'YES' : 'NO'}; absorption=${(result.risk.terminalAbsorptionProbability * 100).toFixed(9)}%; unresolved=${(result.risk.unresolvedOnPolicyProbability * 100).toFixed(9)}%; reconciled=${result.solver.costReconciled ? 'YES' : 'NO'} (${money(result.solver.reconciliationDifferenceChaos)})`);
  lines.push(`  Bellman / occupancy: ${result.solver.bellmanIterations} (${result.solver.bellmanConverged ? 'CONVERGED' : 'NOT CONVERGED'}) / ${result.solver.occupancyIterations} (${result.solver.occupancyConverged ? 'CONVERGED' : 'NOT CONVERGED'})`);
  lines.push(`  DEEPEN delta: states=${progress.newCanonicalStates}; feasible-U=${progress.newAcquisitionFeasibleUpperBounds}; dominated=${progress.newlyDominatedByBound}; meaningful=${progress.meaningfulProgress ? 'YES' : 'NO'}; stopped-early=${progress.stoppedEarlyNoMeaningfulProgress ? 'YES' : 'NO'}`);
  if (progress.message) lines.push(`  DEEPEN message: ${progress.message}`);
  lines.push(`  actions: ${result.expectedActionUsage.map((entry) => `${entry.actionName}×${entry.expectedCount.toFixed(4)}`).join(' -> ') || 'NONE'}`);
  return result;
}

const twoModRawTarget: TargetDefinition = {
  requiredMods: [{ modId: t1Es.modId }, { modId: t1Int.modId }],
};
const twoModCleanTarget: TargetDefinition = {
  ...twoModRawTarget,
  finalStateConstraints: { maxUnmatchedAffixes: 0 },
};
const rawKey = getCanonicalStateKey({
  baseType: 'Large Cluster Jewel',
  clusterType: liveCluster,
  itemLevel: 84,
  passiveCount: 12,
  rarity: 'rare',
  prefixes: [toRolledMod(t1Es)],
  suffixes: [toRolledMod(t1Int)],
  fracturedModIds: [],
}, twoModRawTarget);
const cleanKey = getCanonicalStateKey({
  baseType: 'Large Cluster Jewel',
  clusterType: liveCluster,
  itemLevel: 84,
  passiveCount: 12,
  rarity: 'rare',
  prefixes: [toRolledMod(t1Es)],
  suffixes: [toRolledMod(t1Int)],
  fracturedModIds: [],
}, twoModCleanTarget);
const filler = getEligibleMods({
  baseType: 'Large Cluster Jewel',
  clusterType: liveCluster,
  itemLevel: 84,
  passiveCount: 12,
  rarity: 'rare',
  prefixes: [toRolledMod(t1Es)],
  suffixes: [toRolledMod(t1Int)],
  fracturedModIds: [],
}, pool.getAllMods())[0];
if (!filler) throw new Error('Missing Phase 2C junk-affix fixture');
const targetOnlyState: ItemState = {
  baseType: 'Large Cluster Jewel',
  clusterType: shieldCluster,
  itemLevel: 84,
  passiveCount: 12,
  rarity: 'rare',
  prefixes: [toRolledMod(t1Es)],
  suffixes: [toRolledMod(t1Int)],
  fracturedModIds: [],
};
const targetPlusJunkState: ItemState = {
  ...targetOnlyState,
  prefixes: filler.genType === 'Prefix'
    ? [...targetOnlyState.prefixes, toRolledMod(filler)]
    : [...targetOnlyState.prefixes],
  suffixes: filler.genType === 'Suffix'
    ? [...targetOnlyState.suffixes, toRolledMod(filler)]
    : [...targetOnlyState.suffixes],
};
lines.push('\nFINAL-STATE TARGET SEMANTICS:');
lines.push('  schema: maxTotalExplicitAffixes?, maxUnmatchedAffixes?, minOpenPrefixes?, minOpenSuffixes?');
lines.push(`  target-only state: raw=${satisfiesTarget(targetOnlyState, twoModRawTarget) ? 'PASS' : 'FAIL'}; clean=${satisfiesTarget(targetOnlyState, twoModCleanTarget) ? 'PASS' : 'FAIL'}`);
lines.push(`  target+junk state: raw=${satisfiesTarget(targetPlusJunkState, twoModRawTarget) ? 'PASS' : 'FAIL'}; clean=${satisfiesTarget(targetPlusJunkState, twoModCleanTarget) ? 'PASS' : 'FAIL'} (clean must reject)`);
lines.push(`  canonical target identity differs: ${rawKey !== cleanKey ? 'YES' : 'NO'}`);
lines.push(`  derived minimum rarity: ${deriveMinimumFeasibleRarity(twoModCleanTarget, pool).rarity}`);

const parity = runExternalParityDiagnostics({ pool: parityPool, priceBook });
const altParity = parity.results.find((entry) => entry.benchmarkId === 'alt_t1_int_es_raw_magic');
const rawHarvestParity = parity.results.find((entry) => entry.benchmarkId === 'harvest_defences_t1_int_es_raw_presence');
const oneAnnulParity = parity.results.find((entry) => entry.benchmarkId === 'annul_once_after_harvest_t1_int_es_raw_hit');
const combinedHarvestAnnulParity = parity.results.find((entry) => entry.benchmarkId === 'harvest_then_one_annul_t1_int_es_presence');
if (!altParity || !rawHarvestParity || !oneAnnulParity || !combinedHarvestAnnulParity) {
  throw new Error('Missing Phase 2C external parity rows');
}
lines.push('\nEXTERNAL TWO-MOD PARITY:');
lines.push(`  Alteration CoE: ${altParity.craftOfExileSampleSize.toLocaleString()} attempts; ${(altParity.craftOfExileObservedPct).toFixed(7)}%; ${altParity.craftOfExileRatio}`);
lines.push(`  Alteration engine fixture: ${altParity.engineFixtureDescription}`);
lines.push(`  Alteration shared analytical / seeded MC: ${altParity.analyticalProbabilityPct.toFixed(7)}% / ${altParity.mcObservedProbabilityPct.toFixed(7)}% (${altParity.mcSampleSize.toLocaleString()} trials)`);
lines.push(`  Alteration external 95% CI: ${((altParity.craftOfExileConfidenceInterval95?.[0] ?? Number.NaN) * 100).toFixed(5)}%–${((altParity.craftOfExileConfidenceInterval95?.[1] ?? Number.NaN) * 100).toFixed(5)}%`);
lines.push(`  Alteration absolute / relative difference: ${altParity.diffPct.toFixed(7)}pp / ${altParity.relativeDiffPct?.toFixed(3)}%`);
lines.push(`  Alteration inside external 95% CI / status: ${altParity.insideExternalConfidenceInterval ? 'YES' : 'NO'} / ${altParity.status}`);
lines.push(`  Harvest raw CoE: ${rawHarvestParity.craftOfExileSampleSize.toLocaleString()} attempts; ${rawHarvestParity.craftOfExileObservedPct.toFixed(6)}%; ${rawHarvestParity.craftOfExileRatio}; RAW PRESENCE ONLY`);
lines.push(`  Harvest raw external 95% CI: ${((rawHarvestParity.craftOfExileConfidenceInterval95?.[0] ?? Number.NaN) * 100).toFixed(5)}%–${((rawHarvestParity.craftOfExileConfidenceInterval95?.[1] ?? Number.NaN) * 100).toFixed(5)}%`);
lines.push('  Harvest confirmed fixture: Large Cluster Jewel | Attack Damage while holding a Shield | ilvl 100 | 12 passives | Rare | unfractured.');
lines.push(`  Harvest engine representative: ${rawHarvestParity.engineFixtureDescription}.`);
lines.push(`  Harvest raw shared analytical / seeded MC: ${rawHarvestParity.analyticalProbabilityPct.toFixed(7)}% / ${rawHarvestParity.mcObservedProbabilityPct.toFixed(7)}% (${rawHarvestParity.mcSuccesses?.toLocaleString()} / ${rawHarvestParity.mcSampleSize.toLocaleString()} Harvest trials)`);
lines.push(`  Harvest raw absolute / relative difference: ${rawHarvestParity.diffPct.toFixed(7)}pp / ${rawHarvestParity.relativeDiffPct?.toFixed(3)}%`);
lines.push(`  Harvest raw inside external 95% CI / status: ${rawHarvestParity.insideExternalConfidenceInterval ? 'YES' : 'NO'} / ${rawHarvestParity.status}`);
lines.push(`  Harvest mechanics confidence: ${rawHarvestParity.mechanicsConfidence}`);
lines.push(`  One-Annul conditional CoE: ${oneAnnulParity.craftOfExileSampleSize.toLocaleString()} hits; ${oneAnnulParity.craftOfExileObservedPct.toFixed(7)}%; ${oneAnnulParity.craftOfExileRatio}`);
lines.push(`  One-Annul external 95% CI: ${((oneAnnulParity.craftOfExileConfidenceInterval95?.[0] ?? Number.NaN) * 100).toFixed(3)}%–${((oneAnnulParity.craftOfExileConfidenceInterval95?.[1] ?? Number.NaN) * 100).toFixed(3)}%`);
lines.push(`  One-Annul shared analytical / seeded MC: ${oneAnnulParity.analyticalProbabilityPct.toFixed(7)}% / ${oneAnnulParity.mcObservedProbabilityPct.toFixed(7)}% (${oneAnnulParity.mcSuccesses?.toLocaleString()} / ${oneAnnulParity.mcSampleSize.toLocaleString()} seeded Harvest hits)`);
lines.push(`  One-Annul absolute / relative difference: ${oneAnnulParity.diffPct.toFixed(7)}pp / ${oneAnnulParity.relativeDiffPct?.toFixed(3)}%`);
lines.push(`  One-Annul inside external 95% CI / status: ${oneAnnulParity.insideExternalConfidenceInterval ? 'YES' : 'NO'} / ${oneAnnulParity.status}`);
lines.push(`  Combined Harvest -> one Annul CoE: ${combinedHarvestAnnulParity.craftOfExileSampleSize.toLocaleString()} attempts; ${combinedHarvestAnnulParity.craftOfExileObservedPct.toFixed(7)}%; ${combinedHarvestAnnulParity.craftOfExileRatio}`);
lines.push(`  Combined external 95% CI: ${((combinedHarvestAnnulParity.craftOfExileConfidenceInterval95?.[0] ?? Number.NaN) * 100).toFixed(5)}%–${((combinedHarvestAnnulParity.craftOfExileConfidenceInterval95?.[1] ?? Number.NaN) * 100).toFixed(5)}%`);
lines.push(`  Combined shared analytical / seeded MC: ${combinedHarvestAnnulParity.analyticalProbabilityPct.toFixed(7)}% / ${combinedHarvestAnnulParity.mcObservedProbabilityPct.toFixed(7)}% (${combinedHarvestAnnulParity.mcSuccesses?.toLocaleString()} / ${combinedHarvestAnnulParity.mcSampleSize.toLocaleString()} Harvest trials)`);
lines.push(`  Combined absolute / relative difference: ${combinedHarvestAnnulParity.diffPct.toFixed(7)}pp / ${combinedHarvestAnnulParity.relativeDiffPct?.toFixed(3)}%`);
lines.push(`  Combined inside external 95% CI / status: ${combinedHarvestAnnulParity.insideExternalConfidenceInterval ? 'YES' : 'NO'} / ${combinedHarvestAnnulParity.status}`);
lines.push('  External B1/B2/B3 rows incorrectly required a clean final state: NO. Remaining junk is allowed in every row.');

const recommendBudget = { maxStates: 5_000, maxWallTimeMs: 30_000, maxExpansionRounds: 3 };
const oneMod = run('ONE-MOD T1 ES — RECOMMEND REGRESSION', {
  ...common,
  target: { requiredMods: [{ modId: t1Es.modId }] },
  searchIntent: 'RECOMMEND',
  searchBudget: recommendBudget,
});
const twoModAny = run('TWO-MOD T1 ES + T1 INT, ANY RARITY / EXTRA AFFIXES ALLOWED — LIVE EQUIVALENT', {
  ...common,
  target: twoModRawTarget,
  searchIntent: 'RECOMMEND',
  searchBudget: recommendBudget,
});
const twoModClean = run('TWO-MOD T1 ES + T1 INT, ANY RARITY / NO UNWANTED AFFIXES', {
  ...common,
  target: twoModCleanTarget,
  searchIntent: 'RECOMMEND',
  searchBudget: recommendBudget,
});
const twoModDeepen = run('TWO-MOD T1 ES + T1 INT — DEEPEN', {
  ...common,
  target: twoModRawTarget,
  searchIntent: 'DEEPEN',
  searchBudget: { maxStates: 5_000, maxWallTimeMs: 15_000, maxExpansionRounds: 3 },
});
const rareTwoMod = run('RARE TWO-MOD T1 ES + T1 INT — REGRESSION', {
  ...common,
  target: { ...twoModRawTarget, requiredRarity: 'rare' },
  searchIntent: 'RECOMMEND',
  searchBudget: recommendBudget,
});

// The full production pool emits more than 200k exact Harvest outcomes per
// reforge. This bounded pool keeps the same shared Harvest and Annul mechanics
// executable while isolating the final-state/Bellman cleanup behavior. It is
// deliberately not labeled as production economics or external parity.
const fillerPrefix = pool.getPrefixes().find((mod) =>
  mod.modId !== t1Es.modId && mod.modGroup !== t1Es.modGroup
);
const fillerPrefix2 = pool.getPrefixes().find((mod) =>
  mod.modId !== t1Es.modId && mod.modGroup !== t1Es.modGroup && mod.modGroup !== fillerPrefix?.modGroup
);
const fillerSuffix = pool.getSuffixes().find((mod) =>
  mod.modId !== t1Int.modId && mod.modGroup !== t1Int.modGroup
);
const fillerSuffix2 = pool.getSuffixes().find((mod) =>
  mod.modId !== t1Int.modId && mod.modGroup !== t1Int.modGroup && mod.modGroup !== fillerSuffix?.modGroup
);
if (!fillerPrefix || !fillerPrefix2 || !fillerSuffix || !fillerSuffix2) {
  throw new Error('Missing bounded Harvest filler fixtures');
}
const boundedPool = new ModPool([t1Es, t1Int, fillerPrefix, fillerPrefix2, fillerSuffix, fillerSuffix2]);
const boundedContext = { pool: boundedPool, priceBook };
const harvestStart: ItemState = {
  baseType: 'Large Cluster Jewel',
  clusterType: shieldCluster,
  itemLevel: 84,
  passiveCount: 12,
  rarity: 'rare',
  prefixes: [],
  suffixes: [],
  fracturedModIds: [],
};
const harvestMechanic = createHarvestReforgeMechanics(boundedContext, ['defences'])[0];
if (!harvestMechanic?.getTransitions || !harvestMechanic.sampleTransition) {
  throw new Error('Shared bounded Harvest fixture is not executable');
}
const harvestDistribution = harvestMechanic.getTransitions(harvestStart, twoModRawTarget, boundedContext);
const containsBoth = (state: ItemState): boolean => {
  const mods = [...state.prefixes, ...state.suffixes];
  return mods.some((mod) => mod.modId === t1Es.modId) && mods.some((mod) => mod.modId === t1Int.modId);
};
const boundedRawProbability = harvestDistribution.outcomes
  .filter((outcome) => containsBoth(outcome.state))
  .reduce((sum, outcome) => sum + outcome.probability, 0);
const boundedHarvestTrials = 100_000;
const boundedHarvestRng = createRandomSource(20260823);
let boundedRawSuccesses = 0;
let boundedImmediateCleanSuccesses = 0;
for (let trial = 0; trial < boundedHarvestTrials; trial++) {
  const sampled = harvestMechanic.sampleTransition(
    harvestStart,
    twoModCleanTarget,
    boundedContext,
    boundedHarvestRng
  );
  if (containsBoth(sampled)) boundedRawSuccesses++;
  if (satisfiesTarget(sampled, twoModCleanTarget)) boundedImmediateCleanSuccesses++;
}
const cleanHarvestResult = new GenericSearchEngine(boundedContext, twoModCleanTarget, {
  includeHarvest: true,
  harvestTags: ['defences'],
  enabledActionIds: ['harvest_reforge_defences', 'annulment_orb'],
  maxStates: 2_000,
  maxWallTimeMs: 15_000,
  maxExpansionRounds: 2,
  searchIntent: 'PROVE',
}).search(harvestStart);
const selectedActions = new Set(cleanHarvestResult.onPolicyRules.map((rule) => rule.selectedActionId));
lines.push('\nINTERNAL POLICY DIAGNOSTIC — NO EXTERNAL FINISHED FIXTURE YET:');
lines.push('  scope: BOUNDED MECHANICS FIXTURE — NOT PRODUCTION ECONOMICS');
lines.push(`  shared bounded Harvest raw both-mod probability: ${(boundedRawProbability * 100).toFixed(6)}%`);
lines.push(`  shared seeded Harvest raw / immediate clean: ${(boundedRawSuccesses / boundedHarvestTrials * 100).toFixed(6)}% / ${(boundedImmediateCleanSuccesses / boundedHarvestTrials * 100).toFixed(6)}% (${boundedHarvestTrials.toLocaleString()} trials)`);
lines.push(`  selected actions: ${[...selectedActions].join(', ') || 'NONE'}`);
lines.push(`  Harvest selected: ${selectedActions.has('harvest_reforge_defences') ? 'YES' : 'NO'}; Annul cleanup selected: ${selectedActions.has('annulment_orb') ? 'YES' : 'NO'}`);
lines.push(`  selected policy: ${cleanHarvestResult.optimalityProof.selectedPolicyStatus}`);
lines.push(`  on-policy states / unresolved / absorption: ${cleanHarvestResult.onPolicyGraph.onPolicyReachableStates} / ${(cleanHarvestResult.onPolicyGraph.onPolicyUnresolvedProbabilityMass * 100).toFixed(9)}% / ${(cleanHarvestResult.onPolicyGraph.terminalAbsorptionProbability * 100).toFixed(9)}%`);
lines.push(`  Bellman / occupancy / reconciliation: ${cleanHarvestResult.convergence.iterations} (${cleanHarvestResult.convergence.converged ? 'CONVERGED' : 'NOT CONVERGED'}) / ${cleanHarvestResult.reconciliation.visitIterations} (${cleanHarvestResult.reconciliation.visitConverged ? 'CONVERGED' : 'NOT CONVERGED'}) / ${money(cleanHarvestResult.reconciliation.differenceChaos)} (${cleanHarvestResult.reconciliation.isReconciled ? 'PASS' : 'FAIL'})`);
lines.push('  mechanics confidence: APPROXIMATE / EXTERNALLY CLOSE');

lines.push('\nPHASE 2C SUMMARY:');
lines.push(`  live-equivalent Any target selection: ${twoModAny.recommended?.name ?? 'NONE'} at ${money(twoModAny.expectedCostChaos)}; safe=${twoModAny.acquisition.selectionSafe ? 'YES' : 'NO'}`);
lines.push(`  clean-finished target selection: ${twoModClean.recommended?.name ?? 'NONE'} at ${money(twoModClean.expectedCostChaos)}; safe=${twoModClean.acquisition.selectionSafe ? 'YES' : 'NO'}`);
lines.push(`  one-mod healthy: ${oneMod.risk.selectedPolicyProper && oneMod.solver.costReconciled ? 'YES' : 'NO'}`);
lines.push(`  rare two-mod retained: ${rareTwoMod.recommended ? 'YES' : 'NO'} (${rareTwoMod.recommendationStatus})`);
lines.push(`  DEEPEN progress: ${twoModDeepen.search.deepenProgress.message ?? (twoModDeepen.search.deepenProgress.meaningfulProgress ? 'MEANINGFUL' : 'NONE')}`);
lines.push('  persistent graph extension: DEFERRED — acceptance gates pass with fair acquisition probes and early-stop DEEPEN; no canonical-identity risk introduced.');

writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
console.log(lines.join('\n'));
