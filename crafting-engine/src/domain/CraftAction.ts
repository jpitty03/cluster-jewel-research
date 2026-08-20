import type { ItemState } from './ItemState.ts';
import type { ModPool } from './ModPool.ts';
import type { PriceBook, CurrencyRates } from './PriceBook.ts';
import type { TargetDefinition } from './TargetDefinition.ts';

export type CurrencyCost = Partial<Record<keyof CurrencyRates | string, number>>;

export interface CraftOutcome {
  probability: number;
  state: ItemState;
  description: string;
}

export interface SolverContext {
  pool: ModPool;
  priceBook: PriceBook;
  target?: TargetDefinition;
  options?: Record<string, unknown>;
}

export interface CraftAction {
  id: string;
  name: string;
  isAvailable(state: ItemState, context: SolverContext): boolean;
  cost(state: ItemState, context: SolverContext): CurrencyCost;
  outcomes(state: ItemState, context: SolverContext): CraftOutcome[];
}
