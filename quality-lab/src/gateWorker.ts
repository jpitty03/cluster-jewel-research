import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from 'playwright';
import { launchProductionApp } from './appLauncher.ts';
import {
  WORKER_CAPTURE_INIT_SCRIPT,
  type CapturedWorkerEvent,
} from './eventCapture.ts';
import { gateById } from './gateRegistry.ts';
import type {
  FixtureCorpusRecord,
  FixtureRecord,
  GateExecutionIdentity,
  QualityGateDefinition,
  QualityGateResult,
  QualityShard,
  QualityShardReport,
  QualitySuiteIdentity,
} from './qualityTypes.ts';

type JsonRecord = Record<string, unknown>;

interface WorkerInvocation {
  runId: string;
  shard: QualityShard;
  gateIds: string[];
  reportPath: string;
  artifactsDirectory: string;
  port: number;
  totalGateCount: number;
  gateIndices: Record<string, number>;
  suiteIdentity: QualitySuiteIdentity;
  fixtureInputHashes: Record<string, string>;
  injectFailureGateId?: string;
}

interface GateWorkerContext {
  browser: Browser;
  appUrl: string;
  port: number;
  invocation: WorkerInvocation;
  fixtureCorpus: FixtureCorpusRecord;
  artifacts: Record<string, string>;
  consoleErrors: string[];
  pageErrors: string[];
  networkErrors: string[];
  currentGate: QualityGateDefinition;
}

interface FrozenPolicyFlowFixture {
  fixtureId: string;
  fixtureVersion: number;
  sourceAppCommit: string;
  normalizedRequest: JsonRecord;
  selectedBundleId: string;
  selectedPolicyFingerprint: string;
  policyFlowVersion: string;
  topologyFingerprint: string;
  serializedSummary: {
    path: string;
    selector: string;
    artifactSha256: string;
    normalizedSummarySha256: string;
    nodeCount: number;
    edgeCount: number;
  };
  certificationScope: string;
  limitations: string[];
}

const qualityDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(qualityDirectory, '..');
const stableEvidenceDirectory = join(qualityDirectory, 'reports', 'evidence');
const fixtureCorpus = JSON.parse(
  readFileSync(join(qualityDirectory, 'fixtures', 'fixtureCorpus.json'), 'utf8'),
) as FixtureCorpusRecord;

function argumentValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function jsonRecord(value: unknown, label: string): JsonRecord {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  return value as JsonRecord;
}

function arrayValue(value: unknown, label: string): unknown[] {
  assert(Array.isArray(value), `${label} must be an array`);
  return value;
}

function numberValue(value: unknown, label: string): number {
  assert(typeof value === 'number' && Number.isFinite(value), `${label} must be a finite number`);
  return value;
}

function assertNear(actual: number, expected: number, label: string, tolerance = 1e-7): void {
  const allowed = Math.max(tolerance, Math.max(Math.abs(actual), Math.abs(expected)) * 1e-8);
  assert(Math.abs(actual - expected) <= allowed, `${label}: ${actual} differs from ${expected}`);
}

function canonicalIds(values: readonly unknown[]): string[] {
  return values.map(String).filter(Boolean).sort((left, right) => left.localeCompare(right));
}

function fixture(id: string): FixtureRecord {
  const found = fixtureCorpus.fixtures.find((entry) => entry.id === id);
  if (!found) throw new Error(`Fixture ${id} is absent from ${fixtureCorpus.version}`);
  return found;
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

function loadFrozenPolicyFlow(
  metadataFile = 'policy-flow-clean-v1.json',
): { metadata: FrozenPolicyFlowFixture; flow: JsonRecord } {
  const metadataPath = join(qualityDirectory, 'fixtures', metadataFile);
  const metadata = JSON.parse(readFileSync(metadataPath, 'utf8')) as FrozenPolicyFlowFixture;
  const artifactPath = join(repositoryRoot, metadata.serializedSummary.path);
  const artifact = readFileSync(artifactPath);
  assert.equal(sha256(artifact), metadata.serializedSummary.artifactSha256, 'Frozen flow artifact hash changed');
  const artifactJson = jsonRecord(JSON.parse(artifact.toString('utf8')), 'frozen policy-flow artifact');
  const flow = jsonRecord(artifactJson[metadata.serializedSummary.selector], 'frozen PolicyFlowSummary');
  assert.equal(sha256(stableJson(flow)), metadata.serializedSummary.normalizedSummarySha256,
    'Frozen flow normalized summary hash changed');
  assert.equal(flow.version, metadata.policyFlowVersion);
  assert.equal(flow.sourceBundleId, metadata.selectedBundleId);
  assert.equal(flow.sourcePolicyFingerprint, metadata.selectedPolicyFingerprint);
  assert.equal(jsonRecord(flow.topology, 'frozen topology').fingerprint, metadata.topologyFingerprint);
  assert.equal(arrayValue(flow.nodes, 'frozen nodes').length, metadata.serializedSummary.nodeCount);
  assert.equal(arrayValue(flow.edges, 'frozen edges').length, metadata.serializedSummary.edgeCount);
  return { metadata, flow };
}

function frozenFlowWorkerOverride(flow: JsonRecord): string {
  const serializedFlow = JSON.stringify(flow).replaceAll('<', '\\u003c');
  return String.raw`
(() => {
  const FrozenFlow = ${serializedFlow};
  const InnerWorker = window.Worker;
  class QualityLabFrozenFlowWorker extends EventTarget {
    constructor(...args) {
      super();
      this.onmessage = null;
      this.onerror = null;
      this.onmessageerror = null;
      this.inner = Reflect.construct(InnerWorker, args);
      this.inner.addEventListener('message', (event) => {
        let data = event.data;
        if (data?.type === 'RESULT' && data.result) {
          data = { ...data, result: { ...data.result, policyFlow: FrozenFlow } };
        }
        const forwarded = new MessageEvent('message', { data });
        this.dispatchEvent(forwarded);
        this.onmessage?.(forwarded);
      });
      this.inner.addEventListener('error', (event) => {
        this.dispatchEvent(new Event('error'));
        this.onerror?.(event);
      });
      this.inner.addEventListener('messageerror', (event) => {
        this.dispatchEvent(new Event('messageerror'));
        this.onmessageerror?.(event);
      });
    }
    postMessage(...args) { return this.inner.postMessage(...args); }
    terminate() { return this.inner.terminate(); }
  }
  Object.defineProperty(window, '__QUALITY_LAB_FROZEN_POLICY_FLOW__', {
    value: { version: FrozenFlow.version, fingerprint: FrozenFlow.topology?.fingerprint },
    enumerable: false,
  });
  window.Worker = QualityLabFrozenFlowWorker;
})();`;
}

async function withPage<T>(
  ctx: GateWorkerContext,
  operation: (page: Page, context: BrowserContext) => Promise<T>,
  options: { frozenFlow?: JsonRecord; viewport?: { width: number; height: number } } = {},
): Promise<T> {
  const context = await ctx.browser.newContext({
    viewport: options.viewport ?? { width: 1280, height: 960 },
    hasTouch: true,
    acceptDownloads: true,
    reducedMotion: 'no-preference',
  });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ctx.appUrl.slice(0, -1) });
  await context.addInitScript({ content: WORKER_CAPTURE_INIT_SCRIPT });
  if (options.frozenFlow) await context.addInitScript({ content: frozenFlowWorkerOverride(options.frozenFlow) });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  const consoleStart = ctx.consoleErrors.length;
  const pageStart = ctx.pageErrors.length;
  const networkStart = ctx.networkErrors.length;
  page.on('console', (message) => {
    if (message.type() === 'error') ctx.consoleErrors.push(`${ctx.currentGate.id}: ${message.text()}`);
  });
  page.on('pageerror', (error) => ctx.pageErrors.push(`${ctx.currentGate.id}: ${error.message}`));
  page.on('requestfailed', (request) => {
    ctx.networkErrors.push(`${ctx.currentGate.id}: ${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'failed'}`);
  });
  try {
    const observed = await operation(page, context);
    assert.deepEqual(ctx.consoleErrors.slice(consoleStart), [], 'Browser console errors were captured');
    assert.deepEqual(ctx.pageErrors.slice(pageStart), [], 'Browser page errors were captured');
    assert.deepEqual(ctx.networkErrors.slice(networkStart), [], 'Browser network errors were captured');
    await context.tracing.stop();
    return observed;
  } catch (error) {
    const gateName = ctx.currentGate.id.replace(/[^a-z0-9-]/gi, '_');
    const screenshotPath = join(ctx.invocation.artifactsDirectory, `${gateName}-failure.png`);
    const tracePath = join(ctx.invocation.artifactsDirectory, `${gateName}-trace.zip`);
    try {
      await page.screenshot({ path: screenshotPath, fullPage: true });
      ctx.artifacts[`${ctx.currentGate.id}:failureScreenshot`] = relative(repositoryRoot, screenshotPath);
    } catch {
      // The page may already be gone; the primary assertion remains authoritative.
    }
    try {
      await context.tracing.stop({ path: tracePath });
      ctx.artifacts[`${ctx.currentGate.id}:trace`] = relative(repositoryRoot, tracePath);
    } catch {
      // Trace finalization must not mask the gate failure.
    }
    throw error;
  } finally {
    await context.close();
  }
}

async function workerEvents(page: Page): Promise<CapturedWorkerEvent[]> {
  return page.evaluate(() => {
    const qualityWindow = window as Window & { __QUALITY_LAB_EVENTS__?: CapturedWorkerEvent[] };
    return qualityWindow.__QUALITY_LAB_EVENTS__ ?? [];
  });
}

async function workerEventCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const qualityWindow = window as Window & { __QUALITY_LAB_EVENTS__?: CapturedWorkerEvent[] };
    return qualityWindow.__QUALITY_LAB_EVENTS__?.length ?? 0;
  });
}

async function workerEventsSince(page: Page, offset: number): Promise<CapturedWorkerEvent[]> {
  return page.evaluate((start) => {
    const qualityWindow = window as Window & { __QUALITY_LAB_EVENTS__?: CapturedWorkerEvent[] };
    return (qualityWindow.__QUALITY_LAB_EVENTS__ ?? []).slice(start);
  }, offset);
}

async function workerResponseCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const qualityWindow = window as Window & { __QUALITY_LAB_EVENTS__?: CapturedWorkerEvent[] };
    return (qualityWindow.__QUALITY_LAB_EVENTS__ ?? [])
      .filter((event) => event.kind === 'MESSAGE_FROM_WORKER').length;
  });
}

async function ensureOptimizerPage(page: Page, appUrl: string): Promise<void> {
  await page.goto(`${appUrl}#optimizer`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Craft target' }).waitFor();
}

async function importFixture(page: Page, input: FixtureRecord): Promise<void> {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Import Setup JSON file' }).click(),
  ]);
  await chooser.setFiles({
    name: `${input.id}.json`,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({
      baseType: input.baseType,
      clusterType: input.clusterType,
      itemLevel: input.itemLevel,
      passiveCount: input.passiveCount,
      targetMods: input.targetMods,
      finalRarity: input.finalRarity,
      maxUnmatchedAffixes: input.extraAffixes === 'no-unwanted' ? 0 : undefined,
      prices: input.priceContext,
      marketContext: input.marketContext,
      expectedSaleValueChaos: input.expectedSaleValueChaos,
    })),
  });
  await page.waitForFunction((expectedIds) => {
    const observed = [...document.querySelectorAll('.target-summary li[data-mod-id]')]
      .map((element) => element.getAttribute('data-mod-id'))
      .filter((id): id is string => typeof id === 'string')
      .sort((left, right) => left.localeCompare(right));
    return JSON.stringify(observed) === JSON.stringify([...expectedIds].sort((left, right) => left.localeCompare(right)));
  }, input.targetMods);
}

async function setBudget(page: Page, budget: FixtureRecord['searchBudget']): Promise<void> {
  const advanced = page.locator('details.advanced-controls');
  if (!(await advanced.evaluate((element) => (element as HTMLDetailsElement).open))) {
    await advanced.getByText('Advanced search settings', { exact: true }).click();
  }
  await page.getByLabel('Max states').fill(String(budget.maxStates));
  await page.getByLabel('Max wall time (ms)').fill(String(budget.maxWallTimeMs));
  await page.getByLabel('Expansion rounds').fill(String(budget.maxExpansionRounds));
}

async function setFewestObjective(page: Page, ceilingChaos: number): Promise<void> {
  await page.getByLabel('Optimization goal').selectOption('FEWEST_ACTIONS_WITHIN_COST');
  await page.getByLabel('Cost ceiling type').selectOption('ABSOLUTE');
  await page.getByLabel('Max total cost (chaos)').fill(String(ceilingChaos));
}

async function waitForWorkerResult(page: Page, offset: number, timeoutMs: number): Promise<JsonRecord> {
  await page.waitForFunction((start) => {
    const events = (window as Window & { __QUALITY_LAB_EVENTS__?: CapturedWorkerEvent[] }).__QUALITY_LAB_EVENTS__ ?? [];
    return events.slice(start).some((event) =>
      event.kind === 'MESSAGE_FROM_WORKER' &&
      (event.payload?.type === 'RESULT' || event.payload?.type === 'ERROR')
    );
  }, offset, { timeout: timeoutMs });
  const terminal = (await workerEventsSince(page, offset)).find((event) =>
    event.kind === 'MESSAGE_FROM_WORKER' &&
    (event.payload?.type === 'RESULT' || event.payload?.type === 'ERROR')
  );
  assert(terminal?.payload, 'Worker terminal response was not captured');
  assert.equal(terminal.payload.type, 'RESULT', `Worker returned ${String(terminal.payload.type)}`);
  await page.locator('.recommendation-hero').waitFor({ state: 'visible', timeout: 5_000 });
  return jsonRecord(terminal.payload.result, 'Worker result');
}

async function runOptimization(page: Page, maxWallTimeMs: number): Promise<JsonRecord> {
  const offset = await workerEventCount(page);
  const optimize = page.getByRole('button', { name: /Find cheapest craft|Optimize craft/ });
  await optimize.waitFor({ state: 'visible' });
  assert(await optimize.isEnabled(), 'Optimization action is disabled');
  await optimize.click();
  return waitForWorkerResult(page, offset, maxWallTimeMs + 8_000);
}

async function optimizedFixture(
  page: Page,
  appUrl: string,
  input: FixtureRecord,
  objective?: 'FEWEST_600',
): Promise<JsonRecord> {
  await ensureOptimizerPage(page, appUrl);
  await importFixture(page, input);
  await setBudget(page, input.searchBudget);
  if (objective === 'FEWEST_600') await setFewestObjective(page, 600);
  return runOptimization(page, input.searchBudget.maxWallTimeMs);
}

async function compareMethodsIndependently(
  page: Page,
  maxWallTimeMs: number,
): Promise<JsonRecord> {
  const offset = await workerEventCount(page);
  const compare = page.getByRole('button', { name: 'Compare Methods Independently' });
  await compare.waitFor({ state: 'visible' });
  assert(await compare.isEnabled(), 'Independent method comparison is disabled');
  await compare.click();
  return waitForWorkerResult(page, offset, maxWallTimeMs + 8_000);
}

function selectedPolicyFlow(result: JsonRecord, label: string): JsonRecord {
  const flow = jsonRecord(result.policyFlow, `${label} selected-policy flow`);
  assert.equal(flow.version, 'SELECTED_POLICY_FLOW_V1');
  assert.equal(flow.status, 'CERTIFIED');
  const reconciliation = jsonRecord(flow.reconciliation, `${label} reconciliation`);
  assert.equal(reconciliation.certified, true);
  assert.equal(reconciliation.outgoingFlowConserved, true);
  assert.equal(reconciliation.conditionalProbabilitiesConserved, true);
  assert.equal(reconciliation.terminalAbsorptionReconciled, true);
  return flow;
}

function assertFlowConservation(flow: JsonRecord, label: string): { nodes: number; edges: number; samples: number } {
  const nodes = arrayValue(flow.nodes, `${label} nodes`).map((entry) => jsonRecord(entry, `${label} node`));
  const edges = arrayValue(flow.edges, `${label} edges`).map((entry) => jsonRecord(entry, `${label} edge`));
  const terminal = new Set(arrayValue(flow.terminalNodeIds, `${label} terminal IDs`).map(String));
  for (const node of nodes) {
    const outgoing = edges.filter((edge) => edge.sourceNodeId === node.id);
    if (terminal.has(String(node.id))) {
      assert.equal(outgoing.length, 0, `${label}/${String(node.id)} terminal has outgoing flow`);
      continue;
    }
    assert(outgoing.length > 0, `${label}/${String(node.id)} has no outgoing branch`);
    assertNear(outgoing.reduce((sum, edge) => sum + numberValue(edge.expectedFlow, 'edge flow'), 0),
      numberValue(node.expectedVisits, 'node visits'), `${label} outgoing occupancy`);
    assertNear(outgoing.reduce((sum, edge) => sum + numberValue(edge.conditionalProbability, 'edge probability'), 0),
      1, `${label} outgoing probability`);
  }
  const samples = arrayValue(jsonRecord(flow.aggregation, `${label} aggregation`).differentialSamples,
    `${label} differential samples`);
  for (const entry of samples) {
    const sample = jsonRecord(entry, `${label} differential sample`);
    assertNear(numberValue(sample.exactExpectedFlow, 'sample flow'),
      numberValue(sample.occupancy, 'sample occupancy') * numberValue(sample.exactProbability, 'sample probability'),
      `${label} exact flow`, 1e-10);
  }
  return { nodes: nodes.length, edges: edges.length, samples: samples.length };
}

function assertCanonicalAccounting(result: JsonRecord): JsonRecord {
  const consistency = jsonRecord(result.internalConsistency, 'internal consistency');
  assert.equal(consistency.status, 'OK');
  const usage = jsonRecord(result.fullRouteUsage, 'full-route usage');
  const acquisition = numberValue(usage.acquisitionCostChaos, 'acquisition cost');
  const downstream = numberValue(usage.downstreamCostChaos, 'downstream cost');
  const full = numberValue(usage.fullRouteCostChaos, 'full-route cost');
  assertNear(acquisition + downstream, full, 'full-route cost reconciliation');
  assertNear(numberValue(usage.reconciliationDifferenceChaos, 'reconciliation difference'), 0,
    'full-route reconciliation difference');
  assertNear(numberValue(result.expectedCostChaos, 'result expected cost'), full, 'result expected cost');
  assert.deepEqual(result.expectedCurrencies, usage.combinedCurrencies);
  const recommended = jsonRecord(result.recommended, 'recommended route');
  assertNear(numberValue(recommended.expectedTotalCostChaos, 'recommended cost'), full, 'recommended cost');
  return {
    selectedBundleId: consistency.selectedBundleId,
    maximumDifferenceChaos: consistency.maximumDifferenceChaos,
    acquisitionCostChaos: acquisition,
    downstreamCostChaos: downstream,
    fullRouteCostChaos: full,
  };
}

function assertTarget(result: JsonRecord, input: FixtureRecord): void {
  const target = jsonRecord(result.target, 'result target');
  const ids = arrayValue(target.requiredMods, 'target modifiers')
    .map((entry) => jsonRecord(entry, 'target modifier').modId);
  assert.deepEqual(canonicalIds(ids), canonicalIds(input.targetMods));
}

function phase3bRouteEvidence(result: JsonRecord): JsonRecord {
  const recommended = jsonRecord(result.recommended, 'recommended route');
  const usage = jsonRecord(result.fullRouteUsage, 'full-route usage');
  const combinedActions = arrayValue(usage.combinedActions, 'combined actions')
    .map((entry) => jsonRecord(entry, 'combined action'));
  const actionCounts = Object.fromEntries(combinedActions.map((action) => [
    String(action.actionId),
    numberValue(action.expectedCount, `${String(action.actionId)} expected count`),
  ]));
  return {
    recommendationStatus: result.recommendationStatus,
    selectedAcquisition: recommended.name,
    selectedBundleId: recommended.bundleId,
    acquisitionCostChaos: usage.acquisitionCostChaos,
    downstreamCostChaos: usage.downstreamCostChaos,
    fullRouteCostChaos: usage.fullRouteCostChaos,
    expectedPhysicalActions: jsonRecord(recommended.metrics, 'route metrics').expectedPhysicalActions,
    estimatedManualTimeMs: jsonRecord(recommended.metrics, 'route metrics').estimatedManualTimeMs,
    actionCounts,
  };
}

function assertPhase3bRecoveryCopy(result: JsonRecord): string | undefined {
  const plan = jsonRecord(result.craftPlan, 'craft plan');
  const recovery = arrayValue(plan.steps, 'craft plan steps')
    .map((entry) => jsonRecord(entry, 'craft plan step'))
    .find((step) => step.phase === 'RECOVER');
  if (!recovery) return undefined;
  const instruction = String(recovery.instruction);
  assert.match(instruction, /resulting item's actual rarity\/state/i);
  assert.match(instruction, /one fractured affix, Scour leaves a Magic item/i);
  assert.match(instruction, /Reacquires, return to the selected acquisition state/i);
  assert.match(instruction, /Decision details for the exact next action/i);
  assert.equal(recovery.recoveryTargetStepId, undefined,
    'Compressed state-dependent Scour/Reacquire recovery retained a false fixed return arrow');
  return instruction;
}

function assertWorkerProtocol(events: CapturedWorkerEvent[]): JsonRecord {
  const messageTypes = events
    .filter((event) => event.kind === 'MESSAGE_FROM_WORKER')
    .map((event) => String(event.payload?.type));
  assert(messageTypes.includes('PROGRESS'), 'Worker emitted no PROGRESS event');
  const complete = messageTypes.lastIndexOf('COMPLETE');
  const result = messageTypes.lastIndexOf('RESULT');
  assert(complete >= 0 && result === complete + 1, 'Worker COMPLETE/RESULT terminal ordering changed');
  assert(events.some((event) => event.kind === 'WORKER_SPAWN'));
  assert(events.some((event) => event.kind === 'POST_MESSAGE_TO_WORKER'));
  return { messageTypes, completeIndex: complete, resultIndex: result };
}

async function noFallbackProbe(ctx: GateWorkerContext): Promise<JsonRecord> {
  const missingDist = join(qualityDirectory, 'fixtures', '__phase3a_missing_dist__');
  const missingBrowser = join(qualityDirectory, 'fixtures', '__phase3a_missing_browser__');
  let appRejected = false;
  try {
    await launchProductionApp({ distDirectory: missingDist, port: ctx.port + 100 });
  } catch (error) {
    appRejected = error instanceof Error && error.message.includes('Built production entry is unavailable');
  }
  assert(appRejected, 'Missing production bundle did not fail closed');
  let browserRejected = false;
  try {
    const browser = await chromium.launch({ executablePath: missingBrowser, headless: true });
    await browser.close();
  } catch {
    browserRejected = true;
  }
  assert(browserRejected, 'Missing browser executable did not fail closed');
  return { appRejected, browserRejected };
}

async function downloadExport(page: Page, destination: string): Promise<JsonRecord> {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export Setup JSON/ }).click();
  const download = await downloadPromise;
  await download.saveAs(destination);
  return jsonRecord(JSON.parse(readFileSync(destination, 'utf8')), 'export bundle');
}

async function runGateOperation(ctx: GateWorkerContext): Promise<unknown> {
  switch (ctx.currentGate.operation) {
    case 'clean-worker-canonical':
      return withPage(ctx, async (page) => {
        const input = fixture('cheap_one_mod');
        const result = await optimizedFixture(page, ctx.appUrl, input);
        assertTarget(result, input);
        const flow = selectedPolicyFlow(result, 'clean');
        const accounting = assertCanonicalAccounting(result);
        assert.equal(flow.sourceBundleId, accounting.selectedBundleId);
        const container = page.getByTestId('markov-constellation-container');
        await container.waitFor();
        assert.equal(await container.getAttribute('data-source-bundle-id'), String(flow.sourceBundleId));
        assert.equal(await container.getAttribute('data-policy-flow-version'), 'SELECTED_POLICY_FLOW_V1');
        return {
          fixture: input.id,
          protocol: assertWorkerProtocol(await workerEvents(page)),
          flow: assertFlowConservation(flow, 'clean'),
          accounting,
        };
      });

    case 'proof-accounting-no-fallback':
      return withPage(ctx, async (page) => {
        const input = fixture('cheap_one_mod');
        const result = await optimizedFixture(page, ctx.appUrl, input);
        const proof = jsonRecord(result.proof, 'proof');
        assert(typeof proof === 'object');
        const search = jsonRecord(result.search, 'search');
        assert(typeof search.totalElapsedMs === 'number');
        return {
          accounting: assertCanonicalAccounting(result),
          proofStatus: result.objectiveProofStatus,
          noFallback: await noFallbackProbe(ctx),
        };
      });

    case 'cancel-replace-recover':
      return withPage(ctx, async (page) => {
        await ensureOptimizerPage(page, ctx.appUrl);
        const complex = fixture('four_mod_release');
        await importFixture(page, complex);
        await setBudget(page, complex.searchBudget);
        const offset = await workerEventCount(page);
        await page.getByRole('button', { name: /Find cheapest craft|Optimize craft/ }).click();
        await page.waitForFunction((start) => {
          const events = (window as Window & { __QUALITY_LAB_EVENTS__?: CapturedWorkerEvent[] }).__QUALITY_LAB_EVENTS__ ?? [];
          return events.slice(start).some((event) => event.kind === 'POST_MESSAGE_TO_WORKER');
        }, offset);
        await page.getByRole('button', { name: 'Cancel' }).first().click();
        await page.getByText(/Optimization cancelled\. The worker was replaced/).waitFor({ timeout: 5_000 });
        const cancelled = await workerEventsSince(page, offset);
        assert(cancelled.some((event) => event.kind === 'WORKER_TERMINATE'));
        assert(cancelled.some((event) => event.kind === 'WORKER_SPAWN'));
        const cheap = fixture('cheap_one_mod');
        await importFixture(page, cheap);
        await setBudget(page, cheap.searchBudget);
        const recovered = await runOptimization(page, cheap.searchBudget.maxWallTimeMs);
        assertTarget(recovered, cheap);
        return { terminated: true, replacementSpawned: true, recovered: recovered.recommendationStatus };
      });

    case 'self-fracture-policy':
      return withPage(ctx, async (page) => {
        const input = fixture('phase2x_three_notable_handoff');
        const result = await optimizedFixture(page, ctx.appUrl, input);
        assertTarget(result, input);
        const flow = selectedPolicyFlow(result, 'self-fracture');
        const conserved = assertFlowConservation(flow, 'self-fracture');
        const nodes = arrayValue(flow.nodes, 'fracture nodes').map((entry) => jsonRecord(entry, 'fracture node'));
        const edges = arrayValue(flow.edges, 'fracture edges').map((entry) => jsonRecord(entry, 'fracture edge'));
        const scour = edges.filter((edge) => edge.actionId === 'scouring_orb');
        const reacquire = edges.filter((edge) => edge.actionId === 'restart_reacquire');
        assert(scour.length > 0, 'Self-fracture flow has no Scour recovery');
        assert(reacquire.length > 0, 'Self-fracture flow has no restart/reacquire outcome');
        assert(scour.every((edge) => edge.outcomeKind === 'RECOVERY'));
        assert(reacquire.every((edge) => edge.outcomeKind === 'REACQUIRE'));
        const oneFracturedScour = scour.find((edge) => {
          const destination = nodes.find((node) => node.id === edge.targetNodeId);
          return Array.isArray(destination?.fracturedTargetModIds) && destination.fracturedTargetModIds.length === 1;
        });
        assert(oneFracturedScour, 'No one-fractured Scour destination exists');
        const destination = nodes.find((node) => node.id === oneFracturedScour.targetNodeId)!;
        assert.equal(destination.rarity, 'magic');
        assert.equal(destination.selectedActionId, 'augmentation_orb',
          'Current-price Scour destination did not economically select Augment');
        const topology = jsonRecord(flow.topology, 'self-fracture topology');
        const route = phase3bRouteEvidence(result);
        const recoveryCopy = assertPhase3bRecoveryCopy(result);
        mkdirSync(stableEvidenceDirectory, { recursive: true });
        const artifactPath = join(stableEvidenceDirectory, 'phase3b-current-self-fracture-flow.json');
        writeFileSync(artifactPath, `${JSON.stringify({ input, route, flow }, null, 2)}\n`, 'utf8');
        ctx.artifacts.phase3bCurrentSelfFractureFlow = relative(repositoryRoot, artifactPath);
        return {
          conserved,
          scourEdges: scour.length,
          reacquireEdges: reacquire.length,
          fracturedDestination: { rarity: destination.rarity, selectedActionId: destination.selectedActionId },
          scourDestinations: scour.map((edge) => ({
            sourceNodeId: edge.sourceNodeId,
            targetNodeId: edge.targetNodeId,
            rarity: nodes.find((node) => node.id === edge.targetNodeId)?.rarity,
            selectedActionId: nodes.find((node) => node.id === edge.targetNodeId)?.selectedActionId,
          })),
          topology,
          route,
          recoveryCopy,
          accounting: assertCanonicalAccounting(result),
          artifact: ctx.artifacts.phase3bCurrentSelfFractureFlow,
        };
      });

    case 'fractured-magic-alter-price-reversal':
      return withPage(ctx, async (page) => {
        const input = fixture('phase3b_three_notable_alter_reversal');
        const result = await optimizedFixture(page, ctx.appUrl, input);
        assertTarget(result, input);
        const flow = selectedPolicyFlow(result, 'Phase 3B Alter reversal');
        const conserved = assertFlowConservation(flow, 'Phase 3B Alter reversal');
        const nodes = arrayValue(flow.nodes, 'Alter reversal nodes')
          .map((entry) => jsonRecord(entry, 'Alter reversal node'));
        const edges = arrayValue(flow.edges, 'Alter reversal edges')
          .map((entry) => jsonRecord(entry, 'Alter reversal edge'));
        const fractureOnlyAlterNode = nodes.find((node) =>
          node.selectedActionId === 'alteration_orb' &&
          Array.isArray(node.fracturedTargetModIds) && node.fracturedTargetModIds.length === 1 &&
          numberValue(node.prefixCount, 'Alter node Prefix count') +
            numberValue(node.suffixCount, 'Alter node Suffix count') === 1
        );
        assert(fractureOnlyAlterNode,
          'Controlled real Worker result has no fracture-only Magic state selecting Alter');
        assert.equal(fractureOnlyAlterNode.rarity, 'magic');
        const selfLoop = edges.find((edge) =>
          edge.sourceNodeId === fractureOnlyAlterNode.id &&
          edge.targetNodeId === fractureOnlyAlterNode.id &&
          edge.actionId === 'alteration_orb' &&
          /no new affix/i.test(String(edge.representativeOutcome))
        );
        assert(selfLoop, 'Fractured-Magic Alter no-new-affix mass is absent from real PolicyFlow');
        assert.equal(selfLoop.outcomeKind, 'REPEAT');
        assert.match(String(selfLoop.representativeOutcome), /fractured (Prefix|Suffix).*requested side/i);
        const conditionalProbability = numberValue(
          selfLoop.conditionalProbability,
          'Alter self-loop conditional probability',
        );
        assert(conditionalProbability > 0 && conditionalProbability < 1,
          'Alter self-loop probability was discarded or renormalized to certainty');
        const anchor = page.locator(`[data-edge-anchor="${String(selfLoop.id)}"]`);
        await anchor.focus();
        await page.keyboard.press('Enter');
        const details = page.getByLabel('Selected constellation edge details');
        await details.waitFor();
        const detailText = await details.innerText();
        assert.match(detailText, /no new affix/i);
        assert.match(detailText, /fractured (Prefix|Suffix)/i);
        assert.match(detailText, /Occupancy-weighted policy-flow probability/i);
        // Read collapsed Advanced evidence directly. Pointer clicks inside the
        // canvas overlay intentionally bubble to the camera gesture owner and
        // would close the selected edge after the accessibility assertion.
        assert.match(String(await details.textContent()), /EXACT_SELECTED_POLICY_TRANSITION/);
        mkdirSync(stableEvidenceDirectory, { recursive: true });
        const screenshotPath = join(stableEvidenceDirectory, 'phase3b-alter-self-loop.png');
        await page.screenshot({ path: screenshotPath, fullPage: true });
        ctx.artifacts.phase3bAlterSelfLoopScreenshot = relative(repositoryRoot, screenshotPath);
        const route = phase3bRouteEvidence(result);
        const recoveryCopy = assertPhase3bRecoveryCopy(result);
        const artifactPath = join(stableEvidenceDirectory, 'phase3b-alter-self-loop-flow.json');
        writeFileSync(artifactPath, `${JSON.stringify({
          input,
          route,
          conserved,
          fractureOnlyAlterNode,
          selfLoop,
          flow,
        }, null, 2)}\n`, 'utf8');
        ctx.artifacts.phase3bAlterSelfLoopFlow = relative(repositoryRoot, artifactPath);
        return {
          route,
          conserved,
          topology: flow.topology,
          fractureOnlyAlterNode: fractureOnlyAlterNode.id,
          selfLoop: {
            id: selfLoop.id,
            conditionalProbability,
            expectedFlow: selfLoop.expectedFlow,
            representativeOutcome: selfLoop.representativeOutcome,
            nextSelectedActionId: selfLoop.nextSelectedActionId,
          },
          recoveryCopy,
          accounting: assertCanonicalAccounting(result),
          screenshot: ctx.artifacts.phase3bAlterSelfLoopScreenshot,
          flowArtifact: ctx.artifacts.phase3bAlterSelfLoopFlow,
        };
      });

    case 'harvest-objective-policy':
      return withPage(ctx, async (page) => {
        const input = fixture('phase2w_armour_evasion_12');
        const result = await optimizedFixture(page, ctx.appUrl, input, 'FEWEST_600');
        const objective = jsonRecord(result.objective, 'objective');
        assert.equal(objective.kind, 'FEWEST_ACTIONS_WITHIN_COST');
        assert.equal(objective.maxExpectedCostChaos, 600);
        const flow = selectedPolicyFlow(result, 'Harvest objective');
        const conserved = assertFlowConservation(flow, 'Harvest objective');
        const nodes = arrayValue(flow.nodes, 'Harvest nodes').map((entry) => jsonRecord(entry, 'Harvest node'));
        const edges = arrayValue(flow.edges, 'Harvest edges').map((entry) => jsonRecord(entry, 'Harvest edge'));
        const harvestNodeIds = new Set(nodes
          .filter((node) => String(node.selectedActionId).startsWith('harvest_reforge_'))
          .map((node) => String(node.id)));
        const harvestEdges = edges.filter((edge) => harvestNodeIds.has(String(edge.sourceNodeId)));
        assert(harvestNodeIds.size > 0, 'Fewest-actions objective did not select Harvest');
        assert(harvestEdges.some((edge) => edge.outcomeKind === 'REPEAT'));
        assert(harvestEdges.some((edge) => edge.outcomeKind === 'SUCCESS'));
        return {
          objective,
          conserved,
          harvestNodes: harvestNodeIds.size,
          repeatEdges: harvestEdges.filter((edge) => edge.outcomeKind === 'REPEAT').length,
          successEdges: harvestEdges.filter((edge) => edge.outcomeKind === 'SUCCESS').length,
          accounting: assertCanonicalAccounting(result),
        };
      });

    case 'policy-family-admissibility':
      return withPage(ctx, async (page) => {
        const input = fixture('phase3c_primordial_renewal_rotten_claws');
        await optimizedFixture(page, ctx.appUrl, input);
        const result = await compareMethodsIndependently(
          page,
          input.searchBudget.maxWallTimeMs,
        );
        assertTarget(result, input);
        const families = arrayValue(result.methodPortfolio, 'Phase 3C method portfolio')
          .map((entry) => jsonRecord(entry, 'Phase 3C method family'));
        const open = families.find((family) =>
          jsonRecord(family.spec, 'Open spec').kind === 'OPEN'
        );
        const conventional = families.find((family) =>
          jsonRecord(family.spec, 'Conventional spec').kind === 'CONVENTIONAL'
        );
        assert(open, 'Real Worker omitted Open family');
        assert(conventional, 'Real Worker omitted Conventional family');
        const openU = numberValue(open.fullRouteU, 'Open executable U');
        const conventionalU = numberValue(
          conventional.fullRouteU,
          'Conventional executable U',
        );
        const audit = jsonRecord(
          conventional.knownPolicyAdmissibility,
          'Conventional known-policy audit',
        );
        assert.equal(audit.admissible, true, `Conventional rejected Open policy: ${
          JSON.stringify(audit.failures)
        }`);
        const knownU = numberValue(
          conventional.revalidatedKnownPolicyCostChaos,
          'revalidated known executable U',
        );
        assert(conventionalU <= knownU + 0.05,
          `Conventional ${conventionalU}c regressed above known ${knownU}c`);
        const selectedOpenAudit = jsonRecord(
          conventional.selectedOpenPolicyAdmissibility,
          'selected Open policy audit',
        );
        const selectedOpenU = numberValue(
          conventional.selectedOpenPolicyCostChaos,
          'selected Open policy U',
        );
        if (selectedOpenAudit.admissible === true) {
          assert(conventionalU <= selectedOpenU + 0.05,
            `Conventional ${conventionalU}c regressed above admissible selected Open ${selectedOpenU}c`);
        } else {
          const failures = arrayValue(
            selectedOpenAudit.failures,
            'selected Open rejection failures',
          ).map((failure) => jsonRecord(failure, 'selected Open rejection'));
          assert(failures.length > 0, 'Selected Open rejection has no exact reason');
          assert(failures.some((failure) =>
            failure.code === 'ACQUISITION_KIND_MISMATCH' ||
            failure.code === 'ACQUISITION_IDENTITY_MISMATCH' ||
            failure.code === 'ACTION_NOT_ALLOWED' ||
            failure.code === 'ACTION_FORBIDDEN'
          ), `Selected Open rejection is not constraint-specific: ${JSON.stringify(failures)}`);
        }
        assert(
          conventional.incumbentSource === 'ADMISSIBLE_KNOWN_POLICY' ||
            conventional.incumbentSource === 'IMPROVED_FROM_KNOWN_POLICY',
          'Known incumbent provenance is absent',
        );
        assert.equal(conventional.familySearchStatus, 'BEST_FOUND_UNPROVEN');
        const parity = jsonRecord(audit.sourceParity, 'fixed-policy source parity');
        assert(numberValue(parity.costDifferenceChaos, 'cost parity') <= 0.05);
        assert(numberValue(parity.actionDifference, 'action parity') <= 1e-5);
        assert(numberValue(parity.timeDifferenceMs, 'time parity') <= 1e-3);
        const evaluation = jsonRecord(audit.evaluation, 'fixed-policy evaluation');
        assert.equal(evaluation.proper, true);
        assert.equal(evaluation.costReconciled, true);
        assertNear(numberValue(evaluation.terminalAbsorptionProbability, 'absorption'), 1,
          'fixed-policy absorption', 1e-6);
        const conventionalCard = page.locator(
          '[data-method-family-id="family_conventional"]',
        );
        await conventionalCard.waitFor();
        assert.equal(await conventionalCard.getAttribute('data-known-policy-admissible'), 'true');
        assert.equal(
          await conventionalCard.getAttribute('data-selected-open-policy-admissible'),
          String(selectedOpenAudit.admissible),
        );
        assert.match(
          String(await conventionalCard.getAttribute('data-incumbent-source')),
          /ADMISSIBLE_KNOWN_POLICY|IMPROVED_FROM_KNOWN_POLICY/,
        );
        assert.equal(
          await conventionalCard.getAttribute('data-family-search-status'),
          'BEST_FOUND_UNPROVEN',
        );
        const cardText = await conventionalCard.innerText();
        assert.match(cardText, /Policy execution status/i);
        assert.match(cardText, /Family search status/i);
        assert.match(cardText, /family optimum not proven/i);
        assert.match(cardText, /Selected Open policy in this family/);
        const sameFingerprint = open.policyEquivalenceFingerprint ===
          conventional.policyEquivalenceFingerprint;
        if (sameFingerprint && conventional.equivalentToSelectedPolicy === true) {
          assert.equal(conventional.status, 'SAME_AS_SELECTED');
          assert.match(cardText, /Same selected policy/i);
        }
        const harvestControls = families.filter((family) =>
          jsonRecord(family.spec, 'family spec').kind === 'HARVEST'
        );
        assert(harvestControls.length > 0);
        assert(harvestControls.every((family) =>
          jsonRecord(
            family.selectedOpenPolicyAdmissibility ?? family.knownPolicyAdmissibility,
            'Harvest audit',
          ).admissible === false
        ));
        const fractureControls = families.filter((family) =>
          jsonRecord(family.spec, 'fracture spec').kind === 'SELF_FRACTURE'
        );
        assert(fractureControls.length > 0);
        assert(fractureControls.every((family) =>
          jsonRecord(family.knownPolicyAdmissibility, 'fracture audit').admissible === false
        ));
        mkdirSync(stableEvidenceDirectory, { recursive: true });
        const artifactPath = join(
          stableEvidenceDirectory,
          'phase3c-policy-family-browser.json',
        );
        writeFileSync(artifactPath, `${JSON.stringify({
          input,
          selected: result.recommended,
          open,
          conventional,
          familyMatrix: families.map((family) => ({
            id: jsonRecord(family.spec, 'matrix spec').id,
            kind: jsonRecord(family.spec, 'matrix spec').kind,
            admissible: family.selectedOpenPolicyAdmissibility
              ? jsonRecord(family.selectedOpenPolicyAdmissibility, 'matrix audit').admissible
              : undefined,
            incumbentSource: family.incumbentSource,
            familySearchStatus: family.familySearchStatus,
            fullRouteU: family.fullRouteU,
          })),
        }, null, 2)}\n`, 'utf8');
        const screenshotPath = join(
          stableEvidenceDirectory,
          'phase3c-policy-family-desktop.png',
        );
        await page.screenshot({ path: screenshotPath, fullPage: true });
        ctx.artifacts.phase3cPolicyFamilyBrowser = relative(repositoryRoot, artifactPath);
        ctx.artifacts.phase3cPolicyFamilyScreenshot = relative(
          repositoryRoot,
          screenshotPath,
        );
        return {
          openU,
          selectedOpenU,
          selectedOpenAdmissible: selectedOpenAudit.admissible,
          selectedOpenFailures: selectedOpenAudit.failures,
          conventionalU,
          knownU,
          admissible: audit.admissible,
          transitionsRegenerated: audit.transitionsRegenerated,
          transitionOutcomesCompared: audit.transitionOutcomesCompared,
          incumbentSource: conventional.incumbentSource,
          familySearchStatus: conventional.familySearchStatus,
          sameFingerprint,
          equivalentToSelectedPolicy: conventional.equivalentToSelectedPolicy,
          accounting: assertCanonicalAccounting(result),
          artifact: ctx.artifacts.phase3cPolicyFamilyBrowser,
          screenshot: ctx.artifacts.phase3cPolicyFamilyScreenshot,
        };
      }, { viewport: { width: 1440, height: 900 } });

    case 'cluster-handoff':
      return withPage(ctx, async (page) => {
        await page.goto(ctx.appUrl, { waitUntil: 'networkidle' });
        const responsesBefore = await workerResponseCount(page);
        await page.getByRole('button', { name: 'Cluster Jewels', exact: true }).click();
        await page.locator('.table-wrap table').waitFor();
        await page.locator('input[type="search"]').first().fill('10% increased Attack Damage');
        const row = page.locator('tbody tr.clickable')
          .filter({ hasText: '10% increased Attack Damage' })
          .filter({ hasText: 'Large' })
          .first();
        await row.click();
        const combo = page.locator('.detail-row li')
          .filter({ has: page.getByRole('button', { name: 'Optimize this combo' }) })
          .first();
        await combo.getByRole('button', { name: 'Optimize this combo' }).click();
        const panel = page.locator('.optimizer-handoff-panel');
        await panel.waitFor();
        const passiveChoice = await panel.getByLabel('Optimizer passive skills').inputValue();
        await panel.getByRole('button', { name: 'Open Craft Optimizer', exact: true }).click();
        const banner = page.locator('.optimizer-source-banner');
        await banner.waitFor();
        assert.equal(await page.getByLabel('Base type').inputValue(), 'Large Cluster Jewel');
        assert.equal(await page.getByLabel('Cluster enchantment').inputValue(), '10% increased Attack Damage');
        assert.equal(await page.locator('.optimizer-form .optimizer-grid label')
          .filter({ has: page.getByText('Passive skills', { exact: true }) }).locator('select').first().inputValue(), passiveChoice);
        assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('optimizer-source-banner')), true);
        assert.equal(await workerResponseCount(page), responsesBefore, 'Handoff started the optimizer Worker');
        return {
          passiveChoice,
          targetIds: ((await banner.getAttribute('data-seed-target-ids')) ?? '').split(',').filter(Boolean),
          automaticSearch: false,
          focusedBanner: true,
        };
      });

    case 'share-export-roundtrip':
      return withPage(ctx, async (page) => {
        const input = fixture('cheap_one_mod');
        const result = await optimizedFixture(page, ctx.appUrl, input);
        const exportPath = join(ctx.invocation.artifactsDirectory, 'phase3a-share-export.json');
        const exported = await downloadExport(page, exportPath);
        ctx.artifacts.phase3aShareExport = relative(repositoryRoot, exportPath);
        const summary = jsonRecord(exported.resultSummary, 'export result summary');
        assert.deepEqual(summary.presentation, result.presentation);
        assert.deepEqual(summary.fullRouteUsage, result.fullRouteUsage);
        assert.deepEqual(summary.policyFlow, result.policyFlow);
        await page.getByRole('button', { name: /Share Link/ }).click();
        const shareUrl = await page.evaluate(() => navigator.clipboard.readText());
        assert.match(shareUrl, /#craft=/);
        await page.goto(shareUrl, { waitUntil: 'networkidle' });
        await page.waitForFunction((ids) => {
          const observed = [...document.querySelectorAll('.target-summary li[data-mod-id]')]
            .map((node) => node.getAttribute('data-mod-id')).filter(Boolean);
          return JSON.stringify(observed) === JSON.stringify(ids);
        }, input.targetMods);
        return {
          exportVersion: exported.appVersion,
          shareHashLength: new URL(shareUrl).hash.length,
          targetIds: input.targetMods,
          policyFlowExported: true,
        };
      });

    case 'responsive-accessibility':
      return withPage(ctx, async (page) => {
        const input = fixture('cheap_one_mod');
        await optimizedFixture(page, ctx.appUrl, input);
        const container = page.getByTestId('markov-constellation-container');
        await container.waitFor();
        const nodes = container.locator('.constellation-node-access-list button');
        assert(await nodes.count() > 0);
        await nodes.first().focus();
        assert.equal(await nodes.first().evaluate((element) => element === document.activeElement), true);
        await page.setViewportSize({ width: 390, height: 844 });
        const geometry = await page.evaluate(() => ({
          viewport: document.documentElement.clientWidth,
          documentWidth: document.documentElement.scrollWidth,
          bodyWidth: document.body.scrollWidth,
        }));
        assert(geometry.documentWidth <= geometry.viewport + 1,
          `Document overflow ${geometry.documentWidth} > ${geometry.viewport}`);
        assert(geometry.bodyWidth <= geometry.viewport + 1,
          `Body overflow ${geometry.bodyWidth} > ${geometry.viewport}`);
        const screenshotPath = join(ctx.invocation.artifactsDirectory, 'phase3a-responsive-mobile.png');
        await page.screenshot({ path: screenshotPath, fullPage: true });
        ctx.artifacts.phase3aResponsiveMobile = relative(repositoryRoot, screenshotPath);
        return { geometry, keyboardNodeFocus: true, screenshot: ctx.artifacts.phase3aResponsiveMobile };
      });

    case 'constellation-large-scc-layout': {
      const frozen = loadFrozenPolicyFlow('policy-flow-phase3c-large-v1.json');
      return withPage(ctx, async (page) => {
        const input = fixture('cheap_one_mod');
        await optimizedFixture(page, ctx.appUrl, input);
        const container = page.getByTestId('markov-constellation-container');
        await container.waitFor();
        assert.equal(
          await container.getAttribute('data-topology-fingerprint'),
          frozen.metadata.topologyFingerprint,
        );
        assert.equal(
          Number(await container.getAttribute('data-node-count')),
          frozen.metadata.serializedSummary.nodeCount,
        );
        assert.equal(
          Number(await container.getAttribute('data-edge-count')),
          frozen.metadata.serializedSummary.edgeCount,
        );
        assert.equal(await container.getAttribute('data-layout-mode'), 'SCC_HYBRID_SEMANTIC_V2');
        assert(Number(await container.getAttribute('data-large-scc-count')) > 0);
        assert(Number(await container.getAttribute('data-large-scc-node-count')) >= 40);
        assert(Number(await container.getAttribute('data-semantic-band-count')) >= 3);
        assert(Number(await container.getAttribute('data-layout-horizontal-span')) >= 560);
        assert(Number(await container.getAttribute('data-layout-vertical-span')) >= 500);
        assert(Number(await container.getAttribute('data-minimum-node-distance')) > 40);
        assert.equal(
          await container.getAttribute('data-default-chronological-ordinals'),
          'false',
        );
        const recoveryCorridors = container.locator(
          '[data-edge-anchor][data-edge-routing="RECOVERY_CORRIDOR"]',
        );
        assert.equal(
          await recoveryCorridors.count(),
          Number(await container.getAttribute('data-recovery-corridor-edge-count')),
        );
        assert(await recoveryCorridors.count() > 0);
        assert.equal(await container.locator('.node-label-step').count(), 0,
          'Default labels expose misleading traversal ordinals');
        const bands = await container.locator('[data-node-anchor]').evaluateAll((nodes) =>
          [...new Set(nodes.map((node) => node.getAttribute('data-semantic-band')))]
        );
        assert(bands.includes('MAGIC_ROLLING'));
        assert(bands.includes('RARE_FINISHING'));
        assert(bands.includes('RECOVERY'));
        assert(bands.includes('GOAL'));
        const goalSeparation = await container.locator('[data-node-anchor]').evaluateAll((nodes) => {
          const values = nodes.map((node) => ({
            band: node.getAttribute('data-semantic-band'),
            x: Number(node.getAttribute('data-node-x')),
          }));
          return {
            goalMin: Math.min(...values.filter((entry) => entry.band === 'GOAL').map((entry) => entry.x)),
            normalMin: Math.min(...values.filter((entry) => entry.band !== 'GOAL').map((entry) => entry.x)),
          };
        });
        assert(goalSeparation.goalMin > goalSeparation.normalMin);
        const collisionCount = await container.locator('.constellation-node-label')
          .evaluateAll((labels) => {
            const rectangles = labels.map((label) => label.getBoundingClientRect())
              .filter((rect) => rect.width > 0 && rect.height > 0);
            let count = 0;
            for (let left = 0; left < rectangles.length; left++) {
              for (let right = left + 1; right < rectangles.length; right++) {
                if (rectangles[left].left < rectangles[right].right &&
                  rectangles[left].right > rectangles[right].left &&
                  rectangles[left].top < rectangles[right].bottom &&
                  rectangles[left].bottom > rectangles[right].top) count++;
              }
            }
            return count;
          });
        assert.equal(collisionCount, 0, 'Default Constellation labels overlap');
        const viewportHeight = await container.locator('.constellation-viewport')
          .evaluate((element) => element.getBoundingClientRect().height);
        assert(viewportHeight >= 690, `Desktop Constellation viewport is only ${viewportHeight}px`);
        const firstNode = container.locator('[data-node-anchor]').first();
        await firstNode.focus();
        await page.keyboard.press('Enter');
        await page.getByLabel('Selected constellation node details').waitFor();
        await page.getByRole('button', { name: 'Close selected node details' }).click();
        const firstRecovery = recoveryCorridors.first();
        await firstRecovery.focus();
        await page.keyboard.press('Enter');
        await page.getByLabel('Selected constellation edge details').waitFor();
        await page.getByRole('button', { name: 'Close selected edge details' }).click();
        await page.getByRole('button', { name: 'Fit All' }).click();
        assert.equal(await container.getAttribute('data-camera-fit-mode'), 'ALL');
        await page.getByRole('button', { name: 'Reset View' }).click();
        await page.getByRole('button', { name: 'Route Focus' }).click();
        assert.equal(await container.getAttribute('data-camera-fit-mode'), 'SELECTED_ROUTE');
        mkdirSync(stableEvidenceDirectory, { recursive: true });
        const desktopPath = join(stableEvidenceDirectory, 'phase3c-constellation-1440x900.png');
        await page.screenshot({ path: desktopPath, fullPage: true });
        await page.setViewportSize({ width: 1920, height: 1080 });
        const widePath = join(stableEvidenceDirectory, 'phase3c-constellation-1920x1080.png');
        await page.screenshot({ path: widePath, fullPage: true });
        await page.setViewportSize({ width: 390, height: 844 });
        const mobileGeometry = await page.evaluate(() => ({
          viewport: document.documentElement.clientWidth,
          documentWidth: document.documentElement.scrollWidth,
          bodyWidth: document.body.scrollWidth,
        }));
        assert(mobileGeometry.documentWidth <= mobileGeometry.viewport + 1);
        assert(mobileGeometry.bodyWidth <= mobileGeometry.viewport + 1);
        const mobilePath = join(stableEvidenceDirectory, 'phase3c-constellation-mobile.png');
        await page.screenshot({ path: mobilePath, fullPage: true });
        ctx.artifacts.phase3cConstellationDesktop = relative(repositoryRoot, desktopPath);
        ctx.artifacts.phase3cConstellationWide = relative(repositoryRoot, widePath);
        ctx.artifacts.phase3cConstellationMobile = relative(repositoryRoot, mobilePath);
        return {
          topologyFingerprint: frozen.metadata.topologyFingerprint,
          nodeCount: frozen.metadata.serializedSummary.nodeCount,
          edgeCount: frozen.metadata.serializedSummary.edgeCount,
          layoutMode: await container.getAttribute('data-layout-mode'),
          semanticBands: bands,
          horizontalSpan: Number(await container.getAttribute('data-layout-horizontal-span')),
          verticalSpan: Number(await container.getAttribute('data-layout-vertical-span')),
          minimumNodeDistance: Number(await container.getAttribute('data-minimum-node-distance')),
          recoveryCorridors: await recoveryCorridors.count(),
          collisionCount,
          viewportHeight,
          goalSeparation,
          mobileGeometry,
          interactions: { node: true, edge: true, fitAll: true, reset: true, routeFocus: true },
          screenshots: {
            desktop: ctx.artifacts.phase3cConstellationDesktop,
            wide: ctx.artifacts.phase3cConstellationWide,
            mobile: ctx.artifacts.phase3cConstellationMobile,
          },
        };
      }, {
        frozenFlow: frozen.flow,
        viewport: { width: 1440, height: 900 },
      });
    }

    case 'real-policy-flow-differential':
      return withPage(ctx, async (page) => {
        const frozen = loadFrozenPolicyFlow();
        const input = fixture('cheap_one_mod');
        const result = await optimizedFixture(page, ctx.appUrl, input);
        const flow = selectedPolicyFlow(result, 'real clean flow');
        assert.equal(sha256(stableJson(flow)), frozen.metadata.serializedSummary.normalizedSummarySha256,
          'Real Worker flow differs from the reviewed frozen flow summary');
        assert.deepEqual(stableJson(flow), stableJson(frozen.flow));
        const topology = jsonRecord(flow.topology, 'real topology');
        const container = page.getByTestId('markov-constellation-container');
        await container.waitFor();
        assert.equal(await container.getAttribute('data-topology-fingerprint'), String(topology.fingerprint));
        assert.equal(Number(await container.getAttribute('data-node-count')), frozen.metadata.serializedSummary.nodeCount);
        assert.equal(Number(await container.getAttribute('data-edge-count')), frozen.metadata.serializedSummary.edgeCount);
        return {
          sourceAppCommit: frozen.metadata.sourceAppCommit,
          normalizedSummarySha256: frozen.metadata.serializedSummary.normalizedSummarySha256,
          topologyFingerprint: topology.fingerprint,
          conservation: assertFlowConservation(flow, 'real clean flow'),
          workerToDom: true,
        };
      });

    case 'frozen-policy-flow-renderer': {
      const frozen = loadFrozenPolicyFlow();
      return withPage(ctx, async (page) => {
        const input = fixture('cheap_one_mod');
        await optimizedFixture(page, ctx.appUrl, input);
        const marker = await page.evaluate(() =>
          (window as Window & { __QUALITY_LAB_FROZEN_POLICY_FLOW__?: unknown }).__QUALITY_LAB_FROZEN_POLICY_FLOW__
        );
        assert(marker, 'Harness-only frozen flow Worker wrapper was not installed');
        const container = page.getByTestId('markov-constellation-container');
        await container.waitFor();
        assert.equal(await container.getAttribute('data-topology-fingerprint'), frozen.metadata.topologyFingerprint);
        assert.equal(Number(await container.getAttribute('data-node-count')), frozen.metadata.serializedSummary.nodeCount);
        assert.equal(Number(await container.getAttribute('data-edge-count')), frozen.metadata.serializedSummary.edgeCount);
        const edgeLabels = container.locator('.constellation-edge-label');
        assert(await edgeLabels.count() > 1, 'Frozen graph did not render branch labels');
        await edgeLabels.first().focus();
        await page.keyboard.press('Enter');
        await page.getByLabel('Selected constellation edge details').waitFor();
        return {
          certificationScope: frozen.metadata.certificationScope,
          topologyFingerprint: frozen.metadata.topologyFingerprint,
          nodeCount: frozen.metadata.serializedSummary.nodeCount,
          edgeCount: frozen.metadata.serializedSummary.edgeCount,
          branchInteraction: true,
        };
      }, { frozenFlow: frozen.flow });
    }

    case 'constellation-interaction-short-replay':
      return withPage(ctx, async (page) => {
        const input = fixture('cheap_one_mod');
        const result = await optimizedFixture(page, ctx.appUrl, input);
        const flow = selectedPolicyFlow(result, 'interaction flow');
        const nodes = arrayValue(flow.nodes, 'interaction nodes').map((entry) => jsonRecord(entry, 'interaction node'));
        const edges = arrayValue(flow.edges, 'interaction edges').map((entry) => jsonRecord(entry, 'interaction edge'));
        const branchNode = nodes.find((node) => edges.filter((edge) => edge.sourceNodeId === node.id).length >= 2);
        assert(branchNode);
        const branch = edges.filter((edge) => edge.sourceNodeId === branchNode.id)
          .sort((left, right) => numberValue(right.expectedFlow, 'right flow') - numberValue(left.expectedFlow, 'left flow'))[0];
        const anchor = page.locator(`[data-edge-anchor="${String(branch.id)}"]`);
        await anchor.focus();
        await page.keyboard.press('Enter');
        const detail = page.getByLabel('Selected constellation edge details');
        await detail.waitFor();
        assert.match(await detail.innerText(), /Occupancy-weighted policy-flow probability/);
        await detail.getByRole('button', { name: 'Close selected edge details' }).click();
        const container = page.getByTestId('markov-constellation-container');
        await container.scrollIntoViewIfNeeded();
        await page.getByRole('button', { name: 'Route Focus' }).click();
        const zoomBefore = Number(await container.getAttribute('data-camera-zoom'));
        await page.getByRole('button', { name: 'Zoom constellation in' }).click();
        assert(Number(await container.getAttribute('data-camera-zoom')) > zoomBefore);
        const memoryBefore = await page.evaluate(() =>
          'memory' in performance
            ? (performance as Performance & { memory: { usedJSHeapSize: number } }).memory.usedJSHeapSize
            : undefined
        );
        await page.getByRole('button', { name: /Replay/ }).click();
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        const scrollBefore = await page.evaluate(() => window.scrollY);
        await page.waitForTimeout(10_000);
        const scrollAfter = await page.evaluate(() => window.scrollY);
        assert(Math.abs(scrollAfter - scrollBefore) <= 2);
        const particles = Number(await container.getAttribute('data-particle-count'));
        assert(particles > 0 && particles <= 120);
        const memoryAfter = await page.evaluate(() =>
          'memory' in performance
            ? (performance as Performance & { memory: { usedJSHeapSize: number } }).memory.usedJSHeapSize
            : undefined
        );
        if (memoryBefore !== undefined && memoryAfter !== undefined) {
          assert(memoryAfter - memoryBefore < 64 * 1024 * 1024, 'Short replay heap delta exceeded 64 MiB');
        }
        return {
          selectedEdge: branch.id,
          keyboardCamera: true,
          replayMs: 10_000,
          particles,
          scrollDelta: scrollAfter - scrollBefore,
          memoryDeltaBytes: memoryBefore === undefined || memoryAfter === undefined
            ? undefined
            : memoryAfter - memoryBefore,
        };
      });

    case 'five-minute-replay-memory-soak':
      return withPage(ctx, async (page) => {
        await optimizedFixture(page, ctx.appUrl, fixture('cheap_one_mod'));
        const container = page.getByTestId('markov-constellation-container');
        const memoryBefore = await page.evaluate(() =>
          'memory' in performance
            ? (performance as Performance & { memory: { usedJSHeapSize: number } }).memory.usedJSHeapSize
            : undefined
        );
        await page.getByRole('button', { name: /Replay/ }).click();
        await page.waitForTimeout(300_000);
        const memoryAfter = await page.evaluate(() =>
          'memory' in performance
            ? (performance as Performance & { memory: { usedJSHeapSize: number } }).memory.usedJSHeapSize
            : undefined
        );
        const particles = Number(await container.getAttribute('data-particle-count'));
        assert(particles <= 120);
        return {
          soakMs: 300_000,
          particles,
          memoryDeltaBytes: memoryBefore === undefined || memoryAfter === undefined
            ? undefined
            : memoryAfter - memoryBefore,
        };
      });

    case 'exhaustive-viewport-matrix':
      return withPage(ctx, async (page) => {
        await optimizedFixture(page, ctx.appUrl, fixture('cheap_one_mod'));
        const viewports = [
          [320, 568], [360, 800], [390, 844], [412, 915], [768, 1024], [820, 1180],
          [1024, 768], [1280, 720], [1280, 960], [1440, 900], [1920, 1080], [2560, 1440],
        ] as const;
        const observations: JsonRecord[] = [];
        for (const [width, height] of viewports) {
          await page.setViewportSize({ width, height });
          const geometry = await page.evaluate(() => ({
            viewport: document.documentElement.clientWidth,
            documentWidth: document.documentElement.scrollWidth,
          }));
          assert(numberValue(geometry.documentWidth, 'document width') <= numberValue(geometry.viewport, 'viewport') + 1);
          observations.push({ width, height, ...geometry });
        }
        return { viewports: observations };
      });

    case 'research-field-proof':
      return withPage(ctx, async (page) => {
        const input = fixture('phase2y_field_three_notable');
        const result = await optimizedFixture(page, ctx.appUrl, input);
        assertTarget(result, input);
        const flow = selectedPolicyFlow(result, 'Phase 3B field control');
        const conserved = assertFlowConservation(flow, 'Phase 3B field control');
        const nodes = arrayValue(flow.nodes, 'field nodes').map((entry) => jsonRecord(entry, 'field node'));
        const edges = arrayValue(flow.edges, 'field edges').map((entry) => jsonRecord(entry, 'field edge'));
        const scourDestinations = edges.filter((edge) => edge.actionId === 'scouring_orb').map((edge) => {
          const destination = nodes.find((node) => node.id === edge.targetNodeId);
          return {
            sourceNodeId: edge.sourceNodeId,
            targetNodeId: edge.targetNodeId,
            rarity: destination?.rarity,
            selectedActionId: destination?.selectedActionId,
          };
        });
        assert(scourDestinations.length > 0, 'Field control has no selected Scour recovery');
        assert(scourDestinations.every((destination) =>
          destination.rarity === 'magic' && destination.selectedActionId === 'augmentation_orb'
        ), 'Field Scour did not continue from the actual one-fractured Magic state into selected Augment');
        const route = phase3bRouteEvidence(result);
        mkdirSync(stableEvidenceDirectory, { recursive: true });
        const artifactPath = join(stableEvidenceDirectory, 'phase3b-field-three-notable.json');
        writeFileSync(artifactPath, `${JSON.stringify({ input, route, scourDestinations, flow }, null, 2)}\n`, 'utf8');
        ctx.artifacts.phase3bFieldThreeNotable = relative(repositoryRoot, artifactPath);
        return {
          fixture: input.id,
          route,
          conserved,
          topology: flow.topology,
          scourDestinations,
          accounting: assertCanonicalAccounting(result),
          proofStatus: result.objectiveProofStatus,
          search: result.search,
          artifact: ctx.artifacts.phase3bFieldThreeNotable,
        };
      });

    case 'generated-fuzz-matrix':
      return withPage(ctx, async (page) => {
        const ids = ['herald_envoy_endbringer', 'three_notable', 'phase2y_field_three_notable'];
        const observations: JsonRecord[] = [];
        for (const id of ids) {
          const input = fixture(id);
          const result = await optimizedFixture(page, ctx.appUrl, input);
          assertTarget(result, input);
          observations.push({ id, status: result.recommendationStatus, accounting: assertCanonicalAccounting(result) });
        }
        return { generatedCases: observations };
      });

    default:
      throw new Error(`No gate operation is implemented for ${ctx.currentGate.operation}`);
  }
}

function executionIdentity(
  definition: QualityGateDefinition,
  invocation: WorkerInvocation,
  browserVersion: string,
): GateExecutionIdentity {
  return {
    applicationSourceBuildHash: invocation.suiteIdentity.applicationSourceBuildHash,
    gateIdVersion: `${definition.id}@${definition.version}`,
    fixtureCorpusVersion: invocation.suiteIdentity.fixtureCorpusVersion,
    fixtureInputHash: invocation.fixtureInputHashes[definition.id] ?? sha256('no-fixture'),
    priceSnapshotIdentity: invocation.suiteIdentity.priceSnapshotIdentity,
    browserVersion,
    harnessVersion: invocation.suiteIdentity.harnessVersion,
    compatibilityHash: invocation.suiteIdentity.compatibilityHash,
  };
}

function elapsedLabel(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}` : `${totalSeconds}s`;
}

async function main(): Promise<void> {
  const invocationPath = argumentValue('--invocation');
  if (!invocationPath) throw new Error('gateWorker requires --invocation <json>');
  const invocation = JSON.parse(readFileSync(resolve(invocationPath), 'utf8')) as WorkerInvocation;
  mkdirSync(dirname(invocation.reportPath), { recursive: true });
  mkdirSync(invocation.artifactsDirectory, { recursive: true });
  const results: QualityGateResult[] = [];
  const artifacts: Record<string, string> = {};
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const networkErrors: string[] = [];
  const wallStarted = performance.now();
  let appStartupMs = 0;
  let browserStartupMs = 0;
  let browser: Browser | undefined;
  let app: Awaited<ReturnType<typeof launchProductionApp>> | undefined;

  try {
    const appStarted = performance.now();
    app = await launchProductionApp({ port: invocation.port });
    appStartupMs = performance.now() - appStarted;
    const browserStarted = performance.now();
    browser = await chromium.launch({ headless: true });
    browserStartupMs = performance.now() - browserStarted;
    const browserVersion = browser.version();
    assert.equal(browserVersion, invocation.suiteIdentity.browserVersion,
      'Launched Chromium differs from the checkpoint browser identity');

    for (const gateId of invocation.gateIds) {
      const definition = gateById(gateId);
      const index = invocation.gateIndices[gateId] ?? 0;
      const prefix = `[${index}/${invocation.totalGateCount}]`;
      const startedAt = new Date().toISOString();
      const started = performance.now();
      console.log(`${prefix} RUN   ${definition.id}`);
      const heartbeat = setInterval(() => {
        console.log(`${prefix} RUN   ${definition.id}  ${elapsedLabel(performance.now() - started)} elapsed`);
      }, 5_000);
      try {
        const details = await runGateOperation({
          browser,
          appUrl: app.url,
          port: invocation.port,
          invocation,
          fixtureCorpus,
          artifacts,
          consoleErrors,
          pageErrors,
          networkErrors,
          currentGate: definition,
        });
        if (invocation.injectFailureGateId === gateId) {
          throw new Error(`Controlled Phase 3A checkpoint failure injected for ${gateId}`);
        }
        const durationMs = Math.round(performance.now() - started);
        results.push({
          id: gateId,
          title: definition.title,
          phase: definition.phase,
          shard: definition.shard,
          tags: definition.tags,
          costClass: definition.costClass,
          status: 'PASS',
          passed: true,
          startedAt,
          finishedAt: new Date().toISOString(),
          durationMs,
          details,
          executionIdentity: executionIdentity(definition, invocation, browserVersion),
        });
        console.log(`${prefix} PASS  ${definition.id}  ${(durationMs / 1000).toFixed(1)}s`);
      } catch (error) {
        const durationMs = Math.round(performance.now() - started);
        const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        const rerunCommand = `npm run -- lab:gate -- --gate ${gateId}`;
        results.push({
          id: gateId,
          title: definition.title,
          phase: definition.phase,
          shard: definition.shard,
          tags: definition.tags,
          costClass: definition.costClass,
          status: 'FAIL',
          passed: false,
          startedAt,
          finishedAt: new Date().toISOString(),
          durationMs,
          details: 'Observed assertion failed.',
          error: message,
          rerunCommand,
          executionIdentity: executionIdentity(definition, invocation, browserVersion),
        });
        console.error(`${prefix} FAIL  ${definition.id}  ${(durationMs / 1000).toFixed(1)}s`);
        console.error(`Rerun: ${rerunCommand}`);
        console.error(message);
      } finally {
        clearInterval(heartbeat);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    for (const gateId of invocation.gateIds.filter((id) => !results.some((result) => result.id === id))) {
      const definition = gateById(gateId);
      results.push({
        id: gateId,
        title: definition.title,
        phase: definition.phase,
        shard: definition.shard,
        tags: definition.tags,
        costClass: definition.costClass,
        status: 'FAIL',
        passed: false,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: 0,
        details: 'Shard startup failed closed.',
        error: message,
        rerunCommand: `npm run -- lab:gate -- --gate ${gateId}`,
        executionIdentity: executionIdentity(definition, invocation, invocation.suiteIdentity.browserVersion),
      });
    }
    console.error(message);
  } finally {
    if (browser) await browser.close();
    await app?.stop();
  }

  const report: QualityShardReport = {
    shard: invocation.shard,
    browserVersion: browser?.version() ?? invocation.suiteIdentity.browserVersion,
    appStartupMs: Math.round(appStartupMs),
    browserStartupMs: Math.round(browserStartupMs),
    wallMs: Math.round(performance.now() - wallStarted),
    results,
    consoleErrors,
    pageErrors,
    networkErrors,
    artifacts,
  };
  writeFileSync(invocation.reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`[shard ${invocation.shard}] ${results.filter((result) => result.passed).length}/${results.length} passed; report ${relative(repositoryRoot, invocation.reportPath)}`);
  if (results.some((result) => !result.passed)) process.exitCode = 1;
}

void main();
