import type { ItemState } from '../domain/ItemState.ts';

export interface OccupiedModState {
  occupiedGroups: Set<string>;
  occupiedNames: Set<string>;
}

export function getOccupiedModState(state: ItemState): OccupiedModState {
  const occupiedGroups = new Set<string>();
  const occupiedNames = new Set<string>();
  const allMods = [...state.prefixes, ...state.suffixes];

  for (const m of allMods) {
    if (m.modGroup) occupiedGroups.add(m.modGroup);
    if (m.modGroups) {
      for (const g of m.modGroups) {
        occupiedGroups.add(g);
      }
    }
    if (m.name) occupiedNames.add(m.name);
  }

  return { occupiedGroups, occupiedNames };
}
