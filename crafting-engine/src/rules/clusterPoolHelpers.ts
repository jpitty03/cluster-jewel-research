import type { Mod, RolledMod } from '../domain/Mod.ts';
import type { ItemState } from '../domain/ItemState.ts';
import type { ModPool } from '../domain/ModPool.ts';

export function getDefenceModsForCluster(pool: ModPool, ilvl = 84): Mod[] {
  return pool.getAllMods().filter((m: Mod) =>
    (m.craftTags.includes('defences') || m.tags.includes('defences')) && m.ilvl <= ilvl
  );
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
