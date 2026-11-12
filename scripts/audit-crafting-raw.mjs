import { createHash } from 'node:crypto';
import { readdir, readFile, rm, stat } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const prune = process.argv.includes('--prune-migrated');
const references = resolve(dirname(fileURLToPath(import.meta.url)), '../docs/crafting-engine/references');
const rawRoot = resolve(references, 'raw');
const toPosix = path => path.replaceAll('\\', '/');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

async function filesBelow(root) {
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) files.push(...await filesBelow(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

function rawRelative(path) {
  const local = relative(references, path);
  if (local.startsWith('..') || resolve(references, local) !== path) throw new Error(`Path escaped references: ${path}`);
  return toPosix(local);
}

const referenced = new Set();
const sourceByPath = new Map();
const rootManifest = JSON.parse(await readFile(resolve(references, 'manifest.json'), 'utf8'));
for (const snapshot of rootManifest.snapshots) {
  const manifest = JSON.parse(await readFile(resolve(references, snapshot.manifest), 'utf8'));
  for (const source of manifest.sources ?? []) {
    const path = source.rawPath ?? `${snapshot.rawBase}/${source.filename}`;
    referenced.add(path);
    sourceByPath.set(path, source);
  }
  for (const derived of manifest.derivedRaw ?? []) {
    referenced.add(derived.path);
    sourceByPath.set(derived.path, derived);
  }
}

const economyRoot = resolve(references, 'economies');
for (const path of await filesBelow(economyRoot)) {
  if (path.endsWith(`${sep}manifest.json`)) {
    const manifest = JSON.parse(await readFile(path, 'utf8'));
    for (const source of manifest.sources ?? []) {
      if (source.path?.startsWith('economies/') && source.path.includes('/raw/')) {
        referenced.add(source.path);
        sourceByPath.set(source.path, source);
      }
    }
  }
}

const requestsRoot = resolve(references, 'requests');
for (const path of await filesBelow(requestsRoot)) {
  if (!path.endsWith('.json')) continue;
  const document = JSON.parse(await readFile(path, 'utf8'));
  for (const input of document.inputs ?? []) {
    if (input.path?.startsWith('raw/')) {
      referenced.add(input.path);
      sourceByPath.set(input.path, input);
    }
  }
}

for (const path of await filesBelow(rawRoot)) {
  if (!path.endsWith(`${sep}manifest.json`)) continue;
  const manifestPath = rawRelative(path);
  referenced.add(manifestPath);
  const manifest = JSON.parse(await readFile(path, 'utf8'));
  for (const file of [...(manifest.sources ?? []), ...(manifest.files ?? [])]) {
    if (!file.filename) continue;
    const sourcePath = toPosix(`${dirname(manifestPath)}/${file.filename}`);
    referenced.add(sourcePath);
    sourceByPath.set(sourcePath, file.source ?? file);
  }
}

async function verifyReferencedSources() {
  for (const path of referenced) {
    const absolute = resolve(references, path);
    if (relative(references, absolute).startsWith('..')) continue;
    const bytes = await readFile(absolute);
    const expected = sourceByPath.get(path)?.sha256;
    if (expected && digest(bytes) !== expected) throw new Error(`Manifest hash mismatch: ${path}`);
  }
}

await verifyReferencedSources();

let removedSidecars = 0;
let removedLegacyBytes = 0;
const readEconomyRawFiles = async () => (await filesBelow(economyRoot))
  .filter(path => toPosix(relative(economyRoot, path)).split('/').includes('raw'));
let economyRawFiles = await readEconomyRawFiles();
if (prune) {
  for (const path of [...await filesBelow(rawRoot), ...economyRawFiles]) {
    if (!path.endsWith('.source.json')) continue;
    const contentPath = path.slice(0, -'.source.json'.length);
    const contentRelative = rawRelative(contentPath);
    const metadata = JSON.parse(await readFile(path, 'utf8'));
    const expected = sourceByPath.get(contentRelative);
    const actualHash = digest(await readFile(contentPath));
    if (!referenced.has(contentRelative) || !expected?.sha256 || metadata.sha256 !== expected.sha256
      || actualHash !== expected.sha256) {
      throw new Error(`Refusing to prune unverified sidecar: ${rawRelative(path)} (${JSON.stringify({
        referenced: referenced.has(contentRelative), metadata: metadata.sha256, expected: expected?.sha256, actual: actualHash,
      })})`);
    }
    await rm(path);
    removedSidecars++;
  }

  const repoeRoot = resolve(rawRoot, 'repoe');
  const retainedHashes = new Set();
  for (const path of referenced) {
    if (path.startsWith('raw/repoe/')) retainedHashes.add(digest(await readFile(resolve(references, path))));
  }
  for (const entry of await readdir(repoeRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('source-')) continue;
    const candidate = resolve(repoeRoot, entry.name);
    if (relative(repoeRoot, candidate).startsWith('..') || candidate === repoeRoot) throw new Error(`Unsafe RePoE path: ${candidate}`);
    const files = await filesBelow(candidate);
    for (const path of files.filter(path => !path.endsWith('.source.json'))) {
      if (!retainedHashes.has(digest(await readFile(path)))) throw new Error(`Legacy RePoE file is not retained: ${rawRelative(path)}`);
    }
    removedLegacyBytes += (await Promise.all(files.map(path => stat(path)))).reduce((sum, value) => sum + value.size, 0);
    await rm(candidate, { recursive: true });
  }
}

if (prune) economyRawFiles = await readEconomyRawFiles();
const rawFiles = [...await filesBelow(rawRoot), ...economyRawFiles];
const actualFiles = rawFiles.filter(path => !path.endsWith('.source.json'));
const sidecars = rawFiles.filter(path => path.endsWith('.source.json'));
const allowedSidecars = new Set(sidecars.flatMap(path => {
  const content = rawRelative(path.slice(0, -'.source.json'.length));
  return referenced.has(content) ? [rawRelative(path)] : [];
}));
const unreferenced = actualFiles.map(rawRelative).filter(path => !referenced.has(path));
const orphanSidecars = sidecars.map(rawRelative).filter(path => !allowedSidecars.has(path));

const hashGroups = new Map();
for (const path of actualFiles) {
  const bytes = await readFile(path);
  const hash = digest(bytes);
  const record = hashGroups.get(hash) ?? { bytes: bytes.length, paths: [] };
  record.paths.push(rawRelative(path));
  hashGroups.set(hash, record);
}
const largeDuplicates = [...hashGroups.values()].filter(group => group.bytes >= 1024 * 1024 && group.paths.length > 1);
const bytes = (await Promise.all(rawFiles.map(path => stat(path)))).reduce((sum, value) => sum + value.size, 0);
const report = {
  files: rawFiles.length,
  bytes,
  referencedSourceFiles: referenced.size,
  retainedCacheSidecars: allowedSidecars.size,
  unreferenced,
  orphanSidecars,
  largeDuplicates,
  pruned: { sourceSidecars: removedSidecars, legacyRepoeBytes: removedLegacyBytes },
};
console.log(JSON.stringify(report, null, 2));
if (unreferenced.length || orphanSidecars.length || largeDuplicates.length) process.exitCode = 1;
