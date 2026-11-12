import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../docs/poe2-crafting-engine/references/classes/bows/review-2026-09-16/', import.meta.url);
await mkdir(new URL('raw/', root), { recursive: true });
const offline = process.argv.includes('--offline');
const pages = ['Bows', 'Obliterator_Bow', 'Essence', 'Omen', 'Desecrated_Modifiers', 'Minimum_Modifier_Level', 'Currency', 'Greater_Iron_Rune'];
const sources = [];
if (process.argv.includes('--details')) {
  const view = JSON.parse(await readFile(new URL('raw/ModsView.json', root), 'utf8'));
  await mkdir(new URL('raw/hover/', root), { recursive: true });
  const urls = [...new Set(Object.values(view).flatMap(rows => rows && typeof rows === 'object'
    ? Object.values(rows).flatMap(row => row?.hover && row?.ModFamilyList ? [row.hover] : []) : []))];
  for (const url of urls) {
    if (!/^https:\/\/cdn\.poe2db\.tw\/cache2\/us\/Poe_Data_Mods_hover\/[a-f0-9]+$/.test(url)) throw new Error(`Unexpected hover URL: ${url}`);
    const path = `raw/hover/${url.split('/').at(-1)}.html`;
    let bytes;
    try { bytes = await readFile(new URL(path, root)); }
    catch (error) {
      if (offline || error.code !== 'ENOENT') throw error;
      const response = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://poe2db.tw/us/Bows' } });
      if (!response.ok) throw new Error(`${response.status}: ${url}`);
      bytes = Buffer.from(await response.arrayBuffer());
      await writeFile(new URL(path, root), bytes);
    }
    sources.push({ url, path, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  await writeFile(new URL('hover-manifest.json', root), JSON.stringify({ game: 'poe2', collectedAt: new Date().toISOString(), sources }, null, 2));
  console.log(`Saved ${sources.length} modifier details`);
  process.exit(0);
}
for (const page of pages) {
  const url = `https://poe2db.tw/us/${page}`;
  const path = new URL(`raw/${page}.html`, root);
  let bytes;
  if (offline) bytes = await readFile(path);
  else {
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`${response.status}: ${url}`);
    bytes = Buffer.from(await response.arrayBuffer());
    await writeFile(path, bytes);
  }
  sources.push({ url, path: `raw/${page}.html`, sha256: createHash('sha256').update(bytes).digest('hex') });
  console.log(`${page}: ${bytes.length} bytes`);
}
if (!offline) await writeFile(new URL('source-manifest.json', root), JSON.stringify({ game: 'poe2', fetchedAt: new Date().toISOString(), sourcePatch: null, sources }, null, 2));
