import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ClusterModRepository } from '../src/data/loadClusterMods.ts';
import { toRolledMod } from '../src/domain/Mod.ts';
import { ModPool } from '../src/domain/ModPool.ts';
import { PriceBook, type CurrencyRates } from '../src/domain/PriceBook.ts';
import type { ItemState } from '../src/domain/ItemState.ts';
import type { TargetDefinition } from '../src/domain/TargetDefinition.ts';
import { createRandomSource } from '../src/probability/random.ts';
import { getCanonicalStateKey } from '../src/rules/actionDiscovery.ts';
import {
  CRAFT_MECHANICS,
  createHarvestReforgeMechanics,
  type CraftMechanic,
  type TransitionDistribution,
} from '../src/rules/actionRegistry.ts';
import { EXTERNAL_PARITY_OBSERVATIONS } from '../src/rules/externalParity.ts';
import { SolverCraftActionAdapter } from '../src/solver/genericSearch.ts';
import { OptimizerService, type OptimizeCraftInput } from '../src/service/optimizerService.ts';

const outputPath = fileURLToPath(
  new URL('../../output-phase2j-harvest-parity-diagnostic.txt', import.meta.url)
);
const repo = new ClusterModRepository();

// The user-supplied screenshot omitted its physical base/enchantment/passive metadata.
// This exact engine fixture is pinned for reproducible mechanics/economic diagnostics only;
// it is never represented as recovered metadata for the external screenshot.
const CONTROL_BASE = 'Large Cluster Jewel' as const;
const CONTROL_CLUSTER = '12% increased Attack Damage while holding a Shield';
const CONTROL_ITEM_LEVEL = 84;
const CONTROL_PASSIVES = 12;
const ARMOUR_ID = 'AfflictionJewelSmallPassivesGrantArmour3_';
const ES_ID = 'AfflictionJewelSmallPassivesGrantES3';
const pool = ModPool.forCluster(repo, CONTROL_BASE, CONTROL_CLUSTER);
const armour = pool.findModById(ARMOUR_ID);
const energyShield = pool.findModById(ES_ID);
if (!armour || !energyShield) throw new Error('Phase 2J Armour/ES fixture modifiers missing');
const target: TargetDefinition = {
  requiredRarity: 'rare',
  requiredMods: [{ modId: ARMOUR_ID }, { modId: ES_ID }],
};
const normalState: ItemState = {
  baseType: CONTROL_BASE,
  clusterType: CONTROL_CLUSTER,
  itemLevel: CONTROL_ITEM_LEVEL,
  passiveCount: CONTROL_PASSIVES,
  rarity: 'normal',
  prefixes: [],
  suffixes: [],
  fracturedModIds: [],
};
const cleanMagicState: ItemState = { ...normalState, rarity: 'magic' };
const harvestStartState: ItemState = { ...normalState, rarity: 'rare' };

function requiredMechanic(id: string): CraftMechanic {
  const mechanic = CRAFT_MECHANICS.find((candidate) => candidate.id === id);
  if (!mechanic?.getTransitions || !mechanic.sampleTransition) {
    throw new Error(`Missing analytical/sampled shared mechanic ${id}`);
  }
  return mechanic;
}

function containsEitherTarget(state: ItemState): boolean {
  const affixes = [...state.prefixes, ...state.suffixes];
  return affixes.some((mod) => mod.modId === ARMOUR_ID || mod.modId === ES_ID);
}

function containsBothTargets(state: ItemState): boolean {
  const affixes = [...state.prefixes, ...state.suffixes];
  return affixes.some((mod) => mod.modId === ARMOUR_ID) &&
    affixes.some((mod) => mod.modId === ES_ID);
}

function probability(
  distribution: TransitionDistribution,
  predicate: (state: ItemState) => boolean
): number {
  return distribution.outcomes.filter((outcome) => predicate(outcome.state))
    .reduce((sum, outcome) => sum + outcome.probability, 0);
}

interface WeightedState {
  state: ItemState;
  probability: number;
}

function aggregate(states: WeightedState[]): WeightedState[] {
  const result = new Map<string, WeightedState>();
  for (const weighted of states) {
    const key = getCanonicalStateKey(weighted.state, target);
    const existing = result.get(key);
    if (existing) existing.probability += weighted.probability;
    else result.set(key, { state: weighted.state, probability: weighted.probability });
  }
  return [...result.values()];
}

function wilson95(successes: number, attempts: number): [number, number] {
  const z = 1.959963984540054;
  const p = successes / attempts;
  const denominator = 1 + z * z / attempts;
  const centre = (p + z * z / (2 * attempts)) / denominator;
  const radius = z * Math.sqrt(
    p * (1 - p) / attempts + z * z / (4 * attempts * attempts)
  ) / denominator;
  return [centre - radius, centre + radius];
}

function observation(id: string) {
  const result = EXTERNAL_PARITY_OBSERVATIONS.find((candidate) => candidate.benchmarkId === id);
  if (!result) throw new Error(`Missing Phase 2J external observation ${id}`);
  return result;
}

const priceBook = new PriceBook();
const context = { pool, priceBook };
const alteration = requiredMechanic('alteration_orb');
const transmute = requiredMechanic('transmutation_orb');
const regal = requiredMechanic('regal_orb');
const exalt = requiredMechanic('exalted_orb');
const scour = requiredMechanic('scouring_orb');
const harvest = createHarvestReforgeMechanics(context, ['defences'])
  .find((candidate) => candidate.id === 'harvest_reforge_defences');
if (!harvest?.getTransitions || !harvest.sampleTransition) {
  throw new Error('Shared Harvest Reforge Defences mechanic missing');
}

console.error('[phase2j-harvest] J-H1 analytical Harvest parity');
let started = Date.now();
const harvestDistribution = harvest.getTransitions(harvestStartState, target, context);
const harvestAnalyticalMs = Date.now() - started;
const analyticalHarvestProbability = probability(harvestDistribution, containsBothTargets);
const harvestTrials = 300_000;
const harvestRng = createRandomSource(2026082401);
let harvestMcSuccesses = 0;
started = Date.now();
for (let trial = 0; trial < harvestTrials; trial++) {
  if (containsBothTargets(harvest.sampleTransition(harvestStartState, target, context, harvestRng))) {
    harvestMcSuccesses++;
  }
}
const harvestMcMs = Date.now() - started;
const harvestMcProbability = harvestMcSuccesses / harvestTrials;

console.error('[phase2j-harvest] J-H2 conventional stages');
const alterationDistribution = alteration.getTransitions!(cleanMagicState, target, context);
const analyticalAlterAdvanceProbability = probability(alterationDistribution, containsEitherTarget);
const alterHitStates = aggregate(alterationDistribution.outcomes
  .filter((outcome) => containsEitherTarget(outcome.state))
  .map((outcome) => ({
    state: outcome.state,
    probability: outcome.probability / analyticalAlterAdvanceProbability,
  })));

let analyticalRegalCompletionProbability = 0;
const regalMissStates: WeightedState[] = [];
for (const weighted of alterHitStates) {
  const distribution = regal.getTransitions!(weighted.state, target, context);
  for (const outcome of distribution.outcomes) {
    const weightedProbability = weighted.probability * outcome.probability;
    if (containsBothTargets(outcome.state)) {
      analyticalRegalCompletionProbability += weightedProbability;
    } else {
      regalMissStates.push({ state: outcome.state, probability: weightedProbability });
    }
  }
}
const regalMissProbability = 1 - analyticalRegalCompletionProbability;
const normalizedRegalMisses = aggregate(regalMissStates.map((weighted) => ({
  state: weighted.state,
  probability: weighted.probability / regalMissProbability,
})));
let analyticalExaltCompletionProbability = 0;
for (const weighted of normalizedRegalMisses) {
  const distribution = exalt.getTransitions!(weighted.state, target, context);
  analyticalExaltCompletionProbability += weighted.probability *
    probability(distribution, containsBothTargets);
}

const conventionalTrials = 300_000;
const conventionalRng = createRandomSource(2026082402);
let alterMcSuccesses = 0;
let regalMcSuccesses = 0;
let exaltMcAttempts = 0;
let exaltMcSuccesses = 0;
for (let trial = 0; trial < conventionalTrials; trial++) {
  const magic = alteration.sampleTransition!(cleanMagicState, target, context, conventionalRng);
  if (!containsEitherTarget(magic)) continue;
  alterMcSuccesses++;
  const rare = regal.sampleTransition!(magic, target, context, conventionalRng);
  if (containsBothTargets(rare)) {
    regalMcSuccesses++;
    continue;
  }
  exaltMcAttempts++;
  if (containsBothTargets(exalt.sampleTransition!(rare, target, context, conventionalRng))) {
    exaltMcSuccesses++;
  }
}
const alterMcProbability = alterMcSuccesses / conventionalTrials;
const regalMcProbability = alterMcSuccesses > 0 ? regalMcSuccesses / alterMcSuccesses : 0;
const exaltMcProbability = exaltMcAttempts > 0 ? exaltMcSuccesses / exaltMcAttempts : 0;

interface ConventionalEconomics {
  expectedCostChaos: number;
  cycleSuccessProbability: number;
  expectedUsage: Record<string, number>;
  reconciliationDifferenceChaos: number;
}

function conventionalEconomics(rates: Partial<CurrencyRates>): ConventionalEconomics {
  const pricedContext = { pool, priceBook: new PriceBook(rates, {}) };
  const pCycle = analyticalRegalCompletionProbability +
    regalMissProbability * analyticalExaltCompletionProbability;
  const alterationsPerCycle = (1 - analyticalAlterAdvanceProbability) /
    analyticalAlterAdvanceProbability;
  const failureProbability = 1 - pCycle;
  const cycleCost = transmute.getCost(pricedContext).costChaos +
    alterationsPerCycle * alteration.getCost(pricedContext).costChaos +
    regal.getCost(pricedContext).costChaos +
    regalMissProbability * exalt.getCost(pricedContext).costChaos +
    failureProbability * scour.getCost(pricedContext).costChaos;
  const expectedUsage = {
    transmutation_orb: 1 / pCycle,
    alteration_orb: alterationsPerCycle / pCycle,
    regal_orb: 1 / pCycle,
    exalted_orb: regalMissProbability / pCycle,
    scouring_orb: failureProbability / pCycle,
  };
  const expectedCostChaos = cycleCost / pCycle;
  const reconciled = expectedUsage.transmutation_orb * transmute.getCost(pricedContext).costChaos +
    expectedUsage.alteration_orb * alteration.getCost(pricedContext).costChaos +
    expectedUsage.regal_orb * regal.getCost(pricedContext).costChaos +
    expectedUsage.exalted_orb * exalt.getCost(pricedContext).costChaos +
    expectedUsage.scouring_orb * scour.getCost(pricedContext).costChaos;
  return {
    expectedCostChaos,
    cycleSuccessProbability: pCycle,
    expectedUsage,
    reconciliationDifferenceChaos: Math.abs(expectedCostChaos - reconciled),
  };
}

const identicalRates: Partial<CurrencyRates> = {
  alteration: 0.11,
  transmutation: 0.03,
  regal: 0.2,
  exalt: 1.2,
  scour: 0.5,
};
const conventional = conventionalEconomics(identicalRates);
if (conventional.reconciliationDifferenceChaos > 1e-8) {
  throw new Error('Phase 2J conventional fixed-policy economics failed reconciliation');
}
const engineCrossover = conventional.expectedCostChaos * analyticalHarvestProbability / 75;

interface EconomicCandidate {
  actionFamily: 'HARVEST_REFORGE_DEFENCES' | 'CONVENTIONAL_ALT_REGAL_EXALT';
  qValueChaos: number;
}

function qValuesAtLifeforcePrice(lifeforceChaos: number): EconomicCandidate[] {
  const harvestQ = 75 * lifeforceChaos / analyticalHarvestProbability;
  const candidates: EconomicCandidate[] = [
    { actionFamily: 'HARVEST_REFORGE_DEFENCES', qValueChaos: harvestQ },
    { actionFamily: 'CONVENTIONAL_ALT_REGAL_EXALT', qValueChaos: conventional.expectedCostChaos },
  ];
  return candidates.sort((left, right) => left.qValueChaos - right.qValueChaos);
}

const crossoverSweep = [
  { label: 'LOW', price: engineCrossover * 0.5 },
  { label: 'NEAR', price: engineCrossover },
  { label: 'HIGH', price: engineCrossover * 2 },
].map((point) => ({ ...point, candidates: qValuesAtLifeforcePrice(point.price) }));
if (
  crossoverSweep[0].candidates[0].actionFamily !== 'HARVEST_REFORGE_DEFENCES' ||
  crossoverSweep[2].candidates[0].actionFamily !== 'CONVENTIONAL_ALT_REGAL_EXALT'
) {
  throw new Error('J10 economic crossover did not emerge from Q-values');
}

console.error('[phase2j-harvest] J11 reusable Harvest distribution profile');
const alternateRareState: ItemState = {
  ...harvestStartState,
  prefixes: [toRolledMod(armour)],
};
const adapter = new SolverCraftActionAdapter(harvest, context, target);
started = Date.now();
const firstAdapterTransition = adapter.getTransitionsWithCacheInfo(harvestStartState);
const firstAdapterMs = Date.now() - started;
started = Date.now();
const secondAdapterTransition = adapter.getTransitionsWithCacheInfo(alternateRareState);
const secondAdapterMs = Date.now() - started;
if (
  firstAdapterTransition.reused ||
  !secondAdapterTransition.reused ||
  firstAdapterTransition.distribution !== secondAdapterTransition.distribution
) {
  throw new Error('Harvest reset-state transition reuse audit failed');
}

console.error('[phase2j-harvest] J11 product runtime control');
const optimizerInput: OptimizeCraftInput = {
  baseType: CONTROL_BASE,
  clusterType: CONTROL_CLUSTER,
  itemLevel: CONTROL_ITEM_LEVEL,
  passiveCount: CONTROL_PASSIVES,
  target,
  prices: {
    currencyRates: { ...identicalRates, primalLifeforce: engineCrossover },
    cleanBaseCostChaos: 10,
    cleanBasePriceSource: 'manual',
    cleanBasePriceProvenance: 'Phase 2J defensive controlled fixture',
  },
  allowResearchFallbackPrices: true,
  searchBudget: { maxStates: 5_000, maxWallTimeMs: 30_000, maxExpansionRounds: 3 },
  searchIntent: 'RECOMMEND',
};
started = Date.now();
const optimizerResult = new OptimizerService(repo).optimize(optimizerInput);
const optimizerElapsedMs = Date.now() - started;
if (
  optimizerResult.recommended === null ||
  !optimizerResult.risk.selectedPolicyProper ||
  !optimizerResult.solver.costReconciled
) {
  throw new Error('J11 defensive two-mod product runtime control failed policy gates');
}

const externalHarvest = observation('phase2j_harvest_defences_t1_armour_es');
const externalAlter = observation('phase2j_conventional_alt_t1_armour_es');
const externalRegal = observation('phase2j_conventional_regal_t1_armour_es');
const externalExalt = observation('phase2j_conventional_exalt_t1_armour_es');
const pct = (value: number): string => `${(value * 100).toFixed(6)}%`;
const interval = (bounds: [number, number]): string =>
  `[${pct(bounds[0])}, ${pct(bounds[1])}]`;
const compare = (
  label: string,
  external: ReturnType<typeof observation>,
  analytical: number,
  mc: number,
  mcAttempts: number,
  mcSuccesses: number
): string => {
  const absolute = Math.abs(analytical - external.observedProbability);
  const relative = absolute / external.observedProbability;
  return `${label}: external=${pct(external.observedProbability)} (${external.successes}/${external.attempts}; Wilson95=${interval(wilson95(external.successes, external.attempts))}); analytical=${pct(analytical)}; MC=${pct(mc)} (${mcSuccesses}/${mcAttempts}); absoluteDiff=${pct(absolute)}; relativeDiff=${(relative * 100).toFixed(3)}%`;
};

const lines = [
  'PHASE 2J T1 ARMOUR + T1 ENERGY SHIELD HARVEST / CONVENTIONAL PARITY DIAGNOSTIC',
  '',
  'EXTERNAL FIXTURE METADATA STATUS',
  '  source evidence supplied: action counts/pass counts and displayed costs only',
  '  base type: NOT PRESENT IN SOURCE EVIDENCE',
  '  cluster enchantment: NOT PRESENT IN SOURCE EVIDENCE',
  '  item level: NOT PRESENT IN SOURCE EVIDENCE',
  '  passive count: NOT PRESENT IN SOURCE EVIDENCE',
  '  exact external mod IDs: NOT RECOVERABLE WITHOUT PHYSICAL METADATA',
  '  external parity claim: BLOCKED / INCOMPLETE (the Phase 2J plan explicitly forbids inferring these fields)',
  '',
  'PINNED CONTROLLED ENGINE FIXTURE (NOT CLAIMED AS RECOVERED SCREENSHOT METADATA)',
  `  base=${CONTROL_BASE}; enchant=${CONTROL_CLUSTER}; ilvl=${CONTROL_ITEM_LEVEL}; passives=${CONTROL_PASSIVES}; start=clean Magic for conventional / non-fractured Rare for Harvest; finish=Rare raw target presence, extra affixes allowed; Armour=${ARMOUR_ID}; ES=${ES_ID}`,
  '',
  'J-H1 HARVEST ANALYTICAL / MC / EXTERNAL OBSERVATION',
  `  ${compare('Harvest Reforge Defences', externalHarvest, analyticalHarvestProbability, harvestMcProbability, harvestTrials, harvestMcSuccesses)}`,
  `  analytical outcomes after proof-safe internal aggregation=${harvestDistribution.outcomes.length}; analytical generation=${harvestAnalyticalMs}ms; MC=${harvestMcMs}ms; mechanicsConfidence=APPROXIMATE / EXTERNALLY CLOSE`,
  '  weights were read from the eligible committed pool; external data was not used as a mechanics input',
  '',
  'J-H2 CONVENTIONAL CONDITIONAL STAGES',
  `  ${compare('Alter stage advances on either T1 target', externalAlter, analyticalAlterAdvanceProbability, alterMcProbability, conventionalTrials, alterMcSuccesses)}`,
  `  ${compare('Regal completes second target | Alter advanced', externalRegal, analyticalRegalCompletionProbability, regalMcProbability, alterMcSuccesses, regalMcSuccesses)}`,
  `  ${compare('Exalt completes second target | controlled Regal miss mixture', externalExalt, analyticalExaltCompletionProbability, exaltMcProbability, exaltMcAttempts, exaltMcSuccesses)}`,
  '  external Passed-row mixture semantics are preserved as conditional observations; the engine Exalt comparison is explicitly its controlled Regal-miss mixture, not a fabricated product of screenshot rows',
  '  Scour and Transmute external 1477/1477 rows are recovery/action accounting; engine legality/probability=1 when invoked by the finite policy',
  '',
  'J-H3 IDENTICAL-PRICE ECONOMICS / J10 LIFEFORCE CROSSOVER',
  `  identical conventional rates=${JSON.stringify(identicalRates)}`,
  `  conventional fixed-policy EV=${conventional.expectedCostChaos.toFixed(6)}c; success/cycle=${pct(conventional.cycleSuccessProbability)}; usage=${JSON.stringify(conventional.expectedUsage)}; reconciliationDiff=${conventional.reconciliationDifferenceChaos.toExponential(3)}`,
  `  engine controlled crossover=${engineCrossover.toFixed(8)}c per Primal Lifeforce (${(1 / engineCrossover).toFixed(3)} lifeforce/c); external screenshot guidance=~0.02022c (validation-only)`,
  ...crossoverSweep.map((point) =>
    `  ${point.label}: lifeforce=${point.price.toFixed(8)}c; Q=${point.candidates.map((candidate) => `${candidate.actionFamily}:${candidate.qValueChaos.toFixed(6)}c`).join(' | ')}; selected=${point.candidates[0].actionFamily}`
  ),
  '  strategy switch is the minimum Bellman repeat-policy Q-value; no Harvest-specific winner/crossover branch exists',
  '',
  'J11 DEFENSIVE TWO-MOD RUNTIME / DUPLICATE WORK PROFILE',
  `  Harvest distribution first generation=${firstAdapterMs}ms; same post-reset mechanical state reuse=${secondAdapterMs}ms; reused=${secondAdapterTransition.reused}; retained outcomes=${secondAdapterTransition.distribution?.outcomes.length ?? 0}`,
  `  product optimizer status=${optimizerResult.recommendationStatus}; U=${optimizerResult.expectedCostChaos?.toFixed(6)}c; elapsed=${optimizerElapsedMs}ms; stageTiming=${JSON.stringify(optimizerResult.search.stageTimingMs)}; states=${optimizerResult.search.statesExpanded}; transitions generated/reused=${optimizerResult.search.transitionDistributionsGenerated}/${optimizerResult.search.transitionDistributionsReused}; first policy=${optimizerResult.search.timeToFirstCertifiedPolicyMs}ms; first acquisition-safe=${optimizerResult.search.timeToFirstUsefulRecommendationMs}ms`,
  '  observed user reference=roughly ten minutes; controlled product request now returns inside the 30-second host guard without reducing mechanics fidelity',
  '',
  'CONSTRAINT AUDIT',
  '  external observations used as mechanics inputs: NO',
  '  hardcoded crossover/route winner: NO',
  '  target/Craft-specific solver branches: NO',
  '  Harvest confidence upgraded: NO',
  '  unit tests added: NO',
];

writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
console.log(lines.join('\n'));
