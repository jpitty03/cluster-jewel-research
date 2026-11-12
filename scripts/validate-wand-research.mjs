import { readFile, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest } from './lib/poedb-wand-references.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../docs/crafting-engine/references');
const readJson = async path => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const verify = async (path, expected) => {
  const actual = digest(await readFile(resolve(root, path)));
  if (actual !== expected) throw new Error(`Hash mismatch: ${path}`);
};

const rootManifest = await readJson('manifest.json');
let sourceFiles = 0;
let outputFiles = 0;
for (const snapshot of rootManifest.snapshots) {
  const manifest = await readJson(snapshot.manifest);
  if (manifest.snapshotId !== snapshot.snapshotId) throw new Error(`Snapshot ID mismatch: ${snapshot.manifest}`);
  for (const source of manifest.sources ?? []) {
    const path = source.rawPath ?? `${snapshot.rawBase}/${source.filename}`;
    await verify(path, source.sha256);
    sourceFiles++;
  }
  const outputs = manifest.outputs ?? manifest.files ?? (manifest.output ? [manifest.output] : []);
  if (!outputs.length) throw new Error(`No outputs in ${snapshot.manifest}`);
  for (const output of outputs) {
    await verify(output.path, output.sha256);
    outputFiles++;
  }
}

const guideManifest = await readJson('raw/codeberg/recombinators-2026-09-06/manifest.json');
for (const file of guideManifest.files) {
  await verify(`raw/codeberg/recombinators-2026-09-06/${file.filename}`, file.sha256);
  sourceFiles++;
}

for (const artifactPath of ['requests/torment-spire-analysis.json', 'requests/torment-spire-recombination.json',
  'requests/miracle-stinger-analysis.json']) {
  const artifact = await readJson(artifactPath);
  for (const input of artifact.inputs) await verify(input.path, input.sha256);
}

for (const entry of await readdir(resolve(root, 'economies'), { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const manifest = await readJson(`economies/${entry.name}/manifest.json`);
  for (const source of manifest.sources) {
    await verify(source.path, source.sha256);
    sourceFiles++;
  }
  for (const output of manifest.outputs) {
    await verify(output.path, output.sha256);
    outputFiles++;
  }
}

const request = await readJson('requests/torment-spire.json');
const repoe = await readJson('snapshots/repoe-wands-2026-09-06/kinetic-wand.json');
const requestIds = Object.values(request.resolution.canonicalModIds).sort();
const snapshotIds = repoe.targetRecords.map(target => target.modId).sort();
if (JSON.stringify(requestIds) !== JSON.stringify(snapshotIds)) throw new Error('Request and RePoE target IDs differ');

const bowRequest = await readJson('requests/miracle-stinger.json');
const bowRepoe = await readJson('snapshots/repoe-bows-2026-09-06/thicket-bow.json');
const bowRequestIds = bowRequest.target.requiredMods.map(row => row.modId).sort();
const bowSnapshotIds = bowRepoe.targetRecords.map(row => row.modId).sort();
if (JSON.stringify(bowRequestIds) !== JSON.stringify(bowSnapshotIds)) {
  throw new Error('Bow request and RePoE target IDs differ');
}

console.log(JSON.stringify({ snapshots: rootManifest.snapshots.length, sourceFiles, outputFiles,
  generatedArtifacts: 3, canonicalTargets: requestIds.length + bowRequestIds.length, status: 'passed' }, null, 2));
