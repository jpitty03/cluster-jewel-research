import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest, tableRecords, buildGroupIndex, modifierRanges } from './lib/poedb-wand-references.mjs';

const args = Object.fromEntries(process.argv.slice(2).flatMap((arg, index, all) =>
  arg.startsWith('--') && all[index + 1] && !all[index + 1].startsWith('--') ? [[arg.slice(2), all[index + 1]]] : []));
const snapshotId = args.snapshot;
const requestFile = args.request;
if (!snapshotId || !requestFile || !/^[a-z0-9-]+$/.test(snapshotId) || !/^[a-z0-9-]+\.json$/.test(requestFile)) {
  throw new Error('Use --snapshot <poedb-snapshot> --request <request.json>');
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../docs/crafting-engine/references');
const readJson = async path => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const prefix = `snapshots/${snapshotId}`;
const rawPrefix = `raw/poedb/${snapshotId.replace(/^poedb-/, '')}`;
const [manifest, data, groups, raw, request] = await Promise.all([
  readJson(`${prefix}/manifest.json`), readJson(`${prefix}/modifiers.json`), readJson(`${prefix}/groups.json`),
  readJson(`${rawPrefix}/ModsView.json`), readJson(`requests/${requestFile}`),
]);
const records = tableRecords(raw);
assert.equal(manifest.coverage.detailFailures, 0);
assert.equal(data.modifiers.length, records.length);
assert.equal(new Set(data.modifiers.map(row => row.recordId)).size, records.length);
assert.deepEqual(groups.groups, buildGroupIndex(data.modifiers));
assert.equal(data.itemClass, request.itemClass);
for (let index = 0; index < records.length; index++) {
  const source = records[index].raw;
  const modifier = data.modifiers[index];
  assert.equal(modifier.source.sourceRecordSha256, digest(JSON.stringify(source)));
  assert.deepEqual(modifier.groups, source.ModFamilyList);
  assert.deepEqual(modifier.tags, source.fossil_no);
  assert.deepEqual(modifier.addsTags, source.adds_no);
  assert.deepEqual(modifier.displayRanges, modifierRanges(source.str));
  assert.ok(Number.isInteger(modifier.tier) && modifier.tier >= 1 && modifier.tier <= modifier.tierCount);
}
for (const source of manifest.sources) {
  assert.equal(digest(await readFile(resolve(root, source.rawPath))), source.sha256, source.rawPath);
}
for (const output of manifest.files) {
  assert.equal(digest(await readFile(resolve(root, output.path))), output.sha256, output.path);
}
for (const required of request.target.requiredMods) {
  const matches = data.modifiers.filter(row => row.sourcePool === required.sourcePool
    && row.name === required.name && row.generationType === required.generationType);
  assert.ok(matches.some(row => row.tier === required.tier && JSON.stringify(row.groups) === JSON.stringify(required.groups)),
    `${required.modId} was not resolved in ${snapshotId}`);
}
console.log(JSON.stringify({ snapshotId, itemClass: data.itemClass, records: records.length,
  groups: Object.keys(groups.groups).length, sourceFiles: manifest.sources.length,
  outputFiles: manifest.files.length, requestedModifiers: request.target.requiredMods.length, status: 'passed' }, null, 2));
