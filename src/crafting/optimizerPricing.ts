import type { BaseType } from '../../crafting-engine/src/domain/ItemState.ts';
import type { PriceFile } from '../priceModel.ts';
import {
  getOptimizerPricingFromSnapshot,
  type BrowserOptimizerPricing,
} from './optimizerPriceEvidence.ts';

export { ENGINE_CURRENCY_MAPPINGS } from './optimizerPriceEvidence.ts';
export type { BrowserOptimizerPricing } from './optimizerPriceEvidence.ts';

const snapshots = import.meta.glob('../data/*/trade-prices.json', {
  eager: true,
  import: 'default',
}) as Record<string, PriceFile>;

const byLeague = new Map(Object.values(snapshots).map((snapshot) => [snapshot.league, snapshot]));

export function getOptimizerPricingLeagues(): string[] {
  return [...byLeague.keys()].sort((left, right) => left.localeCompare(right));
}

export function getBrowserOptimizerPricing(
  league: string,
  baseType: BaseType,
  clusterType: string,
  passiveCount: number,
  itemLevel: number
): BrowserOptimizerPricing | null {
  const snapshot = byLeague.get(league);
  return snapshot
    ? getOptimizerPricingFromSnapshot(snapshot, baseType, clusterType, passiveCount, itemLevel)
    : null;
}
