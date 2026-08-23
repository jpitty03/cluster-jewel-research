import type { ItemState } from '../domain/ItemState.ts';
import type { TargetDefinition } from '../domain/TargetDefinition.ts';
import {
  evaluateRollRequirement,
  getAllTargetModRequirements,
  matchesModRequirement,
} from '../domain/TargetDefinition.ts';
import type { SolverContext } from '../domain/CraftAction.ts';
import type { PriceConfidence, PriceSource } from '../domain/PriceBook.ts';
import type { RandomSource } from '../probability/random.ts';
import type { Mod } from '../domain/Mod.ts';
import { toRolledMod } from '../domain/Mod.ts';
import { canAcceptPrefix, canAcceptSuffix } from './affixRules.ts';
import {
  getAllAffixes,
  getPhysicalStateSignature,
  getRemovableAffixes,
  isFracturedMod,
  cloneItemState,
} from '../domain/ItemState.ts';
import { getEligibleMods, calculateTotalWeight } from './modEligibility.ts';
import { HARVEST_CRAFT_DEFINITIONS, getHarvestCraftCost } from './harvestCrafts.ts';
import { getTaggedModsForCluster } from './clusterPoolHelpers.ts';

export type DiscoveredActionType =
  | 'TRANSFORMATION_ORB'
  | 'AUGMENTATION_ORB'
  | 'ALTERATION_ORB'
  | 'REGAL_ORB'
  | 'SCOURING_ORB'
  | 'CHAOS_ORB'
  | 'EXALTED_ORB'
  | 'ANNULMENT_ORB'
  | 'DIVINE_ORB'
  | 'FRACTURING_ORB'
  | 'RESTART_REACQUIRE'
  | 'HARVEST_REFORGE'
  | 'TERMINAL';

export interface CraftCost {
  costChaos: number;
  confidence: PriceConfidence;
  source?: PriceSource | 'solver-context';
  provenance?: string;
}

export interface TransitionOutcome {
  state: ItemState;
  probability: number;
  label?: string;
}

export interface TransitionDistribution {
  outcomes: TransitionOutcome[];
  immediateCostChaos: number;
}

export interface TransitionGenerationControl {
  deadlineMs?: number;
}

export class TransitionGenerationDeadlineExceeded extends Error {
  constructor() {
    super('Search wall-time budget expired during transition generation');
    this.name = 'TransitionGenerationDeadlineExceeded';
  }
}

export type MechanicsConfidence = 'VALIDATED' | 'APPROXIMATE / EXTERNALLY CLOSE';

export interface CraftMechanic {
  id: string;
  actionType: DiscoveredActionType;
  name: string;
  category: 'base-prep' | 'core-reforge' | 'cleanup' | 'slam' | 'finishing' | 'terminal';
  isLegal(state: ItemState, target: TargetDefinition, context: SolverContext): boolean;
  getCost(context: SolverContext): CraftCost;
  parameters?: Record<string, any>;
  mechanicsConfidence?: MechanicsConfidence;
  mechanicsProvenance?: string;
  getTransitions?(
    state: ItemState,
    target: TargetDefinition,
    context: SolverContext,
    control?: TransitionGenerationControl
  ): TransitionDistribution;
  sampleTransition?(state: ItemState, target: TargetDefinition, context: SolverContext, rng: RandomSource): ItemState;
}

export interface RestartReacquireDefinition {
  destination: ItemState;
  acquisitionCostChaos: number;
  confidence: PriceConfidence;
  provenance: string;
  label?: string;
}

export interface AcquisitionMethodDefinition {
  id: string;
  label: string;
  acquisitionCostChaos: number;
  confidence: PriceConfidence;
  provenance: string;
}

export interface AcquisitionPortfolioCandidate {
  id: string;
  label: string;
  physicalState: ItemState;
  methods: AcquisitionMethodDefinition[];
}

function selectWeightedMod(mods: Mod[], rng: RandomSource): Mod | undefined {
  const totalWeight = calculateTotalWeight(mods);
  if (totalWeight <= 0 || mods.length === 0) return undefined;
  const roll = rng.next() * totalWeight;
  let running = 0;
  for (const m of mods) {
    running += m.weight || 0;
    if (roll < running) {
      return m;
    }
  }
  return mods[mods.length - 1];
}

function addMod(state: ItemState, mod: Mod): ItemState {
  const nextState = cloneItemState(state);
  if (mod.genType === 'Prefix') nextState.prefixes.push(toRolledMod(mod));
  else nextState.suffixes.push(toRolledMod(mod));
  return nextState;
}

function getHarvestCanonicalAggregationKey(state: ItemState, target: TargetDefinition): string {
  const requirements = getAllTargetModRequirements(target);
  const formatMod = (mod: ReturnType<typeof toRolledMod>): string => {
    const groups = (mod.modGroups.length > 0 ? mod.modGroups : [mod.modGroup]).slice().sort().join('+');
    const targetMatches = requirements
      .map((requirement, index) => matchesModRequirement(mod, requirement) ? index : -1)
      .filter((index) => index >= 0)
      .join(',');
    const craftTags = (mod.craftTags ?? []).slice().sort().join(',');
    const rollSensitivity = (target.finalRollRequirements ?? [])
      .map((requirement, index) => ({ index, evaluation: evaluateRollRequirement(mod, requirement) }))
      .filter(({ evaluation }) => evaluation.matchesMod)
      .map(({ index, evaluation }) => `${index}:${evaluation.passes ? 'PASS' : 'FAIL'}:${evaluation.actualValue ?? '*'}`)
      .join(',');
    const targetIdentity = targetMatches.length > 0 ? `:${mod.modId}` : '';
    return `${mod.isFractured ? 'F' : 'N'}:${groups}:t${mod.tier}:name(${mod.name}):notable(${mod.isNotable}):target(${targetMatches})${targetIdentity}:tags(${craftTags}):roll(${rollSensitivity})`;
  };
  return `${state.rarity}|P:${state.prefixes.map(formatMod).sort().join('|')}|S:${state.suffixes.map(formatMod).sort().join('|')}`;
}

function checkTransitionDeadline(control?: TransitionGenerationControl): void {
  if (control?.deadlineMs !== undefined && Date.now() >= control.deadlineMs) {
    throw new TransitionGenerationDeadlineExceeded();
  }
}

function generateHarvestTransitions(
  state: ItemState,
  tag: string,
  target: TargetDefinition,
  context: SolverContext,
  costChaos: number,
  control?: TransitionGenerationControl
): TransitionDistribution {
  checkTransitionDeadline(control);
  const baseState = cloneItemState(state);
  baseState.prefixes = baseState.prefixes.filter((mod) => isFracturedMod(baseState, mod));
  baseState.suffixes = baseState.suffixes.filter((mod) => isFracturedMod(baseState, mod));
  baseState.fracturedModIds = getAllAffixes(baseState).filter((mod) => mod.isFractured).map((mod) => mod.modId);
  baseState.rarity = 'rare';

  const allMods = context.pool.getAllMods();
  const eligible = getEligibleMods(baseState, allMods, { filterBySlotCapacity: false });
  const tagged = eligible.filter((mod) =>
    mod.craftTags.some((candidate) => candidate.toLowerCase() === tag) ||
    mod.tags.some((candidate) => candidate.toLowerCase() === tag)
  );
  const taggedWeight = calculateTotalWeight(tagged);
  if (taggedWeight <= 0) return { outcomes: [], immediateCostChaos: costChaos };

  const outcomes = new Map<string, TransitionOutcome>();
  for (const desiredTotalAffixes of [3, 4]) {
    // Aggregate after every roll, not only after enumerating the complete
    // Cartesian tree. The key retains every property that affects target
    // satisfaction or downstream pool eligibility, so this is a probability-
    // preserving canonical quotient rather than a sampled approximation.
    let frontier = new Map<string, TransitionOutcome>();
    for (const guaranteed of tagged) {
      checkTransitionDeadline(control);
      const guaranteedState = addMod(baseState, guaranteed);
      const key = getHarvestCanonicalAggregationKey(guaranteedState, target);
      const probability = guaranteed.weight / taggedWeight * 0.5;
      const existing = frontier.get(key);
      if (existing) existing.probability += probability;
      else frontier.set(key, {
        state: guaranteedState,
        probability,
        label: `Guaranteed ${tag}: ${guaranteed.name}; approximate ${desiredTotalAffixes}-total-affix branch`,
      });
    }
    const initialAffixCount = getAllAffixes(baseState).length + 1;
    const extras = Math.max(0, desiredTotalAffixes - initialAffixCount);
    for (let extraIndex = 0; extraIndex < extras; extraIndex++) {
      const nextFrontier = new Map<string, TransitionOutcome>();
      for (const outcome of frontier.values()) {
        checkTransitionDeadline(control);
        const eligibleExtras = getEligibleMods(outcome.state, allMods);
        const totalWeight = calculateTotalWeight(eligibleExtras);
        if (totalWeight <= 0) {
          const key = getHarvestCanonicalAggregationKey(outcome.state, target);
          const existing = nextFrontier.get(key);
          if (existing) existing.probability += outcome.probability;
          else nextFrontier.set(key, outcome);
          continue;
        }
        for (const mod of eligibleExtras) {
          const nextState = addMod(outcome.state, mod);
          const key = getHarvestCanonicalAggregationKey(nextState, target);
          const probability = outcome.probability * (mod.weight / totalWeight);
          const existing = nextFrontier.get(key);
          if (existing) existing.probability += probability;
          else nextFrontier.set(key, {
            state: nextState,
            probability,
            label: `${outcome.label}; added ${mod.name}`,
          });
        }
      }
      frontier = nextFrontier;
    }
    for (const [key, outcome] of frontier) {
      const existing = outcomes.get(key);
      if (existing) existing.probability += outcome.probability;
      else outcomes.set(key, outcome);
    }
  }
  return {
    outcomes: [...outcomes.values()],
    immediateCostChaos: costChaos,
  };
}

function sampleHarvestTransition(
  state: ItemState,
  tag: string,
  context: SolverContext,
  rng: RandomSource
): ItemState {
  let nextState = cloneItemState(state);
  nextState.prefixes = nextState.prefixes.filter((mod) => isFracturedMod(nextState, mod));
  nextState.suffixes = nextState.suffixes.filter((mod) => isFracturedMod(nextState, mod));
  nextState.fracturedModIds = getAllAffixes(nextState).filter((mod) => mod.isFractured).map((mod) => mod.modId);
  nextState.rarity = 'rare';
  const allMods = context.pool.getAllMods();
  const tagged = getEligibleMods(nextState, allMods, { filterBySlotCapacity: false }).filter((mod) =>
    mod.craftTags.some((candidate) => candidate.toLowerCase() === tag) ||
    mod.tags.some((candidate) => candidate.toLowerCase() === tag)
  );
  const guaranteed = selectWeightedMod(tagged, rng);
  if (!guaranteed) return nextState;
  nextState = addMod(nextState, guaranteed);
  const desiredTotalAffixes = rng.next() < 0.5 ? 3 : 4;
  const extraCount = Math.max(0, desiredTotalAffixes - getAllAffixes(nextState).length);
  for (let index = 0; index < extraCount; index++) {
    const extra = selectWeightedMod(getEligibleMods(nextState, allMods), rng);
    if (!extra) break;
    nextState = addMod(nextState, extra);
  }
  return nextState;
}

function scouredRarity(state: ItemState): ItemState['rarity'] {
  const fracturedCount = getAllAffixes(state).filter(
    (mod) => isFracturedMod(state, mod)
  ).length;
  if (fracturedCount === 0) return 'normal';
  if (fracturedCount === 1) return 'magic';
  return 'rare';
}

/**
 * Creates the economic abandon-and-reacquire action for a solver run. The destination
 * and price evidence are supplied by the selected starting acquisition, never a recipe.
 */
export function createRestartReacquireMechanic(definition: RestartReacquireDefinition): CraftMechanic {
  const destination = cloneItemState(definition.destination);
  const destinationSignature = getPhysicalStateSignature(destination);
  return {
    id: 'restart_reacquire',
    actionType: 'RESTART_REACQUIRE',
    name: definition.label ?? 'Abandon + Reacquire',
    category: 'base-prep',
    isLegal: (state) => getPhysicalStateSignature(state) !== destinationSignature,
    getCost: () => ({
      costChaos: definition.acquisitionCostChaos,
      confidence: definition.confidence,
      source: 'solver-context',
      provenance: definition.provenance,
    }),
    getTransitions: () => ({
      outcomes: [{ state: cloneItemState(destination), probability: 1, label: definition.provenance }],
      immediateCostChaos: definition.acquisitionCostChaos,
    }),
    sampleTransition: () => cloneItemState(destination),
  };
}

/**
 * Creates one Bellman action per acquisition method. Multiple methods may point
 * at the same physical state; canonical graph identity solves that state once.
 */
export function createAcquisitionPortfolioMechanics(
  candidates: AcquisitionPortfolioCandidate[]
): CraftMechanic[] {
  return candidates.flatMap((candidate) => {
    const destination = cloneItemState(candidate.physicalState);
    const destinationSignature = getPhysicalStateSignature(destination);
    return candidate.methods.map((method) => ({
      id: `acquire_${candidate.id}_${method.id}`,
      actionType: 'RESTART_REACQUIRE' as const,
      name: `Restart/Reacquire: ${method.label}`,
      category: 'base-prep' as const,
      isLegal: (state: ItemState) =>
        state.flags?.acquisitionMenu === true ||
        getPhysicalStateSignature(state) !== destinationSignature,
      getCost: (): CraftCost => ({
        costChaos: method.acquisitionCostChaos,
        confidence: method.confidence,
        source: 'solver-context',
        provenance: method.provenance,
      }),
      parameters: {
        acquisitionCandidateId: candidate.id,
        acquisitionCandidateLabel: candidate.label,
        acquisitionMethodId: method.id,
      },
      getTransitions: (): TransitionDistribution => ({
        outcomes: [{
          state: cloneItemState(destination),
          probability: 1,
          label: method.provenance,
        }],
        immediateCostChaos: method.acquisitionCostChaos,
      }),
      sampleTransition: (): ItemState => cloneItemState(destination),
    }));
  });
}

function generateMagicTransitions(
  state: ItemState,
  context: SolverContext,
  costChaos: number,
  control?: TransitionGenerationControl
): TransitionDistribution {
  checkTransitionDeadline(control);
  const pool = context.pool;
  if (!pool) return { outcomes: [], immediateCostChaos: costChaos };

  const allMods = pool.getAllMods();
  const cleanMagicBase: ItemState = {
    ...cloneItemState(state),
    rarity: 'magic',
    prefixes: state.prefixes.filter((p) => p.isFractured),
    suffixes: state.suffixes.filter((s) => s.isFractured),
  };

  const eligiblePrefixes = getEligibleMods(cleanMagicBase, allMods, { requiredGenType: 'Prefix' });
  const eligibleSuffixes = getEligibleMods(cleanMagicBase, allMods, { requiredGenType: 'Suffix' });

  const totalPrefixWeight = calculateTotalWeight(eligiblePrefixes);
  const totalSuffixWeight = calculateTotalWeight(eligibleSuffixes);
  const fracturedAffixCount = getAllAffixes(cleanMagicBase).length;

  if (totalPrefixWeight <= 0 && totalSuffixWeight <= 0) {
    return { outcomes: [{ state: cleanMagicBase, probability: 1.0 }], immediateCostChaos: costChaos };
  }

  const outcomes: TransitionOutcome[] = [];

  // A scoured item with one fractured affix is magic and has exactly one legal
  // non-fractured slot. Alteration fills that opposite-side slot.
  if (fracturedAffixCount === 1) {
    const eligible = totalPrefixWeight > 0 ? eligiblePrefixes : eligibleSuffixes;
    const totalWeight = calculateTotalWeight(eligible);
    for (const mod of eligible) {
      checkTransitionDeadline(control);
      const nextState = cloneItemState(cleanMagicBase);
      if (mod.genType === 'Prefix') nextState.prefixes.push(toRolledMod(mod));
      else nextState.suffixes.push(toRolledMod(mod));
      outcomes.push({
        state: nextState,
        probability: mod.weight / totalWeight,
        label: `Fractured magic roll: ${mod.name}`,
      });
    }
    return { outcomes, immediateCostChaos: costChaos };
  }

  // 1. 1-Prefix only (25% chance)
  if (totalPrefixWeight > 0) {
    for (const p of eligiblePrefixes) {
      checkTransitionDeadline(control);
      const pProb = 0.25 * (p.weight / totalPrefixWeight);
      const nextState = cloneItemState(cleanMagicBase);
      nextState.prefixes.push(toRolledMod(p));
      outcomes.push({
        state: nextState,
        probability: pProb,
        label: `1 Prefix: ${p.name}`,
      });
    }
  }

  // 2. 1-Suffix only (25% chance)
  if (totalSuffixWeight > 0) {
    for (const s of eligibleSuffixes) {
      checkTransitionDeadline(control);
      const sProb = 0.25 * (s.weight / totalSuffixWeight);
      const nextState = cloneItemState(cleanMagicBase);
      nextState.suffixes.push(toRolledMod(s));
      outcomes.push({
        state: nextState,
        probability: sProb,
        label: `1 Suffix: ${s.name}`,
      });
    }
  }

  // 3. 1-Prefix + 1-Suffix (50% chance)
  if (totalPrefixWeight > 0 && totalSuffixWeight > 0) {
    for (const p of eligiblePrefixes) {
      checkTransitionDeadline(control);
      const stateWithP = cloneItemState(cleanMagicBase);
      stateWithP.prefixes.push(toRolledMod(p));
      const remainingSuffixes = getEligibleMods(stateWithP, allMods, { requiredGenType: 'Suffix' });
      const remSuffixWeight = calculateTotalWeight(remainingSuffixes);

      if (remSuffixWeight > 0) {
        for (const s of remainingSuffixes) {
          checkTransitionDeadline(control);
          const comboProb = 0.5 * (p.weight / totalPrefixWeight) * (s.weight / remSuffixWeight);
          const nextState = cloneItemState(stateWithP);
          nextState.suffixes.push(toRolledMod(s));
          outcomes.push({
            state: nextState,
            probability: comboProb,
            label: `2 Affixes: ${p.name} / ${s.name}`,
          });
        }
      }
    }
  }

  return { outcomes, immediateCostChaos: costChaos };
}

function sampleMagicTransition(
  state: ItemState,
  context: SolverContext,
  rng: RandomSource
): ItemState {
  const pool = context.pool;
  if (!pool) return state;

  const allMods = pool.getAllMods();
  const nextState: ItemState = {
    ...cloneItemState(state),
    rarity: 'magic',
    prefixes: state.prefixes.filter((p) => p.isFractured),
    suffixes: state.suffixes.filter((s) => s.isFractured),
  };

  if (getAllAffixes(nextState).length === 1) {
    const eligible = getEligibleMods(nextState, allMods);
    const chosen = selectWeightedMod(eligible, rng);
    if (chosen) {
      if (chosen.genType === 'Prefix') nextState.prefixes.push(toRolledMod(chosen));
      else nextState.suffixes.push(toRolledMod(chosen));
    }
    return nextState;
  }

  const isTwoAffix = rng.next() < 0.5;

  if (isTwoAffix) {
    // 2 Affixes: 1 Prefix + 1 Suffix
    const eligiblePrefixes = getEligibleMods(nextState, allMods, { requiredGenType: 'Prefix' });
    const chosenP = selectWeightedMod(eligiblePrefixes, rng);
    if (chosenP) {
      nextState.prefixes.push(toRolledMod(chosenP));
    }
    const eligibleSuffixes = getEligibleMods(nextState, allMods, { requiredGenType: 'Suffix' });
    const chosenS = selectWeightedMod(eligibleSuffixes, rng);
    if (chosenS) {
      nextState.suffixes.push(toRolledMod(chosenS));
    }
  } else {
    // 1 Affix: 50% Prefix, 50% Suffix
    const isPrefix = rng.next() < 0.5;
    if (isPrefix) {
      const eligiblePrefixes = getEligibleMods(nextState, allMods, { requiredGenType: 'Prefix' });
      const chosenP = selectWeightedMod(eligiblePrefixes, rng);
      if (chosenP) {
        nextState.prefixes.push(toRolledMod(chosenP));
      }
    } else {
      const eligibleSuffixes = getEligibleMods(nextState, allMods, { requiredGenType: 'Suffix' });
      const chosenS = selectWeightedMod(eligibleSuffixes, rng);
      if (chosenS) {
        nextState.suffixes.push(toRolledMod(chosenS));
      }
    }
  }

  return nextState;
}

/**
 * Registry of authoritative craft mechanics for cluster jewel crafting.
 * Single source of truth for action legality, actionType mapping, currency cost, and transitions.
 */
export const CRAFT_MECHANICS: CraftMechanic[] = [
  // 0. Normal Base Transformation
  {
    id: 'transmutation_orb',
    actionType: 'TRANSFORMATION_ORB',
    name: 'Orb of Transmutation',
    category: 'base-prep',
    isLegal: (state) => state.rarity === 'normal',
    getCost: (ctx) => ctx.priceBook.evaluateRate('transmutation', 0.03),
    getTransitions: (state, _target, context, control) => {
      const cost = ctxCost(context, 'transmutation', 0.03);
      return generateMagicTransitions(state, context, cost, control);
    },
    sampleTransition: (state, _target, context, rng) => {
      return sampleMagicTransition(state, context, rng);
    },
  },

  // 1. Magic Base Prep
  {
    id: 'augmentation_orb',
    actionType: 'AUGMENTATION_ORB',
    name: 'Orb of Augmentation',
    category: 'base-prep',
    isLegal: (state) => state.rarity === 'magic' && (canAcceptPrefix(state) || canAcceptSuffix(state)),
    getCost: (ctx) => ctx.priceBook.evaluateRate('augmentation', 0.03),
    getTransitions: (state, _target, context, control) => {
      checkTransitionDeadline(control);
      const cost = ctxCost(context, 'augmentation', 0.03);
      const pool = context.pool;
      if (!pool) return { outcomes: [], immediateCostChaos: cost };

      const allMods = pool.getAllMods();
      const outcomes: TransitionOutcome[] = [];

      if (canAcceptPrefix(state)) {
        const eligible = getEligibleMods(state, allMods, { requiredGenType: 'Prefix' });
        const totWeight = calculateTotalWeight(eligible);
        if (totWeight > 0) {
          for (const m of eligible) {
            checkTransitionDeadline(control);
            const nextState = cloneItemState(state);
            nextState.prefixes.push(toRolledMod(m));
            outcomes.push({
              state: nextState,
              probability: m.weight / totWeight,
              label: `Augment added Prefix: ${m.name}`,
            });
          }
        }
      } else if (canAcceptSuffix(state)) {
        const eligible = getEligibleMods(state, allMods, { requiredGenType: 'Suffix' });
        const totWeight = calculateTotalWeight(eligible);
        if (totWeight > 0) {
          for (const m of eligible) {
            checkTransitionDeadline(control);
            const nextState = cloneItemState(state);
            nextState.suffixes.push(toRolledMod(m));
            outcomes.push({
              state: nextState,
              probability: m.weight / totWeight,
              label: `Augment added Suffix: ${m.name}`,
            });
          }
        }
      }

      return { outcomes, immediateCostChaos: cost };
    },
    sampleTransition: (state, _target, context, rng) => {
      const pool = context.pool;
      if (!pool) return state;
      const allMods = pool.getAllMods();
      const nextState = cloneItemState(state);

      if (canAcceptPrefix(nextState)) {
        const eligible = getEligibleMods(nextState, allMods, { requiredGenType: 'Prefix' });
        const chosen = selectWeightedMod(eligible, rng);
        if (chosen) nextState.prefixes.push(toRolledMod(chosen));
      } else if (canAcceptSuffix(nextState)) {
        const eligible = getEligibleMods(nextState, allMods, { requiredGenType: 'Suffix' });
        const chosen = selectWeightedMod(eligible, rng);
        if (chosen) nextState.suffixes.push(toRolledMod(chosen));
      }

      return nextState;
    },
  },
  {
    id: 'alteration_orb',
    actionType: 'ALTERATION_ORB',
    name: 'Orb of Alteration',
    category: 'base-prep',
    isLegal: (state) => state.rarity === 'magic',
    getCost: (ctx) => ctx.priceBook.evaluateRate('alteration', 0.11),
    getTransitions: (state, _target, context, control) => {
      const cost = ctxCost(context, 'alteration', 0.11);
      return generateMagicTransitions(state, context, cost, control);
    },
    sampleTransition: (state, _target, context, rng) => {
      return sampleMagicTransition(state, context, rng);
    },
  },
  {
    id: 'regal_orb',
    actionType: 'REGAL_ORB',
    name: 'Regal Orb',
    category: 'base-prep',
    isLegal: (state) => state.rarity === 'magic' && state.prefixes.length + state.suffixes.length >= 1,
    getCost: (ctx) => ctx.priceBook.evaluateRate('regal', 0.20),
    getTransitions: (state, _target, context, control) => {
      checkTransitionDeadline(control);
      const cost = ctxCost(context, 'regal', 0.20);
      const pool = context.pool;
      if (!pool) return { outcomes: [], immediateCostChaos: cost };

      const allMods = pool.getAllMods();
      const rareBaseState: ItemState = {
        ...cloneItemState(state),
        rarity: 'rare',
      };

      const eligiblePrefixes = canAcceptPrefix(rareBaseState) ? getEligibleMods(rareBaseState, allMods, { requiredGenType: 'Prefix' }) : [];
      const eligibleSuffixes = canAcceptSuffix(rareBaseState) ? getEligibleMods(rareBaseState, allMods, { requiredGenType: 'Suffix' }) : [];

      const totalPWeight = calculateTotalWeight(eligiblePrefixes);
      const totalSWeight = calculateTotalWeight(eligibleSuffixes);
      const totalWeight = totalPWeight + totalSWeight;

      if (totalWeight <= 0) {
        return { outcomes: [{ state: rareBaseState, probability: 1.0 }], immediateCostChaos: cost };
      }

      const outcomes: TransitionOutcome[] = [];
      for (const p of eligiblePrefixes) {
        checkTransitionDeadline(control);
        const nextState = cloneItemState(rareBaseState);
        nextState.prefixes.push(toRolledMod(p));
        outcomes.push({
          state: nextState,
          probability: p.weight / totalWeight,
          label: `Regal added Prefix: ${p.name}`,
        });
      }
      for (const s of eligibleSuffixes) {
        checkTransitionDeadline(control);
        const nextState = cloneItemState(rareBaseState);
        nextState.suffixes.push(toRolledMod(s));
        outcomes.push({
          state: nextState,
          probability: s.weight / totalWeight,
          label: `Regal added Suffix: ${s.name}`,
        });
      }

      return { outcomes, immediateCostChaos: cost };
    },
    sampleTransition: (state, _target, context, rng) => {
      const pool = context.pool;
      if (!pool) return state;

      const allMods = pool.getAllMods();
      const rareBaseState: ItemState = {
        ...cloneItemState(state),
        rarity: 'rare',
      };

      const eligiblePrefixes = canAcceptPrefix(rareBaseState) ? getEligibleMods(rareBaseState, allMods, { requiredGenType: 'Prefix' }) : [];
      const eligibleSuffixes = canAcceptSuffix(rareBaseState) ? getEligibleMods(rareBaseState, allMods, { requiredGenType: 'Suffix' }) : [];
      const eligibleCombined = [...eligiblePrefixes, ...eligibleSuffixes];

      const chosen = selectWeightedMod(eligibleCombined, rng);
      if (chosen) {
        if (chosen.genType === 'Prefix') {
          rareBaseState.prefixes.push(toRolledMod(chosen));
        } else {
          rareBaseState.suffixes.push(toRolledMod(chosen));
        }
      }

      return rareBaseState;
    },
  },
  {
    id: 'scouring_orb',
    actionType: 'SCOURING_ORB',
    name: 'Orb of Scouring',
    category: 'base-prep',
    isLegal: (state) => state.rarity !== 'normal' && getRemovableAffixes(state).length > 0,
    getCost: (ctx) => ctx.priceBook.evaluateRate('scour', 0.5),
    getTransitions: (state, _target, context, control) => {
      checkTransitionDeadline(control);
      const nextState = cloneItemState(state);
      nextState.prefixes = nextState.prefixes.filter(
        (mod) => isFracturedMod(state, mod)
      );
      nextState.suffixes = nextState.suffixes.filter(
        (mod) => isFracturedMod(state, mod)
      );
      nextState.fracturedModIds = [...nextState.prefixes, ...nextState.suffixes]
        .filter((mod) => isFracturedMod(nextState, mod))
        .map((mod) => mod.modId);
      nextState.rarity = scouredRarity(nextState);
      return {
        outcomes: [{ state: nextState, probability: 1, label: 'Removed every non-fractured explicit modifier' }],
        immediateCostChaos: ctxCost(context, 'scour', 0.5),
      };
    },
    sampleTransition: (state, _target, context) => {
      const distribution = CRAFT_MECHANICS.find((mechanic) => mechanic.id === 'scouring_orb')!
        .getTransitions!(state, _target, context);
      return distribution.outcomes[0]?.state ?? cloneItemState(state);
    },
  },

  // 2. Rare Operations
  {
    id: 'chaos_orb',
    actionType: 'CHAOS_ORB',
    name: 'Chaos Orb',
    category: 'core-reforge',
    isLegal: (state) => state.rarity === 'rare',
    getCost: (ctx) => {
      const cost = ctx.priceBook.toChaos(1, 'chaos');
      return {
        costChaos: cost || 1.0,
        confidence: cost > 0 ? 'known' : 'research-fallback',
      };
    },
  },
  {
    id: 'annulment_orb',
    actionType: 'ANNULMENT_ORB',
    name: 'Orb of Annulment',
    category: 'cleanup',
    isLegal: (state) => state.rarity === 'rare' && getRemovableAffixes(state).length > 0,
    getCost: (ctx) => {
      const cost = ctx.priceBook.toChaos(1, 'annul');
      return {
        costChaos: cost || 9.0,
        confidence: cost > 0 ? 'known' : 'research-fallback',
      };
    },
    getTransitions: (state, _target, context, control) => {
      const removable = getRemovableAffixes(state);
      const cost = ctxCost(context, 'annul', 9.0);
      if (removable.length === 0) return { outcomes: [], immediateCostChaos: cost };
      const p = 1 / removable.length;
      const outcomes = removable.map((modToRemove) => {
        checkTransitionDeadline(control);
        const nextState = cloneItemState(state);
        if (modToRemove.genType === 'Prefix') {
          nextState.prefixes = nextState.prefixes.filter((m) => m.modId !== modToRemove.modId);
        } else {
          nextState.suffixes = nextState.suffixes.filter((m) => m.modId !== modToRemove.modId);
        }
        return {
          state: nextState,
          probability: p,
          label: `Annul removed ${modToRemove.name} (${modToRemove.genType})`,
        };
      });
      return { outcomes, immediateCostChaos: cost };
    },
    sampleTransition: (state, _target, _context, rng) => {
      const removable = getRemovableAffixes(state);
      if (removable.length === 0) return state;
      const idx = Math.floor(rng.next() * removable.length);
      const modToRemove = removable[idx];
      const nextState = cloneItemState(state);
      if (modToRemove.genType === 'Prefix') {
        nextState.prefixes = nextState.prefixes.filter((m) => m.modId !== modToRemove.modId);
      } else {
        nextState.suffixes = nextState.suffixes.filter((m) => m.modId !== modToRemove.modId);
      }
      return nextState;
    },
  },
  {
    id: 'exalted_orb',
    actionType: 'EXALTED_ORB',
    name: 'Exalted Orb Slam',
    category: 'slam',
    isLegal: (state, _target, context) =>
      state.rarity === 'rare' &&
      (canAcceptPrefix(state) || canAcceptSuffix(state)) &&
      getEligibleMods(state, context.pool.getAllMods()).length > 0,
    getCost: (ctx) => ctx.priceBook.evaluateRate('exalt', 1.2),
    getTransitions: (state, _target, context, control) => {
      checkTransitionDeadline(control);
      const eligible = getEligibleMods(state, context.pool.getAllMods());
      const totalWeight = calculateTotalWeight(eligible);
      const cost = ctxCost(context, 'exalt', 1.2);
      if (totalWeight <= 0) return { outcomes: [], immediateCostChaos: cost };
      const outcomes = eligible.map((mod) => {
        checkTransitionDeadline(control);
        const nextState = cloneItemState(state);
        const rolled = toRolledMod(mod);
        if (mod.genType === 'Prefix') nextState.prefixes.push(rolled);
        else nextState.suffixes.push(rolled);
        return {
          state: nextState,
          probability: mod.weight / totalWeight,
          label: `Exalt added ${mod.genType}: ${mod.name}`,
        };
      });
      return { outcomes, immediateCostChaos: cost };
    },
    sampleTransition: (state, _target, context, rng) => {
      const eligible = getEligibleMods(state, context.pool.getAllMods());
      const chosen = selectWeightedMod(eligible, rng);
      const nextState = cloneItemState(state);
      if (chosen) {
        if (chosen.genType === 'Prefix') nextState.prefixes.push(toRolledMod(chosen));
        else nextState.suffixes.push(toRolledMod(chosen));
      }
      return nextState;
    },
  },
  {
    id: 'fracturing_orb',
    actionType: 'FRACTURING_ORB',
    name: 'Fracturing Orb',
    category: 'base-prep',
    isLegal: (state) => {
      const alreadyFractured = getAllAffixes(state).some(
        (mod) => isFracturedMod(state, mod)
      );
      return state.rarity === 'rare' &&
        getAllAffixes(state).length >= 4 &&
        !alreadyFractured &&
        state.flags?.influenced !== true &&
        state.flags?.synthesised !== true;
    },
    getCost: (ctx) => ctx.priceBook.evaluateRate('fracturing', 359),
    getTransitions: (state, _target, context, control) => {
      checkTransitionDeadline(control);
      const affixes = getAllAffixes(state);
      const cost = ctxCost(context, 'fracturing', 359);
      if (affixes.length < 4) return { outcomes: [], immediateCostChaos: cost };
      const probability = 1 / affixes.length;
      const outcomes = affixes.map((selected) => {
        checkTransitionDeadline(control);
        const nextState = cloneItemState(state);
        const rolled = [...nextState.prefixes, ...nextState.suffixes].find(
          (mod) => mod.modId === selected.modId
        );
        if (rolled) rolled.isFractured = true;
        nextState.fracturedModIds = [selected.modId];
        return {
          state: nextState,
          probability,
          label: `Fractured ${selected.name} (${selected.genType})`,
        };
      });
      return { outcomes, immediateCostChaos: cost };
    },
    sampleTransition: (state, _target, _context, rng) => {
      const affixes = getAllAffixes(state);
      if (affixes.length < 4) return cloneItemState(state);
      const selected = affixes[Math.min(Math.floor(rng.next() * affixes.length), affixes.length - 1)];
      const nextState = cloneItemState(state);
      const rolled = [...nextState.prefixes, ...nextState.suffixes].find(
        (mod) => mod.modId === selected.modId
      );
      if (rolled) rolled.isFractured = true;
      nextState.fracturedModIds = [selected.modId];
      return nextState;
    },
  },
];

function ctxCost(context: SolverContext, currencyKey: string, fallback: number): number {
  return context.priceBook.evaluateRate(currencyKey as any, fallback).costChaos;
}

/**
 * Returns all registered Harvest reforge mechanics applicable to a given state.
 */
export function getHarvestMechanicsForState(
  state: ItemState,
  _target: TargetDefinition,
  context: SolverContext
): CraftMechanic[] {
  if (state.rarity !== 'rare') return [];
  return createHarvestReforgeMechanics(context);
}

/** Creates shared executable Harvest mechanics, optionally restricted to selected tags. */
export function createHarvestReforgeMechanics(
  context: SolverContext,
  selectedTags?: string[]
): CraftMechanic[] {
  const pool = context.pool;
  const selected = selectedTags ? new Set(selectedTags.map((tag) => tag.toLowerCase())) : undefined;
  const mechanics: CraftMechanic[] = [];

  for (const [tag, def] of Object.entries(HARVEST_CRAFT_DEFINITIONS)) {
    if (selected && !selected.has(tag)) continue;
    const taggedMods = pool ? getTaggedModsForCluster(pool, tag, 100) : [];
    if (taggedMods.length > 0) {
      mechanics.push({
        id: def.craftId,
        actionType: 'HARVEST_REFORGE',
        name: def.name,
        category: 'core-reforge',
        isLegal: (state) =>
          state.rarity === 'rare' &&
          getTaggedModsForCluster(context.pool, tag, state.itemLevel).length > 0,
        getCost: (ctx) => {
          const res = getHarvestCraftCost(tag, ctx.priceBook);
          return {
            costChaos: res.costChaos,
            confidence: res.confidence,
            source: res.source,
            provenance: res.provenance,
          };
        },
        mechanicsConfidence: 'APPROXIMATE / EXTERNALLY CLOSE',
        mechanicsProvenance: 'Current engine approximation: preserve fractures, guarantee one tagged mod, then roll to 3 or 4 total explicit affixes with 50% probability each',
        parameters: { harvestTag: tag, lifeforceType: def.lifeforceType, lifeforceAmount: def.lifeforceAmount },
        getTransitions: (state, target, ctx, control) => {
          const cost = getHarvestCraftCost(tag, ctx.priceBook);
          return generateHarvestTransitions(state, tag, target, ctx, cost.costChaos, control);
        },
        sampleTransition: (state, _target, ctx, rng) =>
          sampleHarvestTransition(state, tag, ctx, rng),
      });
    }
  }

  return mechanics;
}
