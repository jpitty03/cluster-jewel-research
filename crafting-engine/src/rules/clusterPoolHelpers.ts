import type { Mod, RolledMod } from '../domain/Mod.ts';
import type { ItemState } from '../domain/ItemState.ts';
import type { ModPool } from '../domain/ModPool.ts';

export function getTaggedModsForCluster(pool: ModPool, tag: string, ilvl = 84): Mod[] {
  const normTag = tag.toLowerCase();
  return pool.getAllMods().filter((m: Mod) =>
    (m.craftTags.some((t) => t.toLowerCase() === normTag) || m.tags.some((t) => t.toLowerCase() === normTag)) && m.ilvl <= ilvl
  );
}

export function getDefenceModsForCluster(pool: ModPool, ilvl = 84): Mod[] {
  return getTaggedModsForCluster(pool, 'defences', ilvl);
}

export function getEligiblePrefixMods(state: ItemState, pool: ModPool, ilvl = 84): Mod[] {
  const placedGroups = new Set([...state.prefixes, ...state.suffixes].map((m: RolledMod) => m.modGroup));
  return pool.getAllMods().filter((m: Mod) =>
    m.genType === 'Prefix' && m.ilvl <= ilvl && !placedGroups.has(m.modGroup)
  );
}

export function getEligibleSuffixMods(state: ItemState, pool: ModPool, ilvl = 84): Mod[] {
  const placedGroups = new Set([...state.prefixes, ...state.suffixes].map((m: RolledMod) => m.modGroup));
  return pool.getAllMods().filter((m: Mod) =>
    m.genType === 'Suffix' && m.ilvl <= ilvl && !placedGroups.has(m.modGroup)
  );
}
