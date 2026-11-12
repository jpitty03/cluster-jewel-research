import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tableRecords, parseDetail, normalizeModifiers, buildGroupIndex, parseEquipmentBase, parseWeaponEnchants } from './lib/poedb-wand-references.mjs';

const args = Object.fromEntries(process.argv.slice(2).flatMap((arg, index, all) =>
  arg.startsWith('--') && all[index + 1] && !all[index + 1].startsWith('--') ? [[arg.slice(2), all[index + 1]]] : []));
const offline = process.argv.includes('--offline');
const classPage = args['class-page'] ?? process.env.POEDB_CLASS_PAGE;
const itemClass = args['item-class'] ?? process.env.POEDB_ITEM_CLASS ?? classPage;
const basePage = args['base-page'] ?? process.env.POEDB_BASE_PAGE;
const baseName = args['base-name'] ?? process.env.POEDB_BASE_NAME;
const snapshotId = args.snapshot ?? process.env.POEDB_EQUIPMENT_SNAPSHOT;
const enchantPage = args['enchant-page'];
const baseImplicit = args['base-implicit'];
for (const [key, value] of Object.entries({ classPage, itemClass, basePage, baseName, snapshotId })) {
  if (!value) throw new Error(`Missing --${key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`);
}
if (!/^[A-Za-z0-9_]+$/.test(classPage) || !/^[A-Za-z0-9_]+$/.test(basePage)) throw new Error('Invalid PoEDB page name');
if (!/^[a-z0-9-]+$/.test(snapshotId)) throw new Error('Invalid snapshot ID');

const references = resolve(dirname(fileURLToPath(import.meta.url)), '../docs/crafting-engine/references');
const rawName = snapshotId.replace(/^poedb-/, '');
const rawDir = resolve(references, 'raw/poedb', rawName);
const normalizedDir = resolve(references, 'snapshots', snapshotId);
await mkdir(rawDir, { recursive: true });
await mkdir(normalizedDir, { recursive: true });
const sha256 = data => createHash('sha256').update(data).digest('hex');
const classUrl = `https://poedb.tw/us/${classPage}`;
const baseUrl = `https://poedb.tw/us/${basePage}`;
const manifestPath = resolve(normalizedDir, 'manifest.json');
let previousSources = [];
try {
  previousSources = JSON.parse(await readFile(manifestPath, 'utf8')).sources ?? [];
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const rawPrefix = `raw/poedb/${rawName}/`;
const cachedSources = new Map(previousSources.flatMap(source =>
  source.rawPath?.startsWith(rawPrefix) ? [[source.rawPath.slice(rawPrefix.length), source]] : []));
const usedSources = new Map();

function cachedSource(filename) {
  const normalizedFilename = filename.replaceAll('\\', '/');
  return cachedSources.get(normalizedFilename) ?? null;
}

async function download(url, filename) {
  const path = resolve(rawDir, filename);
  try {
    const bytes = await readFile(path);
    const source = cachedSource(filename);
    if (!source) throw Object.assign(new Error(`Missing cache provenance: ${filename}`), { code: 'ENOENT' });
    if (source.url !== url || source.sha256 !== sha256(bytes)) throw new Error(`Cache provenance mismatch: ${filename}`);
    usedSources.set(filename.replaceAll('\\', '/'), source);
    return bytes.toString('utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (offline) throw new Error(`Offline cache miss: ${filename}`);
  const response = await fetch(url, {
    signal: AbortSignal.timeout(60000),
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PoEEquipmentReferenceCollector/1.0)', Referer: classUrl },
  });
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(path, bytes);
  const source = {
    url, fetchedAt: new Date().toISOString(), sha256: sha256(bytes),
    contentType: response.headers.get('content-type'), game: 'poe1', sourcePatch: null,
  };
  usedSources.set(filename.replaceAll('\\', '/'), source);
  await new Promise(done => setTimeout(done, 100));
  return bytes.toString('utf8');
}

function extractModsView(html) {
  const marker = html.indexOf('new ModsView(');
  if (marker < 0) throw new Error('Missing ModsView data');
  const start = html.indexOf('{', marker);
  let depth = 0, inString = false, escaped = false;
  for (let index = start; index < html.length; index++) {
    const character = html[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
    } else if (character === '"') inString = true;
    else if (character === '{') depth++;
    else if (character === '}' && --depth === 0) return JSON.parse(html.slice(start, index + 1));
  }
  throw new Error('Unterminated ModsView data');
}

const html = await download(classUrl, `${classPage}.html`);
const view = extractModsView(html);
await writeFile(resolve(rawDir, 'ModsView.json'), JSON.stringify(view, null, 2) + '\n');
const scriptUrl = html.match(/src="(https:\/\/cdn\.poedb\.tw\/js\/ModsView\.[^"]+\.js)"/)?.[1];
if (!scriptUrl) throw new Error('Missing ModsView script URL');
await download(scriptUrl, 'ModsView.js');
await download(baseUrl, `${basePage}.html`);
let weaponEnchantments = null;
if (enchantPage) {
  const enchantUrl = `https://poedb.tw/us/${enchantPage}`;
  weaponEnchantments = parseWeaponEnchants(await download(enchantUrl, `${enchantPage}.html`));
}
await mkdir(resolve(rawDir, 'hover'), { recursive: true });

const urls = [...new Set(tableRecords(view).map(record => record.raw.hover).filter(Boolean))];
const details = new Map();
const failures = [];
let next = 0, completed = 0;
async function worker() {
  while (next < urls.length) {
    const url = urls[next++];
    const isCdn = /^https:\/\/cdn\.poedb\.tw\/cache1\/us\/Poe_Data_Mods_hover\/[a-f0-9]+$/.test(url);
    const isLegacy = url.startsWith('?s=') && /^Data[\\/]Mods[\\/][A-Za-z0-9_]+$/.test(decodeURIComponent(url.slice(3)));
    if (!isCdn && !isLegacy) throw new Error(`Unexpected detail URL: ${url}`);
    try {
      const body = await download(isLegacy ? `https://poedb.tw/us/hover${url}` : url,
        `hover/${isLegacy ? sha256(url) : url.split('/').at(-1)}.html`);
      details.set(url, parseDetail(body));
    } catch (error) {
      failures.push({ url, error: error.message });
    }
    completed++;
    if (completed % 100 === 0 || completed === urls.length) console.log(`Detail records: ${completed}/${urls.length}; failures: ${failures.length}`);
  }
}
await Promise.all(Array.from({ length: 4 }, () => worker()));

const modifiers = normalizeModifiers(view, details, { itemClass, sourceUrl: classUrl, numericIdFields: [`${itemClass.replaceAll(' ', '')}ModsID`] });
const pools = Object.fromEntries(Object.keys(view.config).filter(pool => view[pool] !== undefined)
  .map(pool => [pool, modifiers.filter(mod => mod.sourcePool === pool).length]));
const baseSource = usedSources.get(`${classPage}.html`);
const dataset = {
  schemaVersion: 1, snapshotId, game: 'poe1', sourcePatch: null,
  requestedRulesetContext: 'poe1-3.29.3b', requestedLeagueContext: 'Allflame softcore trade',
  patchVerification: 'unknown: current PoEDB fetch is not proof of an exact game patch',
  fetchedAt: baseSource.fetchedAt, itemClass, sourceUrl: classUrl, poolCounts: pools, modifierCount: modifiers.length,
  tierMethod: 'PoEDB ModsView UI method: descending distinct levels per pool/generation/first group. sourceTier remains source-specific.',
  limitations: [
    'recordId is a local locator; canonical IDs are present only when exposed by the source URL.',
    'All source pools are catalogued; presence does not establish current action availability.',
    'pageWeight is a class-page weight, not a probability or base-adjusted weight.',
    'Apply ordered weights, base tags, item level, existing groups and the selected action before calculating probabilities.',
    'Null means not exposed and must not be treated as zero or uniform.',
  ],
  modifiers,
};
const outputs = {
  'modifiers.json': dataset,
  'groups.json': { schemaVersion: 1, snapshotId, rule: 'Check every group for conflicts, then apply action and generation-layer rules.', groups: buildGroupIndex(modifiers) },
  'base-types.json': { schemaVersion: 1, snapshotId, bases: [parseEquipmentBase(
    await readFile(resolve(rawDir, `${basePage}.html`), 'utf8'), { name: baseName, itemClass, sourceUrl: baseUrl,
      implicit: baseImplicit ? { description: baseImplicit, group: `${baseName.replaceAll(' ', '')}Implicit`, modId: null,
        interpretation: 'base implicit, not an explicit affix' } : null })] },
  'detail-failures.json': failures,
};
if (weaponEnchantments) outputs['weapon-enchantments.json'] = {
  schemaVersion: 1, snapshotId, enchantments: weaponEnchantments,
};
for (const [filename, value] of Object.entries(outputs)) {
  await writeFile(resolve(normalizedDir, filename), JSON.stringify(value, null, 2) + '\n');
}
const sources = [...usedSources.entries()].sort(([left], [right]) => left.localeCompare(right))
  .map(([rawPath, data]) => ({ ...data, rawPath: `${rawPrefix}${rawPath}` }));
const modsViewPath = resolve(rawDir, 'ModsView.json');
const manifest = {
  schemaVersion: 1, snapshotId, game: 'poe1', sourcePatch: null, fetchedAt: baseSource.fetchedAt,
  extractionMethod: `${itemClass} ModsView JSON + public modifier detail HTML + ${baseName} HTML`,
  evidenceStatus: 'datamined-via-poedb', importer: 'scripts/scrape-equipment-references.mjs',
  coverage: { itemClasses: [itemClass], ordinaryModifiers: pools.normal, allModifierRecords: modifiers.length,
    uniqueDetailUrls: urls.length, parsedDetails: details.size, detailFailures: failures.length,
    canonicalModIds: modifiers.filter(mod => mod.modId !== null).length },
  files: await Promise.all(Object.keys(outputs).map(async filename => ({
    path: `snapshots/${snapshotId}/${filename}`, sha256: sha256(await readFile(resolve(normalizedDir, filename))),
  }))),
  derivedRaw: [{ path: `${rawPrefix}ModsView.json`, sha256: sha256(await readFile(modsViewPath)) }],
  sources,
};
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
const indexPath = resolve(references, 'manifest.json');
const index = JSON.parse(await readFile(indexPath, 'utf8'));
index.snapshots = index.snapshots.filter(snapshot => snapshot.snapshotId !== snapshotId);
index.snapshots.push({ snapshotId, game: 'poe1', sourcePatch: null, rawBase: `raw/poedb/${rawName}`, manifest: `snapshots/${snapshotId}/manifest.json` });
await writeFile(indexPath, JSON.stringify(index, null, 2) + '\n');
console.log(JSON.stringify({ snapshotId, itemClass, modifiers: modifiers.length, pools, detailUrls: urls.length,
  parsedDetails: details.size, failures: failures.slice(0, 5) }, null, 2));
if (failures.length) process.exitCode = 1;
