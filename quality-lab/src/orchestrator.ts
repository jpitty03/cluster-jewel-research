import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  QUALITY_GATE_REGISTRY,
  dependencyClosure,
  gateById,
  gatesForTags,
  gatesForTier,
} from './gateRegistry.ts';
import { computeQualityIdentity } from './qualityIdentity.ts';
import type {
  QualityGateDefinition,
  QualityGateResult,
  QualityShard,
  QualityShardReport,
  QualitySuiteReport,
  QualityTier,
} from './qualityTypes.ts';

interface CliOptions {
  suite?: QualityTier;
  gateIds: string[];
  tags: string[];
  failedReport?: string;
  resumeReport?: string;
  injectFailureGateId?: string;
  reportPath?: string;
  dryRun: boolean;
  list: boolean;
  help: boolean;
}

interface ShardPlan {
  shard: QualityShard;
  definitions: QualityGateDefinition[];
  mode: 'PARALLEL_BROWSER_LIGHT' | 'SERIAL_SOLVER_HEAVY' | 'SERIAL_LONG_SOAK';
}

interface WorkerInvocation {
  runId: string;
  shard: QualityShard;
  gateIds: string[];
  reportPath: string;
  artifactsDirectory: string;
  port: number;
  totalGateCount: number;
  gateIndices: Record<string, number>;
  suiteIdentity: ReturnType<typeof computeQualityIdentity>['suiteIdentity'];
  fixtureInputHashes: Record<string, string>;
  injectFailureGateId?: string;
}

const qualityDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(qualityDirectory, '..');
const reportsDirectory = join(qualityDirectory, 'reports');
const tsxCliPath = join(repositoryRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const workerPath = join(qualityDirectory, 'src', 'gateWorker.ts');

function valuesFor(argv: readonly string[], name: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === name && argv[index + 1]) values.push(argv[index + 1]);
  }
  return values;
}

function valueFor(argv: readonly string[], name: string): string | undefined {
  return valuesFor(argv, name).at(-1);
}

function parseCli(argv = process.argv.slice(2)): CliOptions {
  const rawSuite = valueFor(argv, '--suite')?.toUpperCase();
  assert(rawSuite === undefined || rawSuite === 'DEV' || rawSuite === 'RELEASE' || rawSuite === 'EXTENDED',
    `Unknown suite ${String(rawSuite)}`);
  const failedFlag = argv.indexOf('--failed');
  const resumeFlag = argv.indexOf('--resume');
  return {
    suite: rawSuite as QualityTier | undefined,
    gateIds: valuesFor(argv, '--gate'),
    tags: valuesFor(argv, '--tag').map((tag) => tag.toLowerCase()),
    failedReport: failedFlag >= 0 ? argv[failedFlag + 1] : undefined,
    resumeReport: resumeFlag >= 0 ? argv[resumeFlag + 1] : undefined,
    injectFailureGateId: valueFor(argv, '--inject-failure'),
    reportPath: valueFor(argv, '--report'),
    dryRun: argv.includes('--dry-run'),
    list: argv.includes('--list'),
    help: argv.includes('--help') || argv.includes('-h'),
  };
}

function readSuiteReport(path: string | undefined, label: string): QualitySuiteReport | undefined {
  if (!path) return undefined;
  const resolvedPath = resolve(repositoryRoot, path);
  assert(existsSync(resolvedPath), `${label} report does not exist: ${resolvedPath}`);
  const report = JSON.parse(readFileSync(resolvedPath, 'utf8')) as QualitySuiteReport;
  assert.equal(report.schemaVersion, 'PHASE3A_QUALITY_REPORT_V1', `${label} is not a Phase 3A report`);
  return report;
}

function selectDefinitions(
  options: CliOptions,
  failedReport: QualitySuiteReport | undefined,
  resumeReport: QualitySuiteReport | undefined,
): { suite: QualityTier | 'TARGETED'; requested: QualityGateDefinition[]; selected: QualityGateDefinition[] } {
  let suite: QualityTier | 'TARGETED';
  let requested: QualityGateDefinition[];
  if (failedReport) {
    suite = 'TARGETED';
    requested = failedReport.results
      .filter((result) => result.status === 'FAIL')
      .map((result) => gateById(result.id));
    assert(requested.length > 0, 'The failed-gate report contains no failed gates');
  } else if (options.gateIds.length > 0 || options.tags.length > 0) {
    suite = 'TARGETED';
    const explicit = options.gateIds.map(gateById);
    const tagged = options.tags.length > 0 ? gatesForTags(options.tags) : [];
    requested = QUALITY_GATE_REGISTRY.filter((definition) =>
      explicit.some((entry) => entry.id === definition.id) || tagged.some((entry) => entry.id === definition.id)
    );
    assert(requested.length > 0, `No gates matched IDs/tags: ${[...options.gateIds, ...options.tags].join(', ')}`);
  } else if (resumeReport?.suite === 'TARGETED') {
    suite = 'TARGETED';
    requested = resumeReport.selectedGateIds.map(gateById);
  } else {
    const resumedSuite = resumeReport?.suite;
    suite = options.suite ?? resumedSuite ?? 'RELEASE';
    requested = gatesForTier(suite);
  }
  return { suite, requested, selected: dependencyClosure(requested) };
}

function planShards(definitions: readonly QualityGateDefinition[]): ShardPlan[] {
  const plans: ShardPlan[] = [];
  for (const shard of ['A', 'B', 'C', 'D', 'E'] as const) {
    const inShard = definitions.filter((definition) => definition.shard === shard);
    if (inShard.length === 0) continue;
    const mode = inShard.some((definition) => definition.costClass === 'LONG_SOAK')
      ? 'SERIAL_LONG_SOAK'
      : inShard.some((definition) => definition.costClass === 'SOLVER_HEAVY')
        ? 'SERIAL_SOLVER_HEAVY'
        : 'PARALLEL_BROWSER_LIGHT';
    plans.push({ shard, definitions: inShard, mode });
  }
  return plans;
}

async function freePort(): Promise<number> {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.once('error', rejectPort);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      assert(address && typeof address === 'object');
      const port = address.port;
      server.close((error) => error ? rejectPort(error) : resolvePort(port));
    });
  });
}

async function runWorker(invocationPath: string): Promise<number> {
  return new Promise((resolveExit, rejectExit) => {
    const child = spawn(process.execPath, [tsxCliPath, workerPath, '--invocation', invocationPath], {
      cwd: repositoryRoot,
      env: { ...process.env, NO_COLOR: '1' },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk: Buffer) => process.stdout.write(chunk));
    child.stderr.on('data', (chunk: Buffer) => process.stderr.write(chunk));
    child.once('error', rejectExit);
    child.once('exit', (code) => resolveExit(code ?? 1));
  });
}

async function runShard(
  plan: ShardPlan,
  runId: string,
  artifactsDirectory: string,
  gateIndices: Record<string, number>,
  totalGateCount: number,
  identity: ReturnType<typeof computeQualityIdentity>,
  injectFailureGateId: string | undefined,
): Promise<QualityShardReport> {
  const shardDirectory = join(artifactsDirectory, `shard-${plan.shard}`);
  mkdirSync(shardDirectory, { recursive: true });
  const reportPath = join(shardDirectory, 'report.json');
  const invocationPath = join(shardDirectory, 'invocation.json');
  const invocation: WorkerInvocation = {
    runId,
    shard: plan.shard,
    gateIds: plan.definitions.map((definition) => definition.id),
    reportPath,
    artifactsDirectory: shardDirectory,
    port: await freePort(),
    totalGateCount,
    gateIndices,
    suiteIdentity: identity.suiteIdentity,
    fixtureInputHashes: identity.fixtureInputHashes,
    injectFailureGateId,
  };
  writeFileSync(invocationPath, `${JSON.stringify(invocation, null, 2)}\n`, 'utf8');
  const exitCode = await runWorker(invocationPath);
  assert(existsSync(reportPath), `Shard ${plan.shard} exited ${exitCode} without a report`);
  const report = JSON.parse(readFileSync(reportPath, 'utf8')) as QualityShardReport;
  if (exitCode !== 0 && report.results.every((result) => result.passed)) {
    throw new Error(`Shard ${plan.shard} exited ${exitCode} despite reporting no failed gate`);
  }
  return report;
}

async function runWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  operation: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await operation(values[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

function resumedResults(
  selected: readonly QualityGateDefinition[],
  report: QualitySuiteReport | undefined,
  compatibilityHash: string,
): { resumed: QualityGateResult[]; remaining: QualityGateDefinition[]; compatible: boolean } {
  if (!report || report.identity.compatibilityHash !== compatibilityHash) {
    return { resumed: [], remaining: [...selected], compatible: report === undefined };
  }
  const priorPassing = new Map(report.results
    .filter((result) => result.status === 'PASS' || result.status === 'RESUMED')
    .map((result) => [result.id, result]));
  const resumed: QualityGateResult[] = [];
  const remaining: QualityGateDefinition[] = [];
  for (const definition of selected) {
    const prior = priorPassing.get(definition.id);
    if (!prior || prior.executionIdentity.gateIdVersion !== `${definition.id}@${definition.version}`) {
      remaining.push(definition);
      continue;
    }
    resumed.push({
      ...prior,
      status: 'RESUMED',
      passed: true,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: 0,
      details: { resumedCompatiblePass: true, originalDetails: prior.details },
      resumedFrom: report.runId,
    });
  }
  return { resumed, remaining, compatible: true };
}

function defaultReportPaths(suite: QualityTier | 'TARGETED'): { json: string; markdown: string } {
  const stem = suite === 'TARGETED' ? 'phase3a-targeted' : `phase3a-${suite.toLowerCase()}`;
  return {
    json: join(reportsDirectory, `${stem}-gate.json`),
    markdown: join(reportsDirectory, `${stem}-summary.md`),
  };
}

function runtimeSummary(
  totalWallMs: number,
  results: readonly QualityGateResult[],
  shards: readonly QualityShardReport[],
): QualitySuiteReport['runtime'] {
  const executed = results.filter((result) => result.status === 'PASS' || result.status === 'FAIL');
  const summedGateMs = executed.reduce((sum, result) => sum + result.durationMs, 0);
  const categoryTotalsMs: Record<string, number> = {};
  for (const result of executed) {
    for (const tag of result.tags) categoryTotalsMs[tag] = (categoryTotalsMs[tag] ?? 0) + result.durationMs;
  }
  const solverHeavyMs = executed
    .filter((result) => result.costClass === 'SOLVER_HEAVY')
    .reduce((sum, result) => sum + result.durationMs, 0);
  const visualInteractionMs = executed
    .filter((result) => result.tags.some((tag) => ['visual', 'constellation', 'responsive', 'accessibility'].includes(tag)))
    .reduce((sum, result) => sum + result.durationMs, 0);
  const summedShardWall = shards.reduce((sum, shard) => sum + shard.wallMs, 0);
  return {
    totalWallMs,
    summedGateMs,
    appStartupMs: shards.reduce((sum, shard) => sum + shard.appStartupMs, 0),
    browserStartupMs: shards.reduce((sum, shard) => sum + shard.browserStartupMs, 0),
    solverHeavyMs,
    visualInteractionMs,
    harnessOverheadMs: Math.max(0, summedShardWall - summedGateMs),
    categoryTotalsMs,
    slowestGates: executed
      .toSorted((left, right) => right.durationMs - left.durationMs)
      .slice(0, 10)
      .map((result) => ({ id: result.id, durationMs: result.durationMs, status: result.status })),
  };
}

function writeSummary(report: QualitySuiteReport, path: string): void {
  const lines = [
    `# Phase 3A ${report.suite} Quality Lab Report`,
    '',
    `- Run: ${report.runId}`,
    `- Status: ${report.status}`,
    `- Started: ${report.startedAt}`,
    `- Finished: ${report.finishedAt}`,
    `- Build compatibility: \`${report.identity.compatibilityHash}\``,
    `- Browser: Chromium ${report.identity.browserVersion}`,
    `- Passed / failed / resumed / skipped: ${report.counts.passed} / ${report.counts.failed} / ${report.counts.resumed} / ${report.counts.skipped}`,
    '',
    '## Runtime',
    '',
    `- Total wall time: ${(report.runtime.totalWallMs / 1000).toFixed(3)} s`,
    `- Summed gate time: ${(report.runtime.summedGateMs / 1000).toFixed(3)} s`,
    `- App startup time: ${(report.runtime.appStartupMs / 1000).toFixed(3)} s`,
    `- Browser startup time: ${(report.runtime.browserStartupMs / 1000).toFixed(3)} s`,
    `- Solver-heavy time: ${(report.runtime.solverHeavyMs / 1000).toFixed(3)} s`,
    `- Visual/interaction time: ${(report.runtime.visualInteractionMs / 1000).toFixed(3)} s`,
    `- Summed harness overhead: ${(report.runtime.harnessOverheadMs / 1000).toFixed(3)} s`,
    `- Browser-light shard parallelism: ${report.scheduling.browserLightParallelism}`,
    `- Solver-heavy concurrency: ${report.scheduling.solverHeavyConcurrency}`,
    `- Automatic long soak: ${report.scheduling.longSoakAutomatic ? 'YES' : 'NO'}`,
    '',
    '## Gates',
    '',
    '| Gate | Shard | Cost | Status | Duration | Rerun |',
    '|---|---:|---|---:|---:|---|',
  ];
  for (const result of report.results) {
    lines.push(`| ${result.id} | ${result.shard} | ${result.costClass} | ${result.status} | ${(result.durationMs / 1000).toFixed(3)} s | ${result.rerunCommand ?? ''} |`);
  }
  lines.push('', '## Ten slowest gates', '', '| Gate | Status | Duration |', '|---|---:|---:|');
  for (const result of report.runtime.slowestGates) {
    lines.push(`| ${result.id} | ${result.status} | ${(result.durationMs / 1000).toFixed(3)} s |`);
  }
  lines.push('', '## Runtime errors', '');
  lines.push(`- Console: ${report.runtimeErrors.console.length}`);
  lines.push(`- Page: ${report.runtimeErrors.page.length}`);
  lines.push(`- Network: ${report.runtimeErrors.network.length}`);
  writeFileSync(path, `${lines.join('\n')}\n`, 'utf8');
}

function printHelp(): void {
  console.log(`Phase 3A Quality Lab\n\n` +
    `  --suite DEV|RELEASE|EXTENDED\n` +
    `  --gate <id>                 repeatable exact gate selection\n` +
    `  --tag <tag>                 repeatable tag intersection\n` +
    `  --failed <report.json>      rerun failed gates and explicit dependencies\n` +
    `  --resume <report.json>      reuse compatible passing gates only\n` +
    `  --inject-failure <gate-id>  controlled harness checkpoint diagnostic\n` +
    `  --dry-run                   print cost-aware shard plan without executing\n` +
    `  --list                      print the gate registry\n`);
}

async function main(): Promise<void> {
  const options = parseCli();
  if (options.help) {
    printHelp();
    return;
  }
  if (options.list) {
    for (const gate of QUALITY_GATE_REGISTRY) {
      console.log(`${gate.id}\t${gate.shard}\t${gate.costClass}\t${gate.defaultSuites.join(',')}\t${gate.tags.join(',')}`);
    }
    return;
  }
  const failedReport = readSuiteReport(options.failedReport, 'Failed-gate');
  const resumeReport = readSuiteReport(options.resumeReport, 'Resume');
  const selection = selectDefinitions(options, failedReport, resumeReport);
  assert(selection.selected.every((definition) => definition.defaultSuites.includes('EXTENDED') || definition.costClass !== 'LONG_SOAK') || selection.suite === 'EXTENDED',
    'A long-soak gate cannot enter DEV/RELEASE implicitly');
  if (selection.suite === 'DEV' || selection.suite === 'RELEASE') {
    assert(!selection.selected.some((definition) => definition.costClass === 'LONG_SOAK'),
      `${selection.suite} must not contain LONG_SOAK gates`);
  }
  const identity = computeQualityIdentity();
  const resume = resumedResults(selection.selected, resumeReport, identity.suiteIdentity.compatibilityHash);
  if (resumeReport && !resume.compatible) {
    console.log(`Resume rejected: complete compatibility identity changed (${resumeReport.identity.compatibilityHash} -> ${identity.suiteIdentity.compatibilityHash}).`);
  } else if (resume.resumed.length > 0) {
    console.log(`Resume accepted: ${resume.resumed.length} compatible passing gate(s) will not be replayed.`);
  }
  const plans = planShards(resume.remaining);
  console.log(`Quality Lab ${selection.suite}: ${selection.selected.length} selected, ${resume.resumed.length} resumed, ${resume.remaining.length} to execute.`);
  for (const plan of plans) {
    console.log(`Shard ${plan.shard}: ${plan.mode} -> ${plan.definitions.map((definition) => definition.id).join(', ')}`);
  }
  if (options.dryRun) {
    console.log('Dry run only; no browser, solver, or long soak was started.');
    return;
  }

  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const startedAt = new Date().toISOString();
  const wallStarted = performance.now();
  const artifactsDirectory = join(qualityDirectory, 'artifacts', `phase3a-${runId}`);
  mkdirSync(artifactsDirectory, { recursive: true });
  const gateIndices = Object.fromEntries(selection.selected.map((definition, index) => [definition.id, index + 1]));
  const runPlan = (plan: ShardPlan) => runShard(
    plan,
    runId,
    artifactsDirectory,
    gateIndices,
    selection.selected.length,
    identity,
    options.injectFailureGateId,
  );
  const light = plans.filter((plan) => plan.mode === 'PARALLEL_BROWSER_LIGHT');
  const heavy = plans.filter((plan) => plan.mode === 'SERIAL_SOLVER_HEAVY');
  const long = plans.filter((plan) => plan.mode === 'SERIAL_LONG_SOAK');
  const shardReports = [
    ...(await runWithConcurrency(light, 2, runPlan)),
    ...(await runWithConcurrency(heavy, 1, runPlan)),
    ...(await runWithConcurrency(long, 1, runPlan)),
  ];
  const executed = shardReports.flatMap((report) => report.results);
  const results = selection.selected.map((definition) =>
    resume.resumed.find((result) => result.id === definition.id) ??
    executed.find((result) => result.id === definition.id)
  );
  assert(results.every((result): result is QualityGateResult => result !== undefined), 'A selected gate produced no result');
  const runtimeErrors = {
    console: shardReports.flatMap((report) => report.consoleErrors),
    page: shardReports.flatMap((report) => report.pageErrors),
    network: shardReports.flatMap((report) => report.networkErrors),
  };
  const failed = results.filter((result) => result.status === 'FAIL').length;
  const reportPaths = defaultReportPaths(selection.suite);
  const stableJsonPath = options.reportPath
    ? resolve(repositoryRoot, options.reportPath)
    : reportPaths.json;
  const stableMarkdownPath = options.reportPath
    ? stableJsonPath.replace(/\.json$/i, '.md')
    : reportPaths.markdown;
  const runReportPath = join(artifactsDirectory, 'report.json');
  const artifacts = Object.assign({}, ...shardReports.map((report) => report.artifacts), {
    runReport: relative(repositoryRoot, runReportPath),
    stableReport: relative(repositoryRoot, stableJsonPath),
    summary: relative(repositoryRoot, stableMarkdownPath),
  });
  const totalWallMs = Math.round(performance.now() - wallStarted);
  const report: QualitySuiteReport = {
    schemaVersion: 'PHASE3A_QUALITY_REPORT_V1',
    runId,
    suite: selection.suite,
    requestedGateIds: selection.requested.map((definition) => definition.id),
    selectedGateIds: selection.selected.map((definition) => definition.id),
    startedAt,
    finishedAt: new Date().toISOString(),
    status: failed === 0 && Object.values(runtimeErrors).every((errors) => errors.length === 0) ? 'PASSED' : 'FAILED',
    identity: identity.suiteIdentity,
    scheduling: {
      processLevelShards: plans.map((plan) => plan.shard),
      browserLightParallelism: 2,
      solverHeavyConcurrency: 1,
      longSoakAutomatic: false,
      shardPlan: plans.map((plan) => ({
        shard: plan.shard,
        gateIds: plan.definitions.map((definition) => definition.id),
        mode: plan.mode,
      })),
    },
    counts: {
      passed: results.filter((result) => result.status === 'PASS').length,
      failed,
      resumed: results.filter((result) => result.status === 'RESUMED').length,
      skipped: 0,
      total: results.length,
    },
    results,
    runtime: runtimeSummary(totalWallMs, results, shardReports),
    runtimeErrors,
    artifacts,
    resumedFrom: resume.resumed.length > 0 ? resumeReport?.runId : undefined,
  };
  mkdirSync(dirname(stableJsonPath), { recursive: true });
  mkdirSync(dirname(stableMarkdownPath), { recursive: true });
  writeFileSync(runReportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  writeFileSync(stableJsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  writeFileSync(join(reportsDirectory, 'latest.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  writeSummary(report, stableMarkdownPath);

  console.log(`Passed / failed / resumed / skipped: ${report.counts.passed} / ${report.counts.failed} / ${report.counts.resumed} / ${report.counts.skipped}`);
  console.log(`Total wall time: ${(report.runtime.totalWallMs / 1000).toFixed(3)}s`);
  console.log(`Summed gate time: ${(report.runtime.summedGateMs / 1000).toFixed(3)}s`);
  console.log(`Browser startup time: ${(report.runtime.browserStartupMs / 1000).toFixed(3)}s`);
  console.log(`Solver-heavy time: ${(report.runtime.solverHeavyMs / 1000).toFixed(3)}s`);
  console.log(`Visual/interaction time: ${(report.runtime.visualInteractionMs / 1000).toFixed(3)}s`);
  console.log(`Harness overhead: ${(report.runtime.harnessOverheadMs / 1000).toFixed(3)}s`);
  console.log('10 slowest gates:');
  for (const slow of report.runtime.slowestGates) {
    console.log(`  ${slow.id}  ${(slow.durationMs / 1000).toFixed(3)}s  ${slow.status}`);
  }
  console.log(`Report: ${relative(repositoryRoot, stableJsonPath)}`);
  if (report.status !== 'PASSED') process.exitCode = 1;
}

void main();
