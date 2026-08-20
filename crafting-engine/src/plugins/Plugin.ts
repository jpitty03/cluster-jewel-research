import type { CraftAction, CraftOutcome, SolverContext } from '../domain/CraftAction.ts';
import type { ItemState } from '../domain/ItemState.ts';

export interface CraftingPlugin {
  id: string;
  name: string;
  enabled: boolean;
  transformActions?(actions: CraftAction[], context: SolverContext): CraftAction[];
  transformOutcomes?(
    action: CraftAction,
    state: ItemState,
    outcomes: CraftOutcome[],
    context: SolverContext,
    valueFn?: (state: ItemState) => number
  ): CraftOutcome[];
}
