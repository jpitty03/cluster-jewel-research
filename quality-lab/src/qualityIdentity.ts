import { createHash } from 'node:crypto';
import {
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { QUALITY_GATE_REGISTRY } from './gateRegistry.ts';
import {
  QUALITY_HARNESS_VERSION,
  type FixtureCorpusRecord,
  type QualitySuiteIdentity,
} from './qualityTypes.ts';

const repositoryRoot = resolve(import.meta.dirname, '..', '..');
const qualityDirectory = join(repositoryRoot, 'quality-lab');

function digest(parts: readonly (string | Buffer)[]): string {
  const hash = createHash('sha256');
  for (const part of parts) hash.update(part);
  return hash.digest('hex');
}

function stableJson(value: unknown): string {
  if (value === undefined) return '"__undefined__"';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
}

function filesUnder(path: string): string[] {
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path, { withFileTypes: true })
    .flatMap((entry) => {
      const child = join(path, entry.name);
      return entry.isDirectory() ? filesUnder(child) : [child];
    });
}

function hashFiles(paths: readonly string[]): string {
  const files = paths.flatMap((path) => filesUnder(path))
    .sort((left, right) => left.localeCompare(right));
  return digest(files.flatMap((path) => [relative(repositoryRoot, path).replaceAll('\\', '/'), '\0', readFileSync(path), '\0']));
}

function chromiumVersion(): string {
  const browsers = JSON.parse(readFileSync(
    join(qualityDirectory, 'node_modules', 'playwright-core', 'browsers.json'),
    'utf8',
  )) as { browsers: Array<{ name: string; browserVersion?: string; revision: string }> };
  const chromium = browsers.browsers.find((browser) => browser.name === 'chromium');
  const browserVersion = chromium?.browserVersion;
  assertChromium(browserVersion, chromium?.revision);
  return browserVersion;
}

function assertChromium(
  browserVersion: string | undefined,
  revision: string | undefined,
): asserts browserVersion is string {
  if (!browserVersion || !revision) throw new Error('Playwright Chromium identity is unavailable');
}

export interface ComputedQualityIdentity {
  suiteIdentity: QualitySuiteIdentity;
  fixtureInputHashes: Record<string, string>;
  applicationHash: string;
  harnessHash: string;
}

export function computeQualityIdentity(): ComputedQualityIdentity {
  const fixtureCorpusPath = join(qualityDirectory, 'fixtures', 'fixtureCorpus.json');
  const frozenFixturePath = join(qualityDirectory, 'fixtures', 'policy-flow-clean-v1.json');
  const frozenFlowArtifactPath = join(qualityDirectory, 'reports', 'evidence', 'phase2z-browser-flow.json');
  const fixtureCorpus = JSON.parse(readFileSync(fixtureCorpusPath, 'utf8')) as FixtureCorpusRecord;
  const applicationHash = hashFiles([
    join(repositoryRoot, 'src'),
    join(repositoryRoot, 'crafting-engine', 'src'),
    join(repositoryRoot, 'dist'),
    join(repositoryRoot, 'package.json'),
    join(repositoryRoot, 'package-lock.json'),
    join(repositoryRoot, 'vite.config.ts'),
    join(repositoryRoot, 'tsconfig.app.json'),
    join(repositoryRoot, 'tsconfig.crafting.json'),
  ]);
  const harnessHash = hashFiles([
    join(qualityDirectory, 'src'),
    join(qualityDirectory, 'package.json'),
    join(qualityDirectory, 'package-lock.json'),
  ]);
  const fixtureCorpusHash = hashFiles([fixtureCorpusPath, frozenFixturePath, frozenFlowArtifactPath]);
  const priceSnapshotIdentity = `prices-${digest([
    stableJson(fixtureCorpus.fixtures.map((fixture) => ({
      id: fixture.id,
      prices: fixture.priceContext,
      market: fixture.marketContext,
    }))),
  ]).slice(0, 16)}`;
  const browserVersion = chromiumVersion();
  const applicationSourceBuildHash = `app-${applicationHash.slice(0, 20)}`;
  const compatibilityHash = `compatible-${digest([
    applicationHash,
    harnessHash,
    fixtureCorpusHash,
    priceSnapshotIdentity,
    browserVersion,
    QUALITY_HARNESS_VERSION,
  ]).slice(0, 24)}`;
  const fixtureInputHashes = Object.fromEntries(QUALITY_GATE_REGISTRY.map((gate) => {
    const selectedFixtures = gate.fixtureIds.map((id) => {
      if (id === 'policy-flow-clean-v1') {
        return {
          metadata: JSON.parse(readFileSync(frozenFixturePath, 'utf8')),
          serializedFlowArtifactHash: digest([readFileSync(frozenFlowArtifactPath)]),
        };
      }
      const fixture = fixtureCorpus.fixtures.find((entry) => entry.id === id);
      if (!fixture) throw new Error(`Gate ${gate.id} references missing fixture ${id}`);
      return fixture;
    });
    return [gate.id, `fixture-${digest([stableJson(selectedFixtures)]).slice(0, 20)}`];
  }));
  return {
    applicationHash,
    harnessHash,
    fixtureInputHashes,
    suiteIdentity: {
      applicationSourceBuildHash,
      fixtureCorpusVersion: fixtureCorpus.version,
      fixtureCorpusHash: `corpus-${fixtureCorpusHash.slice(0, 20)}`,
      priceSnapshotIdentity,
      browserVersion,
      harnessVersion: QUALITY_HARNESS_VERSION,
      compatibilityHash,
    },
  };
}
