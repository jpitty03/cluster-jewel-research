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

  const { occupiedGroups } = getOccupiedModState(state);

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

    // Display names are deliberately not an exclusion: only mod groups exclude
    // in-game. "of the Cloud" names both +all Attributes and a Lightning
    // Resistance tier, which can and do roll together.

    return true;
  });
}

export function calculateTotalWeight(mods: Mod[]): number {
  return mods.reduce((sum, m) => sum + m.weight, 0);
}
