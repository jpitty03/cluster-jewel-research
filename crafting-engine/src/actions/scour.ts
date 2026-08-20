import type { CraftAction, CraftOutcome, CurrencyCost, SolverContext } from '../domain/CraftAction.ts';
import type { ItemState } from '../domain/ItemState.ts';
import { cloneItemState, getRemovableAffixes } from '../domain/ItemState.ts';

export class ScourAction implements CraftAction {
  readonly id = 'scour';
  readonly name = 'Orb of Scouring';

  isAvailable(state: ItemState, _context: SolverContext): boolean {
    if (state.rarity === 'normal') return false;
    const removable = getRemovableAffixes(state);
    return removable.length > 0;
  }

  cost(_state: ItemState, _context: SolverContext): CurrencyCost {
    return { scour: 1 };
  }

  outcomes(state: ItemState, _context: SolverContext): CraftOutcome[] {
    const nextState = cloneItemState(state);

    nextState.prefixes = nextState.prefixes.filter((m) => m.isFractured);
    nextState.suffixes = nextState.suffixes.filter((m) => m.isFractured);

    if (nextState.prefixes.length === 0 && nextState.suffixes.length === 0) {
      nextState.rarity = 'normal';
    }

    return [
      {
        probability: 1.0,
        state: nextState,
        description: 'Scoured all non-fractured modifiers',
      },
    ];
  }
}
