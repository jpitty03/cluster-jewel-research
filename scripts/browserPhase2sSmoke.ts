import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const run = spawnSync(npmExecutable, ['run', 'lab:smoke'], {
  cwd: repositoryRoot,
  encoding: 'utf8',
  stdio: 'inherit',
  windowsHide: true,
});
assert.equal(run.status, 0, `Real Playwright smoke exited with ${run.status}`);

const reportPath = fileURLToPath(new URL('../quality-lab/reports/release-gate.json', import.meta.url));
const report = JSON.parse(readFileSync(reportPath, 'utf8')) as {
  runId: string;
  browser: string;
  browserVersion: string;
  status: string;
  checks: Array<{ passed: boolean }>;
  workerEventCounts: Record<string, number>;
};
assert.equal(report.status, 'PASSED');
assert(report.checks.length > 0 && report.checks.every((check) => check.passed));

const lines = [
  'PHASE 2T REAL-BROWSER SMOKE (SUPERSEDES PHASE 2S SIMULATED SMOKE)',
  `Run: ${report.runId}`,
  `Browser: ${report.browser} ${report.browserVersion}`,
  `Observed gates: ${report.checks.filter((check) => check.passed).length}/${report.checks.length}`,
  `Observed Worker messages: ${report.workerEventCounts.MESSAGE_FROM_WORKER ?? 0}`,
  `Status: ${report.status}`,
  'Unit tests run: NO',
];
const outputPath = fileURLToPath(new URL('../output-browser-phase2t-real-smoke.txt', import.meta.url));
writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
console.log(lines.join('\n'));
