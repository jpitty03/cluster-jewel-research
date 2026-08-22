import type { ItemState } from '../domain/ItemState.ts';
import type { TargetDefinition } from '../domain/TargetDefinition.ts';
import type { SolverContext, CraftAction } from '../domain/CraftAction.ts';
import type { RolledMod } from '../domain/Mod.ts';
import { canAcceptPrefix, canAcceptSuffix } from './affixRules.ts';
import { getRemovableAffixes } from '../domain/ItemState.ts';
import { getTaggedModsForCluster } from './clusterPoolHelpers.ts';
import { matchesModRequirement } from '../domain/TargetDefinition.ts';

import { CRAFT_MECHANICS, getHarvestMechanicsForState } from './actionRegistry.ts';

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
  priceConfidence: 'known' | 'research-fallback' | 'unavailable';
  parameters?: Record<string, any>;
}

/**
 * Discovers and enumerates all legal crafting actions from a given item state.
 * Routes through the authoritative CRAFT_MECHANICS registry.
 */
export function getLegalActions(
  state: ItemState,
  target: TargetDefinition,
  context: ActionDiscoveryContext
): LegalCraftAction[] {
  const actions: LegalCraftAction[] = [];

  // 1. Standard currency mechanics from registry
  for (const mechanic of CRAFT_MECHANICS) {
    if (mechanic.isLegal(state, target, context)) {
      const price = mechanic.getCost(context);
      let actionType: DiscoveredActionType = 'CHAOS_ORB';
      if (mechanic.id === 'augmentation_orb') actionType = 'AUGMENTATION_ORB';
      else if (mechanic.id === 'alteration_orb') actionType = 'ALTERATION_ORB';
      else if (mechanic.id === 'regal_orb') actionType = 'REGAL_ORB';
      else if (mechanic.id === 'scouring_orb') actionType = 'SCOURING_ORB';
      else if (mechanic.id === 'annulment_orb') actionType = 'ANNULMENT_ORB';
      else if (mechanic.id === 'exalted_orb') actionType = 'EXALTED_ORB';
      else if (mechanic.id === 'fracturing_orb') actionType = 'FRACTURING_ORB';

      actions.push({
        actionType,
        name: mechanic.name,
        category: mechanic.category,
        costChaos: price.costChaos,
        priceConfidence: price.confidence,
        parameters: mechanic.parameters,
      });
    }
  }

  // 2. Data-driven Harvest mechanics
  const harvestMechanics = getHarvestMechanicsForState(state, target, context);
  for (const hMech of harvestMechanics) {
    const price = hMech.getCost(context);
    actions.push({
      actionType: 'HARVEST_REFORGE',
      name: hMech.name,
      category: hMech.category,
      costChaos: price.costChaos,
      priceConfidence: price.confidence,
      parameters: hMech.parameters,
    });
  }

  return actions;
}

export interface CanonicalStateKeyOptions {
  includeContextScope?: boolean;
}

/**
 * STRICT STATE-EQUIVALENCE CONTRACT FOR BELLMAN SEARCH:
 *
 * Two ItemStates may share a canonical key if and only if every modeled legal action
 * from both states has:
 * 1. Identical legality (e.g. prefix/suffix capacity, removable affixes, fractured constraints);
 * 2. Identical immediate currency cost;
 * 3. Identical transition probabilities into equivalent successor states (preserving mod-group
 *    blocking for Exalts, Harvest tag pools, and target satisfaction).
 *
 * Rolls are normalized only when the target and all modeled transitions are invariant to numeric values.
 */
export function getCanonicalStateKey(
  state: ItemState,
  target?: TargetDefinition,
  options: CanonicalStateKeyOptions = { includeContextScope: true }
): string {
  const reqs = target ? [...target.requiredMods, ...(target.outcomeBranches?.flatMap((b) => b.requiredMods) ?? [])] : [];

  const formatMod = (m: RolledMod): string => {
    const isTarget = reqs.some((r) => matchesModRequirement(m, r));
    const isFrac = m.isFractured ? 'FRAC:' : '';
    const craftTags = (m.craftTags ?? []).slice().sort().join(',');

    // Check if target definition has specific roll requirements for this mod
    let rollSuffix = '';
    if (isTarget && target?.finalRollRequirements) {
      for (const [statKey, minVal] of Object.entries(target.finalRollRequirements)) {
        if (m.stats?.[statKey] !== undefined) {
          rollSuffix += `:roll(${statKey}>=${minVal})`;
        }
      }
    }

    // Always preserve modGroup to ensure mod-group blocking and eligibility are preserved
    const groupOrId = m.modGroup ?? m.modId;
    return `${isFrac}${groupOrId}:t${m.tier}:tags(${craftTags})${rollSuffix}`;
  };

  const pKeys = state.prefixes.map(formatMod).sort().join('|');
  const sKeys = state.suffixes.map(formatMod).sort().join('|');

  const contextPrefix = options.includeContextScope
    ? `${state.baseType ?? 'Large Cluster Jewel'}:${state.clusterType ?? 'generic'}:${state.itemLevel ?? 84}:${state.passiveCount ?? 12}:`
    : '';

  return `${contextPrefix}${state.rarity}|P:[${pKeys}]|S:[${sKeys}]`;
}
