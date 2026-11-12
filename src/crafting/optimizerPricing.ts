import type { BaseType } from '../../crafting-engine/src/domain/ItemState.ts';
import type { PriceFile } from '../priceModel.ts';
import { DEFAULT_LEAGUE } from '../../league.ts';
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

/**
 * The league the calculator prices against on load: the configured current league
 * when it has a snapshot, otherwise the most recently fetched one. Never
 * alphabetical — an ended league must not win because its name sorts first.
 */
export function getDefaultOptimizerPricingLeague(): string {
  if (byLeague.has(DEFAULT_LEAGUE)) return DEFAULT_LEAGUE;
  let newest: PriceFile | undefined;
  for (const snapshot of byLeague.values()) {
    if (!newest || Date.parse(snapshot.fetchedAt) > Date.parse(newest.fetchedAt)) newest = snapshot;
  }
  return newest?.league ?? '';
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
