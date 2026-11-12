import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest } from './lib/poedb-wand-references.mjs';

const args = Object.fromEntries(process.argv.slice(2).flatMap((arg, index, all) =>
  arg.startsWith('--') && all[index + 1] && !all[index + 1].startsWith('--') ? [[arg.slice(2), all[index + 1]]] : []));
const offline = process.argv.includes('--offline');
const baseName = args['base-name'];
const requestName = args.request;
const snapshotId = args.snapshot;
if (!baseName || !requestName || !snapshotId) throw new Error('Usage: --base-name <name> --request <file> --snapshot <id> [--offline]');
if (!/^[a-z0-9-]+$/.test(snapshotId) || !/^[a-z0-9-]+\.json$/.test(requestName)) throw new Error('Invalid snapshot or request name');

const references = resolve(dirname(fileURLToPath(import.meta.url)), '../docs/crafting-engine/references');
const observationDate = snapshotId.match(/\d{4}-\d{2}-\d{2}$/)?.[0];
const rawName = args['source-cache'] ?? (observationDate ? `source-${observationDate}` : null);
if (!rawName || !/^[a-z0-9.-]+$/.test(rawName)) throw new Error('Use a dated --source-cache when the snapshot has no date');
const rawDir = resolve(references, 'raw/repoe', rawName);
const outputDir = resolve(references, 'snapshots', snapshotId);
await mkdir(rawDir, { recursive: true });
await mkdir(outputDir, { recursive: true });
const cacheManifestPath = resolve(rawDir, 'manifest.json');
let cachedSources = [];
try {
  cachedSources = JSON.parse(await readFile(cacheManifestPath, 'utf8')).sources ?? [];
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const sourceCache = new Map(cachedSources.map(source => [source.filename, source]));
const usedSources = new Map();

async function get(url, filename) {
  const path = resolve(rawDir, filename);
  try {
    const bytes = await readFile(path);
    const source = sourceCache.get(filename);
    if (!source) throw Object.assign(new Error(`Missing cache provenance: ${filename}`), { code: 'ENOENT' });
    if (source.url !== url || source.sha256 !== digest(bytes)) throw new Error(`Cache mismatch: ${filename}`);
    usedSources.set(filename, source);
    return bytes;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (offline) throw new Error(`Offline cache miss: ${filename}`);
  const response = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'PoEEquipmentCraftingResearch/1.0' } });
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(path, bytes);
  const source = {
    url, fetchedAt: new Date().toISOString(), sha256: digest(bytes), contentType: response.headers.get('content-type'), etag: response.headers.get('etag'),
  };
  usedSources.set(filename, { filename, ...source });
  return bytes;
}

const requestPath = resolve(references, 'requests', requestName);
const request = JSON.parse(await readFile(requestPath, 'utf8'));
const indexBytes = await get('https://repoe-fork.github.io/data-formats/', 'data-formats.html');
const gameVersion = indexBytes.toString('utf8').match(/PoE version\s+([0-9.]+)/)?.[1];
if (!gameVersion) throw new Error('Could not resolve RePoE game version');
await get('https://raw.githubusercontent.com/repoe-fork/repoe/master/RePoE/docs/mods.md', 'mods-docs.md');
const modsBytes = await get('https://repoe-fork.github.io/mods.json', 'mods.json');
const basesBytes = await get('https://repoe-fork.github.io/base_items.json', 'base_items.json');
const mods = JSON.parse(modsBytes);
const bases = JSON.parse(basesBytes);
const baseEntry = Object.entries(bases).find(([, base]) => base.name === baseName);
if (!baseEntry) throw new Error(`${baseName} missing from RePoE`);
const [baseId, base] = baseEntry;
const excludedImplicitTags = new Set(request.generationRestrictions?.excludedImplicitTags ?? []);

function firstWeight(weights, tags, emptyValue) {
  if (!Array.isArray(weights)) throw new Error('Invalid RePoE weight array');
  if (weights.length === 0) return emptyValue;
  return weights.find(entry => tags.has(entry.tag))?.weight ?? null;
}

const baseTags = new Set(base.tags);
const ordinary = Object.entries(mods).flatMap(([modId, mod]) => {
  if (mod.domain !== 'item' || !['prefix', 'suffix'].includes(mod.generation_type)
    || mod.required_level > request.referenceItemLevel || mod.is_essence_only
    || (mod.implicit_tags ?? []).some(tag => excludedImplicitTags.has(tag))) return [];
  const spawnWeight = firstWeight(mod.spawn_weights, baseTags, null);
  const generationPercent = firstWeight(mod.generation_weights, baseTags, 100);
  if (!(spawnWeight > 0) || !(generationPercent >= 0)) return [];
  const adjustedWeight = spawnWeight * generationPercent / 100;
  return adjustedWeight > 0 ? [{ modId, ...mod, spawnWeight, generationPercent, adjustedWeight }] : [];
});
const targetIds = new Set([
  ...request.target.requiredMods.map(mod => mod.modId).filter(Boolean),
  ...Object.values(request.resolution?.canonicalModIds ?? {}).filter(Boolean),
]);
const targetRecords = [...targetIds].map(modId => {
  const mod = mods[modId];
  if (!mod) throw new Error(`Target modifier missing from RePoE: ${modId}`);
  const ordinaryRecord = ordinary.find(candidate => candidate.modId === modId);
  return { modId, ...mod, ordinaryOnBase: Boolean(ordinaryRecord),
    spawnWeight: ordinaryRecord?.spawnWeight ?? null,
    generationPercent: ordinaryRecord?.generationPercent ?? null,
    adjustedWeight: ordinaryRecord?.adjustedWeight ?? null };
});
const baseSlug = baseName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const outputName = `${baseSlug}.json`;
const dataset = {
  schemaVersion: 1, snapshotId, game: 'poe1', gameVersion, source: 'RePoE fork generated from game data',
  baseId, base, actionContext: { itemLevel: request.referenceItemLevel, rarity: 'magic',
    excludedImplicitTags: [...excludedImplicitTags], emptyGenerationWeights: 'neutral 100%, per RePoE documentation' },
  ordinaryModifierCount: ordinary.length, ordinary, targetRecords,
  limitations: [
    `The ordinary list is filtered for an empty item-level ${request.referenceItemLevel} ${baseName}; later existing groups and action rules require reevaluation.`,
    'Source-only target records are retained even when they cannot spawn ordinarily on the base.',
    'Relative weights do not supply affix-count or action-specific outcome distributions.',
    'RePoE is a community extraction of game data.',
  ],
};
await writeFile(resolve(outputDir, outputName), JSON.stringify(dataset, null, 2) + '\n');
const sourceNames = ['data-formats.html', 'mods-docs.md', 'mods.json', 'base_items.json'];
const cacheSources = sourceNames.map(filename => ({ filename, ...usedSources.get(filename) }));
await writeFile(cacheManifestPath, JSON.stringify({ schemaVersion: 1, sourceCache: rawName, sources: cacheSources }, null, 2) + '\n');
const sources = cacheSources.map(source => ({ ...source, rawPath: `raw/repoe/${rawName}/${source.filename}` }));
const manifest = { schemaVersion: 1, snapshotId, gameVersion, importer: 'scripts/collect-repoe-equipment-data.mjs', sources,
  output: { path: `snapshots/${snapshotId}/${outputName}`, sha256: digest(await readFile(resolve(outputDir, outputName))) } };
await writeFile(resolve(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
const rootManifestPath = resolve(references, 'manifest.json');
const rootManifest = JSON.parse(await readFile(rootManifestPath, 'utf8'));
rootManifest.snapshots = rootManifest.snapshots.filter(snapshot => snapshot.snapshotId !== snapshotId);
rootManifest.snapshots.push({ snapshotId, game: 'poe1', sourcePatch: gameVersion, rawBase: `raw/repoe/${rawName}`,
  manifest: `snapshots/${snapshotId}/manifest.json` });
await writeFile(rootManifestPath, JSON.stringify(rootManifest, null, 2) + '\n');
console.log(JSON.stringify({ snapshotId, gameVersion, baseId, ordinaryModifiers: ordinary.length,
  targets: targetRecords.map(mod => ({ modId: mod.modId, ordinaryOnBase: mod.ordinaryOnBase })) }, null, 2));
