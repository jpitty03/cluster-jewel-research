import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { QualitySuiteReport } from '../quality-lab/src/qualityTypes.ts';

interface CommandObservation {
  name: string;
  args: string[];
  status: number;
  pid?: number;
  stdout: string;
  stderr: string;
  report: QualitySuiteReport;
}

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const qualityDirectory = join(repositoryRoot, 'quality-lab');
const auditDirectory = join(qualityDirectory, 'artifacts', 'phase3a-harness-audit');
const evidencePath = join(qualityDirectory, 'reports', 'evidence', 'phase3a-harness-control.json');
const tsxCliPath = join(repositoryRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const orchestratorPath = join(qualityDirectory, 'src', 'orchestrator.ts');

mkdirSync(auditDirectory, { recursive: true });

function run(
  name: string,
  args: string[],
  expectedStatus: number,
): CommandObservation {
  const reportPath = join(auditDirectory, `${name}.json`);
  const invocationArgs = [tsxCliPath, orchestratorPath, ...args, '--report', reportPath];
  const result = spawnSync(process.execPath, invocationArgs, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, expectedStatus,
    `${name} exited ${String(result.status)} instead of ${expectedStatus}\n${result.stdout}\n${result.stderr}`);
  const report = JSON.parse(readFileSync(reportPath, 'utf8')) as QualitySuiteReport;
  return {
    name,
    args,
    status: result.status ?? 1,
    pid: result.pid,
    stdout: result.stdout,
    stderr: result.stderr,
    report,
  };
}

const standaloneGateIds = [
  'A-clean-worker-canonical',
  'C-cluster-handoff',
  'C-share-export-roundtrip',
  'D-real-policy-flow-differential',
  'D-frozen-policy-flow-renderer',
] as const;

const standalone = standaloneGateIds.map((gateId) =>
  run(`standalone-${gateId}`, ['--gate', gateId], 0)
);
for (const observation of standalone) {
  assert.equal(observation.report.status, 'PASSED');
  assert.deepEqual(observation.report.selectedGateIds, [observation.report.results[0].id]);
  assert.equal(observation.report.results.length, 1);
  assert.equal(observation.report.results[0].status, 'PASS');
}
assert.equal(new Set(standalone.map((observation) => observation.report.runId)).size, standalone.length,
  'Standalone reruns did not use distinct clean processes/runs');

const controlledFailure = run('controlled-failure', [
  '--gate', 'A-clean-worker-canonical',
  '--gate', 'C-cluster-handoff',
  '--inject-failure', 'C-cluster-handoff',
], 1);
assert.equal(controlledFailure.report.counts.passed, 1);
assert.equal(controlledFailure.report.counts.failed, 1);
assert.deepEqual(
  controlledFailure.report.results.filter((result) => result.status === 'FAIL').map((result) => result.id),
  ['C-cluster-handoff'],
);
assert.match(controlledFailure.stdout + controlledFailure.stderr,
  /Rerun: npm run -- lab:gate -- --gate C-cluster-handoff/);

const failedRerun = run('failed-rerun', [
  '--failed', join(auditDirectory, 'controlled-failure.json'),
], 0);
assert.deepEqual(failedRerun.report.selectedGateIds, ['C-cluster-handoff']);
assert.equal(failedRerun.report.counts.passed, 1);
assert.equal(failedRerun.report.counts.resumed, 0);

const resumed = run('compatible-resume', [
  '--resume', join(auditDirectory, 'controlled-failure.json'),
], 0);
assert.deepEqual(resumed.report.selectedGateIds, ['A-clean-worker-canonical', 'C-cluster-handoff']);
assert.deepEqual(
  resumed.report.results.filter((result) => result.status === 'RESUMED').map((result) => result.id),
  ['A-clean-worker-canonical'],
);
assert.deepEqual(
  resumed.report.results.filter((result) => result.status === 'PASS').map((result) => result.id),
  ['C-cluster-handoff'],
);
assert.equal(resumed.report.resumedFrom, controlledFailure.report.runId);

const compatibilityHashes = new Set([
  controlledFailure.report.identity.compatibilityHash,
  failedRerun.report.identity.compatibilityHash,
  resumed.report.identity.compatibilityHash,
  ...standalone.map((observation) => observation.report.identity.compatibilityHash),
]);
assert.equal(compatibilityHashes.size, 1, 'Harness diagnostic source changed between checkpoint runs');

const terminalLines = [
  ...standalone.flatMap((observation) => observation.stdout.split(/\r?\n/)),
  ...controlledFailure.stdout.split(/\r?\n/),
  ...controlledFailure.stderr.split(/\r?\n/),
  ...failedRerun.stdout.split(/\r?\n/),
  ...resumed.stdout.split(/\r?\n/),
].filter((line) => /^\[\d+\/\d+\] (?:RUN|PASS|FAIL)\s+/.test(line) || line.startsWith('Rerun:'));
assert(terminalLines.some((line) => / RUN\s+/.test(line)));
assert(terminalLines.some((line) => / PASS\s+/.test(line)));
assert(terminalLines.some((line) => / FAIL\s+/.test(line)));
assert(terminalLines.some((line) => line.startsWith('Rerun:')));

const parallelPlan = controlledFailure.report.scheduling.shardPlan;
assert.deepEqual(parallelPlan.map((plan) => plan.shard).sort(), ['A', 'C']);
assert(parallelPlan.every((plan) => plan.mode === 'PARALLEL_BROWSER_LIGHT'));
assert.equal(controlledFailure.report.scheduling.browserLightParallelism, 2);
assert(controlledFailure.report.runtime.totalWallMs < controlledFailure.report.runtime.summedGateMs,
  'The controlled light-shard run did not demonstrate lower parallel wall time');

const evidence = {
  version: 'PHASE3A_HARNESS_CONTROL_V1',
  generatedAt: new Date().toISOString(),
  compatibilityHash: [...compatibilityHashes][0],
  unitTestsRun: false,
  selfContainedReruns: standalone.map((observation) => ({
    gateId: observation.report.selectedGateIds[0],
    runId: observation.report.runId,
    processId: observation.pid,
    status: observation.report.status,
    durationMs: observation.report.runtime.totalWallMs,
    report: relative(repositoryRoot, join(auditDirectory, `${observation.name}.json`)),
  })),
  controlledFailure: {
    runId: controlledFailure.report.runId,
    selectedGateIds: controlledFailure.report.selectedGateIds,
    passedGateIds: controlledFailure.report.results.filter((result) => result.status === 'PASS').map((result) => result.id),
    failedGateIds: controlledFailure.report.results.filter((result) => result.status === 'FAIL').map((result) => result.id),
    rerunCommand: controlledFailure.report.results.find((result) => result.status === 'FAIL')?.rerunCommand,
  },
  failedOnlyRerun: {
    runId: failedRerun.report.runId,
    selectedGateIds: failedRerun.report.selectedGateIds,
    passed: failedRerun.report.status === 'PASSED',
  },
  compatibleResume: {
    runId: resumed.report.runId,
    resumedFrom: resumed.report.resumedFrom,
    resumedGateIds: resumed.report.results.filter((result) => result.status === 'RESUMED').map((result) => result.id),
    executedGateIds: resumed.report.results.filter((result) => result.status === 'PASS').map((result) => result.id),
  },
  liveProgress: {
    observed: true,
    terminalLines,
  },
  lightShardParallelism: {
    shards: parallelPlan.map((plan) => plan.shard),
    concurrency: controlledFailure.report.scheduling.browserLightParallelism,
    wallMs: controlledFailure.report.runtime.totalWallMs,
    summedGateMs: controlledFailure.report.runtime.summedGateMs,
  },
};

writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
console.log('PHASE 3A — SELF-CONTAINED / CHECKPOINT / LIVE-PROGRESS HARNESS DIAGNOSTIC');
console.log(`PASS: ${standalone.length}/${standalone.length} gates passed alone in distinct processes.`);
console.log('PASS: controlled failure, failed-only rerun, and compatible resume behaved exactly as registered.');
console.log('PASS: real RUN/PASS/FAIL/rerun terminal lines and parallel browser-light shards were captured.');
console.log('Unit tests run: NO');
