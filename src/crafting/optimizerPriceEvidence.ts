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

/**
 * The snapshot key quoting a clean base for this craft. Base quotes are stored per
 * passive *range* and only at the item levels the pricing run searches (83 and 84),
 * so an exact `5-5||i85` key never exists even when a usable quote does:
 *  - passives: any quoted range containing the count ("4-5" covers 4 and 5);
 *  - item level: the exact level, else the lowest quoted level at or above it (a
 *    higher-ilvl base rolls a superset of the mods), else the highest quoted level
 *    (84 is the last mod tier, so an ilvl 85+ target is the same base).
 * Returns the exact key when nothing matches, so the miss is reported against it.
 */
function findBaseQuoteKey(
  snapshot: PriceFile,
  baseType: BaseType,
  clusterType: string,
  passiveCount: number,
  itemLevel: number
): string {
  const exact = baseKey(baseType, clusterType, { min: passiveCount, max: passiveCount }, itemLevel);
  if (snapshot.bases[exact]) return exact;
  const prefix = `${baseType}||${clusterType}||`;
  const quoted: { key: string; ilvl: number }[] = [];
  for (const key of Object.keys(snapshot.bases)) {
    if (!key.startsWith(prefix)) continue;
    const match = /^(\d+|any)-(\d+|any)\|\|i(\d+)$/.exec(key.slice(prefix.length));
    if (!match) continue;
    const min = match[1] === 'any' ? -Infinity : Number(match[1]);
    const max = match[2] === 'any' ? Infinity : Number(match[2]);
    if (passiveCount < min || passiveCount > max) continue;
    quoted.push({ key, ilvl: Number(match[3]) });
  }
  if (quoted.length === 0) return exact;
  quoted.sort((left, right) => left.ilvl - right.ilvl);
  return (
    quoted.find((quote) => quote.ilvl === itemLevel) ??
    quoted.find((quote) => quote.ilvl > itemLevel) ??
    quoted[quoted.length - 1]
  ).key;
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

  const key = findBaseQuoteKey(snapshot, baseType, clusterType, passiveCount, itemLevel);
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
