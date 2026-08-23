import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { PriceFile } from '../src/priceModel.ts';
import { getOptimizerPricingFromSnapshot } from '../src/crafting/optimizerPriceEvidence.ts';

const snapshotPath = fileURLToPath(new URL('../src/data/Allflame/trade-prices.json', import.meta.url));
const outputPath = fileURLToPath(new URL('../output-optimizer-pricing-phase2b.txt', import.meta.url));
const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8')) as PriceFile;
const available = getOptimizerPricingFromSnapshot(
  snapshot,
  'Small Cluster Jewel',
  '6% increased Mana Reservation Efficiency of Skills',
  3,
  83
);
const unavailable = getOptimizerPricingFromSnapshot(
  snapshot,
  'Large Cluster Jewel',
  '12% increased Attack Damage while holding a Shield',
  12,
  84
);

function age(value: number | undefined): string {
  return value === undefined ? 'UNKNOWN' : `${(value / 86_400_000).toFixed(3)} days`;
}

const quote = available.marketContext.cleanBaseQuote;
const coverage = available.marketContext.currencyCoverage;
const lines = [
  'DEVELOPER UI PHASE 2B — OPTIMIZER PRICING EVIDENCE DIAGNOSTIC',
  `pricing league: ${available.marketContext.league}`,
  `snapshot: ${available.marketContext.snapshotAt}; age=${age(available.marketContext.snapshotAgeMs)}; stale=${available.marketContext.snapshotStale ? 'YES' : 'NO'}`,
  `currency rates: ${available.marketContext.currencyRatesAt ?? 'UNAVAILABLE'}; age=${age(available.marketContext.currencyRatesAgeMs)}; stale=${available.marketContext.currencyRatesStale ? 'YES' : 'NO'}`,
  '',
  'AVAILABLE CLEAN-BASE EVIDENCE:',
  `  status: ${quote.status}`,
  `  sampled low / midpoint: ${quote.lowChaos?.toFixed(3) ?? 'UNAVAILABLE'}c / ${quote.midChaos?.toFixed(3) ?? 'UNAVAILABLE'}c`,
  `  listed / sampled: ${quote.listed ?? 0} / ${quote.sampled ?? 0}`,
  `  quote timestamp / age / stale: ${quote.at ?? 'UNAVAILABLE'} / ${age(quote.ageMs)} / ${quote.stale ? 'YES' : 'NO'}`,
  `  provenance: ${quote.provenance}`,
  '',
  'CONTROLLED T1 ES CLEAN-BASE EVIDENCE:',
  `  status: ${unavailable.marketContext.cleanBaseQuote.status}`,
  `  provenance: ${unavailable.marketContext.cleanBaseQuote.provenance}`,
  '  manual override provenance remains explicit at the service/UI boundary; unavailable evidence is never relabeled as market-known.',
  '',
  'CURRENCY MAPPING COVERAGE:',
  `  mapped and present (${coverage.mappedAndPresent.length}): ${coverage.mappedAndPresent.join(', ') || 'NONE'}`,
  `  mapped but missing (${coverage.mappedButMissing.length}): ${coverage.mappedButMissing.join(', ') || 'NONE'}`,
  `  unmapped engine currencies (${coverage.unmappedEngineCurrencies.length}): ${coverage.unmappedEngineCurrencies.join(', ') || 'NONE'}`,
];

writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
console.log(lines.join('\n'));
