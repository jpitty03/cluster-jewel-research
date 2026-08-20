import type { CraftAction, CraftOutcome, CurrencyCost, SolverContext } from '../domain/CraftAction.ts';
import type { ItemState } from '../domain/ItemState.ts';
import { cloneItemState, getAllAffixes } from '../domain/ItemState.ts';
import { consolidateOutcomes } from '../domain/CraftResult.ts';

export class FractureAction implements CraftAction {
  readonly id = 'fracture';
  readonly name = 'Fracturing Orb';

  isAvailable(state: ItemState, _context: SolverContext): boolean {
    if (state.rarity !== 'rare') return false;
    if (state.fracturedModIds.length > 0) return false;
    const affixes = getAllAffixes(state);
    return affixes.length === 4;
  }

  cost(_state: ItemState, _context: SolverContext): CurrencyCost {
    return { fracturing: 1 };
  }

  outcomes(state: ItemState, _context: SolverContext): CraftOutcome[] {
    const affixes = getAllAffixes(state);
    const n = affixes.length;

    if (n === 0) {
      return [];
    }

    const p = 1 / n;
    const rawOutcomes: CraftOutcome[] = affixes.map((targetMod) => {
      const nextState = cloneItemState(state);

      if (targetMod.genType === 'Prefix') {
        const mod = nextState.prefixes.find((m) => m.modId === targetMod.modId);
        if (mod) mod.isFractured = true;
      } else {
        const mod = nextState.suffixes.find((m) => m.modId === targetMod.modId);
        if (mod) mod.isFractured = true;
      }

      nextState.fracturedModIds = [targetMod.modId];

      return {
        probability: p,
        state: nextState,
        description: `Fractured ${targetMod.name} (${targetMod.genType})`,
      };
    });

    return consolidateOutcomes(rawOutcomes);
  }
}
