import type { BaseType, ItemState } from '../domain/ItemState.ts';

// Affix slot limits on Cluster Jewels in Path of Exile:
// Rare cluster jewels have a maximum of 2 prefixes and 2 suffixes (total 4 affixes).
// Magic cluster jewels have a maximum of 1 prefix and 1 suffix (total 2 affixes).
// Normal cluster jewels have 0 affixes.
export const MAX_PREFIXES_BY_RARITY = {
  normal: 0,
  magic: 1,
  rare: 2,
} as const;

export const MAX_SUFFIXES_BY_RARITY = {
  normal: 0,
  magic: 1,
  rare: 2,
} as const;

export const MAX_NOTABLES_BY_BASE: Record<BaseType, number> = {
  'Large Cluster Jewel': 3,
  'Medium Cluster Jewel': 2,
  'Small Cluster Jewel': 1,
};

export function getMaxPrefixes(rarity: ItemState['rarity']): number {
  return MAX_PREFIXES_BY_RARITY[rarity] ?? 2;
}

export function getMaxSuffixes(rarity: ItemState['rarity']): number {
  return MAX_SUFFIXES_BY_RARITY[rarity] ?? 2;
}

export function getMaxNotables(baseType: BaseType): number {
  return MAX_NOTABLES_BY_BASE[baseType] ?? 3;
}

export function canAcceptPrefix(state: ItemState): boolean {
  return state.prefixes.length < getMaxPrefixes(state.rarity);
}

export function canAcceptSuffix(state: ItemState): boolean {
  return state.suffixes.length < getMaxSuffixes(state.rarity);
}

export function hasOpenAffixSlot(state: ItemState): boolean {
  return canAcceptPrefix(state) || canAcceptSuffix(state);
}

export function getNotableCount(state: ItemState): number {
  return (
    state.prefixes.filter((m) => m.isNotable).length +
    state.suffixes.filter((m) => m.isNotable).length
  );
}

export function canAcceptNotable(state: ItemState): boolean {
  return getNotableCount(state) < getMaxNotables(state.baseType);
}
