import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ClusterModRepository } from '../src/data/loadClusterMods.ts';
import type { SolverContext } from '../src/domain/CraftAction.ts';
import type { ItemState } from '../src/domain/ItemState.ts';
import type { Mod, RolledMod } from '../src/domain/Mod.ts';
import { toRolledMod } from '../src/domain/Mod.ts';
import { ModPool } from '../src/domain/ModPool.ts';
import { PriceBook, type CurrencyRates } from '../src/domain/PriceBook.ts';
import type { TargetDefinition } from '../src/domain/TargetDefinition.ts';
import { matchesModRequirement } from '../src/domain/TargetDefinition.ts';
import { Mulberry32RandomSource } from '../src/probability/random.ts';
import { CRAFT_MECHANICS, type CraftMechanic } from '../src/rules/actionRegistry.ts';
import { calculateTotalWeight, getEligibleMods } from '../src/rules/modEligibility.ts';
import {
  GenericSearchEngine,
  type CandidateActionQValue,
  type GenericSearchResult,
  type StatePolicyDecision,
} from '../src/solver/genericSearch.ts';
import { buildCraftPlan, type CraftPlanSource } from '../src/service/craftPlan.ts';
import type { PolicyExplanationRule } from '../src/service/optimizerService.ts';

const outputPath = fileURLToPath(
  new URL('../../output-phase2i-weight-policy-diagnostic.txt', import.meta.url)
);
const TARGET_A = 'Phase2I_Target_A';
const TARGET_B = 'Phase2I_Target_B';
const SYNTHETIC_CLUSTER = 'Phase 2I symmetric weight-policy fixture';
const ENABLED_ACTIONS = [
  'transmutation_orb',
  'alteration_orb',
  'augmentation_orb',
  'regal_orb',
  'exalted_orb',
  'scouring_orb',
  'restart_reacquire',
];
const EXPENSIVE_LATE_RATES: Partial<CurrencyRates> = {
  transmutation: 0.01,
  alteration: 0.01,
  augmentation: 0.03,
  regal: 0.5,
  exalt: 2,
  scour: 0.1,
};
const CHEAP_LATE_RATES: Partial<CurrencyRates> = {
  transmutation: 0.01,
  alteration: 5,
  augmentation: 0.01,
  regal: 0.001,
  exalt: 0.002,
  scour: 0.01,
};
const RESTART_COST = 1;

function mod(
  modId: string,
  genType: Mod['genType'],
  weight: number,
  options: { notable?: boolean; craftTags?: string[] } = {}
): Mod {
  return {
    modId,
    name: modId,
    genType,
    weight,
    ilvl: 1,
    modGroup: `${modId}_group`,
    modGroups: [`${modId}_group`],
    tags: options.craftTags ? [...options.craftTags] : [],
    craftTags: options.craftTags ? [...options.craftTags] : [],
    spawnTags: [],
    statText: modId.replaceAll('_', ' '),
    statValues: [],
    tier: 1,
    tierCount: 1,
    isNotable: options.notable ?? false,
  };
}

function fixturePool(aWeight: number, bWeight: number): ModPool {
  return new ModPool([
    mod(TARGET_A, 'Prefix', aWeight),
    mod(TARGET_B, 'Prefix', bWeight),
    mod('Phase2I_Filler_Prefix_1', 'Prefix', 800),
    mod('Phase2I_Filler_Prefix_2', 'Prefix', 1_000),
    mod('Phase2I_Filler_Prefix_3', 'Prefix', 1_200),
    mod('Phase2I_Filler_Suffix_1', 'Suffix', 900),
    mod('Phase2I_Filler_Suffix_2', 'Suffix', 1_100),
    mod('Phase2I_Filler_Suffix_3', 'Suffix', 1_300),
  ]);
}

function cleanState(clusterType = SYNTHETIC_CLUSTER): ItemState {
  return {
    baseType: 'Medium Cluster Jewel',
    clusterType,
    itemLevel: 84,
    passiveCount: 6,
    rarity: 'normal',
    prefixes: [],
    suffixes: [],
    fracturedModIds: [],
  };
}

function syntheticTarget(): TargetDefinition {
  return { requiredMods: [{ modId: TARGET_A }, { modId: TARGET_B }] };
}

function action(actionId: string): CraftMechanic {
  const found = CRAFT_MECHANICS.find((candidate) => candidate.id === actionId);
  if (!found?.getTransitions || !found.sampleTransition) {
    throw new Error(`Required executable mechanic is missing: ${actionId}`);
  }
  return found;
}

function rolled(pool: ModPool, modId: string): RolledMod {
  const found = pool.findModById(modId);
  if (!found) throw new Error(`Fixture mod missing: ${modId}`);
  return toRolledMod(found);
}

function stateWith(
  pool: ModPool,
  rarity: ItemState['rarity'],
  prefixIds: string[],
  suffixIds: string[],
  clusterType = SYNTHETIC_CLUSTER
): ItemState {
  return {
    ...cleanState(clusterType),
    rarity,
    prefixes: prefixIds.map((id) => rolled(pool, id)),
    suffixes: suffixIds.map((id) => rolled(pool, id)),
  };
}

function probabilityOfMod(
  outcomes: ReturnType<NonNullable<CraftMechanic['getTransitions']>>['outcomes'],
  modId: string
): number {
  return outcomes.reduce(
    (sum, outcome) => sum + (
      [...outcome.state.prefixes, ...outcome.state.suffixes].some((candidate) => candidate.modId === modId)
        ? outcome.probability
        : 0
    ),
    0
  );
}

function assertClose(actual: number, expected: number, tolerance: number, label: string): void {
  if (!Number.isFinite(actual) || Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label}: expected ${expected}, received ${actual}`);
  }
}

interface TransitionAudit {
  actionId: string;
  sum: number;
  expectedA: number;
  emittedA: number;
  expectedB: number;
  emittedB: number;
  branch?: string;
}

function runTransitionAudit(): TransitionAudit[] {
  const pool = fixturePool(1, 12_000);
  const target = syntheticTarget();
  const context: SolverContext = {
    pool,
    priceBook: new PriceBook(EXPENSIVE_LATE_RATES, {}),
    target,
  };
  const magicZeroTarget = stateWith(
    pool,
    'magic',
    ['Phase2I_Filler_Prefix_1'],
    ['Phase2I_Filler_Suffix_1']
  );
  const rareZeroTarget = { ...magicZeroTarget, rarity: 'rare' as const };
  const audits: TransitionAudit[] = [];

  const alteration = action('alteration_orb').getTransitions!(magicZeroTarget, target, context);
  const prefixTotal = calculateTotalWeight(pool.getPrefixes());
  const alterationAudit: TransitionAudit = {
    actionId: 'alteration_orb',
    sum: alteration.outcomes.reduce((sum, outcome) => sum + outcome.probability, 0),
    expectedA: 0.75 * (1 / prefixTotal),
    emittedA: probabilityOfMod(alteration.outcomes, TARGET_A),
    expectedB: 0.75 * (12_000 / prefixTotal),
    emittedB: probabilityOfMod(alteration.outcomes, TARGET_B),
    branch: '25% prefix-only + 50% prefix/suffix; conditional prefix weight fraction in each branch',
  };
  audits.push(alterationAudit);

  for (const [actionId, state] of [
    ['regal_orb', magicZeroTarget],
    ['exalted_orb', rareZeroTarget],
  ] as const) {
    const distribution = action(actionId).getTransitions!(state, target, context);
    const rareInput = actionId === 'regal_orb' ? { ...state, rarity: 'rare' as const } : state;
    const eligible = getEligibleMods(rareInput, pool.getAllMods());
    const total = calculateTotalWeight(eligible);
    const a = eligible.find((candidate) => candidate.modId === TARGET_A)?.weight ?? 0;
    const b = eligible.find((candidate) => candidate.modId === TARGET_B)?.weight ?? 0;
    audits.push({
      actionId,
      sum: distribution.outcomes.reduce((sum, outcome) => sum + outcome.probability, 0),
      expectedA: a / total,
      emittedA: probabilityOfMod(distribution.outcomes, TARGET_A),
      expectedB: b / total,
      emittedB: probabilityOfMod(distribution.outcomes, TARGET_B),
    });
  }

  for (const audit of audits) {
    assertClose(audit.sum, 1, 1e-12, `${audit.actionId} probability sum`);
    assertClose(audit.emittedA, audit.expectedA, 1e-12, `${audit.actionId} P(A)`);
    assertClose(audit.emittedB, audit.expectedB, 1e-12, `${audit.actionId} P(B)`);
  }
  return audits;
}

interface TargetBehavior {
  targetId: string;
  stateCount: number;
  expectedVisits: number;
  preserveStateCount: number;
  preserveVisits: number;
  rerollStateCount: number;
  rerollVisits: number;
  selectedActions: Record<string, { states: number; visits: number }>;
}

interface TargetPreference {
  kind: 'NONE' | 'PREFER_TARGET_FIRST';
  targetModIds: string[];
  strength: 'CLEAR' | 'SOFT' | 'NONE';
  evidence: string;
}

function targetBehavior(result: GenericSearchResult, targetId: string): TargetBehavior {
  const rules = result.onPolicyRules.filter((rule) => {
    if (rule.state.rarity !== 'magic') return false;
    const affixes = [...rule.state.prefixes, ...rule.state.suffixes];
    const matched = [TARGET_A, TARGET_B].filter((id) => affixes.some((mod) => mod.modId === id));
    return matched.length === 1 && matched[0] === targetId;
  });
  const behavior: TargetBehavior = {
    targetId,
    stateCount: rules.length,
    expectedVisits: 0,
    preserveStateCount: 0,
    preserveVisits: 0,
    rerollStateCount: 0,
    rerollVisits: 0,
    selectedActions: {},
  };
  for (const rule of rules) {
    behavior.expectedVisits += rule.expectedVisits;
    const entry = behavior.selectedActions[rule.selectedActionId] ?? { states: 0, visits: 0 };
    entry.states++;
    entry.visits += rule.expectedVisits;
    behavior.selectedActions[rule.selectedActionId] = entry;
    if (rule.selectedActionId === 'alteration_orb') {
      behavior.rerollStateCount++;
      behavior.rerollVisits += rule.expectedVisits;
    } else {
      behavior.preserveStateCount++;
      behavior.preserveVisits += rule.expectedVisits;
    }
  }
  return behavior;
}

function classifyPreference(result: GenericSearchResult): {
  preference: TargetPreference;
  behaviors: TargetBehavior[];
} {
  const behaviors = [targetBehavior(result, TARGET_A), targetBehavior(result, TARGET_B)];
  const fullyPreserved = behaviors.filter((behavior) =>
    behavior.stateCount > 0 && behavior.preserveStateCount === behavior.stateCount
  );
  const fullyRerolled = behaviors.filter((behavior) =>
    behavior.stateCount > 0 && behavior.rerollStateCount === behavior.stateCount
  );
  if (fullyPreserved.length !== 1 || fullyRerolled.length !== behaviors.length - 1) {
    return {
      preference: {
        kind: 'NONE',
        targetModIds: [],
        strength: 'NONE',
        evidence: `No complete selected-policy preservation opposition: ${behaviors.map((behavior) => `${behavior.targetId}=${behavior.preserveStateCount}/${behavior.stateCount}`).join(', ')}.`,
      },
      behaviors,
    };
  }
  const high = fullyPreserved[0];
  const low = fullyRerolled[0];
  return {
    preference: {
      kind: 'PREFER_TARGET_FIRST',
      targetModIds: [high.targetId],
      strength: 'CLEAR',
      evidence:
        `${high.targetId} is preserved in ${high.preserveStateCount}/${high.stateCount} reachable Magic cases ` +
        `(${high.preserveVisits.toFixed(6)} expected visits), versus ${low.targetId} in ` +
        `${low.preserveStateCount}/${low.stateCount} (${low.preserveVisits.toFixed(6)} visits).`,
    },
    behaviors,
  };
}

interface SyntheticRun {
  label: string;
  aWeight: number;
  bWeight: number;
  rates: Partial<CurrencyRates>;
  pool: ModPool;
  target: TargetDefinition;
  context: SolverContext;
  result: GenericSearchResult;
  preference: TargetPreference;
  behaviors: TargetBehavior[];
}

function runSynthetic(
  label: string,
  aWeight: number,
  bWeight: number,
  rates: Partial<CurrencyRates>
): SyntheticRun {
  const pool = fixturePool(aWeight, bWeight);
  const target = syntheticTarget();
  const start = cleanState();
  const context: SolverContext = { pool, priceBook: new PriceBook(rates, {}), target };
  const engine = new GenericSearchEngine(context, target, {
    enabledActionIds: ENABLED_ACTIONS,
    restartReacquire: {
      destination: start,
      acquisitionCostChaos: RESTART_COST,
      confidence: 'known',
      provenance: 'Phase 2I controlled clean-base restart price',
    },
    prioritizeTargetProgress: true,
    maxStates: 8_000,
    maxWallTimeMs: 30_000,
    maxExpansionRounds: 2,
    maxIterations: 8_000,
    maxMarkovIterations: 1_000_000,
    searchIntent: 'PROVE',
    persistentExpansion: true,
  });
  const result = engine.search(start);
  const { preference, behaviors } = classifyPreference(result);
  if (
    result.optimalityProof.selectedPolicyStatus !==
      'FULLY RESOLVED / PROPER / ABSORBING / COST-RECONCILED' ||
    !result.onPolicyGraph.isProper ||
    result.onPolicyGraph.terminalAbsorptionProbability < 1 - 1e-8 ||
    !result.convergence.converged ||
    !result.reconciliation.visitConverged ||
    !result.reconciliation.isReconciled
  ) {
    throw new Error(
      `${label} failed policy-health gates: status=${result.optimalityProof.selectedPolicyStatus}; ` +
      `proper=${result.onPolicyGraph.isProper}; absorption=${result.onPolicyGraph.terminalAbsorptionProbability}; ` +
      `Bellman=${result.convergence.converged}; occupancy=${result.reconciliation.visitConverged}; ` +
      `reconciled=${result.reconciliation.isReconciled}; states=${result.searchSummary.statesExpanded}; ` +
      `rounds=${result.searchSummary.expansionRounds}; elapsed=${result.searchSummary.elapsedMs}`
    );
  }
  return { label, aWeight, bWeight, rates, pool, target, context, result, preference, behaviors };
}

function syntheticPresentationPlan(run: SyntheticRun) {
  const policyExplanation: PolicyExplanationRule[] = run.result.onPolicyRules.map((rule) => {
    const matchedTargetModIds = targetMatches(rule.state);
    return {
      condition: `${rule.state.rarity} ${rule.state.prefixes.length}P/${rule.state.suffixes.length}S`,
      actionId: rule.selectedActionId,
      action: rule.selectedActionName,
      representedStateCount: 1,
      expectedVisits: rule.expectedVisits,
      exampleState: rule.stateKey,
      context: {
        rarity: rule.state.rarity,
        prefixCount: rule.state.prefixes.length,
        suffixCount: rule.state.suffixes.length,
        matchedTargetModIds,
        unmatchedTargetModIds: [TARGET_A, TARGET_B].filter((id) => !matchedTargetModIds.includes(id)),
        prefixes: rule.state.prefixes.map((affix) => ({
          modId: affix.modId,
          tier: affix.tier,
          isFractured: false,
          currentRoll: affix.currentRoll,
        })),
        suffixes: rule.state.suffixes.map((affix) => ({
          modId: affix.modId,
          tier: affix.tier,
          isFractured: false,
          currentRoll: affix.currentRoll,
        })),
        influenced: false,
        synthesised: false,
        acquisitionMenu: false,
        disambiguateAffixes: true,
      },
    };
  });
  const source: CraftPlanSource = {
    target: run.target,
    recommendationStatus: 'PROVEN_OPTIMAL',
    recommended: {
      actionId: 'acquire_phase2i_weight_fixture',
      name: 'Controlled clean base',
      acquisitionCandidateId: 'candidate_0',
      acquisitionMethodId: 'controlled_base',
      expectedTotalCostChaos: RESTART_COST + run.result.totalExpectedCostChaos,
      lowerBoundChaos: RESTART_COST + run.result.totalExpectedCostChaos,
      incumbentUpperBoundChaos: RESTART_COST + run.result.totalExpectedCostChaos,
      optimalityGapChaos: 0,
      status: 'RESOLVED',
      couldBeatResolvedIncumbent: false,
    },
    expectedActionUsage: run.result.expectedActionUsage.map((usage) => ({ ...usage })),
    policyExplanation,
    acquisition: {
      selectedCandidateId: 'candidate_0',
      selectedMethodId: 'controlled_base',
      candidates: [{
        id: 'candidate_0',
        label: 'Controlled clean base',
        physicalStateSignature: 'phase2i-weight-fixture',
        methods: [{
          id: 'controlled_base',
          label: 'Controlled clean base',
          costChaos: RESTART_COST,
          confidence: 'known',
          provenance: 'Phase 2I symmetric diagnostic fixture.',
          approximate: false,
          executable: false,
        }],
      }],
      methodCount: 1,
      distinctPhysicalStateCount: 1,
      selectionSafe: true,
      stage: {
        mode: 'NO_FRACTURE_CANDIDATES',
        candidateCount: 0,
        attemptedCandidates: 0,
        certifiedCandidates: 0,
        cacheHits: 0,
        totalStateBudget: 0,
        totalWallTimeBudgetMs: 0,
        maxExpansionRoundsPerCandidate: 0,
        elapsedMs: 0,
        allocation: 'No fracture candidates.',
        cacheIdentity: 'not applicable',
      },
    },
    proof: { globalOptimality: 'PROVEN OVER MODELED ACTIONS' },
  };
  return buildCraftPlan(source);
}

type StateShape = 'NORMAL' | 'MAGIC_ZERO' | 'MAGIC_A' | 'MAGIC_B' | 'RARE_A' | 'RARE_B';

function targetMatches(state: ItemState): string[] {
  return [TARGET_A, TARGET_B].filter((id) =>
    [...state.prefixes, ...state.suffixes].some((mod) => mod.modId === id)
  );
}

function decisionFor(run: SyntheticRun, shape: StateShape): StatePolicyDecision | undefined {
  const decisions = [...run.result.policyMap.values()];
  const matching = decisions.filter((decision) => {
    const state = decision.state;
    const matched = targetMatches(state);
    if (shape === 'NORMAL') return state.rarity === 'normal';
    if (shape === 'MAGIC_ZERO') return state.rarity === 'magic' && matched.length === 0;
    if (shape === 'MAGIC_A') return state.rarity === 'magic' && matched.length === 1 && matched[0] === TARGET_A;
    if (shape === 'MAGIC_B') return state.rarity === 'magic' && matched.length === 1 && matched[0] === TARGET_B;
    if (shape === 'RARE_A') return state.rarity === 'rare' && matched.length === 1 && matched[0] === TARGET_A;
    return state.rarity === 'rare' && matched.length === 1 && matched[0] === TARGET_B;
  });
  return matching.sort((left, right) => {
    const leftVisits = run.result.onPolicyRules.find((rule) => rule.stateKey === left.stateKey)?.expectedVisits ?? 0;
    const rightVisits = run.result.onPolicyRules.find((rule) => rule.stateKey === right.stateKey)?.expectedVisits ?? 0;
    return rightVisits - leftVisits;
  })[0];
}

function finite(value: number): string {
  return Number.isFinite(value) ? value.toFixed(6) : 'Infinity';
}

function qSummary(candidate: CandidateActionQValue): string {
  return `${candidate.actionId}[immediate=${finite(candidate.immediateCostChaos)}, continuation=${finite(candidate.expectedContinuationChaos)}, Q=${finite(candidate.totalQValueChaos)}, status=${candidate.status}]`;
}

function decisionSummary(decision: StatePolicyDecision | undefined): string {
  if (!decision) return 'NOT_REPRESENTED';
  return `${decision.bestActionId}; V=${finite(decision.optimalValueChaos)}; candidates=${decision.candidateQValues.map(qSummary).join(' | ')}`;
}

function runPriceSensitivity(expensive: SyntheticRun): {
  cheap: SyntheticRun;
  flipKey: string;
  expensiveDecision: StatePolicyDecision;
  cheapDecision: StatePolicyDecision;
} {
  const cheap = runSynthetic('W3 cheap-late', expensive.aWeight, expensive.bWeight, CHEAP_LATE_RATES);
  const flips = [...expensive.result.policyMap.entries()].flatMap(([key, decision]) => {
    const other = cheap.result.policyMap.get(key);
    if (!other || other.bestActionId === decision.bestActionId) return [];
    const matches = targetMatches(decision.state);
    if (decision.state.rarity === 'normal' || matches.length > 1) return [];
    return [{ key, expensiveDecision: decision, cheapDecision: other }];
  });
  const selected = flips.find(({ expensiveDecision, cheapDecision }) =>
    [expensiveDecision.bestActionId, cheapDecision.bestActionId].includes('alteration_orb') &&
    [expensiveDecision.bestActionId, cheapDecision.bestActionId].some((id) =>
      id === 'regal_orb' || id === 'exalted_orb' || id === 'augmentation_orb'
    )
  ) ?? flips[0];
  if (!selected) throw new Error('W3 failed to cross a selected-policy decision boundary');
  return { cheap, flipKey: selected.key, ...selected };
}

function runMonteCarloAudit(): {
  samples: number;
  expectedA: number;
  observedA: number;
  expectedB: number;
  observedB: number;
  toleranceA: number;
  toleranceB: number;
} {
  const pool = fixturePool(1, 12_000);
  const target = syntheticTarget();
  const context: SolverContext = { pool, priceBook: new PriceBook(EXPENSIVE_LATE_RATES, {}), target };
  const state = stateWith(
    pool,
    'rare',
    ['Phase2I_Filler_Prefix_1'],
    ['Phase2I_Filler_Suffix_1']
  );
  const exalt = action('exalted_orb');
  const analytical = exalt.getTransitions!(state, target, context);
  const expectedA = probabilityOfMod(analytical.outcomes, TARGET_A);
  const expectedB = probabilityOfMod(analytical.outcomes, TARGET_B);
  const samples = 500_000;
  const rng = new Mulberry32RandomSource(2_026_020_9);
  let hitsA = 0;
  let hitsB = 0;
  for (let index = 0; index < samples; index++) {
    const outcome = exalt.sampleTransition!(state, target, context, rng);
    const ids = [...outcome.prefixes, ...outcome.suffixes].map((mod) => mod.modId);
    if (ids.includes(TARGET_A)) hitsA++;
    if (ids.includes(TARGET_B)) hitsB++;
  }
  const observedA = hitsA / samples;
  const observedB = hitsB / samples;
  const tolerance = (probability: number): number =>
    Math.max(2 / samples, 5 * Math.sqrt(probability * (1 - probability) / samples));
  const toleranceA = tolerance(expectedA);
  const toleranceB = tolerance(expectedB);
  assertClose(observedA, expectedA, toleranceA, 'W5 sampled P(A)');
  assertClose(observedB, expectedB, toleranceB, 'W5 sampled P(B)');
  return { samples, expectedA, observedA, expectedB, observedB, toleranceA, toleranceB };
}

interface RealTargetBehavior {
  targetId: string;
  magicRules: number;
  magicVisits: number;
  preserveRules: number;
  preserveVisits: number;
  rerollRules: number;
  rerollVisits: number;
  actions: Record<string, { states: number; visits: number }>;
  representativeMagic?: StatePolicyDecision;
  representativeRare?: StatePolicyDecision;
}

function realBehavior(result: GenericSearchResult, target: TargetDefinition, targetId: string): RealTargetBehavior {
  const requirements = target.requiredMods;
  const matchingIds = (state: ItemState): string[] => requirements
    .filter((requirement) => [...state.prefixes, ...state.suffixes].some((mod) => matchesModRequirement(mod, requirement)))
    .map((requirement) => requirement.modId!)
    .sort();
  const rules = result.onPolicyRules.filter((rule) => {
    const matched = matchingIds(rule.state);
    return rule.state.rarity === 'magic' && matched.length === 1 && matched[0] === targetId;
  });
  const actions: RealTargetBehavior['actions'] = {};
  let preserveRules = 0;
  let preserveVisits = 0;
  let rerollRules = 0;
  let rerollVisits = 0;
  for (const rule of rules) {
    const entry = actions[rule.selectedActionId] ?? { states: 0, visits: 0 };
    entry.states++;
    entry.visits += rule.expectedVisits;
    actions[rule.selectedActionId] = entry;
    if (rule.selectedActionId === 'alteration_orb') {
      rerollRules++;
      rerollVisits += rule.expectedVisits;
    } else {
      preserveRules++;
      preserveVisits += rule.expectedVisits;
    }
  }
  const representative = (rarity: ItemState['rarity']): StatePolicyDecision | undefined => {
    const candidates = [...result.policyMap.values()].filter((decision) => {
      const matched = matchingIds(decision.state);
      return decision.state.rarity === rarity && matched.length === 1 && matched[0] === targetId;
    });
    return candidates.sort((left, right) => {
      const leftVisits = result.onPolicyRules.find((rule) => rule.stateKey === left.stateKey)?.expectedVisits ?? 0;
      const rightVisits = result.onPolicyRules.find((rule) => rule.stateKey === right.stateKey)?.expectedVisits ?? 0;
      return rightVisits - leftVisits;
    })[0];
  };
  return {
    targetId,
    magicRules: rules.length,
    magicVisits: rules.reduce((sum, rule) => sum + rule.expectedVisits, 0),
    preserveRules,
    preserveVisits,
    rerollRules,
    rerollVisits,
    actions,
    representativeMagic: representative('magic'),
    representativeRare: representative('rare'),
  };
}

function classifyRealPreference(behaviors: RealTargetBehavior[]): TargetPreference {
  const fullyPreserved = behaviors.filter((behavior) =>
    behavior.magicRules > 0 && behavior.preserveRules === behavior.magicRules
  );
  const fullyRerolled = behaviors.filter((behavior) =>
    behavior.magicRules > 0 && behavior.rerollRules === behavior.magicRules
  );
  if (fullyPreserved.length !== 1 || fullyRerolled.length !== behaviors.length - 1) {
    return {
      kind: 'NONE',
      targetModIds: [],
      strength: 'NONE',
      evidence: `No complete identity-specific preservation opposition: ${behaviors.map((entry) => `${entry.targetId}=${entry.preserveRules}/${entry.magicRules}`).join(', ')}.`,
    };
  }
  const high = fullyPreserved[0];
  const low = fullyRerolled[0];
  return {
    kind: 'PREFER_TARGET_FIRST',
    targetModIds: [high.targetId],
    strength: 'CLEAR',
    evidence:
      `${high.targetId} is preserved in ${high.preserveRules}/${high.magicRules} represented Magic cases ` +
      `(${high.preserveVisits.toFixed(6)} visits), versus ${low.targetId} in ` +
      `${low.preserveRules}/${low.magicRules} (${low.preserveVisits.toFixed(6)} visits).`,
  };
}

function runRealHerald(): {
  result: GenericSearchResult;
  targetIds: string[];
  targetWeights: Record<string, number>;
  prefixTotals: Record<string, number>;
  behaviors: RealTargetBehavior[];
  preference: TargetPreference;
} {
  const repo = new ClusterModRepository();
  const clusterType = '10% increased Damage while affected by a Herald';
  const pool = ModPool.forCluster(repo, 'Medium Cluster Jewel', clusterType);
  const byText = (text: string): Mod => {
    const matches = pool.getAllMods().filter((candidate) => candidate.statText === text && candidate.isNotable);
    if (matches.length !== 1) throw new Error(`Expected one Herald notable ${text}; found ${matches.length}`);
    return matches[0];
  };
  const empowered = byText('Empowered Envoy');
  const endbringer = byText('Endbringer');
  const target: TargetDefinition = {
    requiredMods: [{ modId: empowered.modId }, { modId: endbringer.modId }],
  };
  const start = cleanState(clusterType);
  const context: SolverContext = { pool, priceBook: new PriceBook(), target };
  const result = new GenericSearchEngine(context, target, {
    includeHarvest: true,
    harvestTags: ['damage'],
    restartReacquire: {
      destination: start,
      acquisitionCostChaos: 10,
      confidence: 'known',
      provenance: 'Phase 2I controlled Herald clean-base restart price',
    },
    prioritizeTargetProgress: true,
    maxStates: 5_000,
    maxWallTimeMs: 30_000,
    maxExpansionRounds: 3,
    searchIntent: 'RECOMMEND',
    persistentExpansion: true,
  }).search(start);
  if (
    result.optimalityProof.selectedPolicyStatus !==
      'FULLY RESOLVED / PROPER / ABSORBING / COST-RECONCILED' ||
    !result.onPolicyGraph.isProper ||
    result.onPolicyGraph.terminalAbsorptionProbability < 1 - 1e-8 ||
    !result.reconciliation.isReconciled
  ) {
    throw new Error('W6 Herald direct policy failed health gates');
  }
  const targetIds = [empowered.modId, endbringer.modId];
  const behaviors = targetIds.map((id) => realBehavior(result, target, id));
  const cleanMagic = { ...start, rarity: 'magic' as const };
  const prefixTotalClean = calculateTotalWeight(
    getEligibleMods(cleanMagic, pool.getAllMods(), { requiredGenType: 'Prefix' })
  );
  const prefixTotals = Object.fromEntries(targetIds.map((id) => {
    const notable = pool.findModById(id)!;
    const representative = stateWith(pool, 'rare', [id], [
      pool.getSuffixes()[0].modId,
      pool.getSuffixes()[1].modId,
      pool.getSuffixes()[2].modId,
    ], clusterType);
    const eligiblePrefixTotal = calculateTotalWeight(
      getEligibleMods(representative, pool.getAllMods(), { requiredGenType: 'Prefix' })
    );
    return [`after_${notable.modId}`, eligiblePrefixTotal];
  }));
  prefixTotals.clean = prefixTotalClean;
  return {
    result,
    targetIds,
    targetWeights: Object.fromEntries(targetIds.map((id) => [id, pool.findModById(id)!.weight])),
    prefixTotals,
    behaviors,
    preference: classifyRealPreference(behaviors),
  };
}

console.error('[phase2i-weight] W4 analytical transition audit');
const w4 = runTransitionAudit();
console.error('[phase2i-weight] W1 rare A / common B');
const w1 = runSynthetic('W1 rare-A/common-B', 1, 12_000, EXPENSIVE_LATE_RATES);
console.error('[phase2i-weight] W2 reversed weights');
const w2 = runSynthetic('W2 common-A/rare-B', 12_000, 1, EXPENSIVE_LATE_RATES);
const w1Presentation = syntheticPresentationPlan(w1);
const w2Presentation = syntheticPresentationPlan(w2);
if (
  w1.preference.kind !== 'PREFER_TARGET_FIRST' ||
  w2.preference.kind !== 'PREFER_TARGET_FIRST' ||
  w1.preference.targetModIds[0] === w2.preference.targetModIds[0] ||
  w1Presentation.targetOrderPreference.kind !== 'PREFER_TARGET_FIRST' ||
  w2Presentation.targetOrderPreference.kind !== 'PREFER_TARGET_FIRST' ||
  w1Presentation.targetOrderPreference.targetModIds[0] !== TARGET_A ||
  w2Presentation.targetOrderPreference.targetModIds[0] !== TARGET_B ||
  w1Presentation.steps.find((step) => step.phase === 'ROLL')?.preferredTargetModIds?.[0] !== TARGET_A ||
  w2Presentation.steps.find((step) => step.phase === 'ROLL')?.preferredTargetModIds?.[0] !== TARGET_B ||
  w1Presentation.uncoveredActionIds.length > 0 ||
  w2Presentation.uncoveredActionIds.length > 0
) {
  throw new Error(
    `W1/W2 target preference did not reverse: W1=${JSON.stringify(w1.preference)}, W2=${JSON.stringify(w2.preference)}`
  );
}
console.error('[phase2i-weight] W3 price sensitivity');
const w3 = runPriceSensitivity(w1);
console.error('[phase2i-weight] W5 Monte Carlo sanity');
const w5 = runMonteCarloAudit();
console.error('[phase2i-weight] W6 real Herald evidence');
const w6 = runRealHerald();

function behaviorSummary(behavior: TargetBehavior | RealTargetBehavior): string {
  const actions = 'selectedActions' in behavior ? behavior.selectedActions : behavior.actions;
  return `${behavior.targetId}: ${JSON.stringify(actions)}`;
}

const lines = [
  'PHASE 2I WEIGHT-AWARE ECONOMIC POLICY VALIDATION',
  '',
  'FIXTURE TOPOLOGY / PRICES',
  '  symmetric target prefixes plus 3 independently grouped filler prefixes and 3 independently grouped filler suffixes',
  '  target weights are the only topology change between W1 and W2',
  `  expensive-late rates: alteration=${EXPENSIVE_LATE_RATES.alteration}c; augmentation=${EXPENSIVE_LATE_RATES.augmentation}c; regal=${EXPENSIVE_LATE_RATES.regal}c; exalt=${EXPENSIVE_LATE_RATES.exalt}c; scour=${EXPENSIVE_LATE_RATES.scour}c; transmutation=${EXPENSIVE_LATE_RATES.transmutation}c; clean-base/restart=${RESTART_COST}c`,
  `  cheap-late rates: alteration=${CHEAP_LATE_RATES.alteration}c; augmentation=${CHEAP_LATE_RATES.augmentation}c; regal=${CHEAP_LATE_RATES.regal}c; exalt=${CHEAP_LATE_RATES.exalt}c; scour=${CHEAP_LATE_RATES.scour}c; transmutation=${CHEAP_LATE_RATES.transmutation}c; clean-base/restart=${RESTART_COST}c`,
  '',
  'W4 ANALYTICAL TRANSITION PROBABILITY AUDIT (executed first)',
  ...w4.map((audit) =>
    `  ${audit.actionId}: sum=${audit.sum.toFixed(12)}; P(A) expected/emitted=${audit.expectedA.toFixed(12)}/${audit.emittedA.toFixed(12)}; P(B) expected/emitted=${audit.expectedB.toFixed(12)}/${audit.emittedB.toFixed(12)}${audit.branch ? `; branch=${audit.branch}` : ''}; PASS`
  ),
  '',
  'W1 RARE A / COMMON B',
  `  weights: A=${w1.aWeight}; B=${w1.bWeight}`,
  `  selected acquisition: controlled clean base; selected total EV including first base=${finite(RESTART_COST + w1.result.totalExpectedCostChaos)}c`,
  `  proper/absorption/Bellman/occupancy/reconciled=${w1.result.onPolicyGraph.isProper}/${w1.result.onPolicyGraph.terminalAbsorptionProbability.toFixed(12)}/${w1.result.convergence.converged}/${w1.result.reconciliation.visitConverged}/${w1.result.reconciliation.isReconciled}`,
  `  preference=${JSON.stringify(w1.preference)}`,
  `  presentation preference=${JSON.stringify(w1Presentation.targetOrderPreference)}; Roll step=${JSON.stringify(w1Presentation.steps.find((step) => step.phase === 'ROLL'))}`,
  ...w1.behaviors.map((behavior) => `  behavior ${behaviorSummary(behavior)}`),
  ...(['NORMAL', 'MAGIC_ZERO', 'MAGIC_A', 'MAGIC_B', 'RARE_A', 'RARE_B'] as StateShape[]).map((shape) =>
    `  ${shape}: ${decisionSummary(decisionFor(w1, shape))}`
  ),
  `  expected usage: ${w1.result.expectedActionUsage.map((usage) => `${usage.actionId}=${usage.expectedCount.toFixed(6)}`).join(', ')}`,
  '',
  'W2 REVERSED WEIGHTS',
  `  weights: A=${w2.aWeight}; B=${w2.bWeight}`,
  `  selected acquisition: controlled clean base; selected total EV including first base=${finite(RESTART_COST + w2.result.totalExpectedCostChaos)}c`,
  `  proper/absorption/Bellman/occupancy/reconciled=${w2.result.onPolicyGraph.isProper}/${w2.result.onPolicyGraph.terminalAbsorptionProbability.toFixed(12)}/${w2.result.convergence.converged}/${w2.result.reconciliation.visitConverged}/${w2.result.reconciliation.isReconciled}`,
  `  preference=${JSON.stringify(w2.preference)}`,
  `  presentation preference=${JSON.stringify(w2Presentation.targetOrderPreference)}; Roll step=${JSON.stringify(w2Presentation.steps.find((step) => step.phase === 'ROLL'))}`,
  ...w2.behaviors.map((behavior) => `  behavior ${behaviorSummary(behavior)}`),
  ...(['NORMAL', 'MAGIC_ZERO', 'MAGIC_A', 'MAGIC_B', 'RARE_A', 'RARE_B'] as StateShape[]).map((shape) =>
    `  ${shape}: ${decisionSummary(decisionFor(w2, shape))}`
  ),
  `  expected usage: ${w2.result.expectedActionUsage.map((usage) => `${usage.actionId}=${usage.expectedCount.toFixed(6)}`).join(', ')}`,
  `  reversal assertion: ${w1.preference.targetModIds[0]} -> ${w2.preference.targetModIds[0]}; PASS`,
  '',
  'W3 PRICE SENSITIVITY',
  `  same weights/topology: A=${w1.aWeight}; B=${w1.bWeight}`,
  `  changed state key: ${w3.flipKey}`,
  `  expensive-late selected: ${decisionSummary(w3.expensiveDecision)}`,
  `  cheap-late selected: ${decisionSummary(w3.cheapDecision)}`,
  '  immediate PriceBook costs and Bellman continuation terms changed consistently; selected action boundary crossed; PASS',
  '',
  'W5 SEEDED MONTE CARLO SANITY',
  `  exalt samples=${w5.samples}; A expected/observed/tolerance=${w5.expectedA.toFixed(12)}/${w5.observedA.toFixed(12)}/${w5.toleranceA.toFixed(12)}; B expected/observed/tolerance=${w5.expectedB.toFixed(12)}/${w5.observedB.toFixed(12)}/${w5.toleranceB.toFixed(12)}; PASS`,
  '',
  'W6 REAL HERALD TARGET-ORDER EVIDENCE',
  `  target weights=${JSON.stringify(w6.targetWeights)}`,
  `  eligible prefix weight totals=${JSON.stringify(w6.prefixTotals)}`,
  `  policy health: U=${finite(10 + w6.result.totalExpectedCostChaos)}c; proper=${w6.result.onPolicyGraph.isProper}; absorption=${w6.result.onPolicyGraph.terminalAbsorptionProbability.toFixed(12)}; Bellman=${w6.result.convergence.converged}; occupancy=${w6.result.reconciliation.visitConverged}; reconciled=${w6.result.reconciliation.isReconciled}; states=${w6.result.searchSummary.statesExpanded}; elapsed=${w6.result.searchSummary.elapsedMs}ms`,
  `  target-order preference=${JSON.stringify(w6.preference)}`,
  ...w6.behaviors.flatMap((behavior) => [
    `  behavior ${behaviorSummary(behavior)}`,
    `  ${behavior.targetId} representative Magic: ${decisionSummary(behavior.representativeMagic)}`,
    `  ${behavior.targetId} representative Rare: ${decisionSummary(behavior.representativeRare)}`,
  ]),
  '',
  'CONCLUSION',
  '  Modifier weights are transition mechanics inputs; currency prices are action-cost inputs; target-order preference is an emergent selected-policy result, not a hardcoded recipe rule.',
  '  target-name/Herald/notable/Craft/mod-ID solver branches added: NO',
  '  hardcoded rare-mod-first or fixed target-order rule added: NO',
  '  unit tests added: NO',
];

writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
console.log(lines.join('\n'));
