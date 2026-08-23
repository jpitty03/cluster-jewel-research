import type { RolledMod } from './Mod.ts';

export type BaseType = 'Large Cluster Jewel' | 'Medium Cluster Jewel' | 'Small Cluster Jewel';
export type ItemRarity = 'normal' | 'magic' | 'rare';

export interface ItemState {
  baseType: BaseType;
  clusterType: string;
  itemLevel: number;
  passiveCount?: number;
  rarity: ItemRarity;
  prefixes: RolledMod[];
  suffixes: RolledMod[];
  fracturedModIds: string[];
  metadata?: Record<string, unknown>;
}

export function cloneItemState(state: ItemState): ItemState {
  const cloneMod = (m: RolledMod): RolledMod => ({
    ...m,
    modGroups: [...m.modGroups],
    tags: m.tags ? [...m.tags] : undefined,
    craftTags: m.craftTags ? [...m.craftTags] : undefined,
    statValues: m.statValues.map((s) => ({ ...s })),
    currentRoll: m.currentRoll ? [...m.currentRoll] : undefined,
  });

  return {
    baseType: state.baseType,
    clusterType: state.clusterType,
    itemLevel: state.itemLevel,
    passiveCount: state.passiveCount,
    rarity: state.rarity,
    prefixes: state.prefixes.map(cloneMod),
    suffixes: state.suffixes.map(cloneMod),
    fracturedModIds: [...state.fracturedModIds],
    metadata: state.metadata ? structuredClone(state.metadata) : undefined,
  };
}

export function getAllAffixes(state: ItemState): RolledMod[] {
  return [...state.prefixes, ...state.suffixes];
}

export function getRemovableAffixes(state: ItemState): RolledMod[] {
  const fracturedSet = new Set(state.fracturedModIds);
  return getAllAffixes(state).filter((m) => !m.isFractured && !fracturedSet.has(m.modId));
}
