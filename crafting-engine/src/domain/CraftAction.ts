import type { ItemState } from './ItemState.ts';
import type { ModPool } from './ModPool.ts';
import type { PriceBook, CurrencyRates } from './PriceBook.ts';
import type { TargetDefinition } from './TargetDefinition.ts';

export type CurrencyCost = Partial<Record<keyof CurrencyRates | string, number>>;

export type EffortConfidence = 'USER_SUPPLIED' | 'DEFAULT_APPROXIMATE' | 'UNAVAILABLE';

export interface ActionCostVector {
  chaosCost: number;
  physicalActionCount: number;
  estimatedManualTimeMs: number;
}

export interface ActionEffortProfile {
  defaultCurrencyTimeMs: number;
  harvestReforgeTimeMs: number;
  fracturingOrbTimeMs: number;
  reacquireCleanBaseTimeMs: number;
  customActionTimesMs?: Record<string, number>;
  customPhysicalActionCounts?: Record<string, number>;
  confidence?: EffortConfidence;
}

export const DEFAULT_ACTION_EFFORT_PROFILE: ActionEffortProfile = {
  defaultCurrencyTimeMs: 400,
  harvestReforgeTimeMs: 2000,
  fracturingOrbTimeMs: 1500,
  reacquireCleanBaseTimeMs: 5000,
  confidence: 'DEFAULT_APPROXIMATE',
};

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
