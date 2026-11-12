import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest } from './lib/poedb-wand-references.mjs';
import { normalizeExchangePrices } from './lib/wand-route-analysis.mjs';

const args = Object.fromEntries(process.argv.slice(2).flatMap((arg, index, all) =>
  arg.startsWith('--') && all[index + 1] && !all[index + 1].startsWith('--') ? [[arg.slice(2), all[index + 1]]] : []));
const offline = process.argv.includes('--offline');
const snapshotId = args.snapshot;
const league = args.league ?? 'Allflame';
const types = (args.types ?? 'Currency,Fossil,Resonator,Ducat').split(',').map(value => value.trim()).filter(Boolean);
if (!snapshotId || !/^[a-z0-9-]+$/.test(snapshotId)) throw new Error('A valid --snapshot is required');
if (!types.length || types.some(type => !/^[A-Za-z]+$/.test(type))) throw new Error('Invalid --types list');

const references = resolve(dirname(fileURLToPath(import.meta.url)), '../docs/crafting-engine/references');
const outputDir = resolve(references, 'economies', snapshotId);
await mkdir(resolve(outputDir, 'raw'), { recursive: true });
const manifestPath = resolve(outputDir, 'manifest.json');
let cachedSources = [];
try {
  cachedSources = JSON.parse(await readFile(manifestPath, 'utf8')).sources ?? [];
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const sourceCache = new Map(cachedSources.map(source => [source.path.split('/').at(-1), source]));
const usedSources = new Map();

async function get(url, filename) {
  const path = resolve(outputDir, 'raw', filename);
  try {
    const bytes = await readFile(path);
    const source = sourceCache.get(filename);
    if (!source) throw Object.assign(new Error(`Missing cache provenance: ${filename}`), { code: 'ENOENT' });
    if (source.url !== url || source.sha256 !== digest(bytes)) throw new Error(`Cache mismatch: ${filename}`);
    usedSources.set(filename, source);
    return { text: bytes.toString('utf8'), source };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (offline) throw new Error(`Offline cache miss: ${filename}`);
  const response = await fetch(url, {
    headers: { 'User-Agent': 'PoEEquipmentCraftingResearch/1.0' }, signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const source = { url, fetchedAt: new Date().toISOString(), sha256: digest(bytes),
    etag: response.headers.get('etag'), cacheControl: response.headers.get('cache-control') };
  await writeFile(path, bytes);
  usedSources.set(filename, source);
  return { text: bytes.toString('utf8'), source };
}

const leagues = JSON.parse((await get('https://poe.ninja/poe1/api/economy/leagues', 'leagues.json')).text);
if (!leagues.some(entry => entry.id === league)) throw new Error(`${league} is not an active poe.ninja economy league`);
const results = [];
for (const type of types) {
  const response = await get(`https://poe.ninja/poe1/api/economy/exchange/current/overview?league=${encodeURIComponent(league)}&type=${type}`, `${type}.json`);
  results.push({ type, data: JSON.parse(response.text), source: response.source });
}
await writeFile(resolve(outputDir, 'exchange-overviews.json'), JSON.stringify({ schemaVersion: 1, snapshotId, league,
  sources: results.map(({ type, source }) => ({ type, ...source })), overviews: results.map(({ type, data }) => ({ type, data })) }, null, 2) + '\n');
const normalized = normalizeExchangePrices(results);
await writeFile(resolve(outputDir, 'prices.json'), JSON.stringify({ schemaVersion: 1, snapshotId, league,
  sources: results.map(({ type, source }) => ({ type, ...source })), ...normalized,
  limitations: ['Exchange estimates, not executable quotes or guaranteed bulk supply.', 'Self-obtained bases and item intermediates are tracked separately.'] }, null, 2) + '\n');
const sourceFiles = ['leagues', ...types].map(name => `${name}.json`);
const sources = sourceFiles.map(filename => ({
  path: `economies/${snapshotId}/raw/${filename}`,
  ...usedSources.get(filename),
}));
const outputs = await Promise.all(['exchange-overviews.json', 'prices.json'].map(async filename => ({
  path: `economies/${snapshotId}/${filename}`,
  sha256: digest(await readFile(resolve(outputDir, filename))),
})));
await writeFile(manifestPath, JSON.stringify({ schemaVersion: 1, snapshotId, league,
  sources, outputs }, null, 2) + '\n');
console.log(JSON.stringify({ snapshotId, league, types, chaosPerDivine: normalized.chaosPerDivine, prices: normalized.prices.length }, null, 2));
