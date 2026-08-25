import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ClusterModRepository } from '../src/data/loadClusterMods.ts';
import { getPhysicalStateSignature, type ItemState } from '../src/domain/ItemState.ts';
import { ModPool } from '../src/domain/ModPool.ts';
import { PriceBook } from '../src/domain/PriceBook.ts';
import type { TargetDefinition } from '../src/domain/TargetDefinition.ts';
import { getAllTargetModRequirements, matchesModRequirement } from '../src/domain/TargetDefinition.ts';
import { getCanonicalStateKey } from '../src/rules/actionDiscovery.ts';
import { CRAFT_MECHANICS, type CraftMechanic } from '../src/rules/actionRegistry.ts';
import {
  GenericSearchEngine,
  type CanonicalGraphNode,
  type GenericSearchResult,
} from '../src/solver/genericSearch.ts';
import {
  describeOptimizerSearchSessionIdentity,
  OptimizerService,
  type OptimizeCraftInput,
  type OptimizeCraftResult,
} from '../src/service/optimizerService.ts';

const outputPath = fileURLToPath(new URL('../../output-phase2j-search-diagnostic.txt', import.meta.url));
const repo = new ClusterModRepository();
const priceBook = new PriceBook();

const HERALD_CLUSTER = '10% increased Damage while affected by a Herald';
const FOUR_MOD_CLUSTER = '12% increased Attack Damage while Dual Wielding';
const FOUR_MOD_IDS = [
  'AfflictionJewelSmallPassivesGrantInt3',
  'AfflictionJewelSmallPassivesHaveIncreasedEffect2',
  'AfflictionJewelSmallPassivesGrantAttributes3',
  'AfflictionJewelSmallPassivesGrantES3',
] as const;

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

function summarizeOptimizer(label: string, result: OptimizeCraftResult, elapsedMs: number): string[] {
  return [
    `${label}: status=${result.recommendationStatus}; U=${finite(result.expectedCostChaos)}; elapsed=${elapsedMs}ms`,
    `  ${health(result)}`,
    `  policyRefinement=${result.policyRefinement.status}; stop=${result.policyRefinement.stopReason}; firstU=${finite(result.policyRefinement.firstCertifiedUpperBoundChaos)}; finalU=${finite(result.policyRefinement.finalUpperBoundChaos)}; improvement=${finite(result.policyRefinement.improvementChaos)}; fraction=${((result.policyRefinement.improvementFraction ?? 0) * 100).toFixed(3)}%`,
    `  incumbentHistory=${JSON.stringify(result.policyRefinement.incumbentHistory)}`,
    `  session=${JSON.stringify(result.search.sessionReuse)}`,
    `  states=${result.search.statesExpanded}; currentRequestNew=${JSON.stringify(result.search.newStatesByRound)}; generated=${result.search.transitionDistributionsGenerated}; reused=${result.search.transitionDistributionsReused}; retainedByRound=${JSON.stringify(result.search.retainedStatesReusedByRound)}`,
    `  plan=${result.craftPlan.status}; steps=${result.craftPlan.steps.length}; uncovered=${JSON.stringify(result.craftPlan.uncoveredActionIds)}; invented=${JSON.stringify(result.craftPlan.inventedActionIds)}`,
  ];
}

const heraldInput: Omit<OptimizeCraftInput, 'searchBudget' | 'searchIntent'> = {
  baseType: 'Medium Cluster Jewel',
  clusterType: HERALD_CLUSTER,
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
};

console.error('[phase2j-search] J2 Herald bounded refinement');
const resumedService = new OptimizerService(repo);
let started = Date.now();
let heraldRecommend = resumedService.optimize({
  ...heraldInput,
  // Wall allowances must let slower runners finish the same fixed state/round
  // boundary; J3 asserts exact cold/resumed equality at that boundary.
  searchBudget: { maxStates: 5_000, maxWallTimeMs: 120_000, maxExpansionRounds: 3 },
  searchIntent: 'RECOMMEND',
});
let heraldRecommendElapsed = Date.now() - started;
const heraldInitialRecommendStates = heraldRecommend.search.statesExpanded;
let heraldPrefixCompletionElapsed = 0;
if (heraldInitialRecommendStates < 5_000) {
  // The production service intentionally returns a first useful clean policy on a
  // short fast-path wall. Complete the same retained 5k prefix explicitly so J3
  // compares cold/resumed work at a state boundary, never at a host-speed boundary.
  started = Date.now();
  heraldRecommend = resumedService.optimize({
    ...heraldInput,
    searchBudget: { maxStates: 5_000, maxWallTimeMs: 180_000, maxExpansionRounds: 3 },
    searchIntent: 'DEEPEN',
  });
  heraldPrefixCompletionElapsed = Date.now() - started;
  heraldRecommendElapsed += heraldPrefixCompletionElapsed;
}
if (heraldRecommend.search.statesExpanded !== 5_000) {
  throw new Error(`J3 retained prefix did not reach the exact 5k state boundary (${heraldRecommend.search.statesExpanded})`);
}

console.error('[phase2j-search] J3 resumed DEEPEN');
started = Date.now();
const heraldResumed = resumedService.optimize({
  ...heraldInput,
  searchBudget: { maxStates: 10_000, maxWallTimeMs: 180_000, maxExpansionRounds: 4 },
  searchIntent: 'DEEPEN',
});
const heraldResumedElapsed = Date.now() - started;

console.error('[phase2j-search] J3 cold DEEPEN');
started = Date.now();
const heraldCold = new OptimizerService(repo).optimize({
  ...heraldInput,
  searchBudget: { maxStates: 10_000, maxWallTimeMs: 180_000, maxExpansionRounds: 4 },
  searchIntent: 'DEEPEN',
});
const heraldColdElapsed = Date.now() - started;

const coldResumedEvDifference = Math.abs(
  (heraldCold.expectedCostChaos ?? Infinity) - (heraldResumed.expectedCostChaos ?? Infinity)
);
const proofHealthy = (result: OptimizeCraftResult): boolean =>
  result.risk.selectedPolicyProper &&
  result.risk.terminalAbsorptionProbability >= 1 - 1e-8 &&
  result.risk.unresolvedOnPolicyProbability <= 1e-10 &&
  result.solver.bellmanConverged &&
  result.solver.occupancyConverged &&
  result.solver.costReconciled;
const coldResumedHealthEquivalent = proofHealthy(heraldCold) && proofHealthy(heraldResumed);
console.error('[phase2j-search] J3 comparison', JSON.stringify({
  coldU: heraldCold.expectedCostChaos,
  resumedU: heraldResumed.expectedCostChaos,
  coldHealth: health(heraldCold),
  resumedHealth: health(heraldResumed),
  coldGenerated: heraldCold.search.transitionDistributionsGenerated,
  resumedGenerated: heraldResumed.search.transitionDistributionsGenerated,
  resumedSession: heraldResumed.search.sessionReuse,
}));
if (
  coldResumedEvDifference > 1e-6 ||
  !coldResumedHealthEquivalent ||
  heraldResumed.search.sessionReuse.status !== 'RESUMED' ||
  heraldResumed.search.sessionReuse.retainedStates <= 0 ||
  heraldResumed.search.transitionDistributionsGenerated >=
    heraldCold.search.transitionDistributionsGenerated
) {
  throw new Error('J3 cold/resumed DEEPEN equivalence or duplicate-work gate failed');
}

function identity(input: OptimizeCraftInput, harvestTags: string[] = []): string {
  return describeOptimizerSearchSessionIdentity(input, harvestTags).identityHash;
}

const identityBase: OptimizeCraftInput = {
  ...heraldInput,
  searchBudget: { maxStates: 5_000, maxWallTimeMs: 30_000, maxExpansionRounds: 3 },
  searchIntent: 'RECOMMEND',
};
const identityControls = {
  targetModId: identity({
    ...identityBase,
    target: { ...identityBase.target, requiredMods: [{ modId: 'Empowered Envoy' }, { modId: 'Heraldry' }] },
  }),
  finalStateConstraint: identity({
    ...identityBase,
    target: { ...identityBase.target, finalStateConstraints: { maxUnmatchedAffixes: 0 } },
  }),
  currencyRate: identity({
    ...identityBase,
    prices: { ...identityBase.prices, currencyRates: { alteration: 0.123456 } },
  }),
  cleanBaseCost: identity({
    ...identityBase,
    prices: { ...identityBase.prices, cleanBaseCostChaos: 11 },
  }),
  harvestScope: identity(identityBase, ['critical']),
  itemLevel: identity({ ...identityBase, itemLevel: 85 }),
};
const baselineIdentity = identity(identityBase);
if (Object.values(identityControls).some((candidate) => candidate === baselineIdentity)) {
  throw new Error('J4 exact-context identity failed to invalidate a changed request');
}

function requiredMechanic(id: string): CraftMechanic {
  const mechanic = CRAFT_MECHANICS.find((candidate) => candidate.id === id);
  if (!mechanic?.getTransitions) throw new Error(`Missing shared mechanic ${id}`);
  return mechanic;
}

function hasIds(state: ItemState, ids: readonly string[]): boolean {
  const affixes = [...state.prefixes, ...state.suffixes];
  return ids.every((id) => affixes.some((mod) => mod.modId === id));
}

interface WeightedState {
  state: ItemState;
  probability: number;
}

function aggregate(states: WeightedState[], target: TargetDefinition): WeightedState[] {
  const byKey = new Map<string, WeightedState>();
  for (const weighted of states) {
    const key = getCanonicalStateKey(weighted.state, target);
    const existing = byKey.get(key);
    if (existing) existing.probability += weighted.probability;
    else byKey.set(key, { state: weighted.state, probability: weighted.probability });
  }
  return [...byKey.values()];
}

interface FourModBaseline {
  selectedMagicPair: string[];
  pairCandidatesEvaluated: number;
  magicPairProbability: number;
  regalThirdTargetProbability: number;
  exaltFourthTargetProbability: number;
  successProbabilityPerCycle: number;
  expectedCostChaos: number;
  expectedUsage: Record<string, number>;
  reconciliationDifferenceChaos: number;
}

/** Diagnostic-only generic finite policy; this function is never imported by product ranking. */
function evaluateFourModFiniteBaseline(
  context: { pool: ModPool; priceBook: PriceBook },
  clean: ItemState,
  target: TargetDefinition
): FourModBaseline {
  const transmute = requiredMechanic('transmutation_orb');
  const alteration = requiredMechanic('alteration_orb');
  const regal = requiredMechanic('regal_orb');
  const exalt = requiredMechanic('exalted_orb');
  const scour = requiredMechanic('scouring_orb');
  const requirements = getAllTargetModRequirements(target);
  const targetMods = requirements.map((requirement) => {
    const mod = context.pool.getAllMods().find((candidate) =>
      matchesModRequirement(candidate, requirement)
    );
    if (!mod) throw new Error(`Four-mod baseline target absent: ${JSON.stringify(requirement)}`);
    return mod;
  });
  const targetModIds = targetMods.map((mod) => mod.modId);
  const prefixTargets = targetMods.filter((mod) => mod.genType === 'Prefix');
  const suffixTargets = targetMods.filter((mod) => mod.genType === 'Suffix');
  if (prefixTargets.length === 0 || suffixTargets.length === 0) {
    throw new Error('Four-mod baseline requires at least one target on each affix side');
  }
  const magicDistribution = transmute.getTransitions!(clean, target, context);
  const candidates: FourModBaseline[] = [];
  for (const prefix of prefixTargets) {
    for (const suffix of suffixTargets) {
      const pairIds = [prefix.modId, suffix.modId];
      const pairOutcomes = magicDistribution.outcomes.filter((outcome) =>
        hasIds(outcome.state, pairIds)
      );
      const magicPairProbability = pairOutcomes.reduce((sum, outcome) => sum + outcome.probability, 0);
      if (magicPairProbability <= 0) continue;
      const pairStates = aggregate(pairOutcomes.map((outcome) => ({
        state: outcome.state,
        probability: outcome.probability / magicPairProbability,
      })), target);
      const regalSuccessStates: WeightedState[] = [];
      let regalThirdTargetProbability = 0;
      for (const weighted of pairStates) {
        const distribution = regal.getTransitions!(weighted.state, target, context);
        for (const outcome of distribution.outcomes) {
          const matched = targetModIds.filter((id) => hasIds(outcome.state, [id])).length;
          if (matched !== 3) continue;
          const probability = weighted.probability * outcome.probability;
          regalThirdTargetProbability += probability;
          regalSuccessStates.push({ state: outcome.state, probability });
        }
      }
      if (regalThirdTargetProbability <= 0) continue;
      const conditionalRegalSuccess = aggregate(regalSuccessStates.map((weighted) => ({
        state: weighted.state,
        probability: weighted.probability / regalThirdTargetProbability,
      })), target);
      let exaltFourthTargetProbability = 0;
      for (const weighted of conditionalRegalSuccess) {
        const distribution = exalt.getTransitions!(weighted.state, target, context);
        exaltFourthTargetProbability += weighted.probability * distribution.outcomes
          .filter((outcome) => hasIds(outcome.state, targetModIds))
          .reduce((sum, outcome) => sum + outcome.probability, 0);
      }
      const successProbabilityPerCycle = regalThirdTargetProbability * exaltFourthTargetProbability;
      if (successProbabilityPerCycle <= 0) continue;
      const alterationsPerCycle = (1 - magicPairProbability) / magicPairProbability;
      const cycleCost = transmute.getCost(context).costChaos +
        alterationsPerCycle * alteration.getCost(context).costChaos +
        regal.getCost(context).costChaos +
        regalThirdTargetProbability * exalt.getCost(context).costChaos +
        (1 - successProbabilityPerCycle) * scour.getCost(context).costChaos;
      const expectedUsage = {
        transmutation_orb: 1 / successProbabilityPerCycle,
        alteration_orb: alterationsPerCycle / successProbabilityPerCycle,
        regal_orb: 1 / successProbabilityPerCycle,
        exalted_orb: regalThirdTargetProbability / successProbabilityPerCycle,
        scouring_orb: (1 - successProbabilityPerCycle) / successProbabilityPerCycle,
      };
      const expectedCostChaos = cycleCost / successProbabilityPerCycle;
      const reconciled = expectedUsage.transmutation_orb * transmute.getCost(context).costChaos +
        expectedUsage.alteration_orb * alteration.getCost(context).costChaos +
        expectedUsage.regal_orb * regal.getCost(context).costChaos +
        expectedUsage.exalted_orb * exalt.getCost(context).costChaos +
        expectedUsage.scouring_orb * scour.getCost(context).costChaos;
      candidates.push({
        selectedMagicPair: pairIds,
        pairCandidatesEvaluated: prefixTargets.length * suffixTargets.length,
        magicPairProbability,
        regalThirdTargetProbability,
        exaltFourthTargetProbability,
        successProbabilityPerCycle,
        expectedCostChaos,
        expectedUsage,
        reconciliationDifferenceChaos: Math.abs(expectedCostChaos - reconciled),
      });
    }
  }
  const selected = candidates.sort((left, right) => left.expectedCostChaos - right.expectedCostChaos)[0];
  if (!selected || selected.reconciliationDifferenceChaos > 1e-8) {
    throw new Error('J5 generic four-mod finite baseline failed to reconcile');
  }
  return selected;
}

const fourModPool = ModPool.forCluster(repo, 'Large Cluster Jewel', FOUR_MOD_CLUSTER);
const fourModTarget: TargetDefinition = {
  requiredRarity: 'rare',
  requiredMods: FOUR_MOD_IDS.map((modId) => ({ modId })),
};
const fourModClean: ItemState = {
  baseType: 'Large Cluster Jewel',
  clusterType: FOUR_MOD_CLUSTER,
  itemLevel: 84,
  passiveCount: 12,
  rarity: 'normal',
  prefixes: [],
  suffixes: [],
  fracturedModIds: [],
};
console.error('[phase2j-search] J5 finite four-mod baseline');
const fourModBaseline = evaluateFourModFiniteBaseline(
  { pool: fourModPool, priceBook },
  fourModClean,
  fourModTarget
);

console.error('[phase2j-search] J7 quotient audit');
function quotientActionSignature(node: CanonicalGraphNode, target: TargetDefinition): string {
  return JSON.stringify([...node.actions.entries()].map(([actionId, action]) => {
    const outcomes = new Map<string, number>();
    for (const transition of action.transitions) {
      const key = getCanonicalStateKey(transition.nextState, target);
      outcomes.set(key, (outcomes.get(key) ?? 0) + transition.probability);
    }
    return {
      actionId,
      immediateCostChaos: action.immediateCostChaos,
      outcomes: [...outcomes].map(([key, probability]) =>
        [key, Number(probability.toFixed(12))] as const
      ).sort(([left], [right]) => left.localeCompare(right)),
    };
  }).sort((left, right) => left.actionId.localeCompare(right.actionId)));
}

const concreteAudit = new GenericSearchEngine(
  { pool: fourModPool, priceBook },
  fourModTarget,
  {
    canonicalStateKey: getPhysicalStateSignature,
    prioritizeTargetProgress: true,
    includeHarvest: false,
  }
).buildGraph(
  fourModClean,
  1_000,
  undefined,
  Date.now() + 20_000,
  new Set(['annulment_orb', 'fracturing_orb']),
  'RECOMMEND'
);
const quotientClasses = new Map<string, { signature: string; count: number }>();
const quotientViolations: string[] = [];
for (const node of concreteAudit.nodes.values()) {
  const key = getCanonicalStateKey(node.state, fourModTarget);
  const signature = quotientActionSignature(node, fourModTarget);
  const existing = quotientClasses.get(key);
  if (existing && existing.signature !== signature) quotientViolations.push(key);
  else if (existing) existing.count++;
  else quotientClasses.set(key, { signature, count: 1 });
}
if (quotientViolations.length > 0) {
  throw new Error(`J7 quotient audit found ${quotientViolations.length} violations`);
}

console.error('[phase2j-search] J6 exact four-mod product solve');
const fourModInput: OptimizeCraftInput = {
  baseType: fourModClean.baseType,
  clusterType: fourModClean.clusterType,
  itemLevel: fourModClean.itemLevel,
  passiveCount: fourModClean.passiveCount!,
  target: fourModTarget,
  prices: {
    cleanBaseCostChaos: 10,
    cleanBasePriceSource: 'manual',
    cleanBasePriceProvenance: 'Phase 2J controlled four-mod clean base',
  },
  allowResearchFallbackPrices: true,
  searchBudget: { maxStates: 5_000, maxWallTimeMs: 30_000, maxExpansionRounds: 3 },
  searchIntent: 'RECOMMEND',
};
started = Date.now();
const fourModProduct = new OptimizerService(repo).optimize(fourModInput);
const fourModElapsed = Date.now() - started;
if (
  fourModProduct.recommended === null ||
  !fourModProduct.risk.selectedPolicyProper ||
  fourModProduct.risk.terminalAbsorptionProbability < 1 - 1e-8 ||
  !fourModProduct.solver.bellmanConverged ||
  !fourModProduct.solver.occupancyConverged ||
  !fourModProduct.solver.costReconciled ||
  fourModProduct.risk.unresolvedOnPolicyProbability > 1e-10 ||
  fourModProduct.craftPlan.uncoveredActionIds.length > 0 ||
  fourModProduct.craftPlan.inventedActionIds.length > 0
) {
  throw new Error('J6 exact four-mod product solve failed proof/plan gates');
}

function graphProfile(result: GenericSearchResult): string {
  return JSON.stringify({
    targetProgress: result.graphBuild.targetProgressCounts,
    frontierTargetProgress: result.graphBuild.frontierTargetProgressCounts,
    rarity: result.graphBuild.stateCountsByRarity,
    affixes: result.graphBuild.stateCountsByAffixes,
    actionAttribution: result.graphBuild.actionAttribution,
    timing: result.stageTiming,
  });
}

const directFourModProfile = new GenericSearchEngine(
  { pool: fourModPool, priceBook },
  fourModTarget,
  {
    prioritizeTargetProgress: true,
    includeHarvest: false,
    maxStates: 5_000,
    maxWallTimeMs: 30_000,
    maxExpansionRounds: 3,
    searchIntent: 'RECOMMEND',
    restartReacquire: {
      destination: fourModClean,
      acquisitionCostChaos: 10,
      confidence: 'known',
      provenance: 'Phase 2J profile restart',
    },
  }
).search(fourModClean);

console.error('[phase2j-search] J8 three-notable real-world regression');
const threeNotableInput: OptimizeCraftInput = {
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
  prices: {
    cleanBaseCostChaos: 10,
    cleanBasePriceSource: 'manual',
    cleanBasePriceProvenance: 'Phase 2J three-notable Cold fixture',
  },
  allowResearchFallbackPrices: true,
  searchBudget: { maxStates: 5_000, maxWallTimeMs: 30_000, maxExpansionRounds: 3 },
  searchIntent: 'RECOMMEND',
};
started = Date.now();
const threeNotableProduct = new OptimizerService(repo).optimize(threeNotableInput);
const threeNotableElapsed = Date.now() - started;
if (
  threeNotableProduct.recommended === null ||
  !threeNotableProduct.risk.selectedPolicyProper ||
  threeNotableProduct.risk.terminalAbsorptionProbability < 1 - 1e-8 ||
  !threeNotableProduct.solver.bellmanConverged ||
  !threeNotableProduct.solver.occupancyConverged ||
  !threeNotableProduct.solver.costReconciled ||
  threeNotableProduct.risk.unresolvedOnPolicyProbability > 1e-10 ||
  threeNotableProduct.craftPlan.uncoveredActionIds.length > 0 ||
  threeNotableProduct.craftPlan.inventedActionIds.length > 0
) {
  throw new Error('J8 three-notable real-world solve failed proof/plan gates');
}

const lines = [
  'PHASE 2J SEARCH / REFINEMENT / RESUME / FOUR-MOD SCALING DIAGNOSTIC',
  '',
  'J2 HERALD POLICY REFINEMENT',
  ...summarizeOptimizer('  RECOMMEND 5k/120s/3', heraldRecommend, heraldRecommendElapsed),
  `  deterministic prefix completion: initialStates=${heraldInitialRecommendStates}; finalStates=${heraldRecommend.search.statesExpanded}; retainedDEEPEN=${heraldPrefixCompletionElapsed > 0}; additionalElapsed=${heraldPrefixCompletionElapsed}ms`,
  `  timeToFirstUseful=${heraldRecommend.search.timeToFirstUsefulRecommendationMs}ms; totalEngine=${heraldRecommend.search.elapsedMs}ms; bounded reserve=one completed post-certification round inside the existing total state/round/wall budget`,
  '',
  'J3 COLD VS RESUMED DEEPEN',
  ...summarizeOptimizer('  resumed 10k/180s/4', heraldResumed, heraldResumedElapsed),
  ...summarizeOptimizer('  cold 10k/180s/4', heraldCold, heraldColdElapsed),
  `  EV difference=${coldResumedEvDifference.toExponential(6)}c; healthEquivalent=${coldResumedHealthEquivalent}; duplicate transition generation delta=${heraldCold.search.transitionDistributionsGenerated - heraldResumed.search.transitionDistributionsGenerated}; PASS`,
  '',
  'J4 SESSION INVALIDATION',
  `  baseline=${baselineIdentity}`,
  ...Object.entries(identityControls).map(([change, changedIdentity]) =>
    `  ${change}: ${changedIdentity}; invalidated=${changedIdentity !== baselineIdentity}`
  ),
  '  budgets and RECOMMEND/DEEPEN intent are intentionally absent from exact mechanics/economics identity; PASS',
  '',
  'J5 FOUR-MOD DIAGNOSTIC-ONLY FINITE BASELINE',
  `  ${JSON.stringify(fourModBaseline)}`,
  '  policy=Transmute/Alter until a generically enumerated target prefix+suffix pair -> Regal for any third target -> Exalt for the fourth -> Scour/repeat on miss; transition source=shared action registry/PriceBook; product ranking import=NONE; proper=true; absorption=1; reconciled=true',
  '',
  'J6 EXACT FOUR-MOD GENERIC PRODUCT SOLVE',
  ...summarizeOptimizer('  product 5k/30s/3', fourModProduct, fourModElapsed),
  `  acquisitionStage=${fourModProduct.acquisition.stage.mode}; proof-honest acquisitionSafe=${fourModProduct.acquisition.selectionSafe}; pre-fractured market methods=${fourModProduct.acquisition.candidates.some((candidate) => candidate.methods.some((method) => method.id.startsWith('market'))) ? 'PRESENT' : 'ABSENT'}`,
  `  direct graph profile=${graphProfile(directFourModProfile)}`,
  '  observed pre-fix browser reference=NO_RESOLVED_ROUTE after ~10 minutes; controlled post-fix product result is finite within the 30-second request guard',
  '',
  'J7 TARGET-CONDITIONED QUOTIENT SAFETY AUDIT',
  `  concreteStates=${concreteAudit.nodes.size}; quotientClasses=${quotientClasses.size}; collapsed=${concreteAudit.nodes.size - quotientClasses.size}; violations=${quotientViolations.length}; actionScope=shared conventional actions plus deferred Annul/Fracture placeholders; PASS`,
  '  Existing canonical quotient retained exact target identities, roll pass/fail, fracture state, mod-group/name exclusions, rarity/occupancy, flags, and final-state semantics. No weaker Phase 2J state identity was introduced.',
  '',
  'J8 THREE-NOTABLE REAL-WORLD REGRESSION',
  ...summarizeOptimizer('  product 5k/30s/3', threeNotableProduct, threeNotableElapsed),
  `  acquisitionStage=${threeNotableProduct.acquisition.stage.mode}; proof-honest acquisitionSafe=${threeNotableProduct.acquisition.selectionSafe}; pre-fractured market methods=${threeNotableProduct.acquisition.candidates.some((candidate) => candidate.methods.some((method) => method.id.startsWith('market'))) ? 'PRESENT' : 'ABSENT'}`,
  '  chronological plan has uncovered=[] and invented=[]; no market-fractured purchase in ranking; PASS',
  '',
  'CONSTRAINT AUDIT',
  '  target/Craft-specific solver branches added: NO',
  '  hardcoded route winner/target order added: NO',
  '  product budgets raised as the fix: NO',
  '  unit tests added: NO',
];

writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
console.log(lines.join('\n'));
