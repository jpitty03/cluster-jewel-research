import type { ItemState } from '../domain/ItemState.ts';
import type { TargetDefinition } from '../domain/TargetDefinition.ts';
import type { SolverContext, CraftAction } from '../domain/CraftAction.ts';
import { canAcceptPrefix, canAcceptSuffix } from './affixRules.ts';
import { getRemovableAffixes } from '../domain/ItemState.ts';
import { getTaggedModsForCluster } from './clusterPoolHelpers.ts';

export interface ActionDiscoveryContext extends SolverContext {
  availableHarvestTags?: string[];
  enableAllflame?: boolean;
}

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

export interface LegalCraftAction {
  actionType: DiscoveredActionType;
  name: string;
  category: 'base-prep' | 'core-reforge' | 'cleanup' | 'slam' | 'finishing' | 'terminal';
  costChaos: number;
  parameters?: Record<string, any>;
}

/**
 * Discovers and enumerates all legal crafting actions from a given item state.
 *
 * Architectural milestone for generic multi-action discovery.
 */
export function getLegalActions(
  state: ItemState,
  target: TargetDefinition,
  context: ActionDiscoveryContext
): LegalCraftAction[] {
  const actions: LegalCraftAction[] = [];
  const priceBook = context.priceBook;
  const pool = context.pool;
  const itemLevel = state.itemLevel ?? 84;

  const totalPrefixes = state.prefixes.length;
  const totalSuffixes = state.suffixes.length;
  const totalAffixes = totalPrefixes + totalSuffixes;
  const removable = getRemovableAffixes(state);

  // 1. Magic Item Actions
  if (state.rarity === 'magic') {
    if (totalAffixes < 2) {
      actions.push({
        actionType: 'AUGMENTATION_ORB',
        name: 'Orb of Augmentation',
        category: 'base-prep',
        costChaos: priceBook.toChaos(1, 'alteration') * 0.25 || 0.03,
      });
    }
    actions.push({
      actionType: 'ALTERATION_ORB',
      name: 'Orb of Alteration',
      category: 'base-prep',
      costChaos: priceBook.toChaos(1, 'alteration') || 0.11,
    });
    if (totalAffixes >= 1) {
      actions.push({
        actionType: 'REGAL_ORB',
        name: 'Regal Orb',
        category: 'base-prep',
        costChaos: priceBook.toChaos(1, 'chaos') * 0.2 || 0.2,
      });
    }
    if (removable.length > 0) {
      actions.push({
        actionType: 'SCOURING_ORB',
        name: 'Orb of Scouring',
        category: 'base-prep',
        costChaos: priceBook.toChaos(1, 'scour') || 0.5,
      });
    }
    return actions;
  }

  // 2. Rare Item Actions
  // 2a. Harvest Reforges (for applicable tags in jewel pool)
  const harvestTags = context.availableHarvestTags ?? ['life', 'defences', 'chaos', 'speed', 'caster', 'attack', 'critical'];
  for (const tag of harvestTags) {
    const taggedMods = pool ? getTaggedModsForCluster(pool, tag, itemLevel) : [];
    if (taggedMods.length > 0) {
      const lifeforce = tag === 'life' ? 'wildLifeforce' : (tag === 'chaos' ? 'vividLifeforce' : 'primalLifeforce');
      actions.push({
        actionType: 'HARVEST_REFORGE',
        name: `Harvest Reforge ${tag.charAt(0).toUpperCase() + tag.slice(1)}`,
        category: 'core-reforge',
        costChaos: priceBook.toChaos(75, lifeforce as any),
        parameters: { harvestTag: tag, lifeforce },
      });
    }
  }

  // 2b. Chaos Orb (Generic full re-roll)
  actions.push({
    actionType: 'CHAOS_ORB',
    name: 'Chaos Orb',
    category: 'core-reforge',
    costChaos: priceBook.toChaos(1, 'chaos') || 1.0,
  });

  // 2c. Annulment Orb (Remove non-fractured mod)
  if (removable.length > 0) {
    actions.push({
      actionType: 'ANNULMENT_ORB',
      name: 'Orb of Annulment',
      category: 'cleanup',
      costChaos: priceBook.toChaos(1, 'annul') || 9.0,
    });
  }

  // 2d. Exalted Orb Slams (If open prefix or suffix slots exist)
  if (canAcceptPrefix(state) || canAcceptSuffix(state)) {
    actions.push({
      actionType: 'EXALTED_ORB',
      name: 'Exalted Orb Slam',
      category: 'slam',
      costChaos: priceBook.toChaos(1, 'exalt') || 1.2,
      parameters: {
        canPrefix: canAcceptPrefix(state),
        canSuffix: canAcceptSuffix(state),
      },
    });
  }

  // 2e. Fracturing Orb (If 4 affixes and no fractured mod)
  if (totalAffixes >= 4 && state.fracturedModIds.length === 0) {
    actions.push({
      actionType: 'FRACTURING_ORB',
      name: 'Fracturing Orb',
      category: 'base-prep',
      costChaos: priceBook.toChaos(1, 'fracture') || 359.0,
    });
  }

  return actions;
}
