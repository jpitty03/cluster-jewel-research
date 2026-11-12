import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest } from './lib/poedb-wand-references.mjs';

const args = Object.fromEntries(process.argv.slice(2).flatMap((arg, index, all) =>
  arg.startsWith('--') && all[index + 1] && !all[index + 1].startsWith('--') ? [[arg.slice(2), all[index + 1]]] : []));
const snapshotId = args.snapshot ?? 'allflame-planning-2026-09-21';
const league = args.league ?? 'Allflame';
const observedDate = args['observed-date'] ?? '2026-09-21';
const fallbackSnapshot = args.fallback ?? 'allflame-bow-planning-2026-09-06';
if (!/^[a-z0-9-]+$/.test(snapshotId) || !/^\d{4}-\d{2}-\d{2}$/.test(observedDate)
  || !/^[a-z0-9-]+$/.test(fallbackSnapshot)) throw new Error('Invalid import arguments');

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const references = resolve(repository, 'docs/crafting-engine/references');
const inputPath = resolve(repository, 'docs/crafting-engine/prices.json');
const outputDir = resolve(references, 'economies', snapshotId);
const rawDir = resolve(outputDir, 'raw');
await mkdir(rawDir, { recursive: true });

const inputBytes = await readFile(inputPath);
const payload = JSON.parse(inputBytes);
const chaosPerDivine = payload.lines?.find(line => line.id === 'divine')?.primaryValue;
if (payload.core?.primary !== 'chaos' || payload.core?.secondary !== 'divine'
  || !Number.isFinite(chaosPerDivine) || chaosPerDivine <= 0) {
  throw new Error('User price payload must contain a positive Divine quote in Chaos');
}
const itemById = new Map(payload.items.map(item => [item.id, item]));
const currentPrices = payload.lines.flatMap(line => {
  if (!Number.isFinite(line.primaryValue) || line.primaryValue <= 0) return [];
  const item = itemById.get(line.id);
  if (!item) throw new Error(`Missing item metadata for ${line.id}`);
  return [{ type: 'Currency', id: line.id, name: item.name, category: item.category,
    detailsId: item.detailsId, chaos: line.primaryValue, divine: line.primaryValue / chaosPerDivine,
    volumePrimaryValue: line.volumePrimaryValue ?? null }];
});
if (currentPrices.length !== new Set(currentPrices.map(price => price.id)).size) throw new Error('Duplicate currency price IDs');

const fallbackPath = resolve(references, 'economies', fallbackSnapshot, 'prices.json');
const fallback = JSON.parse(await readFile(fallbackPath, 'utf8'));
if (fallback.league !== league) throw new Error('Fallback economy league mismatch');
const carriedPrices = fallback.prices.filter(price => price.type !== 'Currency')
  .map(price => ({ ...price, divine: price.chaos / chaosPerDivine }));
const sourcePath = resolve(rawDir, 'Currency.json');
await writeFile(sourcePath, inputBytes);
const source = {
  type: 'Currency',
  path: `economies/${snapshotId}/raw/Currency.json`,
  sha256: digest(inputBytes),
  observedDate,
  timestampStatus: 'Date received from the user; the supplied payload has no fetch timestamp or league field.',
  evidenceStatus: 'user-supplied poe.ninja response',
};
const sources = [source, ...fallback.sources.filter(entry => entry.type !== 'Currency')];
const prices = {
  schemaVersion: 1,
  snapshotId,
  league,
  observedDate,
  sources,
  chaosPerDivine,
  conversion: 'All Chaos quotes divided by the direct Divine quote in the user-supplied Currency response.',
  prices: [...currentPrices, ...carriedPrices],
  limitations: [
    'Currency prices come from the user-supplied poe.ninja payload; its exact fetch time and league field were not embedded.',
    `Essence, Fossil, Resonator and Ducat Chaos quotes are carried forward from ${fallbackSnapshot} and converted at the new Divine quote.`,
    'Exchange estimates are not executable quotes or guaranteed bulk supply.',
  ],
};
const outputPath = resolve(outputDir, 'prices.json');
await writeFile(outputPath, JSON.stringify(prices, null, 2) + '\n');
const manifest = {
  schemaVersion: 1,
  snapshotId,
  league,
  observedDate,
  importer: 'scripts/import-user-poe-ninja-prices.mjs',
  sources,
  outputs: [{ path: `economies/${snapshotId}/prices.json`, sha256: digest(await readFile(outputPath)) }],
};
await writeFile(resolve(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ snapshotId, league, observedDate, chaosPerDivine,
  currentCurrencyPrices: currentPrices.length, carriedPrices: carriedPrices.length }, null, 2));
