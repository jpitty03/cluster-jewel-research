import type { ItemState } from '../domain/ItemState.ts';
import type { TargetDefinition } from '../domain/TargetDefinition.ts';
import type { SolverContext } from '../domain/CraftAction.ts';
import type { PriceBook } from '../domain/PriceBook.ts';
import type { RandomSource } from '../probability/random.ts';
import type { Mod } from '../domain/Mod.ts';
import { toRolledMod } from '../domain/Mod.ts';
import { canAcceptPrefix, canAcceptSuffix } from './affixRules.ts';
import { getRemovableAffixes, cloneItemState } from '../domain/ItemState.ts';
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
  | 'HARVEST_REFORGE'
  | 'TERMINAL';

export interface CraftCost {
  costChaos: number;
  confidence: 'known' | 'research-fallback' | 'unavailable';
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

export interface CraftMechanic {
  id: string;
  actionType: DiscoveredActionType;
  name: string;
  category: 'base-prep' | 'core-reforge' | 'cleanup' | 'slam' | 'finishing' | 'terminal';
  isLegal(state: ItemState, target: TargetDefinition, context: SolverContext): boolean;
  getCost(context: SolverContext): CraftCost;
  parameters?: Record<string, any>;
  getTransitions?(state: ItemState, target: TargetDefinition, context: SolverContext): TransitionDistribution;
  sampleTransition?(state: ItemState, target: TargetDefinition, context: SolverContext, rng: RandomSource): ItemState;
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

function generateMagicTransitions(
  state: ItemState,
  context: SolverContext,
  costChaos: number
): TransitionDistribution {
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

  if (totalPrefixWeight <= 0 && totalSuffixWeight <= 0) {
    return { outcomes: [{ state: cleanMagicBase, probability: 1.0 }], immediateCostChaos: costChaos };
  }

  const outcomes: TransitionOutcome[] = [];

  // 1. 1-Prefix only (25% chance)
  if (totalPrefixWeight > 0) {
    for (const p of eligiblePrefixes) {
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
      const stateWithP = cloneItemState(cleanMagicBase);
      stateWithP.prefixes.push(toRolledMod(p));
      const remainingSuffixes = getEligibleMods(stateWithP, allMods, { requiredGenType: 'Suffix' });
      const remSuffixWeight = calculateTotalWeight(remainingSuffixes);

      if (remSuffixWeight > 0) {
        for (const s of remainingSuffixes) {
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
    getCost: (ctx) => {
      const altRate = ctx.priceBook.toChaos(1, 'alteration');
      return {
        costChaos: altRate > 0 ? altRate * 0.25 : 0.03,
        confidence: altRate > 0 ? 'known' : 'research-fallback',
      };
    },
    getTransitions: (state, target, context) => {
      const cost = ctxCost(context, 'alteration', 0.12) * 0.25;
      return generateMagicTransitions(state, context, cost);
    },
    sampleTransition: (state, target, context, rng) => {
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
    getCost: (ctx) => {
      const altRate = ctx.priceBook.toChaos(1, 'alteration');
      return {
        costChaos: altRate > 0 ? altRate * 0.25 : 0.03,
        confidence: altRate > 0 ? 'known' : 'research-fallback',
      };
    },
    getTransitions: (state, target, context) => {
      const cost = ctxCost(context, 'alteration', 0.12) * 0.25;
      const pool = context.pool;
      if (!pool) return { outcomes: [], immediateCostChaos: cost };

      const allMods = pool.getAllMods();
      const outcomes: TransitionOutcome[] = [];

      if (canAcceptPrefix(state)) {
        const eligible = getEligibleMods(state, allMods, { requiredGenType: 'Prefix' });
        const totWeight = calculateTotalWeight(eligible);
        if (totWeight > 0) {
          for (const m of eligible) {
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
    sampleTransition: (state, target, context, rng) => {
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
    getCost: (ctx) => {
      const cost = ctx.priceBook.toChaos(1, 'alteration');
      return {
        costChaos: cost || 0.11,
        confidence: cost > 0 ? 'known' : 'research-fallback',
      };
    },
    getTransitions: (state, target, context) => {
      const cost = ctxCost(context, 'alteration', 0.11);
      return generateMagicTransitions(state, context, cost);
    },
    sampleTransition: (state, target, context, rng) => {
      return sampleMagicTransition(state, context, rng);
    },
  },
  {
    id: 'regal_orb',
    actionType: 'REGAL_ORB',
    name: 'Regal Orb',
    category: 'base-prep',
    isLegal: (state) => state.rarity === 'magic' && state.prefixes.length + state.suffixes.length >= 1,
    getCost: (ctx) => {
      const cost = ctx.priceBook.toChaos(1, 'regal') || ctx.priceBook.toChaos(1, 'chaos') * 0.2;
      return {
        costChaos: cost || 0.2,
        confidence: cost > 0 ? 'known' : 'research-fallback',
      };
    },
    getTransitions: (state, target, context) => {
      const cost = ctxCost(context, 'regal', 0.2);
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
        const nextState = cloneItemState(rareBaseState);
        nextState.prefixes.push(toRolledMod(p));
        outcomes.push({
          state: nextState,
          probability: p.weight / totalWeight,
          label: `Regal added Prefix: ${p.name}`,
        });
      }
      for (const s of eligibleSuffixes) {
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
    sampleTransition: (state, target, context, rng) => {
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
    isLegal: (state) => getRemovableAffixes(state).length > 0,
    getCost: (ctx) => {
      const cost = ctx.priceBook.toChaos(1, 'scour');
      return {
        costChaos: cost || 0.5,
        confidence: cost > 0 ? 'known' : 'research-fallback',
      };
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
    getTransitions: (state, target, context) => {
      const removable = getRemovableAffixes(state);
      const cost = ctxCost(context, 'annul', 9.0);
      if (removable.length === 0) return { outcomes: [], immediateCostChaos: cost };
      const p = 1 / removable.length;
      const outcomes = removable.map((modToRemove) => {
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
    sampleTransition: (state, target, context, rng) => {
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
    isLegal: (state) => state.rarity === 'rare' && (canAcceptPrefix(state) || canAcceptSuffix(state)),
    getCost: (ctx) => {
      const cost = ctx.priceBook.toChaos(1, 'exalt');
      return {
        costChaos: cost || 1.2,
        confidence: cost > 0 ? 'known' : 'research-fallback',
      };
    },
  },
  {
    id: 'fracturing_orb',
    actionType: 'FRACTURING_ORB',
    name: 'Fracturing Orb',
    category: 'base-prep',
    isLegal: (state) => state.rarity === 'rare' && state.prefixes.length + state.suffixes.length >= 4 && state.fracturedModIds.length === 0,
    getCost: (ctx) => {
      const cost = ctx.priceBook.getRate('fracturing') || 359.0;
      return {
        costChaos: cost,
        confidence: ctx.priceBook.toChaos(1, 'fracturing' as any) > 0 ? 'known' : 'research-fallback',
      };
    },
  },
];

function ctxCost(context: SolverContext, currencyKey: string, fallback: number): number {
  return context.priceBook.toChaos(1, currencyKey as any) || fallback;
}

/**
 * Returns all registered Harvest reforge mechanics applicable to a given state.
 */
export function getHarvestMechanicsForState(
  state: ItemState,
  target: TargetDefinition,
  context: SolverContext
): CraftMechanic[] {
  if (state.rarity !== 'rare') return [];
  const pool = context.pool;
  const ilvl = state.itemLevel ?? 84;
  const mechanics: CraftMechanic[] = [];

  for (const [tag, def] of Object.entries(HARVEST_CRAFT_DEFINITIONS)) {
    const taggedMods = pool ? getTaggedModsForCluster(pool, tag, ilvl) : [];
    if (taggedMods.length > 0) {
      mechanics.push({
        id: def.craftId,
        actionType: 'HARVEST_REFORGE',
        name: def.name,
        category: 'core-reforge',
        isLegal: (s) => s.rarity === 'rare',
        getCost: (ctx) => {
          const res = getHarvestCraftCost(tag, ctx.priceBook);
          return {
            costChaos: res.costChaos,
            confidence: res.confidence,
          };
        },
        parameters: { harvestTag: tag, lifeforceType: def.lifeforceType, lifeforceAmount: def.lifeforceAmount },
      });
    }
  }

  return mechanics;
}
