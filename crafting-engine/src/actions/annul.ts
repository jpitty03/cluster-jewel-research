import type { CraftAction, CraftOutcome, CurrencyCost, SolverContext } from '../domain/CraftAction.ts';
import type { ItemState } from '../domain/ItemState.ts';
import { cloneItemState, getRemovableAffixes } from '../domain/ItemState.ts';
import { consolidateOutcomes } from '../domain/CraftResult.ts';

export class AnnulAction implements CraftAction {
  readonly id = 'annul';
  readonly name = 'Orb of Annulment';

  isAvailable(state: ItemState, _context: SolverContext): boolean {
    if (state.rarity !== 'rare') return false;
    const removable = getRemovableAffixes(state);
    return removable.length > 0;
  }

  cost(_state: ItemState, _context: SolverContext): CurrencyCost {
    return { annul: 1 };
  }

  outcomes(state: ItemState, _context: SolverContext): CraftOutcome[] {
    const removable = getRemovableAffixes(state);
    const n = removable.length;

    if (n === 0) {
      return [];
    }

    const p = 1 / n;
    const rawOutcomes: CraftOutcome[] = removable.map((targetMod) => {
      const nextState = cloneItemState(state);

      if (targetMod.genType === 'Prefix') {
        const idx = nextState.prefixes.findIndex((m) => m.modId === targetMod.modId && !m.isFractured);
        if (idx !== -1) nextState.prefixes.splice(idx, 1);
      } else {
        const idx = nextState.suffixes.findIndex((m) => m.modId === targetMod.modId && !m.isFractured);
        if (idx !== -1) nextState.suffixes.splice(idx, 1);
      }

      return {
        probability: p,
        state: nextState,
        description: `Annul removed ${targetMod.name} (${targetMod.genType})`,
      };
    });

    return consolidateOutcomes(rawOutcomes);
  }
}
