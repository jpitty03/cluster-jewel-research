import type { ItemState } from '../domain/ItemState.ts';
import type { Mod, GenType } from '../domain/Mod.ts';
import { canAcceptPrefix, canAcceptSuffix, canAcceptNotable } from './affixRules.ts';
import { getOccupiedModState } from './modGroups.ts';

export interface EligibilityOptions {
  requiredGenType?: GenType;
  filterBySlotCapacity?: boolean;
}

export function getEligibleMods(
  state: ItemState,
  pool: Mod[],
  options: EligibilityOptions = {}
): Mod[] {
  const filterSlots = options.filterBySlotCapacity ?? true;
  const canPrefix = canAcceptPrefix(state);
  const canSuffix = canAcceptSuffix(state);
  const canNotable = canAcceptNotable(state);

  if (filterSlots && !canPrefix && !canSuffix) {
    return [];
  }

  const { occupiedGroups, occupiedNames } = getOccupiedModState(state);

  return pool.filter((mod) => {
    // 1. Check ilvl requirement
    if (mod.ilvl > state.itemLevel) {
      return false;
    }

    // 2. Check genType requirement
    if (options.requiredGenType && mod.genType !== options.requiredGenType) {
      return false;
    }

    // 3. Check affix slot capacity
    if (filterSlots) {
      if (mod.genType === 'Prefix' && !canPrefix) return false;
      if (mod.genType === 'Suffix' && !canSuffix) return false;
    }

    // 4. Check notable capacity limit
    if (mod.isNotable && !canNotable) {
      return false;
    }

    // 5. Check mod group exclusion
    if (occupiedGroups.has(mod.modGroup)) {
      return false;
    }
    if (mod.modGroups && mod.modGroups.some((g) => occupiedGroups.has(g))) {
      return false;
    }

    // 6. Check duplicate name exclusion
    if (occupiedNames.has(mod.name)) {
      return false;
    }

    return true;
  });
}

export function calculateTotalWeight(mods: Mod[]): number {
  return mods.reduce((sum, m) => sum + m.weight, 0);
}
