import type { BaseType } from '../../crafting-engine/src/domain/ItemState.ts';
import { DEFAULT_CURRENCY_RATES } from '../../crafting-engine/src/domain/PriceBook.ts';
import type {
  OptimizeCraftPriceContext,
  OptimizerMarketContext,
} from '../../crafting-engine/src/service/optimizerService.ts';
import { chaosValue, type PriceFile } from '../priceModel.ts';
import { baseKey } from '../tradeQuery.ts';

const STALE_AFTER_MS = 7 * 86_400_000;

function evidenceAge(timestamp: string | undefined): { ageMs?: number; stale: boolean } {
  if (!timestamp) return { stale: true };
  const ageMs = Date.now() - Date.parse(timestamp);
  return {
    ageMs: Number.isFinite(ageMs) ? ageMs : undefined,
    stale: !Number.isFinite(ageMs) || ageMs > STALE_AFTER_MS,
  };
}

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

/** Pure evidence adapter shared by the browser loader and Node diagnostics. */
export function getOptimizerPricingFromSnapshot(
  snapshot: PriceFile,
  baseType: BaseType,
  clusterType: string,
  passiveCount: number,
  itemLevel: number
): BrowserOptimizerPricing {
  const currencyRates: Record<string, number> = {};
  const mappedAndPresent: string[] = [];
  const mappedButMissing: string[] = [];
  for (const [engineKey, snapshotKey] of Object.entries(ENGINE_CURRENCY_MAPPINGS)) {
    const rate = snapshot.rates?.[snapshotKey];
    const present = rate !== undefined && Number.isFinite(rate) && rate > 0;
    if (present) currencyRates[engineKey] = rate;
    (present ? mappedAndPresent : mappedButMissing).push(`${engineKey} -> ${snapshotKey}`);
  }
  const unmappedEngineCurrencies = Object.keys(DEFAULT_CURRENCY_RATES)
    .filter((engineKey) => !(engineKey in ENGINE_CURRENCY_MAPPINGS))
    .sort();

  const key = baseKey(baseType, clusterType, { min: passiveCount, max: passiveCount }, itemLevel);
  const entry = snapshot.bases[key];
  const cleanBaseChaos = chaosValue(snapshot.rates, entry?.low);
  const cleanBaseMidChaos = chaosValue(snapshot.rates, entry?.mid);
  const cleanBaseAvailable = entry !== undefined && entry.listed > 0 && cleanBaseChaos !== null;
  const snapshotFreshness = evidenceAge(snapshot.fetchedAt);
  const ratesFreshness = evidenceAge(snapshot.ratesAt);
  const quoteFreshness = evidenceAge(entry?.at);
  const stale = snapshotFreshness.stale || ratesFreshness.stale ||
    (entry !== undefined && quoteFreshness.stale);
  const quoteProvenance = cleanBaseAvailable
    ? `${snapshot.league} sampled low listing for ${key}; midpoint ${cleanBaseMidChaos === null ? 'unavailable' : `${cleanBaseMidChaos.toFixed(3)}c`}; ${entry.sampled} sampled of ${entry.listed} listed at ${entry.at}`
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
      snapshotAgeMs: snapshotFreshness.ageMs,
      snapshotStale: snapshotFreshness.stale,
      currencyRatesAt: snapshot.ratesAt,
      currencyRatesAgeMs: ratesFreshness.ageMs,
      currencyRatesStale: ratesFreshness.stale,
      stale,
      cleanBaseQuote: cleanBaseAvailable
        ? {
            status: 'AVAILABLE',
            costChaos: cleanBaseChaos,
            lowChaos: cleanBaseChaos,
            midChaos: cleanBaseMidChaos ?? undefined,
            listed: entry.listed,
            sampled: entry.sampled,
            at: entry.at,
            ageMs: quoteFreshness.ageMs,
            stale: quoteFreshness.stale,
            provenance: quoteProvenance,
          }
        : {
            status: 'UNAVAILABLE',
            at: entry?.at,
            ageMs: quoteFreshness.ageMs,
            stale: entry ? quoteFreshness.stale : undefined,
            provenance: quoteProvenance,
          },
      currencyMappings: { ...ENGINE_CURRENCY_MAPPINGS },
      currencyCoverage: { mappedAndPresent, mappedButMissing, unmappedEngineCurrencies },
    },
  };
}
