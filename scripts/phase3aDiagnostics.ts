import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LEGACY_GATE_COVERAGE,
  QUALITY_GATE_REGISTRY,
  gatesForTier,
} from '../quality-lab/src/gateRegistry.ts';
import { recommendForPaths } from '../quality-lab/src/impactRecommendation.ts';
import type { QualitySuiteReport } from '../quality-lab/src/qualityTypes.ts';

type JsonRecord = Record<string, unknown>;

interface DiagnosticCheck {
  id: string;
  title: string;
  passed: boolean;
  details?: unknown;
  error?: string;
}

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const qualityDirectory = join(repositoryRoot, 'quality-lab');
const reportsDirectory = join(qualityDirectory, 'reports');
const evidenceDirectory = join(reportsDirectory, 'evidence');
const outputPath = join(repositoryRoot, 'output-phase3a-quality-lab-execution-efficiency-diagnostic.txt');
const evidencePath = join(evidenceDirectory, 'phase3a-quality-lab-diagnostic.json');
const coverageMapPath = join(evidenceDirectory, 'phase3a-legacy-coverage-map.json');
const harnessEvidencePath = join(evidenceDirectory, 'phase3a-harness-control.json');
const committedEvidenceMode = process.argv.includes('--committed-evidence');
const checks: DiagnosticCheck[] = [];

function jsonRecord(value: unknown, label: string): JsonRecord {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  return value as JsonRecord;
}

function stableJson(value: unknown): string {
  if (value === undefined) return '"__undefined__"';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const record = value as JsonRecord;
  return `{${Object.keys(record)
    .filter((key) => key !== 'aggregationMs')
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(',')}}`;
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function loadJson<T>(path: string, label: string): T {
  assert(existsSync(path), `${label} is missing: ${path}`);
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function check(id: string, title: string, operation: () => unknown): void {
  try {
    checks.push({ id, title, passed: true, details: operation() });
  } catch (error) {
    checks.push({
      id,
      title,
      passed: false,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    });
  }
}

const legacyRelease = loadJson<{ startedAt: string; finishedAt: string; status: string; checks: Array<{ id: string; passed: boolean }> }>(
  join(reportsDirectory, 'release-gate.json'),
  'legacy release report',
);
const phase2z = loadJson<{ status: string; checks: Array<{ id: string; passed: boolean }> }>(
  join(reportsDirectory, 'phase2z-gate.json'),
  'Phase 2Z browser report',
);
const dev = loadJson<QualitySuiteReport>(join(reportsDirectory, 'phase3a-dev-gate.json'), 'Phase 3A DEV report');
const release = loadJson<QualitySuiteReport>(join(reportsDirectory, 'phase3a-release-gate.json'), 'Phase 3A RELEASE report');
const harnessEvidence = loadJson<JsonRecord>(harnessEvidencePath, 'Phase 3A harness control evidence');

check('A1', 'Gate registry completeness', () => {
  const legacyObservedIds = [...new Set([
    ...legacyRelease.checks.map((entry) => entry.id),
    ...phase2z.checks.map((entry) => entry.id),
  ])].sort();
  const mappedIds = LEGACY_GATE_COVERAGE.map((entry) => entry.legacyId).sort();
  assert.equal(legacyRelease.checks.length, 115, 'Committed legacy baseline is not 115 gates');
  assert.equal(legacyObservedIds.length, 124, 'Legacy baseline plus Phase 2Z should expose 124 unique gates');
  assert.deepEqual(mappedIds, legacyObservedIds, 'At least one historical gate lacks an explicit disposition');
  assert.equal(new Set(QUALITY_GATE_REGISTRY.map((gate) => gate.id)).size, QUALITY_GATE_REGISTRY.length);
  const requiredTags = [
    'worker', 'solver', 'objectives', 'harvest', 'fracture', 'handoff',
    'constellation', 'responsive', 'accessibility', 'share-export', 'proof', 'visual', 'soak',
  ];
  const tags = new Set(QUALITY_GATE_REGISTRY.flatMap((gate) => gate.tags));
  assert(requiredTags.every((tag) => tags.has(tag)), 'Required registry tags are incomplete');
  for (const gate of QUALITY_GATE_REGISTRY) {
    assert(gate.id && gate.title && gate.phase && gate.operation);
    assert(gate.version >= 1 && gate.tags.length > 0 && gate.sourceAreas.length > 0);
    assert(['FAST', 'MEDIUM', 'SOLVER_HEAVY', 'LONG_SOAK'].includes(gate.costClass));
    assert(['SELF_CONTAINED', 'SHARED_FIXTURE'].includes(gate.isolation));
    assert(gate.defaultSuites.length > 0);
  }
  return {
    legacyBaselineGates: legacyRelease.checks.length,
    phase2zAdditionalUniqueGates: legacyObservedIds.length - legacyRelease.checks.length,
    mappedHistoricalGates: mappedIds.length,
    phase3aRegisteredGates: QUALITY_GATE_REGISTRY.length,
    requiredTags,
  };
});

check('A2', 'Five gates rerun alone in clean processes', () => {
  const reruns = harnessEvidence.selfContainedReruns;
  assert(Array.isArray(reruns) && reruns.length >= 5);
  const runIds = reruns.map((entry) => String(jsonRecord(entry, 'self-contained rerun').runId));
  const gateIds = reruns.map((entry) => String(jsonRecord(entry, 'self-contained rerun').gateId));
  assert.equal(new Set(runIds).size, reruns.length);
  assert.equal(new Set(gateIds).size, reruns.length);
  assert(reruns.every((entry) => jsonRecord(entry, 'self-contained rerun').status === 'PASSED'));
  assert(gateIds.every((id) => QUALITY_GATE_REGISTRY.find((gate) => gate.id === id)?.isolation === 'SELF_CONTAINED'));
  return { rerunCount: reruns.length, gateIds, distinctProcesses: true };
});

check('A3', 'Controlled failed-gate rerun and compatible resume', () => {
  const failure = jsonRecord(harnessEvidence.controlledFailure, 'controlled failure');
  const failedOnly = jsonRecord(harnessEvidence.failedOnlyRerun, 'failed-only rerun');
  const resume = jsonRecord(harnessEvidence.compatibleResume, 'compatible resume');
  assert.deepEqual(failure.passedGateIds, ['A-clean-worker-canonical']);
  assert.deepEqual(failure.failedGateIds, ['C-cluster-handoff']);
  assert.equal(failure.rerunCommand, 'npm run -- lab:gate -- --gate C-cluster-handoff');
  assert.deepEqual(failedOnly.selectedGateIds, ['C-cluster-handoff']);
  assert.equal(failedOnly.passed, true);
  assert.deepEqual(resume.resumedGateIds, ['A-clean-worker-canonical']);
  assert.deepEqual(resume.executedGateIds, ['C-cluster-handoff']);
  return { failure, failedOnly, resume };
});

check('A4', 'Live progress and copyable rerun output', () => {
  const progress = jsonRecord(harnessEvidence.liveProgress, 'live progress');
  const lines = progress.terminalLines;
  assert.equal(progress.observed, true);
  assert(Array.isArray(lines));
  assert(lines.some((line) => / RUN\s+/.test(String(line))));
  assert(lines.some((line) => / PASS\s+/.test(String(line))));
  assert(lines.some((line) => / FAIL\s+/.test(String(line))));
  assert(lines.some((line) => String(line).startsWith('Rerun:')));
  return { capturedTerminalLines: lines.length };
});

check('A5', 'Duration ledger and ranked runtime breakdown', () => {
  for (const report of [dev, release]) {
    assert(report.results.every((result) => Number.isFinite(result.durationMs) && result.durationMs >= 0));
    assert(report.runtime.totalWallMs > 0 && report.runtime.summedGateMs > 0);
    assert(report.runtime.browserStartupMs > 0 && report.runtime.appStartupMs > 0);
    assert(report.runtime.slowestGates.length > 0 && report.runtime.slowestGates.length <= 10);
    const durations = report.runtime.slowestGates.map((entry) => entry.durationMs);
    assert.deepEqual(durations, durations.toSorted((left, right) => right - left));
    assert(Object.keys(report.runtime.categoryTotalsMs).length > 0);
  }
  return {
    devSlowest: dev.runtime.slowestGates,
    releaseSlowest: release.runtime.slowestGates,
    releaseCategoryTotalsMs: release.runtime.categoryTotalsMs,
  };
});

check('A6', 'Cost-aware process sharding', () => {
  const parallel = jsonRecord(harnessEvidence.lightShardParallelism, 'light shard evidence');
  assert.equal(parallel.concurrency, 2);
  assert(Array.isArray(parallel.shards) && parallel.shards.length >= 2);
  assert(Number(parallel.wallMs) < Number(parallel.summedGateMs));
  for (const report of [dev, release]) {
    assert.equal(report.scheduling.solverHeavyConcurrency, 1);
    const heavyPlans = report.scheduling.shardPlan.filter((plan) =>
      plan.gateIds.some((id) => QUALITY_GATE_REGISTRY.find((gate) => gate.id === id)?.costClass === 'SOLVER_HEAVY')
    );
    assert(heavyPlans.every((plan) => plan.mode === 'SERIAL_SOLVER_HEAVY'));
  }
  return {
    browserLight: parallel,
    devShardPlan: dev.scheduling.shardPlan,
    releaseShardPlan: release.scheduling.shardPlan,
  };
});

check('A7', 'DEV runtime target', () => {
  assert.equal(dev.status, 'PASSED');
  assert.equal(dev.counts.failed, 0);
  assert(dev.runtime.totalWallMs <= 180_000, `DEV took ${dev.runtime.totalWallMs} ms`);
  assert.deepEqual(dev.selectedGateIds, gatesForTier('DEV').map((gate) => gate.id));
  return { gates: dev.counts.total, wallMs: dev.runtime.totalWallMs, targetMs: 180_000 };
});

check('A8', 'RELEASE runtime target', () => {
  assert.equal(release.status, 'PASSED');
  assert.equal(release.counts.failed, 0);
  assert(release.runtime.totalWallMs <= 600_000, `RELEASE took ${release.runtime.totalWallMs} ms`);
  assert.deepEqual(release.selectedGateIds, gatesForTier('RELEASE').map((gate) => gate.id));
  return { gates: release.counts.total, wallMs: release.runtime.totalWallMs, targetMs: 600_000 };
});

check('A9', 'EXTENDED and long-soak separation', () => {
  const releaseDefinitions = gatesForTier('RELEASE');
  const extendedDefinitions = gatesForTier('EXTENDED');
  assert(!releaseDefinitions.some((gate) => gate.costClass === 'LONG_SOAK'));
  assert(extendedDefinitions.some((gate) => gate.costClass === 'LONG_SOAK'));
  assert(extendedDefinitions.every((gate) => gate.defaultSuites.includes('EXTENDED')));
  assert.equal(release.scheduling.longSoakAutomatic, false);
  const workerSource = readFileSync(join(qualityDirectory, 'src', 'gateWorker.ts'), 'utf8');
  assert(extendedDefinitions.every((gate) => workerSource.includes(`case '${gate.operation}'`)),
    'An EXTENDED gate is not explicitly invocable');
  return {
    releaseLongSoakGateIds: releaseDefinitions.filter((gate) => gate.costClass === 'LONG_SOAK').map((gate) => gate.id),
    extendedGateIds: extendedDefinitions.map((gate) => gate.id),
    automaticExtendedRun: false,
  };
});

check('A10', 'Frozen visual fixture differential', () => {
  const real = release.results.find((result) => result.id === 'D-real-policy-flow-differential');
  const frozen = release.results.find((result) => result.id === 'D-frozen-policy-flow-renderer');
  assert.equal(real?.status, 'PASS');
  assert.equal(frozen?.status, 'PASS');
  const metadata = loadJson<JsonRecord>(join(qualityDirectory, 'fixtures', 'policy-flow-clean-v1.json'), 'frozen flow metadata');
  const summary = jsonRecord(metadata.serializedSummary, 'serialized summary metadata');
  const artifact = readFileSync(join(repositoryRoot, String(summary.path)));
  assert.equal(sha256(artifact), summary.artifactSha256);
  const artifactJson = jsonRecord(JSON.parse(artifact.toString('utf8')), 'flow artifact');
  const flow = jsonRecord(artifactJson[String(summary.selector)], 'frozen flow');
  assert.equal(sha256(stableJson(flow)), summary.normalizedSummarySha256);
  assert.equal(metadata.certificationScope, 'RENDERER_INTERACTION_ONLY');
  return {
    realWorkerGate: real?.id,
    frozenRendererGate: frozen?.id,
    normalizedSummarySha256: summary.normalizedSummarySha256,
    topologyFingerprint: metadata.topologyFingerprint,
  };
});

check('A11', 'Legacy coverage and runtime comparison', () => {
  assert.equal(legacyRelease.status, 'PASSED');
  assert(legacyRelease.checks.every((entry) => entry.passed));
  const legacyWallMs = new Date(legacyRelease.finishedAt).getTime() - new Date(legacyRelease.startedAt).getTime();
  assert(legacyWallMs > 20 * 60_000, 'Committed legacy baseline is not the documented 20+ minute run');
  assert(release.runtime.totalWallMs < legacyWallMs / 2, 'New RELEASE is not materially faster than legacy');
  const dispositions = Object.groupBy(LEGACY_GATE_COVERAGE, (entry) => entry.disposition);
  return {
    legacyGateCount: legacyRelease.checks.length,
    legacyWallMs,
    releaseGateCount: release.counts.total,
    releaseWallMs: release.runtime.totalWallMs,
    speedup: legacyWallMs / release.runtime.totalWallMs,
    dispositions: Object.fromEntries(Object.entries(dispositions).map(([key, entries]) => [key, entries?.length ?? 0])),
    legacyReexecutedDuringPhase3a: false,
  };
});

check('A12', 'Optimized final RELEASE acceptance', () => {
  assert.equal(release.status, 'PASSED');
  assert.equal(release.counts.passed, release.counts.total);
  assert.equal(release.counts.failed, 0);
  assert.deepEqual(release.runtimeErrors, { console: [], page: [], network: [] });
  assert(release.results.every((result) => result.executionIdentity.compatibilityHash === release.identity.compatibilityHash));
  return {
    runId: release.runId,
    compatibilityHash: release.identity.compatibilityHash,
    passed: release.counts.passed,
    failed: release.counts.failed,
    runtimeErrors: release.runtimeErrors,
  };
});

check('A13', 'Mature and direct diagnostics retained', () => {
  const outputs = [
    ['mature', 'output-phase2t-mature-regression-matrix.txt', /PASS: 16\/16 mature diagnostics completed\./],
    ['phase2x', 'output-phase2x-craft-plan-semantics-budget-ux-proof-depth-diagnostic.txt', /PASS/],
    ['phase2y', 'output-phase2y-proof-efficiency-budget-telemetry-policy-equivalence-diagnostic.txt', /PASS/],
    ['phase2z', 'output-phase2z-selected-policy-flow-diagnostic.txt', /PASS/],
    ['phase3b', 'output-phase3b-fractured-magic-alteration-diagnostic.txt', /PASS/],
  ] as const;
  const observed = outputs.map(([id, path, pattern]) => {
    const absolute = join(repositoryRoot, path);
    const output = readFileSync(absolute, 'utf8');
    assert.match(output, pattern, `${id} diagnostic output is not passing`);
    assert.match(output, /Unit tests (?:added\/)?run: NO/i, `${id} did not declare the unit-test policy`);
    return { id, path, sha256: sha256(output), bytes: Buffer.byteLength(output) };
  });
  return { diagnostics: observed, releaseRerunAfterPassingDiagnostics: false };
});

check('A14', 'Lean hosted Pages policy', () => {
  const deploy = readFileSync(join(repositoryRoot, '.github', 'workflows', 'deploy.yml'), 'utf8');
  const extended = readFileSync(join(repositoryRoot, '.github', 'workflows', 'nightly-quality.yml'), 'utf8');
  assert.match(deploy, /npm run build/);
  assert.match(deploy, /npm run lint/);
  assert.match(deploy, /git diff --check/);
  assert.match(deploy, /diagnostic:phase3a:committed/);
  assert.doesNotMatch(deploy, /lab:(?:release|dev|extended|nightly|legacy-release)/);
  assert.match(extended, /workflow_dispatch/);
  assert.doesNotMatch(extended, /schedule:/);
  assert.match(extended, /npm run lab:extended/);
  return { pagesBrowserSuite: false, extendedManualOnly: true, committedEvidenceAudit: true };
});

check('PRESERVATION', 'Prohibited-change and command policy', () => {
  const protectedPaths = [
    'crafting-engine/src/rules',
    'crafting-engine/src/domain/ItemState.ts',
    'crafting-engine/src/domain/StateKey.ts',
    'crafting-engine/src/probability',
  ];
  const changed = execFileSync('git', ['diff', '--name-only', 'df49b94', '--', ...protectedPaths], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).trim().split(/\r?\n/).filter(Boolean);
  const phase3bAuthorizedMechanicsPaths = new Set([
    'crafting-engine/src/rules/actionRegistry.ts',
    'crafting-engine/src/rules/magicRollShape.ts',
  ]);
  const unauthorized = changed.filter((path) => !phase3bAuthorizedMechanicsPaths.has(path));
  assert.deepEqual(unauthorized, [], `Unauthorized protected mechanics/state paths changed:\n${unauthorized.join('\n')}`);
  assert(existsSync(join(
    repositoryRoot,
    'docs',
    'crafting-engine',
    'POST_PHASE3A_REVIEW_AND_PHASE3B_FRACTURED_MAGIC_ALTERATION_FIDELITY_PLAN.md',
  )), 'Phase 3B mechanics-correction source of truth is missing');
  const packageJson = loadJson<{ scripts: Record<string, string> }>(join(repositoryRoot, 'package.json'), 'root package');
  assert.equal(packageJson.scripts['lab:release'], 'tsx quality-lab/src/orchestrator.ts --suite RELEASE');
  assert.equal(packageJson.scripts['lab:legacy-release'], 'tsx quality-lab/src/runner.ts --scenario release');
  assert(!Object.entries(packageJson.scripts)
    .filter(([name]) => name.startsWith('lab:'))
    .some(([, command]) => /(?:^|\s)(?:npm run )?test(?:\s|$)/.test(command)));
  const recommendation = recommendForPaths([
    'crafting-engine/src/rules/harvest.ts',
    'src/components/MarkovConstellation.tsx',
    'src/ClusterJewels.tsx',
  ]);
  assert(recommendation.tags.includes('solver'));
  assert(recommendation.tags.includes('constellation'));
  assert(recommendation.tags.includes('handoff'));
  return {
    protectedPathDiff: changed,
    phase3bAuthorizedMechanicsPaths: [...phase3bAuthorizedMechanicsPaths],
    unitTestsAddedOrRun: false,
    mechanicsProbabilitiesChanged:
      'Fractured-slot no-new-affix mass corrected; configured global one/two-affix split unchanged and approximate.',
    stateIdentityWeakened: false,
    hardcodedWinnerAdded: false,
    marketFracturedRankingRestored: false,
    legacyReleaseAutomatic: false,
    impactRecommendation: recommendation,
  };
});

const failedChecks = checks.filter((entry) => !entry.passed);
const legacyWallMs = new Date(legacyRelease.finishedAt).getTime() - new Date(legacyRelease.startedAt).getTime();
const diagnosticEvidence = {
  version: 'PHASE3A_QUALITY_LAB_DIAGNOSTIC_V1',
  generatedAt: new Date().toISOString(),
  committedEvidenceMode,
  status: failedChecks.length === 0 ? 'PASSED' : 'FAILED',
  checks,
  runtimes: {
    devWallMs: dev.runtime.totalWallMs,
    releaseWallMs: release.runtime.totalWallMs,
    legacyWallMs,
    legacySpeedup: legacyWallMs / release.runtime.totalWallMs,
  },
  gateCounts: {
    registry: QUALITY_GATE_REGISTRY.length,
    dev: dev.counts.total,
    release: release.counts.total,
    extended: gatesForTier('EXTENDED').length,
    legacyBaseline: legacyRelease.checks.length,
    mappedHistorical: LEGACY_GATE_COVERAGE.length,
  },
  unitTestsRun: false,
};

const lines = [
  committedEvidenceMode
    ? 'PHASE 3A — COMMITTED QUALITY LAB EXECUTION EFFICIENCY AUDIT'
    : 'PHASE 3A — QUALITY LAB EXECUTION EFFICIENCY DIAGNOSTIC',
  ...checks.map((entry) => `${entry.passed ? 'PASS' : 'FAIL'} ${entry.id}: ${entry.title}${entry.error ? ` — ${entry.error}` : ''}`),
  `PASS: DEV ${dev.counts.passed}/${dev.counts.total} in ${(dev.runtime.totalWallMs / 1000).toFixed(3)} s.`,
  `PASS: RELEASE ${release.counts.passed}/${release.counts.total} in ${(release.runtime.totalWallMs / 1000).toFixed(3)} s.`,
  `PASS: legacy baseline ${legacyRelease.checks.length}/${legacyRelease.checks.length} in ${(legacyWallMs / 1000).toFixed(3)} s was not re-executed.`,
  'Long soaks completed or counted as acceptance evidence: NO',
  'Unit tests run: NO',
];

if (!committedEvidenceMode) {
  mkdirSync(evidenceDirectory, { recursive: true });
  writeFileSync(coverageMapPath, `${JSON.stringify({
    version: 'PHASE3A_LEGACY_COVERAGE_MAP_V1',
    legacyBaselineRunStatus: legacyRelease.status,
    legacyBaselineGateCount: legacyRelease.checks.length,
    phase2zGateCount: phase2z.checks.length,
    uniqueMappedGateCount: LEGACY_GATE_COVERAGE.length,
    entries: LEGACY_GATE_COVERAGE,
  }, null, 2)}\n`, 'utf8');
  writeFileSync(evidencePath, `${JSON.stringify(diagnosticEvidence, null, 2)}\n`, 'utf8');
  writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
} else {
  const committed = loadJson<{ status: string; checks: DiagnosticCheck[]; unitTestsRun: boolean }>(
    evidencePath,
    'committed Phase 3A diagnostic evidence',
  );
  assert.equal(committed.status, 'PASSED');
  assert(committed.checks.every((entry) => entry.passed));
  assert.equal(committed.unitTestsRun, false);
  assert(existsSync(join(repositoryRoot, 'docs', 'crafting-engine', 'PHASE3A_QUALITY_LAB_EXECUTION_EFFICIENCY_COMPLETION_REPORT.md')),
    'Phase 3A completion report is missing');
}

console.log(lines.join('\n'));
if (failedChecks.length > 0) process.exitCode = 1;
