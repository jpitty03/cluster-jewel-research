import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('../docs/poe2-crafting-engine/references/classes/bows/review-2026-09-16/', import.meta.url);
const html = await readFile(new URL('raw/Bows.html', root), 'utf8');
const marker = html.indexOf('new ModsView(');
if (marker < 0) throw new Error('Missing ModsView');
const start = html.indexOf('{', marker);
let depth = 0, quoted = false, escaped = false, view;
for (let i = start; i < html.length; i++) {
  const c = html[i];
  if (quoted) {
    if (escaped) escaped = false;
    else if (c === '\\') escaped = true;
    else if (c === '"') quoted = false;
  } else if (c === '"') quoted = true;
  else if (c === '{') depth++;
  else if (c === '}' && --depth === 0) { view = JSON.parse(html.slice(start, i + 1)); break; }
}
if (!view) throw new Error('Unterminated ModsView');
await writeFile(new URL('raw/ModsView.json', root), JSON.stringify(view, null, 2));
const plain = value => value.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ');
console.log(JSON.stringify({ pools: Object.fromEntries(Object.entries(view).filter(([, rows]) => Array.isArray(rows)).map(([key, rows]) => [key, rows.length])) }, null, 2));
for (const [pool, rows] of Object.entries(view)) {
  if (!rows || typeof rows !== 'object') continue;
  const matches = Object.entries(rows).filter(([, row]) => row && typeof row.str === 'string' &&
    /Gleaming|Shocking|Bloodthirsty|of the Sniper|of Splintering|of Amanamu/.test(row.Name));
  for (const [key, row] of matches) console.log(JSON.stringify({ pool, key, name: row.Name, level: row.Level, weight: row.DropChance, groups: row.ModFamilyList, text: plain(row.str) }));
}
for (const row of view.desecrated) console.log('DESECRATED', row.Level, row.ModGenerationTypeID, row.DropChance, plain(row.str));
for (const row of view.perfect_essence) console.log('PERFECT', row.Level, row.ModGenerationTypeID, plain(row.str));
