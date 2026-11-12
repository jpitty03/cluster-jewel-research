import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest, tableRecords, buildGroupIndex, modifierRanges } from './lib/poedb-wand-references.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../docs/crafting-engine/references');
const snapshotId = process.env.POEDB_WAND_SNAPSHOT ?? 'poedb-wands-2026-09-06';
assert.match(snapshotId, /^[a-z0-9-]+$/);
const readJson = async path => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const prefix = `snapshots/${snapshotId}/`;
const manifest = await readJson(`${prefix}manifest.json`);
const data = await readJson(`${prefix}modifiers.json`);
const groups = await readJson(`${prefix}groups.json`);
const raw = await readJson(`raw/poedb/${snapshotId.replace(/^poedb-/, '')}/ModsView.json`);
const records = tableRecords(raw);
assert.equal(manifest.coverage.detailFailures, 0);
assert.equal(data.sourcePatch, null);
assert.equal(data.modifiers.length, records.length);
assert.equal(new Set(data.modifiers.map(mod => mod.recordId)).size, records.length);
assert.deepEqual(groups.groups, buildGroupIndex(data.modifiers));
const sourceUrls = new Set(manifest.sources.map(source => source.url));
for (let i = 0; i < records.length; i++) {
  const source = records[i].raw;
  const mod = data.modifiers[i];
  assert.equal(mod.source.sourceRecordSha256, digest(JSON.stringify(source)));
  assert.deepEqual(mod.groups, source.ModFamilyList);
  assert.deepEqual(mod.tags, source.fossil_no);
  assert.deepEqual(mod.sourceSpawnTags, source.spawn_no);
  assert.deepEqual(mod.addsTags, source.adds_no);
  assert.deepEqual(mod.displayRanges, modifierRanges(source.str));
  assert.ok(Number.isInteger(mod.tier) && mod.tier >= 1 && mod.tier <= mod.tierCount);
  assert.ok(Number.isInteger(mod.requiredItemLevel) && mod.requiredItemLevel >= 0);
  assert.ok(mod.source.detailAvailable);
  assert.ok(sourceUrls.has(source.hover.startsWith('?') ? `https://poedb.tw/us/hover${source.hover}` : source.hover), `Missing source provenance: ${source.hover}`);
  assert.equal(mod.pageWeight, source.DropChance === undefined ? null : Number(source.DropChance));
  for (const weights of [mod.spawnWeights, mod.generationWeights]) {
    if (weights !== null) for (const entry of weights) {
      assert.equal(typeof entry.tag, 'string');
      assert.ok(Number.isFinite(entry.weight) && entry.weight >= 0);
    }
  }
  for (const range of [...mod.displayRanges, ...(mod.stats ?? [])]) {
    assert.ok(Number.isFinite(range.min) && Number.isFinite(range.max) && range.min <= range.max);
  }
}
for (const source of manifest.sources) {
  assert.equal(digest(await readFile(resolve(root, source.rawPath))), source.sha256, source.rawPath);
}
for (const file of manifest.files) {
  assert.equal(digest(await readFile(resolve(root, file.path))), file.sha256, file.path);
}
const request = await readJson('requests/torment-spire.json');
for (const required of request.target.requiredMods) {
  const matches = data.modifiers.filter(mod => mod.sourcePool === required.sourcePool && mod.name === required.name);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].tier, required.tier);
  assert.deepEqual(matches[0].groups, required.groups);
}
console.log(JSON.stringify({
  snapshotId, records: data.modifiers.length, groups: Object.keys(groups.groups).length,
  verifiedSourceFiles: manifest.sources.length, verifiedOutputFiles: manifest.files.length,
  canonicalModIds: manifest.coverage.canonicalModIds,
  missingCanonicalModIds: data.modifiers.filter(mod => mod.modId === null).length,
  missingSpawnWeights: data.modifiers.filter(mod => mod.spawnWeights === null).length,
  missingGenerationWeights: data.modifiers.filter(mod => mod.generationWeights === null).length,
  status: 'passed',
}, null, 2));
