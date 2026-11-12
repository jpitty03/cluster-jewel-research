import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest } from './lib/poedb-wand-references.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../docs/crafting-engine/references/raw/codeberg/recombinators-2026-09-06');
await mkdir(root, { recursive: true });
const rawBase = 'https://codeberg.org/poe_notes/poe_notes/raw/branch/main/';
const manifestPath = resolve(root, 'manifest.json');
let cachedFiles = [];
try {
  cachedFiles = JSON.parse(await readFile(manifestPath, 'utf8')).files ?? [];
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const sourceCache = new Map(cachedFiles.map(file => [file.filename, file.source]));
const usedSources = new Map();
async function get(relative) {
  const filename = basename(relative);
  const path = resolve(root, filename);
  const url = rawBase + relative;
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
  if (process.argv.includes('--offline')) throw new Error(`Offline cache miss: ${filename}`);
  const response = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'WandCraftingResearch/1.0' } });
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(path, bytes);
  usedSources.set(filename, { url, fetchedAt: new Date().toISOString(), sha256: digest(bytes),
    sourceContext: 'User-supplied community guide; describes 3.26 and assumes 3.25 probability table' });
  return bytes;
}
const markdown = (await get('Recombinators.md')).toString('utf8');
const images = [...new Set([...markdown.matchAll(/!\[[^\]]*\]\((img\/[^)]+)\)/g)].map(match => match[1]))];
for (const path of images) await get(path);
const files = ['Recombinators.md', ...images.map(path => basename(path))];
await writeFile(manifestPath, JSON.stringify({ schemaVersion: 1,
  sourceUrl: 'https://codeberg.org/poe_notes/poe_notes/src/branch/main/Recombinators.md',
  scope: 'Guide Markdown and every directly referenced image',
  files: await Promise.all(files.map(async filename => ({ filename, sha256: digest(await readFile(resolve(root, filename))),
    source: usedSources.get(filename) }))),
}, null, 2) + '\n');
console.log(JSON.stringify({ images: images.length, files: files.length }));
