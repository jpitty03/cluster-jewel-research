import type { SolverContext } from '../domain/CraftAction.ts';
import { getAllAffixes, type ItemState } from '../domain/ItemState.ts';
import type { Mod, GenType } from '../domain/Mod.ts';
import type { PriceConfidence } from '../domain/PriceBook.ts';
import {
  canonicalTargetFingerprintMaterial,
  getTargetRequirementScenarios,
  matchesModRequirement,
  type ModRequirement,
  type TargetDefinition,
} from '../domain/TargetDefinition.ts';
import type { CraftMechanic } from '../rules/actionRegistry.ts';
import { getEligibleMods } from '../rules/modEligibility.ts';

export const RELAXED_TARGET_PROGRESS_LOWER_BOUND_VERSION =
  'RELAXED_TARGET_PROGRESS_LOWER_BOUND_V2_PHASE3B_MAGIC_ROLL_SHAPE' as const;

export interface RelaxedTargetActionBound {
  actionId: string;
  actionName: string;
  actionCostChaos: number;
  successProbabilityUpperBound: number;
  expectedCostLowerBoundChaos: number;
  priceConfidence: PriceConfidence;
  transitionClass:
    | 'MAGIC_REROLL'
    | 'RARE_REROLL'
    | 'SINGLE_AFFIX'
    | 'HARVEST_REFORGE'
    | 'DETERMINISTIC_REACQUIRE';
}

export interface RelaxedTargetRequirementBound {
  requirementIdentity: string;
  matchedAtStart: boolean;
  candidateModIds: string[];
  lowerBoundChaos: number;
  selectedAction?: RelaxedTargetActionBound;
}

export interface RelaxedTargetProgressLowerBoundResult {
  version: typeof RELAXED_TARGET_PROGRESS_LOWER_BOUND_VERSION;
  proven: boolean;
  lowerBoundChaos: number;
  scenarioCount: number;
  selectedScenarioIndex?: number;
  matchedTargetIds: string[];
  relaxedState: {
    rarity: ItemState['rarity'];
    prefixTargetOccupancy: number;
    suffixTargetOccupancy: number;
    fracturedTargetIds: string[];
  };
  requirements: RelaxedTargetRequirementBound[];
  enabledActionIds: string[];
  unknownOrUnpricedCreatorActionIds: string[];
  cache: {
    identityHash: string;
    hit: boolean;
    computeMs: number;
  };
  provenance: string;
}

interface CachedRelaxedBound extends Omit<RelaxedTargetProgressLowerBoundResult, 'cache'> {
  identityHash: string;
  computeMs: number;
}

const CACHE_LIMIT = 512;
const relaxedBoundCache = new Map<string, CachedRelaxedBound>();

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `r2y-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function requirementIdentity(requirement: ModRequirement): string {
  return [
    requirement.modId ?? '',
    requirement.modGroup ?? '',
    requirement.name ?? '',
    requirement.minTierNumber ?? '',
    requirement.maxTierNumber ?? '',
    requirement.mustBeFractured === true ? 'fractured' : '',
  ].join('|');
}

function targetProgressRequirement(requirement: ModRequirement): ModRequirement {
  // Fracture creation is bounded independently by mandatoryMechanicsLowerBound.
  // Ignoring the fracture predicate here makes this abstraction strictly easier.
  return { ...requirement, mustBeFractured: undefined };
}

function groups(mod: Mod): Set<string> {
  return new Set(mod.modGroups?.length ? mod.modGroups : [mod.modGroup]);
}

function intersects(left: Set<string>, right: Set<string>): boolean {
  for (const value of left) if (right.has(value)) return true;
  return false;
}

/**
 * Upper-bounds a weighted affix-selection hit chance.
 *
 * A real rare cluster jewel can have at most three other affixes while leaving
 * a slot for the requested affix. We let three arbitrary, even mutually-illegal,
 * blockers remove their full exclusion weight and deliberately double-count
 * overlaps. That can only shrink the relaxed denominator and increase the hit
 * chance, so the resulting probability is optimistic.
 */
function optimisticSelectionProbability(
  eligible: readonly Mod[],
  targets: readonly Mod[],
): number {
  const targetIds = new Set(targets.map((mod) => mod.modId));
  const targetWeight = targets.reduce((sum, mod) => sum + Math.max(0, mod.weight), 0);
  if (targetWeight <= 0) return 0;
  const totalWeight = eligible.reduce((sum, mod) => sum + Math.max(0, mod.weight), 0);
  if (totalWeight <= 0) return 0;
  const targetGroups = new Set(targets.flatMap((mod) => [...groups(mod)]));
  const targetNames = new Set(targets.map((mod) => mod.name));
  const removableWeights = eligible
    .filter((blocker) => !targetIds.has(blocker.modId))
    .filter((blocker) => !intersects(groups(blocker), targetGroups))
    .filter((blocker) => !targetNames.has(blocker.name))
    .map((blocker) => {
      const blockerGroups = groups(blocker);
      return eligible.reduce((removed, candidate) => {
        if (targetIds.has(candidate.modId)) return removed;
        const excludedByGroup = intersects(blockerGroups, groups(candidate));
        const excludedByName = blocker.name === candidate.name;
        return removed + (excludedByGroup || excludedByName ? Math.max(0, candidate.weight) : 0);
      }, 0);
    })
    .sort((left, right) => right - left)
    .slice(0, 3);
  const optimisticDenominator = Math.max(
    targetWeight,
    totalWeight - removableWeights.reduce((sum, value) => sum + value, 0),
  );
  return Math.min(1, targetWeight / optimisticDenominator);
}

function upperChanceByGenType(
  eligible: readonly Mod[],
  targets: readonly Mod[],
): number {
  const probabilities: number[] = [];
  for (const genType of ['Prefix', 'Suffix'] as const satisfies readonly GenType[]) {
    const eligibleType = eligible.filter((mod) => mod.genType === genType);
    const targetType = targets.filter((mod) => mod.genType === genType);
    if (targetType.length > 0) {
      probabilities.push(optimisticSelectionProbability(eligibleType, targetType));
    }
  }
  // A relaxed action may choose the favorable affix side. If a broad
  // requirement matches either side, use a union upper bound.
  return Math.min(1, probabilities.reduce((sum, probability) => sum + probability, 0));
}

function creatorTransitionClass(mechanic: CraftMechanic): RelaxedTargetActionBound['transitionClass'] | undefined {
  switch (mechanic.actionType) {
    case 'TRANSFORMATION_ORB':
    case 'ALTERATION_ORB':
      return 'MAGIC_REROLL';
    case 'CHAOS_ORB':
      return 'RARE_REROLL';
    case 'AUGMENTATION_ORB':
    case 'REGAL_ORB':
    case 'EXALTED_ORB':
      return 'SINGLE_AFFIX';
    case 'HARVEST_REFORGE':
      return 'HARVEST_REFORGE';
    case 'RESTART_REACQUIRE':
      return 'DETERMINISTIC_REACQUIRE';
    default:
      return undefined;
  }
}

function usableCost(
  mechanic: CraftMechanic,
  context: SolverContext,
  allowResearchFallbackPrices: boolean,
): ReturnType<CraftMechanic['getCost']> | undefined {
  const cost = mechanic.getCost(context);
  if (!Number.isFinite(cost.costChaos) || cost.costChaos < 0 || cost.confidence === 'unavailable') {
    return undefined;
  }
  if (!allowResearchFallbackPrices && cost.confidence === 'research-fallback') return undefined;
  return cost;
}

function deterministicReacquireChance(
  mechanic: CraftMechanic,
  state: ItemState,
  target: TargetDefinition,
  context: SolverContext,
  requirement: ModRequirement,
): number {
  if (!mechanic.getTransitions) return 0;
  try {
    const distribution = mechanic.getTransitions(state, target, context);
    return Math.min(1, distribution.outcomes.reduce((sum, outcome) => {
      const matched = getAllAffixes(outcome.state).some((mod) =>
        matchesModRequirement(mod, targetProgressRequirement(requirement))
      );
      return sum + (matched ? outcome.probability : 0);
    }, 0));
  } catch {
    return 0;
  }
}

function evaluateRequirement(
  context: SolverContext,
  state: ItemState,
  target: TargetDefinition,
  requirement: ModRequirement,
  mechanics: readonly CraftMechanic[],
  allowResearchFallbackPrices: boolean,
): { bound: RelaxedTargetRequirementBound; unknownCreators: string[] } {
  const relaxedRequirement = targetProgressRequirement(requirement);
  const matchedAtStart = getAllAffixes(state).some((mod) =>
    matchesModRequirement(mod, relaxedRequirement)
  );
  const candidates = context.pool.getAllMods().filter((mod) =>
    mod.ilvl <= state.itemLevel && matchesModRequirement(mod, relaxedRequirement)
  );
  const baseState: ItemState = {
    ...state,
    rarity: 'rare',
    prefixes: state.prefixes.filter((mod) => mod.isFractured),
    suffixes: state.suffixes.filter((mod) => mod.isFractured),
  };
  const eligible = getEligibleMods(baseState, context.pool.getAllMods(), {
    filterBySlotCapacity: false,
  });
  const eligibleIds = new Set(eligible.map((mod) => mod.modId));
  const eligibleTargets = candidates.filter((mod) => eligibleIds.has(mod.modId));
  const generalUpperChance = upperChanceByGenType(eligible, eligibleTargets);
  const actionBounds: RelaxedTargetActionBound[] = [];
  const unknownCreators: string[] = [];

  if (!matchedAtStart && eligibleTargets.length > 0) {
    for (const mechanic of mechanics) {
      const transitionClass = creatorTransitionClass(mechanic);
      if (!transitionClass) continue;
      let probability = 0;
      if (transitionClass === 'DETERMINISTIC_REACQUIRE') {
        probability = deterministicReacquireChance(
          mechanic, state, target, context, requirement
        );
      } else if (transitionClass === 'HARVEST_REFORGE') {
        const harvestTag = String(mechanic.parameters?.harvestTag ?? '').toLowerCase();
        const taggedEligible = eligible.filter((mod) =>
          (mod.craftTags ?? []).some((tag) => tag.toLowerCase() === harvestTag) ||
          (mod.tags ?? []).some((tag) => tag.toLowerCase() === harvestTag)
        );
        const taggedTargets = eligibleTargets.filter((mod) =>
          (mod.craftTags ?? []).some((tag) => tag.toLowerCase() === harvestTag) ||
          (mod.tags ?? []).some((tag) => tag.toLowerCase() === harvestTag)
        );
        const guaranteedUpperChance = upperChanceByGenType(taggedEligible, taggedTargets);
        // Current shared Harvest mechanics add one guaranteed tagged affix and
        // at most three extras. Union-bound all four favorable relaxed draws.
        probability = Math.min(1, guaranteedUpperChance + 3 * generalUpperChance);
      } else if (transitionClass === 'RARE_REROLL') {
        // A rare reroll can supply as many as six explicit affixes. Treat all
        // six as independent favorable opportunities. This union bound is
        // intentionally more generous than the real without-replacement roll.
        probability = Math.min(1, 6 * generalUpperChance);
      } else if (transitionClass === 'MAGIC_REROLL') {
        // Transformation/Alteration mechanics can produce two explicit
        // affixes. Count both optimistic opportunities so this abstraction
        // never makes the real reroll less likely to hit a target.
        probability = Math.min(1, 2 * generalUpperChance);
      } else {
        probability = generalUpperChance;
      }
      if (!(probability > 0)) continue;
      const cost = usableCost(mechanic, context, allowResearchFallbackPrices);
      if (!cost) {
        unknownCreators.push(mechanic.id);
        continue;
      }
      actionBounds.push({
        actionId: mechanic.id,
        actionName: mechanic.name,
        actionCostChaos: cost.costChaos,
        successProbabilityUpperBound: probability,
        expectedCostLowerBoundChaos: cost.costChaos / probability,
        priceConfidence: cost.confidence,
        transitionClass,
      });
    }
  }

  actionBounds.sort((left, right) =>
    left.expectedCostLowerBoundChaos - right.expectedCostLowerBoundChaos ||
    left.actionId.localeCompare(right.actionId)
  );
  const selectedAction = actionBounds[0];
  return {
    bound: {
      requirementIdentity: requirementIdentity(requirement),
      matchedAtStart,
      candidateModIds: candidates.map((mod) => mod.modId).sort(),
      lowerBoundChaos: matchedAtStart ? 0 : selectedAction?.expectedCostLowerBoundChaos ?? 0,
      selectedAction,
    },
    unknownCreators,
  };
}

/**
 * Computes an optimistic one-target-at-a-time relaxation. Reaching the real
 * terminal state requires reaching every target in one admissible scenario;
 * therefore its expected cost is at least the maximum single-target hitting
 * cost. The relaxation ignores target loss, cleanup, ordering, and recovery,
 * permits favorable exclusion blockers, and uses probability upper bounds.
 */
export function evaluateRelaxedTargetProgressLowerBound(
  context: SolverContext,
  state: ItemState,
  target: TargetDefinition,
  mechanics: readonly CraftMechanic[],
  enabledActionIds: readonly string[],
  allowResearchFallbackPrices: boolean,
): RelaxedTargetProgressLowerBoundResult {
  const started = Date.now();
  const enabled = new Set(enabledActionIds);
  const scopedMechanics = mechanics.filter((mechanic) => enabled.has(mechanic.id));
  const identity = JSON.stringify({
    version: RELAXED_TARGET_PROGRESS_LOWER_BOUND_VERSION,
    state: {
      baseType: state.baseType,
      clusterType: state.clusterType,
      itemLevel: state.itemLevel,
      passiveCount: state.passiveCount,
      rarity: state.rarity,
      affixes: getAllAffixes(state).map((mod) => [mod.modId, mod.isFractured]).sort(),
    },
    target: canonicalTargetFingerprintMaterial(target),
    pool: context.pool.getAllMods().map((mod) => [
      mod.modId,
      mod.genType,
      mod.weight,
      mod.ilvl,
      mod.name,
      [...(mod.modGroups?.length ? mod.modGroups : [mod.modGroup])].sort(),
      [...(mod.craftTags ?? [])].sort(),
    ]),
    actions: scopedMechanics.map((mechanic) => {
      const cost = mechanic.getCost(context);
      return [mechanic.id, mechanic.actionType, cost.costChaos, cost.confidence, mechanic.parameters];
    }).sort(),
    enabled: [...enabled].sort(),
    allowResearchFallbackPrices,
  });
  const identityHash = stableHash(identity);
  const cached = relaxedBoundCache.get(identity);
  if (cached) {
    relaxedBoundCache.delete(identity);
    relaxedBoundCache.set(identity, cached);
    return {
      ...cached,
      requirements: cached.requirements.map((requirement) => ({
        ...requirement,
        candidateModIds: [...requirement.candidateModIds],
        selectedAction: requirement.selectedAction ? { ...requirement.selectedAction } : undefined,
      })),
      enabledActionIds: [...cached.enabledActionIds],
      unknownOrUnpricedCreatorActionIds: [...cached.unknownOrUnpricedCreatorActionIds],
      matchedTargetIds: [...cached.matchedTargetIds],
      relaxedState: { ...cached.relaxedState, fracturedTargetIds: [...cached.relaxedState.fracturedTargetIds] },
      cache: { identityHash, hit: true, computeMs: cached.computeMs },
    };
  }

  const scenarios = getTargetRequirementScenarios(target);
  const evaluated = scenarios.map((scenario) => {
    const results = scenario.map((requirement) => evaluateRequirement(
      context,
      state,
      target,
      requirement,
      scopedMechanics,
      allowResearchFallbackPrices,
    ));
    const unknown = [...new Set(results.flatMap((result) => result.unknownCreators))].sort();
    return {
      requirements: results.map((result) => result.bound),
      unknown,
      lowerBoundChaos: results.reduce(
        (maximum, result) => Math.max(maximum, result.bound.lowerBoundChaos),
        0,
      ),
    };
  });
  evaluated.sort((left, right) => left.lowerBoundChaos - right.lowerBoundChaos);
  const selected = evaluated[0] ?? { requirements: [], unknown: [], lowerBoundChaos: 0 };
  const unavailableEnabledActions = [...enabled].filter(
    (actionId) => !scopedMechanics.some((mechanic) => mechanic.id === actionId)
  );
  // Unknown actions make a positive target-progress claim unsafe because their
  // state-creation capability is not known. Known non-creator mechanics do not.
  const unknownCreators = [...new Set([...selected.unknown, ...unavailableEnabledActions])].sort();
  const proven = unknownCreators.length === 0;
  const progressRequirements = selected.requirements;
  const matchedTargetIds = progressRequirements
    .filter((requirement) => requirement.matchedAtStart)
    .map((requirement) => requirement.requirementIdentity)
    .sort();
  const targetAffixes = getAllAffixes(state).filter((mod) =>
    progressRequirements.some((requirement) => requirement.candidateModIds.includes(mod.modId))
  );
  const computed: CachedRelaxedBound = {
    identityHash,
    computeMs: Date.now() - started,
    version: RELAXED_TARGET_PROGRESS_LOWER_BOUND_VERSION,
    proven,
    lowerBoundChaos: proven ? selected.lowerBoundChaos : 0,
    scenarioCount: scenarios.length,
    selectedScenarioIndex: evaluated.length > 0 ? scenarios.findIndex((scenario) =>
      scenario.length === selected.requirements.length &&
      scenario.every((requirement) => selected.requirements.some(
        (bound) => bound.requirementIdentity === requirementIdentity(requirement)
      ))
    ) : undefined,
    matchedTargetIds,
    relaxedState: {
      rarity: state.rarity,
      prefixTargetOccupancy: targetAffixes.filter((mod) => mod.genType === 'Prefix').length,
      suffixTargetOccupancy: targetAffixes.filter((mod) => mod.genType === 'Suffix').length,
      fracturedTargetIds: targetAffixes.filter((mod) => mod.isFractured).map((mod) => mod.modId).sort(),
    },
    requirements: progressRequirements,
    enabledActionIds: [...enabled].sort(),
    unknownOrUnpricedCreatorActionIds: unknownCreators,
    provenance:
      'Optimistic target-progress hitting-cost bound from shared eligible weights and action ' +
      'prices. It ignores target loss, cleanup, ordering, and recovery; permits three favorable ' +
      'exclusion blockers; union-bounds every possible affix draw for magic, rare, and Harvest ' +
      'rerolls; and takes the maximum unavoidable single-target hitting cost.',
  };
  relaxedBoundCache.set(identity, computed);
  while (relaxedBoundCache.size > CACHE_LIMIT) {
    const oldest = relaxedBoundCache.keys().next().value;
    if (oldest === undefined) break;
    relaxedBoundCache.delete(oldest);
  }
  return {
    ...computed,
    cache: { identityHash, hit: false, computeMs: computed.computeMs },
  };
}

export function clearRelaxedTargetProgressLowerBoundCache(): void {
  relaxedBoundCache.clear();
}
