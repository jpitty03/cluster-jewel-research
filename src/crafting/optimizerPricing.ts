import type { BaseType } from '../../crafting-engine/src/domain/ItemState.ts';
import type {
  OptimizeCraftPriceContext,
  OptimizerMarketContext,
} from '../../crafting-engine/src/service/optimizerService.ts';
import { chaosValue, type PriceFile } from '../priceModel.ts';
import { baseKey } from '../tradeQuery.ts';

const snapshots = import.meta.glob('../data/*/trade-prices.json', {
  eager: true,
  import: 'default',
}) as Record<string, PriceFile>;

const byLeague = new Map(Object.values(snapshots).map((snapshot) => [snapshot.league, snapshot]));

export const ENGINE_CURRENCY_MAPPINGS = {
  chaos: 'chaos',
  divine: 'divine',
  fracturing: 'fracturing-orb',
  annul: 'annul',
  exalt: 'exalted',
  scour: 'scour',
  alteration: 'alt',
  transmutation: 'transmute',
  augmentation: 'aug',
  regal: 'regal',
  wildLifeforce: 'wild-lifeforce',
  vividLifeforce: 'vivid-lifeforce',
  primalLifeforce: 'primal-lifeforce',
} as const;

export interface BrowserOptimizerPricing {
  priceContext: OptimizeCraftPriceContext;
  marketContext: OptimizerMarketContext;
}

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
  if (!snapshot) return null;

  const currencyRates: Record<string, number> = {};
  for (const [engineKey, snapshotKey] of Object.entries(ENGINE_CURRENCY_MAPPINGS)) {
    const rate = snapshot.rates?.[snapshotKey];
    if (rate !== undefined && Number.isFinite(rate) && rate > 0) currencyRates[engineKey] = rate;
  }

  const key = baseKey(
    baseType,
    clusterType,
    { min: passiveCount, max: passiveCount },
    itemLevel
  );
  const entry = snapshot.bases[key];
  const cleanBaseChaos = chaosValue(snapshot.rates, entry?.low);
  const cleanBaseAvailable = entry !== undefined && entry.listed > 0 && cleanBaseChaos !== null;
  const snapshotAgeMs = Date.now() - Date.parse(snapshot.fetchedAt);
  const stale = !Number.isFinite(snapshotAgeMs) || snapshotAgeMs > 7 * 86_400_000;
  const quoteProvenance = cleanBaseAvailable
    ? `${snapshot.league} trade snapshot low quote for ${key}; ${entry.sampled} sampled of ${entry.listed} listed at ${entry.at}`
    : `${snapshot.league} trade snapshot has no exact clean-base quote for ${key}; no market value was invented.`;

  return {
    priceContext: {
      currencyRates,
      cleanBaseCostChaos: cleanBaseAvailable ? cleanBaseChaos : undefined,
      cleanBasePriceSource: cleanBaseAvailable ? 'market' : undefined,
      cleanBasePriceProvenance: cleanBaseAvailable ? quoteProvenance : undefined,
    },
    marketContext: {
      league: snapshot.league,
      snapshotAt: snapshot.fetchedAt,
      currencyRatesAt: snapshot.ratesAt,
      stale,
      cleanBaseQuote: cleanBaseAvailable
        ? {
            status: 'AVAILABLE',
            costChaos: cleanBaseChaos,
            listed: entry.listed,
            sampled: entry.sampled,
            provenance: quoteProvenance,
          }
        : { status: 'UNAVAILABLE', provenance: quoteProvenance },
      currencyMappings: { ...ENGINE_CURRENCY_MAPPINGS },
    },
  };
}
