import type { ItemState } from '../domain/ItemState.ts';
import type { TargetDefinition } from '../domain/TargetDefinition.ts';
import type { SolverContext } from '../domain/CraftAction.ts';
import type { PriceBook } from '../domain/PriceBook.ts';
import type { RandomSource } from '../probability/random.ts';
import { canAcceptPrefix, canAcceptSuffix } from './affixRules.ts';
import { getRemovableAffixes, cloneItemState } from '../domain/ItemState.ts';
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

/**
 * Registry of authoritative craft mechanics for cluster jewel crafting.
 * Single source of truth for action legality, actionType mapping, and currency cost derivation.
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
  },

  // 1. Magic Base Prep
  {
    id: 'augmentation_orb',
    actionType: 'AUGMENTATION_ORB',
    name: 'Orb of Augmentation',
    category: 'base-prep',
    isLegal: (state) => state.rarity === 'magic' && state.prefixes.length + state.suffixes.length < 2,
    getCost: (ctx) => {
      const altRate = ctx.priceBook.toChaos(1, 'alteration');
      return {
        costChaos: altRate > 0 ? altRate * 0.25 : 0.03,
        confidence: altRate > 0 ? 'known' : 'research-fallback',
      };
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
  },
  {
    id: 'regal_orb',
    actionType: 'REGAL_ORB',
    name: 'Regal Orb',
    category: 'base-prep',
    isLegal: (state) => state.rarity === 'magic' && state.prefixes.length + state.suffixes.length >= 1,
    getCost: (ctx) => {
      const cost = ctx.priceBook.toChaos(1, 'chaos') * 0.2;
      return {
        costChaos: cost || 0.2,
        confidence: cost > 0 ? 'known' : 'research-fallback',
      };
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
      const cost = ctx.priceBook.toChaos(1, 'fracture');
      return {
        costChaos: cost || 359.0,
        confidence: cost > 0 ? 'known' : 'research-fallback',
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
