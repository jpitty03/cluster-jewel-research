import type { ItemState } from '../domain/ItemState.ts';
import type { RolledMod } from '../domain/Mod.ts';

function formatModKey(mod: RolledMod, fracturedSet: Set<string>): string {
  const isFrac = mod.isFractured || fracturedSet.has(mod.modId) ? 'F' : 'N';
  const rollStr = mod.currentRoll && mod.currentRoll.length > 0 ? `:[${mod.currentRoll.join(',')}]` : '';
  return `${mod.modId}:T${mod.tier}:${isFrac}${rollStr}`;
}

export function generateStateKey(state: ItemState): string {
  const fracturedSet = new Set<string>(state.fracturedModIds);
  for (const m of state.prefixes) {
    if (m.isFractured) fracturedSet.add(m.modId);
  }
  for (const m of state.suffixes) {
    if (m.isFractured) fracturedSet.add(m.modId);
  }

  const sortedPrefixes = [...state.prefixes]
    .map((m) => formatModKey(m, fracturedSet))
    .sort()
    .join(',');

  const sortedSuffixes = [...state.suffixes]
    .map((m) => formatModKey(m, fracturedSet))
    .sort()
    .join(',');

  const sortedFractures = [...fracturedSet].sort().join(',');

  return [
    state.baseType,
    state.clusterType,
    state.passiveCount !== undefined ? `${state.passiveCount}p` : '',
    `i${state.itemLevel}`,
    state.rarity,
    `P[${sortedPrefixes}]`,
    `S[${sortedSuffixes}]`,
    `F[${sortedFractures}]`,
  ].join('|');
}
