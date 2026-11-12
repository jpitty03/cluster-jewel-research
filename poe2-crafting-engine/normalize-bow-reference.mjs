import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { parseClipboard } from './engine.mjs';
const root = new URL('../docs/poe2-crafting-engine/references/classes/bows/review-2026-09-16/', import.meta.url);
const view = JSON.parse(await readFile(new URL('raw/ModsView.json', root), 'utf8'));
const plain = value => value.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
const records = [];
for (const [pool, rows] of Object.entries(view)) {
  if (!Array.isArray(rows)) continue;
  for (const [index, row] of rows.entries()) {
    if (!row.ModFamilyList || typeof row.str !== 'string') continue;
    let detail = null;
    try { if (row.hover) detail = await readFile(new URL(`raw/hover/${row.hover.split('/').at(-1)}.html`, root), 'utf8'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const fields = detail ? Object.fromEntries([...detail.matchAll(/<tr>\s*<th>(.*?)<td>(.*?)(?=<tr>|<\/table>)/gs)].map(([, key, value]) => [plain(key), plain(value)])) : null;
    records.push({ recordId: `poe2db:Bows:${pool}:${index}`, pool, sourceIndex: index,
      name: row.Name ?? null, level: Number(row.Level), side: ({ 1: 'prefix', 2: 'suffix' })[row.ModGenerationTypeID] ?? null,
      groups: row.ModFamilyList, description: plain(row.str), pageWeight: row.DropChance === undefined ? null : Number(row.DropChance),
      tags: row.fossil_no ?? null, spawnTags: row.spawn_no ?? null,
      sourceTier: row.Tier ?? null, canonicalModId: null, detailFields: fields,
      hoverUrl: row.hover, sourceUrl: 'https://poe2db.tw/us/Bows',
    });
  }
}
await writeFile(new URL('modifiers.json', root), JSON.stringify({ game: 'poe2', itemClass: 'Bows', sourcePatch: null,
  scope: 'All modifier rows exposed by the fetched bow ModsView, including unwanted tiers and special pools. Page weights are not certified action probabilities. Canonical IDs unresolved.', records }, null, 2));
await writeFile(new URL('bases.json', root), JSON.stringify({ game: 'poe2', bases: [{
  name: 'Obliterator Bow', baseId: 'Metadata/Items/Weapons/TwoHandWeapons/Bows/FourBow9Endgame',
  itemClass: 'Bows', tags: ['default', 'weapon', 'twohand', 'bow', 'ranged', 'two_hand_weapon'],
  requiredLevel: 78, dexterity: 163, attacksPerSecond: 1.1, criticalChance: 5,
  implicit: '50% reduced Projectile Range', sourceUrl: 'https://poe2db.tw/us/Obliterator_Bow'
}] }, null, 2));
const targetNames = ['Gleaming', 'Shocking', 'Bloodthirsty', 'of the Sniper', 'of Splintering'];
const targets = records.filter(row => row.pool === 'normal' && targetNames.includes(row.name));
targets.push(records.find(row => row.pool === 'desecrated' && row.groups.includes('CompanionAttackSpeed') && row.name === 'of Amanamu'));
if (targets.length !== 6 || targets.some(row => !row)) throw new Error('Unresolved target');
const tiers = [5, 4, 4, 1, 3, 1];
// Explicit path independent of pool nesting.
const requestRoot = new URL('../docs/poe2-crafting-engine/references/requests/morbid-siege/', import.meta.url);
await mkdir(requestRoot, { recursive: true });
const request = { schemaVersion: 1, game: 'poe2', status: 'target-resolved-routes-conditional',
  rawItemText: await readFile(new URL('item.txt', requestRoot), 'utf8'),
  context: { patch: '0.5.5b-observed', league: null, mode: null, realm: null },
  intent: 'reproduce-target-assumed',
  target: { base: 'Obliterator Bow', sourceItemLevel: 82, minimumNaturalModifierLevel: 81,
    interpretation: 'same-modifier-tiers-any-rolls-assumed', modifiers: targets.map((row, i) => ({ ...row, clipboardTier: tiers[i] })),
    runePhysicalPercent: 36, sockets: 2, corrupted: false, sanctified: false },
  benchmark: { currency: 'divine', amount: 75, source: 'user clipboard listing; availability not verified' },
  budget: null, acquisition: null,
  unresolved: ['league-mode-platform', 'acquisition-rules', 'exact-versus-minimum-target-confirmation', 'live-prices', 'action-kernel-validation'] };
try {
  const preferences = JSON.parse(await readFile(new URL('preferences.json', requestRoot), 'utf8'));
  Object.assign(request.context, { league: preferences.league, mode: preferences.mode, realm: preferences.realm });
  request.target.interpretation = preferences.targetInterpretation;
  request.acquisition = { buyUsefulBases: preferences.buyUsefulBases, buyUsefulIntermediates: preferences.buyUsefulIntermediates };
  request.unresolved = ['live-intermediate-listings', 'game-validation-of-simulator-probabilities'];
} catch (error) { if (error.code !== 'ENOENT') throw error; }
await writeFile(new URL('request.json', requestRoot), JSON.stringify(request, null, 2));
await writeFile(new URL('intake.json', requestRoot), JSON.stringify(parseClipboard(request.rawItemText), null, 2));
const summary = { records: records.length, details: records.filter(row => row.detailFields).length,
  targets: targets.map(row => ({ id: row.recordId, level: row.level, weight: row.pageWeight, description: row.description })),
  ordinaryPrefixWeightIlvl82: records.filter(row => row.pool === 'normal' && row.side === 'prefix' && row.level <= 82).reduce((a, row) => a + row.pageWeight, 0),
  ordinarySuffixWeightIlvl82: records.filter(row => row.pool === 'normal' && row.side === 'suffix' && row.level <= 82).reduce((a, row) => a + row.pageWeight, 0) };
console.log(JSON.stringify(summary, null, 2));
