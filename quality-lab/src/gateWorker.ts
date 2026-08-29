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
import { runPhase3GDomainSolverDiagnostics } from './phase3gDiagnostics.ts';
import { runPhase3HHandoffDiagnostics } from './phase3hDiagnostics.ts';
import { runPhase3IInformationArchitectureDiagnostics } from './phase3iDiagnostics.ts';
import { runPhase3JPlayerRuleDiagnostics } from './phase3jDiagnostics.ts';
import {
  proofPresentation,
  searchEvidencePresentation,
} from '../../src/optimizerPresentation.ts';
import type { OptimizeCraftResult } from '../../crafting-engine/src/service/optimizerService.ts';

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
  selectedRouteName?: string;
  selectedCostChaos?: number;
  policyFlowVersion: string;
  topologyFingerprint: string;
  exactFlowFingerprint?: string;
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

function frozenFlowWorkerOverride(
  flow: JsonRecord,
  acquisitionContext?: JsonRecord,
): string {
  const serializedFlow = JSON.stringify(flow).replaceAll('<', '\\u003c');
  const serializedAcquisitionContext = JSON.stringify(acquisitionContext ?? null)
    .replaceAll('<', '\\u003c');
  return String.raw`
(() => {
  const FrozenFlow = ${serializedFlow};
  const FrozenAcquisitionContext = ${serializedAcquisitionContext};
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
          data = {
            ...data,
            result: {
              ...data.result,
              policyFlow: FrozenFlow,
              presentation: FrozenAcquisitionContext
                ? { ...data.result.presentation, acquisitionContext: FrozenAcquisitionContext }
                : data.result.presentation,
            },
          };
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
  options: {
    frozenFlow?: JsonRecord;
    frozenAcquisitionContext?: JsonRecord;
    viewport?: { width: number; height: number };
  } = {},
): Promise<T> {
  const context = await ctx.browser.newContext({
    viewport: options.viewport ?? { width: 1280, height: 960 },
    hasTouch: true,
    acceptDownloads: true,
    reducedMotion: 'no-preference',
  });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ctx.appUrl.slice(0, -1) });
  await context.addInitScript({ content: WORKER_CAPTURE_INIT_SCRIPT });
  if (options.frozenFlow) {
    await context.addInitScript({
      content: frozenFlowWorkerOverride(options.frozenFlow, options.frozenAcquisitionContext),
    });
  }
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
  // The optimizer deliberately starts a module Worker during hydration. Its
  // network lifecycle is independent from DOM readiness, so a network-idle
  // navigation can time out even when the complete page is already interactive.
  await page.goto(`${appUrl}#optimizer`, { waitUntil: 'domcontentloaded' });
  await page.locator('#optimizer-input-title').waitFor();
}

async function openOptimizerDisclosure(page: Page, testId: string): Promise<void> {
  const disclosure = page.getByTestId(testId);
  const toggle = disclosure.locator('button[aria-expanded]').first();
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
}

async function visibleConstellation(page: Page) {
  const container = page.getByTestId('markov-constellation-container');
  await container.waitFor({ state: 'visible' });
  const ancestry = await container.evaluate((element) => ({
    disclosure: element.closest('[data-testid$="-disclosure"]')?.getAttribute('data-testid') ?? null,
    details: element.closest('details') !== null,
    ariaExpanded: element.closest('[aria-expanded]') !== null,
  }));
  assert.deepEqual(ancestry, { disclosure: null, details: false, ariaExpanded: false });
  return container;
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
      acceptableAnyOf: input.acceptableAnyOf?.map((branch) =>
        branch.map((modId) => ({ modId }))
      ),
      finalRarity: input.finalRarity,
      maxUnmatchedAffixes: input.extraAffixes === 'no-unwanted' ? 0 : undefined,
      prices: input.priceContext,
      marketContext: input.marketContext,
      expectedSaleValueChaos: input.expectedSaleValueChaos,
    })),
  });
  await page.waitForFunction(({ required, acceptable }) => {
    const observedRequired = [...document.querySelectorAll(
      '[data-testid="required-modifier-summary"] li[data-mod-id]',
    )]
      .map((element) => element.getAttribute('data-mod-id'))
      .filter((id): id is string => typeof id === 'string')
      .sort((left, right) => left.localeCompare(right));
    const observedAcceptable = [...document.querySelectorAll(
      '[data-testid="acceptable-alternative-summary"] li[data-mod-id]',
    )]
      .map((element) => element.getAttribute('data-mod-id'))
      .filter((id): id is string => typeof id === 'string')
      .sort((left, right) => left.localeCompare(right));
    return JSON.stringify(observedRequired) === JSON.stringify([...required].sort()) &&
      JSON.stringify(observedAcceptable) === JSON.stringify([...acceptable].sort());
  }, { required: input.targetMods, acceptable: input.acceptableAnyOf?.flat() ?? [] });
}

async function setBudget(page: Page, budget: FixtureRecord['searchBudget']): Promise<void> {
  await openOptimizerDisclosure(page, 'optimization-settings-disclosure');
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

async function launchQuotedClusterHandoff(page: Page, appUrl: string) {
  if (!page.url().startsWith(appUrl)) await page.goto(appUrl, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Cluster Jewels', exact: true }).click();
  await page.locator('.table-wrap table').waitFor();
  const search = page.locator('input[type="search"]').first();
  await search.fill('6% increased maximum Mana');
  const row = page.locator('tbody tr.clickable')
    .filter({ hasText: '6% increased maximum Mana' })
    .filter({ hasText: 'Small' })
    .first();
  await row.click();
  const combo = page.locator('.detail-row li')
    .filter({ hasText: '35% increased Small Passive Effect' })
    .first();
  await combo.getByRole('button', { name: 'Optimize this combo' }).click();
  const panel = page.locator('.optimizer-handoff-panel');
  await panel.waitFor();
  assert.match(await panel.innerText(), /sampled-low sale value/i);
  await panel.getByRole('button', { name: 'Open Craft Optimizer', exact: true }).click();
  const banner = page.locator('.optimizer-source-banner');
  await banner.waitFor();
  await openOptimizerDisclosure(page, 'target-editor-disclosure');
  await openOptimizerDisclosure(page, 'optimization-settings-disclosure');
  const saleInput = page.getByLabel('Expected sale value (chaos, optional)');
  const sourceQuoteChaos = Number(await saleInput.inputValue());
  assert(Number.isFinite(sourceQuoteChaos) && sourceQuoteChaos > 0);
  assert.equal(await saleInput.getAttribute('data-sale-value-provenance'), 'cluster-source');
  return {
    banner,
    saleInput,
    sourceQuoteChaos,
    bannerText: await banner.innerText(),
  };
}

async function compareMethodsIndependently(
  page: Page,
  maxWallTimeMs: number,
): Promise<JsonRecord> {
  await openOptimizerDisclosure(page, 'alternative-methods-disclosure');
  const offset = await workerEventCount(page);
  const compare = page.getByRole('button', { name: 'Compare Methods Independently' });
  await compare.waitFor({ state: 'visible' });
  assert(await compare.isEnabled(), 'Independent method comparison is disabled');
  await compare.click();
  return waitForWorkerResult(page, offset, maxWallTimeMs + 8_000);
}

/** Run a comparison request in a brand-new module Worker/service session. */
async function runFreshWorkerComparison(
  page: Page,
  maxWallTimeMs: number,
): Promise<JsonRecord> {
  const events = await workerEvents(page);
  const spawn = [...events].reverse().find((event) =>
    event.kind === 'WORKER_SPAWN' && typeof event.scriptUrl === 'string'
  );
  const posted = [...events].reverse().find((event) =>
    event.kind === 'POST_MESSAGE_TO_WORKER' && event.payload?.type === 'OPTIMIZE'
  );
  assert(spawn?.scriptUrl, 'Fresh Worker A/B could not recover the built module Worker URL');
  assert(posted?.payload, 'Fresh Worker A/B could not recover the canonical request payload');
  const spawnRecord = spawn as unknown as JsonRecord;
  const offset = await workerEventCount(page);
  await page.evaluate(({
    scriptUrl,
    options,
    payload,
  }: {
    scriptUrl: string;
    options: WorkerOptions;
    payload: JsonRecord;
  }) => {
    const request = JSON.parse(JSON.stringify(payload)) as {
      type: 'OPTIMIZE';
      requestId: string;
      input: Record<string, unknown>;
    };
    request.requestId = `phase3d_fresh_${Date.now()}`;
    request.input = { ...request.input, compareMethodFamilies: true };
    const worker = new Worker(scriptUrl, options as WorkerOptions);
    (window as Window & { __PHASE3D_FRESH_WORKER__?: Worker }).__PHASE3D_FRESH_WORKER__ = worker;
    worker.postMessage(request);
  }, {
    scriptUrl: spawn.scriptUrl,
    options: (spawnRecord.options ?? { type: 'module' }) as WorkerOptions,
    payload: posted.payload,
  });
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

async function constellationFitGeometry(page: Page): Promise<JsonRecord> {
  return page.getByTestId('markov-constellation-container').evaluate((container) => {
    const viewport = container.querySelector('.constellation-viewport')!.getBoundingClientRect();
    const nodeLabels = [...container.querySelectorAll<HTMLElement>('.constellation-node-label')]
      .map((element) => ({
        element,
        rect: element.getBoundingClientRect(),
      }))
      .filter(({ rect }) => rect.width > 0 && rect.height > 0);
    const scopeHeaders = [...container.querySelectorAll<HTMLElement>('.constellation-scope-header')]
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width > 0 && rect.height > 0);
    const handoffLabels = [...container.querySelectorAll<HTMLElement>(
      '.constellation-edge-label.scope-handoff-edge',
    )]
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width > 0 && rect.height > 0);
    const checked = [...nodeLabels, ...scopeHeaders, ...handoffLabels];
    const outside = checked.filter(({ rect }) =>
      rect.left < viewport.left - 1 || rect.right > viewport.right + 1 ||
      rect.top < viewport.top - 1 || rect.bottom > viewport.bottom + 1
    ).map(({ element }) =>
      element.getAttribute('data-node-id') ??
      element.getAttribute('data-edge-id') ??
      element.getAttribute('data-scope') ??
      element.className
    );
    let collisionCount = 0;
    for (let left = 0; left < nodeLabels.length; left++) {
      for (let right = left + 1; right < nodeLabels.length; right++) {
        const a = nodeLabels[left].rect;
        const b = nodeLabels[right].rect;
        if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) {
          collisionCount++;
        }
      }
    }
    const goalIds = [...container.querySelectorAll<HTMLElement>(
      '[data-node-anchor][data-semantic-band="GOAL"]',
    )].map((element) => element.dataset.nodeId);
    const visibleGoalLabels = goalIds.filter((id) =>
      id && nodeLabels.some(({ element }) => element.dataset.nodeId === id)
    );
    const occupied = [...container.querySelectorAll<HTMLElement>(
      '[data-node-anchor], .constellation-node-label',
    )]
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width > 0 && rect.height > 0);
    const occupiedTop = occupied.length > 0
      ? Math.min(...occupied.map(({ rect }) => rect.top))
      : viewport.top;
    const occupiedBottom = occupied.length > 0
      ? Math.max(...occupied.map(({ rect }) => rect.bottom))
      : viewport.bottom;
    return {
      viewport: {
        left: viewport.left,
        top: viewport.top,
        right: viewport.right,
        bottom: viewport.bottom,
        width: viewport.width,
        height: viewport.height,
      },
      nodeLabelCount: nodeLabels.length,
      scopeHeaderCount: scopeHeaders.length,
      handoffLabelCount: handoffLabels.length,
      outside,
      collisionCount,
      goalCount: goalIds.length,
      visibleGoalLabelCount: visibleGoalLabels.length,
      topGap: occupiedTop - viewport.top,
      bottomGap: viewport.bottom - occupiedBottom,
    };
  });
}

function assertTarget(result: JsonRecord, input: FixtureRecord): void {
  const target = jsonRecord(result.target, 'result target');
  const ids = arrayValue(target.requiredMods, 'target modifiers')
    .map((entry) => jsonRecord(entry, 'target modifier').modId);
  assert.deepEqual(canonicalIds(ids), canonicalIds(input.targetMods));
  const alternatives = arrayValue(target.acceptableAnyOf ?? [], 'acceptable alternatives')
    .map((branch) => arrayValue(branch, 'acceptable branch')
      .map((entry) => jsonRecord(entry, 'acceptable requirement').modId));
  assert.deepEqual(
    alternatives.map((branch) => canonicalIds(branch)).sort(),
    (input.acceptableAnyOf ?? []).map((branch) => canonicalIds(branch)).sort(),
  );
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
        await visibleConstellation(page);
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

    case 'phase3g-alternative-domain-solver':
      return withPage(ctx, async (page) => {
        const input = fixture('phase3g_spell_damage_alternatives');
        const direct = runPhase3GDomainSolverDiagnostics({
          baseType: 'Large Cluster Jewel',
          clusterType: input.clusterType,
          itemLevel: input.itemLevel,
          passiveCount: input.passiveCount,
          requiredIds: input.targetMods,
          acceptableIds: input.acceptableAnyOf?.flat() ?? [],
        });
        const result = await optimizedFixture(page, ctx.appUrl, input);
        assertTarget(result, input);
        const flow = selectedPolicyFlow(result, 'Phase 3G field target');
        const solver = jsonRecord(result.solver, 'Phase 3G solver reconciliation');
        const risk = jsonRecord(result.risk, 'Phase 3G policy risk');
        assert.equal(solver.bellmanConverged, true);
        assert.equal(solver.occupancyConverged, true);
        assert.equal(solver.costReconciled, true);
        if (risk.selectedPolicyProper === true) {
          assertNear(numberValue(risk.terminalAbsorptionProbability, 'terminal absorption'), 1,
            'Phase 3G terminal absorption');
        }
        assert(numberValue(risk.unresolvedOnPolicyProbability, 'unresolved policy mass') >= 0);
        return {
          direct,
          G7: {
            flow: assertFlowConservation(flow, 'Phase 3G field target'),
            accounting: assertCanonicalAccounting(result),
            solver,
            risk,
            unresolvedCompetitors: jsonRecord(result.proof, 'Phase 3G proof').unresolvedCompetitiveCandidates,
          },
          protocol: assertWorkerProtocol(await workerEvents(page)),
        };
      });

    case 'phase3h-handoff-domain-evidence':
      return withPage(ctx, async () => {
        const direct = runPhase3HHandoffDiagnostics();
        const source = readFileSync(resolve(repositoryRoot, 'src', 'CraftOptimizer.tsx'), 'utf8');
        assert.doesNotMatch(source, /Acceptable fourth modifier/i);
        assert.match(source, /Acceptable alternative modifiers/i);
        return {
          direct,
          H9: {
            genericHeading: 'Acceptable alternative modifiers',
            ordinalFourthAbsentFromSource: true,
          },
        };
      });

    case 'phase3i-information-architecture':
      return withPage(ctx, async () => {
        const direct = runPhase3IInformationArchitectureDiagnostics();
        const source = readFileSync(resolve(repositoryRoot, 'src', 'CraftOptimizer.tsx'), 'utf8');
        const disclosureSource = readFileSync(
          resolve(repositoryRoot, 'src', 'components', 'OptimizerDisclosure.tsx'),
          'utf8',
        );
        assert.match(disclosureSource, /aria-expanded=\{open\}/);
        assert.match(disclosureSource, /aria-controls=\{panelId\}/);
        assert.match(disclosureSource, /keepMountedAfterOpen/);
        const draftDependencyBlock = source.slice(
          source.indexOf('const draftInput = useMemo'),
          source.indexOf('const validation = useMemo'),
        );
        assert.doesNotMatch(draftDependencyBlock, /Open|Disclosure|entryMode|presetsOpen/,
          'Presentation state entered authoritative request construction');
        return { ...direct, I16: { retainedGateCoverageRegistered: true } };
      });

    case 'phase3j-player-rule-direct':
      return withPage(ctx, async () => {
        const direct = runPhase3JPlayerRuleDiagnostics();
        const optimizerSource = readFileSync(resolve(repositoryRoot, 'src', 'CraftOptimizer.tsx'), 'utf8');
        const guideSource = readFileSync(
          resolve(repositoryRoot, 'src', 'components', 'SimpleCraftInstructions.tsx'),
          'utf8',
        );
        assert.match(guideSource, /<strong>WHEN<\/strong>/);
        assert.match(guideSource, /<strong>USE<\/strong>/);
        assert.match(guideSource, /<strong>THEN<\/strong>/);
        assert.doesNotMatch(guideSource, /selected policy wants|when needed/i);
        assert.match(optimizerSource, /Advanced policy evidence/);
        assert.match(optimizerSource, /constellation-top-level/);
        assert.doesNotMatch(optimizerSource, /title="Strategy visualization"/);
        return direct;
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
        await visibleConstellation(page);
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

    case 'phase3j-player-rule-worker':
      return withPage(ctx, async (page) => {
        const fieldFixture = fixture('phase3c_primordial_renewal_rotten_claws');
        const input: FixtureRecord = {
          ...fieldFixture,
          searchBudget: { ...fieldFixture.searchBudget, maxStates: 3_334 },
        };
        const result = await optimizedFixture(page, ctx.appUrl, input);
        const craftPlan = jsonRecord(result.craftPlan, 'Phase 3J craft plan');
        assert.equal(craftPlan.status, 'CERTIFIED');
        const certification = jsonRecord(
          craftPlan.playerRuleCertification,
          'Phase 3J player-rule certification',
        );
        assert.equal(certification.status, 'CERTIFIED');
        assert.deepEqual(
          arrayValue(certification.coveredPolicyRuleIndices, 'covered policy rules'),
          arrayValue(certification.sourcePolicyRuleIndices, 'source policy rules'),
        );
        const explanation = arrayValue(result.policyExplanation, 'Phase 3J policy explanation')
          .map((entry) => jsonRecord(entry, 'Phase 3J policy explanation rule'));
        const playerRules = arrayValue(craftPlan.playerRules, 'Phase 3J player rules')
          .map((entry) => jsonRecord(entry, 'Phase 3J player rule'));
        assert(playerRules.length > 0);
        const conditionKeys = new Set<string>();
        let representedStates = 0;
        let expectedVisits = 0;
        for (const playerRule of playerRules) {
          assert.equal(playerRule.evidenceStatus, 'CERTIFIED');
          const actionId = String(playerRule.actionId);
          const policyRuleIndices = arrayValue(playerRule.policyRuleIndices, 'player policy indices')
            .map(Number);
          assert(policyRuleIndices.length > 0);
          assert(policyRuleIndices.every((index) => explanation[index]?.actionId === actionId),
            `Player rule ${String(playerRule.id)} merged a different action`);
          const condition = jsonRecord(playerRule.when, 'player condition');
          const conditionKey = JSON.stringify(condition);
          assert(!conditionKeys.has(conditionKey), 'Published player conditions overlap exactly');
          conditionKeys.add(conditionKey);
          const sourceEvidence = arrayValue(playerRule.sourceEvidence, 'player source evidence')
            .map((entry) => jsonRecord(entry, 'player source evidence row'));
          for (const source of sourceEvidence) {
            const affixes = arrayValue(source.exactAffixes, 'exact affix evidence')
              .map((entry) => jsonRecord(entry, 'exact affix'));
            assert(affixes.every((affix) =>
              ['REQUIRED_TARGET', 'ACCEPTABLE_TARGET', 'JUNK'].includes(String(affix.role))
            ));
            assert(affixes.filter((affix) => affix.role === 'JUNK').every((affix) =>
              ['SAFE_FOR_THIS_RULE', 'BLOCKS_MISSING_TARGET', 'OCCUPIES_LAST_COMPATIBLE_SLOT', 'FRACTURED']
                .includes(String(affix.junkKind))
            ));
          }
          representedStates += numberValue(playerRule.representedStateCount, 'represented states');
          expectedVisits += numberValue(playerRule.expectedVisits, 'expected visits');
        }
        assert.equal(representedStates, certification.representedStateCount);
        assertNear(expectedVisits, numberValue(certification.expectedVisits, 'certified visits'),
          'Phase 3J player-rule visits', 1e-9);
        const representedActions = canonicalIds([...new Set(playerRules.map((rule) => rule.actionId))]);
        assert.deepEqual(representedActions, canonicalIds(
          arrayValue(certification.selectedActionIds, 'selected player actions'),
        ));
        for (const actionId of [
          'alteration_orb',
          'augmentation_orb',
          'regal_orb',
          'exalted_orb',
          'scouring_orb',
          'transmutation_orb',
          'fracturing_orb',
          'restart_reacquire',
        ]) assert(representedActions.includes(actionId), `Phase 3J omitted selected action ${actionId}`);
        const recoveryKinds = playerRules.map((rule) =>
          String(jsonRecord(rule.then, 'player outcome').recoveryKind)
        );
        assert(recoveryKinds.includes('SCOUR_TO_FRACTURED_MAGIC'));
        assert(recoveryKinds.includes('REACQUIRE'));
        assert(recoveryKinds.includes('FRACTURE_HANDOFF_OR_REACQUIRE'));
        assert(craftPlan.playerFinishRule, 'Phase 3J omitted terminal Finish rule');
        const actionRuleCounts = Object.fromEntries(representedActions.map((actionId) => [
          actionId,
          playerRules.filter((rule) => rule.actionId === actionId).length,
        ]));
        return {
          J1_J6: {
            rules: playerRules.length,
            representedStates,
            expectedVisits,
            minimalExceptions: certification.minimalExceptionCount,
          },
          J8: { representedActions, actionRuleCounts },
          J9: { recoveryKinds: canonicalIds(recoveryKinds) },
          J10: { structuredRequiredAcceptableProgressRetained: true },
          J11: { certification: certification.status },
          J14: {
            exactPolicyRules: explanation.length,
            sourceRules: arrayValue(certification.sourcePolicyRuleIndices, 'source rules').length,
          },
          accounting: assertCanonicalAccounting(result),
          flow: assertFlowConservation(selectedPolicyFlow(result, 'Phase 3J Worker'), 'Phase 3J Worker'),
        };
      });

    case 'craft-plan-decision-fidelity':
      return withPage(ctx, async (page) => {
        const fieldFixture = fixture('phase3c_primordial_renewal_rotten_claws');
        // The NORMAL fixture's wall-clock portfolio frontier can legitimately
        // improve from the frozen self-fracture incumbent to a clean incumbent
        // on a faster browser runtime. Bound only this presentation gate at the
        // audited Phase 3D core frontier so it exercises the intended real
        // selected self-fracture policy without changing production ranking.
        const input: FixtureRecord = {
          ...fieldFixture,
          searchBudget: { ...fieldFixture.searchBudget, maxStates: 3_334 },
        };
        const result = await optimizedFixture(page, ctx.appUrl, input);
        assert.equal(jsonRecord(result.recommended, 'Phase 3F recommendation').name,
          'Self-fracture Primordial Bond');
        assertNear(numberValue(result.expectedCostChaos, 'Phase 3F selected U'),
          1459.7923662160777, 'Phase 3F selected U');
        const craftPlan = jsonRecord(result.craftPlan, 'Phase 3F craft plan');
        assert.equal(
          craftPlan.status,
          'CERTIFIED',
          JSON.stringify(craftPlan.playerRuleCertification),
        );
        assert.deepEqual(arrayValue(craftPlan.withheldDecisionDetails, 'withheld decisions'), []);
        const steps = arrayValue(craftPlan.steps, 'craft-plan steps')
          .map((entry) => jsonRecord(entry, 'craft-plan step'));
        const promoteStep = steps.find((step) => step.phase === 'PROMOTE');
        assert(promoteStep, 'Phase 3F result omitted PROMOTE');
        const promoteGroup = arrayValue(promoteStep.decisionDetails, 'PROMOTE decisions')
          .map((entry) => jsonRecord(entry, 'PROMOTE decision'))
          .find((group) => {
            const cohort = jsonRecord(group.cohort, 'PROMOTE cohort');
            return cohort.policyScope === 'ACQUISITION' &&
              cohort.progressKind === 'PREPARATION' && cohort.rarity === 'magic';
          });
        assert(promoteGroup, 'Rendered plan source omitted the Magic preparation cohort');
        assert.equal(promoteGroup.evidenceStatus, 'RECONCILED');
        const promoteCohort = jsonRecord(promoteGroup.cohort, 'Magic preparation cohort');
        assert.deepEqual(canonicalIds(arrayValue(promoteCohort.targetModIds, 'prep targets')),
          ['Primordial Bond']);
        const promoteOptions = arrayValue(promoteGroup.options, 'PROMOTE options')
          .map((entry) => jsonRecord(entry, 'PROMOTE option'));
        const optionByAction = new Map(promoteOptions.map((option) => [String(option.actionId), option]));
        assert.deepEqual(canonicalIds([...optionByAction.keys()]), [
          'alteration_orb',
          'augmentation_orb',
          'regal_orb',
        ]);
        const aggregate = (
          actionId: string,
          representedStateCount: number,
          expectedVisits: number,
        ) => {
          const option = optionByAction.get(actionId);
          assert(option, `PROMOTE omitted ${actionId}`);
          assert.equal(option.representedStateCount, representedStateCount);
          assertNear(numberValue(option.expectedVisits, `${actionId} visits`), expectedVisits,
            `${actionId} visits`, 1e-9);
          return option;
        };
        const alter = aggregate('alteration_orb', 208, 323.68085106349275);
        const augment = aggregate('augmentation_orb', 13, 82.92021276587121);
        const regal = aggregate('regal_orb', 1, 3.9999999999958216);
        const explanation = arrayValue(result.policyExplanation, 'policy explanation')
          .map((entry) => jsonRecord(entry, 'policy explanation rule'));
        for (const option of [alter, augment, regal]) {
          const indices = arrayValue(option.policyRuleIndices, 'option rule indices').map(Number);
          assert(indices.length > 0);
          const rules = indices.map((index) => explanation[index]);
          assert(rules.every((rule) => rule.actionId === option.actionId));
          assert(rules.every((rule) => {
            const context = jsonRecord(rule.context, 'option rule context');
            return context.policyScope === 'ACQUISITION' &&
              context.progressKind === 'PREPARATION' && context.rarity === 'magic' &&
              Number(context.prefixCount) === arrayValue(context.prefixes, 'prefixes').length &&
              Number(context.suffixCount) === arrayValue(context.suffixes, 'suffixes').length &&
              arrayValue(rule.sourceStateKeys, 'source state keys').length ===
                numberValue(rule.representedStateCount, 'represented states');
          }), `${String(option.actionId)} contains malformed rule context`);
          assert.equal(
            rules.reduce((sum, rule) => sum + numberValue(rule.representedStateCount, 'rule states'), 0),
            option.representedStateCount,
          );
          assertNear(
            rules.reduce((sum, rule) => sum + numberValue(rule.expectedVisits, 'rule visits'), 0),
            numberValue(option.expectedVisits, 'option visits'),
            `${String(option.actionId)} aggregate`,
            1e-9,
          );
        }

        const craftGuide = page.locator('.craft-guide');
        const simpleGuide = craftGuide.locator('.simple-craft-instructions');
        await simpleGuide.waitFor();
        const renderedActions = canonicalIds(await simpleGuide.locator('.player-craft-rule[data-action-id]')
          .evaluateAll((items) => items.map((item) => item.getAttribute('data-action-id'))));
        for (const actionId of ['alteration_orb', 'augmentation_orb', 'regal_orb']) {
          assert(renderedActions.includes(actionId), `Simple guide omitted real Promote action ${actionId}`);
        }
        const renderedExamples: Record<string, string> = Object.fromEntries(
          [alter, augment, regal].map((option) => {
            const sourceRule = explanation[Number(arrayValue(option.policyRuleIndices, 'rule indices')[0])];
            return [String(option.actionId), String(sourceRule.exampleState)];
          }),
        );
        assert.equal(await craftGuide.locator('details.craft-plan-decision-details').count(), 0);

        await openOptimizerDisclosure(page, 'research-diagnostics-disclosure');
        const advancedDetails = page.locator('.advanced-optimizer-details');
        const advancedPolicy = advancedDetails.locator('.advanced-policy-evidence');
        assert(await advancedPolicy.isVisible());
        const decisionCohorts = advancedPolicy.locator('details.advanced-decision-cohorts');
        await decisionCohorts.locator(':scope > summary').click();
        const decisionEvidenceText = await decisionCohorts.innerText();
        assert.match(decisionEvidenceText, /Acquisition-preparation Magic states/i);
        assert.match(decisionEvidenceText, /Final-craft Rare states/i);
        const exactBranches = advancedDetails.locator('details.exact-policy-branches');
        await exactBranches.locator(':scope > summary').click();
        const sourceIdentityCounts = await exactBranches.locator('.craft-rule')
          .evaluateAll((rules) => rules.map((rule) => {
            try {
              const sourceStateKeys = JSON.parse(rule.getAttribute('data-source-state-keys') ?? '[]');
              return Array.isArray(sourceStateKeys) ? sourceStateKeys.length : 0;
            } catch {
              return 0;
            }
          }));
        assert(sourceIdentityCounts.length === explanation.length);
        assert(sourceIdentityCounts.every((count) => count > 0));
        await exactBranches.locator(':scope > summary').click();
        assert(!await craftGuide.innerText().then((text) =>
          /no target modifier present;\s*all target modifiers present/i.test(text)
        ));
        mkdirSync(stableEvidenceDirectory, { recursive: true });
        const screenshotPath = join(
          stableEvidenceDirectory,
          'phase3f-craft-plan-decision-details-1440x900.png',
        );
        await craftGuide.scrollIntoViewIfNeeded();
        await page.screenshot({ path: screenshotPath });
        ctx.artifacts.phase3fCraftPlanDecisionDetails = relative(repositoryRoot, screenshotPath);
        return {
          selectedRoute: jsonRecord(result.recommended, 'recommendation').name,
          expectedCostChaos: result.expectedCostChaos,
          promote: {
            cohort: promoteCohort,
            actions: renderedActions,
            aggregates: {
              alteration_orb: alter,
              augmentation_orb: augment,
              regal_orb: regal,
            },
            examplesMagic: true,
            renderedExamples,
            forbiddenActionsAbsent: true,
          },
          finishExaltScour: true,
          sourceIdentityCounts: {
            rules: sourceIdentityCounts.length,
            minimum: Math.min(...sourceIdentityCounts),
          },
          contradictionAbsent: true,
          screenshot: ctx.artifacts.phase3fCraftPlanDecisionDetails,
        };
      }, { viewport: { width: 1440, height: 900 } });

    case 'full-route-policy-evidence':
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
        const conventional = families.find((family) =>
          jsonRecord(family.spec, 'Conventional spec').kind === 'CONVENTIONAL'
        );
        assert(conventional, 'Real Worker omitted Conventional family');
        const primordialFracture = families.find((candidate) => {
          const spec = jsonRecord(candidate.spec, 'fracture spec');
          return spec.kind === 'SELF_FRACTURE' && String(spec.name).includes('Primordial Bond');
        });
        assert(primordialFracture, 'Real Worker omitted Self-fracture Primordial Bond');
        const fullEvidence = jsonRecord(
          primordialFracture.fullRouteActionEvidence,
          'Primordial full-route evidence',
        );
        const evidenceEntries = arrayValue(fullEvidence.entries, 'full-route evidence entries')
          .map((entry) => jsonRecord(entry, 'full-route evidence entry'));
        assert(evidenceEntries.length > 0);
        assert(evidenceEntries.every((entry) =>
          entry.physicalAcquisitionIdentity === fullEvidence.physicalAcquisitionIdentity &&
          entry.policySessionIdentity === fullEvidence.policySessionIdentity &&
          entry.sourcePolicyFingerprint === fullEvidence.sourcePolicyFingerprint
        ), 'Full-route action evidence identity does not reconcile');
        const fractureEntry = evidenceEntries.find((entry) =>
          entry.actionId === 'fracturing_orb' && entry.scope === 'ACQUISITION' &&
          numberValue(entry.expectedCount, 'Fracturing Orb count') > 0
        );
        assert(fractureEntry, 'Acquisition evidence omitted positive Fracturing Orb use');
        const fractureChecks = arrayValue(
          primordialFracture.requiredActionEvidenceChecks,
          'Primordial required-action checks',
        ).map((entry) => jsonRecord(entry, 'required-action check'));
        const fractureCheck = fractureChecks.find((entry) => entry.actionId === 'fracturing_orb');
        assert(fractureCheck);
        assert.equal(fractureCheck.requiredScope, 'ACQUISITION');
        assert.equal(fractureCheck.observed, true);
        if (primordialFracture.equivalentToSelectedPolicy === true) {
          assert.equal(primordialFracture.status, 'SAME_AS_SELECTED');
          const audit = jsonRecord(
            primordialFracture.selectedOpenPolicyAdmissibility,
            'equivalent selected-policy audit',
          );
          const failures = arrayValue(audit.failures, 'equivalent audit failures')
            .map((failure) => jsonRecord(failure, 'equivalent audit failure'));
          assert(!failures.some((failure) =>
            failure.code === 'REQUIRED_ACTION_NOT_OBSERVED' &&
            failure.actionId === 'fracturing_orb'
          ), 'Same selected policy still says acquisition Fracturing Orb was not observed');
        }
        const acquisitionContext = jsonRecord(
          jsonRecord(result.presentation, 'presentation').acquisitionContext,
          'acquisition context',
        );
        if (acquisitionContext.kind === 'SELF_FRACTURE') {
          const audit = jsonRecord(
            conventional.selectedOpenPolicyAdmissibility,
            'Conventional selected-policy negative control',
          );
          assert.equal(audit.admissible, false);
          const failures = arrayValue(audit.failures, 'Conventional failures')
            .map((failure) => jsonRecord(failure, 'Conventional failure'));
          assert(failures.some((failure) =>
            failure.code === 'ACQUISITION_KIND_MISMATCH' ||
            failure.code === 'ACQUISITION_IDENTITY_MISMATCH' ||
            failure.code === 'ACQUISITION_COST_MISMATCH'
          ));
        } else {
          const audit = jsonRecord(
            primordialFracture.knownPolicyAdmissibility,
            'clean-to-self-fracture negative control',
          );
          assert.equal(audit.admissible, false);
          const failures = arrayValue(audit.failures, 'self-fracture failures')
            .map((failure) => jsonRecord(failure, 'self-fracture failure'));
          assert(failures.some((failure) =>
            failure.code === 'ACQUISITION_KIND_MISMATCH' ||
            failure.code === 'ACQUISITION_IDENTITY_MISMATCH' ||
            failure.code === 'ACQUISITION_COST_MISMATCH'
          ));
        }
        const harvestControls = families.filter((family) =>
          jsonRecord(family.spec, 'family spec').kind === 'HARVEST'
        );
        assert(harvestControls.length > 0);
        assert(harvestControls.every((candidate) =>
          arrayValue(
            jsonRecord(candidate.spec, 'Harvest spec').requiredActionEvidence,
            'Harvest requirements',
          ).every((requirement) =>
            jsonRecord(requirement, 'Harvest requirement').scope === 'DOWNSTREAM'
          )
        ));
        assert(harvestControls.some((candidate) => {
          const rawAudit = candidate.selectedOpenPolicyAdmissibility ??
            candidate.knownPolicyAdmissibility;
          if (!rawAudit) return false;
          const audit = jsonRecord(rawAudit, 'Harvest negative-control audit');
          return audit.admissible === false &&
            arrayValue(audit.failures, 'Harvest failures').some((failure) =>
              jsonRecord(failure, 'Harvest failure').code === 'REQUIRED_ACTION_NOT_OBSERVED'
            );
        }), 'No downstream Harvest negative control was exercised');
        const combinedControls = families.filter((candidate) =>
          jsonRecord(candidate.spec, 'combined spec').kind === 'SELF_FRACTURE_HARVEST'
        );
        assert(combinedControls.length > 0);
        assert(combinedControls.every((candidate) => {
          const requirements = arrayValue(
            jsonRecord(candidate.spec, 'combined spec').requiredActionEvidence,
            'combined requirements',
          ).map((requirement) => jsonRecord(requirement, 'combined requirement'));
          return requirements.some((requirement) =>
            requirement.actionId === 'fracturing_orb' && requirement.scope === 'ACQUISITION'
          ) && requirements.some((requirement) =>
            String(requirement.actionId).startsWith('harvest_reforge_') &&
            requirement.scope === 'DOWNSTREAM'
          );
        }));
        const primordialCard = page.locator(
          `[data-method-family-id="${String(jsonRecord(primordialFracture.spec, 'Primordial spec').id)}"]`,
        );
        await primordialCard.waitFor();
        assert.match(
          String(await primordialCard.getAttribute('data-required-action-evidence')),
          /fracturing_orb:ACQUISITION:true/,
        );
        const cardText = await primordialCard.innerText();
        assert.match(cardText, /Policy execution status/i);
        assert.match(cardText, /Family search status/i);
        assert.match(cardText, /fracturing_orb @ acquisition: observed/i);
        if (primordialFracture.equivalentToSelectedPolicy === true) {
          assert.match(cardText, /Same selected policy/i);
          assert.doesNotMatch(cardText, /required action not observed.*fracturing/i);
        }
        mkdirSync(stableEvidenceDirectory, { recursive: true });
        const artifactPath = join(
          stableEvidenceDirectory,
          'phase3d-full-route-policy-evidence-browser.json',
        );
        writeFileSync(artifactPath, `${JSON.stringify({
          input,
          selected: result.recommended,
          conventional,
          primordialFracture,
          harvestControls: harvestControls.map((candidate) => candidate.spec),
          combinedControls: combinedControls.map((candidate) => candidate.spec),
        }, null, 2)}\n`, 'utf8');
        const screenshotPath = join(
          stableEvidenceDirectory,
          'phase3d-full-route-policy-evidence-desktop.png',
        );
        await page.screenshot({ path: screenshotPath, fullPage: true });
        ctx.artifacts.phase3dPolicyEvidenceBrowser = relative(repositoryRoot, artifactPath);
        ctx.artifacts.phase3dPolicyEvidenceScreenshot = relative(
          repositoryRoot,
          screenshotPath,
        );
        return {
          selectedAcquisitionKind: acquisitionContext.kind,
          primordialFamilyId: jsonRecord(primordialFracture.spec, 'Primordial spec').id,
          primordialStatus: primordialFracture.status,
          equivalentToSelectedPolicy: primordialFracture.equivalentToSelectedPolicy,
          fractureCheck,
          evidenceEntries: evidenceEntries.length,
          harvestFamilies: harvestControls.length,
          combinedFamilies: combinedControls.length,
          accounting: assertCanonicalAccounting(result),
          artifact: ctx.artifacts.phase3dPolicyEvidenceBrowser,
          screenshot: ctx.artifacts.phase3dPolicyEvidenceScreenshot,
        };
      }, { viewport: { width: 1440, height: 900 } });

    case 'core-budget-isolation':
      return withPage(ctx, async (page) => {
        const input = fixture('phase3c_primordial_renewal_rotten_claws');
        const disabled = await optimizedFixture(page, ctx.appUrl, input);
        const disabledSearch = jsonRecord(disabled.search, 'comparison-disabled search');
        const disabledSnapshot = jsonRecord(
          disabledSearch.coreRecommendationSnapshot,
          'comparison-disabled core snapshot',
        );
        assert.equal(disabledSnapshot.compareMethodFamiliesRequested, false);
        const enabled = await runFreshWorkerComparison(page, input.searchBudget.maxWallTimeMs);
        const enabledSearch = jsonRecord(enabled.search, 'comparison-enabled search');
        const enabledSnapshot = jsonRecord(
          enabledSearch.coreRecommendationSnapshot,
          'comparison-enabled core snapshot',
        );
        assert.equal(enabledSnapshot.compareMethodFamiliesRequested, true);
        assert.deepEqual(
          enabledSnapshot.coreEnvelope,
          disabledSnapshot.coreEnvelope,
          'Compare Methods changed the core deadline envelope',
        );
        assert.equal(
          numberValue(
            jsonRecord(enabledSnapshot.coreEnvelope, 'enabled core envelope').deadlineFraction,
            'enabled core fraction',
          ),
          0.85,
        );
        const exactWork = enabledSnapshot.statesExpanded === disabledSnapshot.statesExpanded &&
          enabledSnapshot.retainedStates === disabledSnapshot.retainedStates &&
          enabledSnapshot.retainedStateFingerprint === disabledSnapshot.retainedStateFingerprint;
        const enabledStates = numberValue(enabledSnapshot.statesExpanded, 'enabled core states');
        const disabledStates = numberValue(disabledSnapshot.statesExpanded, 'disabled core states');
        const hostTimedVariance = !exactWork &&
          enabledSnapshot.stopReason === 'HOST_RESERVE' &&
          disabledSnapshot.stopReason === 'HOST_RESERVE';
        if (exactWork) {
          assert.deepEqual(
            enabledSnapshot.candidateExecutableUChaos,
            disabledSnapshot.candidateExecutableUChaos,
          );
          assert.equal(
            enabledSnapshot.selectedExecutableUChaos,
            disabledSnapshot.selectedExecutableUChaos,
          );
          assert.equal(enabledSnapshot.stopReason, disabledSnapshot.stopReason);
          assert.equal(
            enabledSnapshot.canonicalPolicyFingerprint,
            disabledSnapshot.canonicalPolicyFingerprint,
          );
        } else {
          assert(
            hostTimedVariance,
            `Non-exact full-field Worker A/B did not share the HOST_RESERVE boundary ` +
              `(false=${disabledStates}, true=${enabledStates}, ` +
              `falseStop=${String(disabledSnapshot.stopReason)}, ` +
              `trueStop=${String(enabledSnapshot.stopReason)})`,
          );
          // These are separate cold Workers stopped by elapsed host time, not
          // equal-work executions. Throughput can put either request farther
          // along the same frozen envelope, so comparing their incumbent U or
          // policy fingerprint would confuse scheduling variance with optional
          // enrichment. The request-local monotonicity checks below remain
          // authoritative, and the equal-work state-capped A/B remains strict.
          numberValue(enabledSnapshot.selectedExecutableUChaos, 'enabled core U');
          numberValue(disabledSnapshot.selectedExecutableUChaos, 'disabled core U');
          assert.equal(enabledSnapshot.stopReason, disabledSnapshot.stopReason);
        }
        for (const [label, result, core] of [
          ['disabled', disabled, disabledSnapshot],
          ['enabled', enabled, enabledSnapshot],
        ] as const) {
          const ledger = jsonRecord(
            jsonRecord(
              jsonRecord(result.search, `${label} search`).requestBudget,
              `${label} request budget`,
            ).ledger,
            `${label} request ledger`,
          );
          assert.equal(ledger.reconciled, true);
          assert.equal(ledger.clock, 'PERFORMANCE_NOW_MONOTONIC_REQUEST_RELATIVE');
          assert(numberValue(ledger.unclassifiedMs, `${label} unclassified time`) <= 2);
          assert.equal(
            numberValue(ledger.coreDeadlineFraction, `${label} core fraction`),
            0.85,
          );
          const finalCost = numberValue(result.expectedCostChaos, `${label} final U`);
          assert(finalCost <= numberValue(core.selectedExecutableUChaos, `${label} frozen core U`) + 0.05,
            `${label} enrichment worsened the frozen core incumbent`);
          const registry = jsonRecord(result.requestPolicyRegistry, `${label} policy registry`);
          assert.equal(registry.monotone, true);
        }

        // The full field is intentionally time-enveloped and can stop at a
        // different deterministic expansion boundary as host throughput moves.
        // A state-capped rendering of the same request proves exact core work
        // independence without weakening the live field incumbent checks above.
        const deterministicInput: FixtureRecord = {
          ...input,
          id: `${input.id}_deterministic_core_ab`,
          name: `${input.name} deterministic state-capped core A/B`,
          searchBudget: {
            maxStates: 500,
            maxWallTimeMs: 30_000,
            maxExpansionRounds: 3,
          },
        };
        // `ensureOptimizerPage` can be a same-document navigation when the hash
        // is already #optimizer. Reload explicitly so both deterministic halves
        // start from cold Worker/service sessions rather than inheriting the
        // field run's request-local retained graph.
        await page.reload({ waitUntil: 'networkidle' });
        const deterministicDisabled = await optimizedFixture(
          page,
          ctx.appUrl,
          deterministicInput,
        );
        const deterministicDisabledSnapshot = jsonRecord(
          jsonRecord(deterministicDisabled.search, 'deterministic disabled search')
            .coreRecommendationSnapshot,
          'deterministic disabled core snapshot',
        );
        assert.equal(deterministicDisabledSnapshot.compareMethodFamiliesRequested, false);
        const deterministicEnabled = await runFreshWorkerComparison(
          page,
          deterministicInput.searchBudget.maxWallTimeMs,
        );
        const deterministicEnabledSnapshot = jsonRecord(
          jsonRecord(deterministicEnabled.search, 'deterministic enabled search')
            .coreRecommendationSnapshot,
          'deterministic enabled core snapshot',
        );
        assert.equal(deterministicEnabledSnapshot.compareMethodFamiliesRequested, true);
        assert.deepEqual(
          deterministicEnabledSnapshot.coreEnvelope,
          deterministicDisabledSnapshot.coreEnvelope,
        );
        assert.equal(
          deterministicEnabledSnapshot.statesExpanded,
          deterministicDisabledSnapshot.statesExpanded,
          'State-capped compare-methods A/B expanded different core work',
        );
        assert.equal(
          deterministicEnabledSnapshot.retainedStates,
          deterministicDisabledSnapshot.retainedStates,
        );
        assert.equal(
          deterministicEnabledSnapshot.retainedStateFingerprint,
          deterministicDisabledSnapshot.retainedStateFingerprint,
        );
        assert.deepEqual(
          deterministicEnabledSnapshot.candidateExecutableUChaos,
          deterministicDisabledSnapshot.candidateExecutableUChaos,
        );
        assert.equal(
          deterministicEnabledSnapshot.selectedExecutableUChaos,
          deterministicDisabledSnapshot.selectedExecutableUChaos,
        );
        assert.equal(
          deterministicEnabledSnapshot.stopReason,
          deterministicDisabledSnapshot.stopReason,
        );
        assert.equal(
          deterministicEnabledSnapshot.canonicalPolicyFingerprint,
          deterministicDisabledSnapshot.canonicalPolicyFingerprint,
        );
        const currentEvents = await workerEvents(page);
        const freshTerminalTypes = currentEvents
          .filter((event) => String(event.payload?.requestId).startsWith('phase3d_fresh_'))
          .filter((event) => event.kind === 'MESSAGE_FROM_WORKER')
          .map((event) => event.payload?.type);
        assert(freshTerminalTypes.includes('PROGRESS'));
        assert(freshTerminalTypes.includes('COMPLETE'));
        assert(freshTerminalTypes.includes('RESULT'));
        mkdirSync(stableEvidenceDirectory, { recursive: true });
        const artifactPath = join(stableEvidenceDirectory, 'phase3d-core-budget-worker-ab.json');
        writeFileSync(artifactPath, `${JSON.stringify({
          input,
          fieldHostTimed: {
            mode: exactWork ? 'EXACT_CORE_STATE_SET' : 'HOST_TIMED_UNEQUAL_WORK',
            stateDelta: enabledStates - disabledStates,
            retainedStateDelta:
              numberValue(enabledSnapshot.retainedStates, 'enabled retained states') -
              numberValue(disabledSnapshot.retainedStates, 'disabled retained states'),
            disabled: {
              snapshot: disabledSnapshot,
              ledger: jsonRecord(jsonRecord(disabledSearch.requestBudget, 'disabled budget').ledger, 'disabled ledger'),
              finalU: disabled.expectedCostChaos,
            },
            enabled: {
              snapshot: enabledSnapshot,
              ledger: jsonRecord(jsonRecord(enabledSearch.requestBudget, 'enabled budget').ledger, 'enabled ledger'),
              finalU: enabled.expectedCostChaos,
              registry: enabled.requestPolicyRegistry,
            },
          },
          deterministicStateCapped: {
            mode: 'EXACT_CORE_STATE_SET',
            input: deterministicInput,
            disabledSnapshot: deterministicDisabledSnapshot,
            enabledSnapshot: deterministicEnabledSnapshot,
          },
          freshWorkerProtocol: freshTerminalTypes,
        }, null, 2)}\n`, 'utf8');
        ctx.artifacts.phase3dCoreBudgetWorkerAb = relative(repositoryRoot, artifactPath);
        return {
          fieldMode: exactWork ? 'EXACT_CORE_STATE_SET' : 'HOST_TIMED_UNEQUAL_WORK',
          deterministicMode: 'EXACT_CORE_STATE_SET',
          disabledSnapshot,
          enabledSnapshot,
          deterministicDisabledSnapshot,
          deterministicEnabledSnapshot,
          disabledFinalU: disabled.expectedCostChaos,
          enabledFinalU: enabled.expectedCostChaos,
          freshWorkerProtocol: freshTerminalTypes,
          artifact: ctx.artifacts.phase3dCoreBudgetWorkerAb,
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
        await page.waitForFunction(() => document.activeElement?.classList.contains('optimizer-source-banner'));
        assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('optimizer-source-banner')), true);
        await openOptimizerDisclosure(page, 'target-editor-disclosure');
        assert.equal(await page.getByLabel('Base type').inputValue(), 'Large Cluster Jewel');
        assert.equal(await page.getByLabel('Cluster enchantment').inputValue(), '10% increased Attack Damage');
        assert.equal(await page.locator('.optimizer-form .optimizer-grid label')
          .filter({ has: page.getByText('Passive skills', { exact: true }) }).locator('select').first().inputValue(), passiveChoice);
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
        await page.goto(shareUrl, { waitUntil: 'domcontentloaded' });
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

    case 'phase3g-alternative-browser-roundtrip':
      return withPage(ctx, async (page) => {
        const input = fixture('phase3g_spell_damage_alternatives');
        const result = await optimizedFixture(page, ctx.appUrl, input);
        assertTarget(result, input);
        const requiredSummary = page.getByTestId('required-modifier-summary');
        const acceptableSummary = page.getByTestId('acceptable-alternative-summary');
        assert.equal(await requiredSummary.locator('li[data-target-role="required"]').count(), 3);
        assert.equal(await acceptableSummary.locator('li[data-target-role="acceptable-alternative"]').count(), 3);
        const summaryText = await page.getByTestId('structured-target-summary').innerText();
        assert.match(summaryText, /Final rarity:\s*rare/i);
        assert.match(summaryText, /Extra affixes:\s*Allowed/i);
        assert.match(summaryText, /Must have all/i);
        assert.match(summaryText, /And at least one/i);
        assert.doesNotMatch(summaryText, /6\s+(?:required|desired)/i);

        const target = jsonRecord(result.target, 'Phase 3G rendered target');
        const explanationText = JSON.stringify(result.policyExplanation);
        const craftPlanText = JSON.stringify(result.craftPlan);
        assert.doesNotMatch(`${explanationText}\n${craftPlanText}`, /4\/6/);
        const finalContexts = arrayValue(result.policyExplanation, 'Phase 3G policy explanation')
          .map((entry) => jsonRecord(jsonRecord(entry, 'Phase 3G explanation rule').context, 'Phase 3G explanation context'))
          .filter((context) => context.policyScope === 'DOWNSTREAM' && context.progressKind === 'FINAL');
        assert(finalContexts.length > 0);
        for (const context of finalContexts) {
          const requiredIds = canonicalIds(arrayValue(context.requiredTargetModIds, 'final required IDs'));
          const alternativeIds = canonicalIds(arrayValue(context.acceptableTargetBranches, 'final acceptable branches').flat());
          assert.deepEqual(requiredIds, canonicalIds(input.targetMods));
          assert.deepEqual(alternativeIds, canonicalIds(input.acceptableAnyOf!.flat()));
          assert(arrayValue(context.unmatchedRequiredTargetModIds, 'unmatched required IDs')
            .every((modId) => requiredIds.includes(String(modId))));
          assert(arrayValue(context.matchedAcceptableTargetModIds, 'matched acceptable IDs')
            .every((modId) => alternativeIds.includes(String(modId))));
        }
        assert.equal(arrayValue(target.requiredMods, 'Phase 3G required target').length, 3);
        assert.equal(arrayValue(target.acceptableAnyOf, 'Phase 3G acceptable target').length, 3);

        const flow = selectedPolicyFlow(result, 'Phase 3G browser');
        const nodes = arrayValue(flow.nodes, 'Phase 3G flow nodes')
          .map((entry) => jsonRecord(entry, 'Phase 3G flow node'));
        const terminalNodes = nodes.filter((node) => node.terminal === true);
        assert(terminalNodes.length > 0);
        assert(terminalNodes.every((node) =>
          arrayValue(node.matchedRequiredTargetModIds, 'terminal required IDs').length === 3 &&
          node.acceptableAlternativeSatisfied === true
        ));
        const requiredOnlyNodes = nodes.filter((node) =>
          node.terminal !== true &&
          arrayValue(node.matchedRequiredTargetModIds ?? [], 'nonterminal required IDs').length === 3 &&
          node.acceptableAlternativeSatisfied === false
        );
        assert(requiredOnlyNodes.length > 0, 'Selected policy omitted the required 3/3 + alternative 0/1 frontier');

        await visibleConstellation(page);
        const constellation = page.getByTestId('markov-constellation-container');
        await constellation.waitFor();
        const terminalId = String(terminalNodes[0].id);
        await constellation.locator(`.constellation-node-access-list button[data-node-id="${terminalId}"]`).click();
        const detail = page.getByLabel('Selected constellation node details');
        const detailText = await detail.innerText();
        assert.match(detailText, /Required\s+3\/3/i);
        assert.match(detailText, /Alternative\s+1\/1/i);
        assert(input.acceptableAnyOf!.flat().some((modId) => detailText.includes(modId)),
          'Terminal Constellation evidence did not name a matched alternative');

        const exportPath = join(ctx.invocation.artifactsDirectory, 'phase3g-alternative-export.json');
        const exported = await downloadExport(page, exportPath);
        const requestInput = jsonRecord(exported.requestInput, 'Phase 3G exported request');
        const exportedTarget = jsonRecord(requestInput.target, 'Phase 3G exported target');
        assert.deepEqual(exportedTarget.acceptableAnyOf, target.acceptableAnyOf);
        ctx.artifacts.phase3gAlternativeExport = relative(repositoryRoot, exportPath);

        await page.getByRole('button', { name: /Copy Shopping List/ }).click();
        const shopping = await page.evaluate(() => navigator.clipboard.readText());
        assert.match(shopping, /Must have all:/i);
        assert.match(shopping, /And at least one:/i);
        assert.doesNotMatch(shopping, /4\/6/);

        await page.getByRole('button', { name: /Share Link/ }).click();
        const shareUrl = await page.evaluate(() => navigator.clipboard.readText());
        assert.match(shareUrl, /#craft=/);
        await page.goto(shareUrl, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(({ required, acceptable }) => {
          const requiredIds = [...document.querySelectorAll('[data-testid="required-modifier-summary"] li')]
            .map((node) => node.getAttribute('data-mod-id')).filter(Boolean).sort();
          const acceptableIds = [...document.querySelectorAll('[data-testid="acceptable-alternative-summary"] li')]
            .map((node) => node.getAttribute('data-mod-id')).filter(Boolean).sort();
          return JSON.stringify(requiredIds) === JSON.stringify([...required].sort()) &&
            JSON.stringify(acceptableIds) === JSON.stringify([...acceptable].sort());
        }, { required: input.targetMods, acceptable: input.acceptableAnyOf!.flat() });
        const restoredSummary = await page.getByTestId('structured-target-summary').innerText();
        assert.match(restoredSummary, /Must have all/i);
        assert.match(restoredSummary, /And at least one/i);
        return {
          fixture: input.id,
          requiredCount: 3,
          acceptableCount: 3,
          terminalCount: terminalNodes.length,
          requiredOnlyFrontierCount: requiredOnlyNodes.length,
          matchedAlternativeEvidence: true,
          shareHashLength: new URL(shareUrl).hash.length,
          export: ctx.artifacts.phase3gAlternativeExport,
        };
      });

    case 'phase3h-handoff-field-browser':
      return withPage(ctx, async (page) => {
        await page.goto(ctx.appUrl, { waitUntil: 'networkidle' });

        const initial = await launchQuotedClusterHandoff(page, ctx.appUrl);
        assert.match(initial.bannerText, /Loaded from Cluster Jewels/i);
        assert(initial.bannerText.includes(initial.sourceQuoteChaos.toFixed(1)));
        const initialSeedId = await initial.banner.getAttribute('data-seed-id');

        // H5: preferences and request depth do not own the physical handoff identity.
        await openOptimizerDisclosure(page, 'optimization-settings-disclosure');
        await page.getByLabel('Optimization goal').selectOption('BALANCED_VALUE_OF_TIME');
        await page.getByLabel('Search depth preset').selectOption('DEEP');
        await page.locator('details.pricing-controls > summary').click();
        await page.locator('details.pricing-controls > summary').click();
        await page.locator('details.advanced-controls > summary').click();
        await page.locator('details.advanced-controls > summary').click();
        assert.equal(await page.locator('.optimizer-source-banner').count(), 1);

        // H4/H6: an identity edit detaches, clearing a source-owned quote; reverting is one-way.
        const originalItemLevel = await page.getByLabel('Item level').inputValue();
        await page.getByLabel('Item level').fill(String(Number(originalItemLevel) - 1));
        await page.locator('.optimizer-source-banner').waitFor({ state: 'detached' });
        assert.equal(await initial.saleInput.inputValue(), '');
        assert.equal(await initial.saleInput.getAttribute('data-sale-value-provenance'), 'empty');
        await page.getByLabel('Item level').fill(originalItemLevel);
        assert.equal(await page.locator('.optimizer-source-banner').count(), 0);
        assert.equal(await page.getByRole('button', { name: 'Back to Cluster Jewels' }).count(), 0);

        const second = await launchQuotedClusterHandoff(page, ctx.appUrl);
        const secondSeedId = await second.banner.getAttribute('data-seed-id');
        assert.notEqual(secondSeedId, initialSeedId, 'A new explicit Optimize action did not attach a fresh seed');

        // H8 negative control: a manually entered value equal to the source quote is user-owned.
        const pricingControls = page.locator('details.pricing-controls');
        if (!(await pricingControls.evaluate((element) => (element as HTMLDetailsElement).open))) {
          await pricingControls.locator('summary').first().click();
        }
        await second.saleInput.fill('');
        await second.saleInput.fill(String(second.sourceQuoteChaos));
        assert.equal(await second.saleInput.getAttribute('data-sale-value-provenance'), 'user');
        const secondItemLevel = await page.getByLabel('Item level').inputValue();
        await page.getByLabel('Item level').fill(String(Number(secondItemLevel) - 1));
        await page.locator('.optimizer-source-banner').waitFor({ state: 'detached' });
        assert.equal(Number(await second.saleInput.inputValue()), second.sourceQuoteChaos);
        assert.equal(await second.saleInput.getAttribute('data-sale-value-provenance'), 'user');

        // H2: changing an exact required modifier detaches immediately.
        await launchQuotedClusterHandoff(page, ctx.appUrl);
        await page.locator('[data-testid="required-modifier-editor"] .clear-selection-btn').first().click();
        await page.locator('.optimizer-source-banner').waitFor({ state: 'detached' });

        // H3: enabling the acceptable-alternative target dimension detaches immediately.
        await launchQuotedClusterHandoff(page, ctx.appUrl);
        await page.getByText('Require one acceptable alternative', { exact: true }).click();
        await page.locator('.optimizer-source-banner').waitFor({ state: 'detached' });

        const detachmentMatrix: Array<{
          field: string;
          edit: () => Promise<void>;
        }> = [
          {
            field: 'baseType',
            edit: async () => {
              await page.getByLabel('Base type').selectOption('Medium Cluster Jewel');
            },
          },
          {
            field: 'clusterType',
            edit: async () => {
              const select = page.getByLabel('Cluster enchantment');
              const current = await select.inputValue();
              const options = await select.locator('option').evaluateAll((nodes) =>
                nodes.map((node) => (node as HTMLOptionElement).value)
              );
              const next = options.find((value) => value !== current);
              assert(next, 'Cluster handoff fixture has no alternate cluster type');
              await select.selectOption(next);
            },
          },
          {
            field: 'passiveCount',
            edit: async () => {
              const select = page.locator('.optimizer-form .optimizer-grid label')
                .filter({ has: page.getByText('Passive skills', { exact: true }) })
                .locator('select').first();
              const current = await select.inputValue();
              const options = await select.locator('option').evaluateAll((nodes) =>
                nodes.map((node) => (node as HTMLOptionElement).value)
              );
              const next = options.find((value) => value !== current);
              assert(next, 'Cluster handoff fixture has no alternate passive count');
              await select.selectOption(next);
            },
          },
          {
            field: 'finalRarity',
            edit: async () => {
              await page.getByLabel('Final rarity').selectOption('rare');
            },
          },
          {
            field: 'extraAffixes',
            edit: async () => {
              await page.getByLabel('Extra affixes').selectOption('no-unwanted');
            },
          },
          {
            field: 'league',
            edit: async () => {
              const select = page.getByLabel('Pricing league');
              const current = await select.inputValue();
              const options = await select.locator('option').evaluateAll((nodes) =>
                nodes.map((node) => (node as HTMLOptionElement).value)
              );
              let next = options.find((value) => value !== current);
              if (!next) {
                next = 'Phase3H Alternate League';
                await select.evaluate((element, value) => {
                  const option = document.createElement('option');
                  option.value = value;
                  option.textContent = value;
                  element.append(option);
                }, next);
              }
              await select.selectOption(next);
            },
          },
        ];
        const matrixEvidence: string[] = [];
        for (const entry of detachmentMatrix) {
          await launchQuotedClusterHandoff(page, ctx.appUrl);
          await entry.edit();
          await page.locator('.optimizer-source-banner').waitFor({ state: 'detached' });
          assert.equal(await page.getByLabel('Expected sale value (chaos, optional)').inputValue(), '');
          matrixEvidence.push(entry.field);
        }

        // H7: detached artifacts are ordinary optimizer state and contain no seed/source quote.
        const cheap = fixture('cheap_one_mod');
        const detachedResult = await optimizedFixture(page, ctx.appUrl, cheap);
        assert.equal(detachedResult.expectedSaleValueChaos, undefined);
        assert.equal(detachedResult.expectedProfitChaos, undefined);
        const exportPath = join(ctx.invocation.artifactsDirectory, 'phase3h-detached-export.json');
        const detachedExport = await downloadExport(page, exportPath);
        assert.equal('optimizerSeedContext' in detachedExport, false);
        assert.equal(JSON.stringify(detachedExport).includes('CLUSTER_JEWELS'), false);
        await page.getByRole('button', { name: /Bug Report/ }).click();
        const bugReport = JSON.parse(await page.evaluate(() => navigator.clipboard.readText())) as JsonRecord;
        assert.equal(JSON.stringify(bugReport).includes('CLUSTER_JEWELS'), false);
        assert.equal('sourceContext' in jsonRecord(bugReport.configuration, 'detached bug configuration'), false);
        await page.getByRole('button', { name: /Share Link/ }).click();
        const detachedShare = await page.evaluate(() => navigator.clipboard.readText());
        assert.equal(decodeURIComponent(atob(new URL(detachedShare).hash.slice(7))).includes('CLUSTER_JEWELS'), false);
        await page.goto(detachedShare, { waitUntil: 'domcontentloaded' });
        assert.equal(await page.locator('.optimizer-source-banner').count(), 0);

        // H9-H12: exact original field target through the real browser and Worker.
        const fieldInput = fixture('phase3g_spell_damage_alternatives');
        const fieldResult = await optimizedFixture(page, ctx.appUrl, fieldInput);
        assertTarget(fieldResult, fieldInput);
        assert.equal(await page.locator('.optimizer-source-banner').count(), 0);
        assert.equal(await page.locator('.source-market-summary').count(), 0);
        assert.doesNotMatch(await page.locator('body').innerText(), /Acceptable fourth modifier/i);
        assert.match(await page.getByTestId('structured-target-summary').innerText(),
          /And at least one/i);

        const typedFieldResult = fieldResult as unknown as OptimizeCraftResult;
        const proof = proofPresentation(typedFieldResult);
        const searchEvidence = searchEvidencePresentation(typedFieldResult);
        assert.equal(await page.getByTestId('selected-policy-solve').innerText(), proof.selectedPolicySolve);
        assert.equal(await page.getByTestId('portfolio-optimality').innerText(), proof.portfolioOptimality);
        assert.notEqual(proof.selectedPolicySolve, proof.portfolioOptimality,
          'Selected-policy resolution and portfolio optimality collapsed to one fact');
        await openOptimizerDisclosure(page, 'search-proof-disclosure');
        const budget = page.getByTestId('request-budget-utilization');
        assert.equal(Number(await budget.getAttribute('data-new-states-expanded')),
          searchEvidence.newStatesExpandedThisRun);
        assert.equal(Number(await budget.getAttribute('data-portfolio-states-expanded')),
          searchEvidence.totalPortfolioStatesExpanded);
        assert.equal(Number(await budget.getAttribute('data-continuation-states-retained')),
          searchEvidence.statesRetainedForContinuation);
        assert.equal(Number(await budget.getAttribute('data-requested-max-states')),
          searchEvidence.requestedExpansionCap);
        const counterText = await page.getByTestId('search-evidence-summary').innerText();
        for (const label of [
          'New states expanded this run',
          'Total portfolio states expanded',
          'States retained for continuation',
          'Requested expansion cap',
          'Stopping condition',
        ]) assert(counterText.includes(label), `Missing Phase 3H search label: ${label}`);
        await openOptimizerDisclosure(page, 'research-diagnostics-disclosure');
        assert((await page.getByTestId('raw-proof-evidence').textContent())?.includes(
          String(fieldResult.objectiveProofStatus)
        ));
        assert((await page.getByTestId('raw-search-counter-evidence').textContent())?.includes(
          String(searchEvidence.totalPortfolioStatesExpanded)
        ));

        const fieldFlow = selectedPolicyFlow(fieldResult, 'Phase 3H field target');
        const fieldNodes = arrayValue(fieldFlow.nodes, 'Phase 3H field nodes')
          .map((entry) => jsonRecord(entry, 'Phase 3H field node'));
        assert(fieldNodes.some((node) => node.terminal === true &&
          arrayValue(node.matchedRequiredTargetModIds, 'terminal required IDs').length === 3 &&
          node.acceptableAlternativeSatisfied === true));
        assert(fieldNodes.some((node) => node.terminal !== true &&
          arrayValue(node.matchedRequiredTargetModIds ?? [], 'required-only IDs').length === 3 &&
          node.acceptableAlternativeSatisfied === false));
        assert.doesNotMatch(JSON.stringify(fieldResult.policyExplanation), /4\/6/);

        const fieldExportPath = join(ctx.invocation.artifactsDirectory, 'phase3h-field-export.json');
        const fieldExport = await downloadExport(page, fieldExportPath);
        const fieldExportInput = jsonRecord(fieldExport.requestInput, 'Phase 3H field export input');
        const fieldExportTarget = jsonRecord(fieldExportInput.target, 'Phase 3H field export target');
        assert.deepEqual(canonicalIds(
          arrayValue(fieldExportTarget.requiredMods, 'Phase 3H exported required mods')
            .map((entry) => String(jsonRecord(entry, 'exported required mod').modId))
        ), canonicalIds(fieldInput.targetMods));
        assert.deepEqual(canonicalIds(
          arrayValue(fieldExportTarget.acceptableAnyOf, 'Phase 3H exported alternatives')
            .flatMap((branch) => arrayValue(branch, 'exported alternative branch'))
            .map((entry) => String(jsonRecord(entry, 'exported alternative mod').modId))
        ), canonicalIds(fieldInput.acceptableAnyOf!.flat()));
        assert.equal('optimizerSeedContext' in fieldExport, false);
        await page.getByRole('button', { name: /Share Link/ }).click();
        const fieldShareUrl = await page.evaluate(() => navigator.clipboard.readText());
        const fieldSharePayload = JSON.parse(decodeURIComponent(atob(
          new URL(fieldShareUrl).hash.slice(7)
        ))) as JsonRecord;
        assert.deepEqual(canonicalIds(arrayValue(
          fieldSharePayload.targetMods, 'Phase 3H shared required mods'
        ).map(String)), canonicalIds(fieldInput.targetMods));
        assert.deepEqual(canonicalIds(
          arrayValue(fieldSharePayload.acceptableAnyOf, 'Phase 3H shared alternatives')
            .flatMap((branch) => arrayValue(branch, 'shared alternative branch'))
            .map((entry) => String(jsonRecord(entry, 'shared alternative mod').modId))
        ), canonicalIds(fieldInput.acceptableAnyOf!.flat()));
        assert.equal('sourceContext' in fieldSharePayload, false);
        await page.goto(fieldShareUrl, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(({ required, acceptable }) => {
          const observedRequired = [...document.querySelectorAll(
            '[data-testid="required-modifier-summary"] li[data-mod-id]'
          )].map((node) => node.getAttribute('data-mod-id'));
          const observedAcceptable = [...document.querySelectorAll(
            '[data-testid="acceptable-alternative-summary"] li[data-mod-id]'
          )].map((node) => node.getAttribute('data-mod-id'));
          return required.every((id) => observedRequired.includes(id)) &&
            acceptable.every((id) => observedAcceptable.includes(id));
        }, {
          required: fieldInput.targetMods,
          acceptable: fieldInput.acceptableAnyOf!.flat(),
        });
        assert.equal(await page.locator('.optimizer-source-banner').count(), 0);

        const comparison = [{ id: 'broad-or', result: fieldResult }];
        for (const alternativeId of fieldInput.acceptableAnyOf!.flat()) {
          const fixedInput: FixtureRecord = {
            ...fieldInput,
            id: `phase3h-fixed-${alternativeId}`,
            name: `Phase 3H fixed ${alternativeId}`,
            targetMods: [...fieldInput.targetMods, alternativeId],
            acceptableAnyOf: undefined,
          };
          comparison.push({ id: alternativeId, result: await optimizedFixture(page, ctx.appUrl, fixedInput) });
        }
        const bounds = comparison.map(({ id, result }) => {
          const proofResult = jsonRecord(result.proof, `${id} proof`);
          const acquisition = jsonRecord(result.acquisition, `${id} acquisition`);
          const portfolio = jsonRecord(acquisition.portfolioProof, `${id} portfolio proof`);
          return {
            id,
            recommendationStatus: result.recommendationStatus,
            selectedPolicyStatus: proofResult.selectedPolicyStatus,
            globalOptimality: proofResult.globalOptimality,
            upperBoundChaos: result.expectedCostChaos,
            bestCompetitiveLowerBoundChaos: portfolio.bestCompetitiveLowerBoundChaos,
            unresolvedCompetitors: proofResult.unresolvedCompetitiveCandidates,
          };
        });
        if (bounds.every((entry) => entry.recommendationStatus === 'PROVEN_OPTIMAL')) {
          const broad = numberValue(bounds[0].upperBoundChaos, 'broad OR proven upper bound');
          const cheapestFixed = Math.min(...bounds.slice(1).map((entry) =>
            numberValue(entry.upperBoundChaos, `${entry.id} proven upper bound`)
          ));
          assert(broad <= cheapestFixed + 1e-9,
            'Proven broad-OR optimum exceeded the cheapest proven fixed-target optimum');
        }

        const artifactPath = join(ctx.invocation.artifactsDirectory, 'phase3h-field-evidence.json');
        writeFileSync(artifactPath, `${JSON.stringify({
          handoff: {
            initialSeedId,
            secondSeedId,
            sourceQuoteChaos: initial.sourceQuoteChaos,
            detachmentMatrix: matrixEvidence,
          },
          proof,
          searchEvidence,
          selectedRoute: fieldResult.presentation,
          solver: fieldResult.solver,
          risk: fieldResult.risk,
          accounting: assertCanonicalAccounting(fieldResult),
          flow: assertFlowConservation(fieldFlow, 'Phase 3H field target'),
          comparison: bounds,
        }, null, 2)}\n`, 'utf8');
        ctx.artifacts.phase3hFieldEvidence = relative(repositoryRoot, artifactPath);
        ctx.artifacts.phase3hDetachedExport = relative(repositoryRoot, exportPath);
        ctx.artifacts.phase3hFieldExport = relative(repositoryRoot, fieldExportPath);

        return {
          H1: { sourceQuoteChaos: initial.sourceQuoteChaos, attached: true },
          H2: { requiredModifierDetaches: true },
          H3: { acceptableAlternativeDetaches: true },
          H4: { detachmentMatrix: ['itemLevel', ...matrixEvidence] },
          H5: { objectiveAndDepthRemainAttached: true },
          H6: { revertRemainsDetached: true, newExplicitSeedAttached: secondSeedId },
          H7: { detachedShareReload: true, exportAndBugReportOmitSource: true },
          H8: { equalManualValuePreserved: second.sourceQuoteChaos },
          H9: { genericAlternativeLabels: true },
          H10: proof,
          H11: searchEvidence,
          H12: {
            fixture: fieldInput.id,
            shareExportRoundTrip: true,
            selectedRoute: fieldResult.presentation,
            solver: fieldResult.solver,
            risk: fieldResult.risk,
            comparison: bounds,
          },
          H13: { retainedGateCoverageRegistered: true },
          artifact: ctx.artifacts.phase3hFieldEvidence,
        };
      }, { viewport: { width: 1440, height: 900 } });

    case 'phase3i-progressive-disclosure-browser':
      return withPage(ctx, async (page) => {
        await ensureOptimizerPage(page, ctx.appUrl);
        assert(await page.getByRole('heading', { name: 'Import a craft' }).isVisible());
        assert(await page.getByRole('button', { name: 'Import Setup JSON file' }).isVisible());
        assert.equal(
          await page.getByTestId('target-editor-disclosure').locator('button[aria-expanded]').getAttribute('aria-expanded'),
          'false',
        );
        assert.equal(
          await page.getByTestId('optimization-settings-disclosure').locator('button[aria-expanded]').getAttribute('aria-expanded'),
          'false',
        );

        const fileInput = page.locator('input[type="file"]');
        await fileInput.setInputFiles({
          name: 'invalid-phase3i.json',
          mimeType: 'application/json',
          buffer: Buffer.from('{not json'),
        });
        await page.getByRole('alert').filter({ hasText: 'not valid optimizer JSON' }).waitFor();
        assert.equal(
          await page.getByTestId('target-editor-disclosure').locator('button[aria-expanded]').getAttribute('aria-expanded'),
          'false',
          'An unreadable file must keep repair at the import surface',
        );
        await fileInput.setInputFiles({
          name: 'repairable-phase3i.json',
          mimeType: 'application/json',
          buffer: Buffer.from(JSON.stringify({
            baseType: 'Large Cluster Jewel',
            clusterType: '10% increased Spell Damage',
            itemLevel: 84,
            passiveCount: 12,
            targetMods: [],
          })),
        });
        await page.getByRole('alert').filter({ hasText: 'did not include a required modifier' }).waitFor();
        assert.equal(
          await page.getByTestId('target-editor-disclosure').locator('button[aria-expanded]').getAttribute('aria-expanded'),
          'true',
          'A repairable target import must open only the target editor',
        );
        assert.equal(
          await page.getByTestId('optimization-settings-disclosure').locator('button[aria-expanded]').getAttribute('aria-expanded'),
          'false',
        );

        const input = fixture('phase3g_spell_damage_alternatives');
        await importFixture(page, input);
        assert(await page.getByRole('heading', { name: 'Target ready' }).isVisible());
        assert(await page.getByTestId('structured-target-summary').isVisible());
        assert.equal(
          await page.getByTestId('target-editor-disclosure').locator('button[aria-expanded]').getAttribute('aria-expanded'),
          'false',
        );
        assert.equal(
          await page.getByTestId('optimization-settings-disclosure').locator('button[aria-expanded]').getAttribute('aria-expanded'),
          'false',
        );

        await setBudget(page, input.searchBudget);
        const offset = await workerEventCount(page);
        await page.getByRole('button', { name: /Find cheapest craft|Optimize craft/ }).click();
        await page.getByTestId('compact-search-status').waitFor({ state: 'visible' });
        const result = await waitForWorkerResult(page, offset, input.searchBudget.maxWallTimeMs + 8_000);
        assertTarget(result, input);

        assert(await page.locator('.recommendation-hero').isVisible());
        assert(await page.locator('.craft-guide').isVisible());
        assert(await page.locator('.compact-shopping-list').isVisible());
        for (const testId of [
          'search-proof-disclosure',
          'alternative-methods-disclosure',
          'cost-usage-disclosure',
          'research-diagnostics-disclosure',
        ]) {
          assert.equal(
            await page.getByTestId(testId).locator('button[aria-expanded]').first().getAttribute('aria-expanded'),
            'false',
            `${testId} must begin closed`,
          );
        }
        assert(await page.getByTestId('selected-policy-solve').isVisible());
        assert(await page.getByTestId('portfolio-optimality').isVisible());
        if (result.recommendationStatus === 'PROVISIONAL_RESOLVED') {
          assert(await page.locator('.provisional-warning').isVisible());
        } else if (result.recommendationStatus === 'NO_RESOLVED_ROUTE' ||
          result.recommendationStatus === 'INTERNAL_RESULT_MISMATCH') {
          assert(await page.locator('.no-route-warning').isVisible());
        }
        if (jsonRecord(result.presentation, 'Phase 3I presentation').pricingLabel ===
          'RESEARCH_ESTIMATE_STALE_PRICING') {
          assert(await page.locator('.stale-research-estimate').isVisible());
        }
        assert.equal(await page.locator('.expected-materials').isVisible(), false);
        assert.equal(await page.getByTestId('markov-constellation-container').count(), 1,
          'Phase 3J requires the graph to mount with every valid result');

        const compactShoppingButton = page.locator('.compact-shopping-list button');
        await compactShoppingButton.click();
        const shoppingBeforeDisclosures = await page.evaluate(() => navigator.clipboard.readText());
        const shareButton = page.getByRole('button', { name: /Share Link/ });
        await shareButton.click();
        const shareBeforeDisclosures = await page.evaluate(() => navigator.clipboard.readText());
        const eventCountBeforeDisclosures = await workerEventCount(page);
        await openOptimizerDisclosure(page, 'search-proof-disclosure');
        assert(await page.locator('.search-activity-card').isVisible());
        assert(await page.getByTestId('request-budget-utilization').isVisible());
        const searchText = await page.getByTestId('search-evidence-summary').innerText();
        for (const label of [
          'New states expanded this run',
          'Total portfolio states expanded',
          'States retained for continuation',
          'Requested expansion cap',
          'Stopping condition',
        ]) assert(searchText.includes(label), `Missing compact search evidence label: ${label}`);

        await visibleConstellation(page);
        const container = page.getByTestId('markov-constellation-container');
        await container.waitFor({ state: 'visible' });
        const nodes = container.locator('.constellation-node-access-list button');
        assert(await nodes.count() > 0);
        await nodes.first().click();
        const nodeDetail = page.getByLabel('Selected constellation node details');
        await nodeDetail.waitFor({ state: 'visible' });
        assert(await nodeDetail.isVisible(), 'Always-visible Constellation must retain node selection');

        await openOptimizerDisclosure(page, 'cost-usage-disclosure');
        assert(await page.locator('.expected-materials').isVisible());
        await openOptimizerDisclosure(page, 'research-diagnostics-disclosure');
        assert(await page.locator('.advanced-optimizer-details').isVisible());
        assert.equal(await workerEventCount(page), eventCountBeforeDisclosures,
          'Disclosure interaction must not create Worker traffic');
        await compactShoppingButton.click();
        assert.equal(await page.evaluate(() => navigator.clipboard.readText()), shoppingBeforeDisclosures,
          'Disclosure interaction changed canonical copy output');
        await shareButton.click();
        assert.equal(await page.evaluate(() => navigator.clipboard.readText()), shareBeforeDisclosures,
          'Disclosure interaction changed the share payload');

        await page.setViewportSize({ width: 390, height: 844 });
        const geometry = await page.evaluate(() => ({
          viewport: document.documentElement.clientWidth,
          documentWidth: document.documentElement.scrollWidth,
          bodyWidth: document.body.scrollWidth,
        }));
        assert(geometry.documentWidth <= geometry.viewport + 1);
        assert(geometry.bodyWidth <= geometry.viewport + 1);
        const screenshotPath = join(ctx.invocation.artifactsDirectory, 'phase3i-compact-optimizer-mobile.png');
        await page.screenshot({ path: screenshotPath, fullPage: true });
        ctx.artifacts.phase3iCompactMobile = relative(repositoryRoot, screenshotPath);

        return {
          I1: { importFirst: true },
          I2: { compactLoadedSummary: true, optimizeVisible: true },
          I3: { targetAndSettingsInitiallyClosed: true },
          I4: { malformedImportOwnsError: true, repairableImportOpensTargetOnly: true },
          I5: { compactRunningStatus: true },
          I6: { fullSearchActivityUnderDisclosure: true },
          I7: { primaryGroupsVisible: ['Recommendation', 'How to craft it', 'Shopping list', 'Markov Policy Constellation'] },
          I8: { researchGroupsInitiallyClosed: 4 },
          I9: { selectedPolicyAndPortfolioVisible: true },
          I10: { targetSummaryPreservesRequiredAndAlternatives: true },
          I11: { desktopAndMobileNoOverflow: geometry },
          I12: { ariaControlledDisclosures: true },
          I13: { graphAlwaysMounted: true, selectionPreserved: true },
          I14: { priorResearchSurfacesReachable: true },
          I15: { workerEventsAddedByDisclosure: 0, copyOutputStable: true, sharePayloadStable: true },
          I16: { retainedCoverageRegistered: true },
          artifact: ctx.artifacts.phase3iCompactMobile,
        };
      }, { viewport: { width: 1440, height: 900 } });

    case 'phase3j-strict-guide-visible-constellation':
      return withPage(ctx, async (page) => {
        const fieldFixture = fixture('phase3c_primordial_renewal_rotten_claws');
        const input: FixtureRecord = {
          ...fieldFixture,
          searchBudget: { ...fieldFixture.searchBudget, maxStates: 3_334 },
        };
        await ensureOptimizerPage(page, ctx.appUrl);
        await importFixture(page, input);
        await setBudget(page, input.searchBudget);
        const offset = await workerEventCount(page);
        await page.getByRole('button', { name: /Find cheapest craft|Optimize craft/ }).click();
        const result = await waitForWorkerResult(page, offset, input.searchBudget.maxWallTimeMs + 8_000);
        const craftPlan = jsonRecord(result.craftPlan, 'Phase 3J browser craft plan');
        assert.equal(craftPlan.status, 'CERTIFIED');

        const guide = page.locator('.craft-guide');
        const simple = guide.locator('.simple-craft-instructions[data-player-rule-status="CERTIFIED"]');
        await simple.waitFor({ state: 'visible' });
        const guideText = await simple.innerText();
        assert.match(guideText, /Match your current item to the first WHEN condition/i);
        assert.match(guideText, /Required targets:/i);
        assert.match(guideText, /Acceptable target:\s*none/i);
        assert.match(guideText, /Junk modifier:\s*anything else/i);
        assert.match(guideText, /Safe junk:/i);
        assert.match(guideText, /Blocking junk:/i);
        assert.match(guideText, /Fractured junk:/i);
        assert.doesNotMatch(guideText, /represented states|expected visits|policy rule indices/i);
        assert.doesNotMatch(guideText, /selected policy wants|when needed|exact current affixes matter/i);
        assert.match(guideText, /exception junk/i);
        const cards = simple.locator('.player-craft-rule[data-action-id]');
        assert(await cards.count() > 0);
        const priorities = (await cards.evaluateAll((elements) => elements.map((element) =>
          Number(element.getAttribute('data-rule-priority'))
        ))).filter(Number.isFinite);
        assert.equal(new Set(priorities).size, priorities.length);
        for (let index = 0; index < await cards.count(); index += 1) {
          const card = cards.nth(index);
          assert.equal(await card.locator('.player-rule-command.when > strong', { hasText: 'WHEN' }).count(), 1);
          assert.equal(await card.locator('.player-rule-command.use > strong', { hasText: 'USE' }).count(), 1);
          assert.equal(await card.locator('.player-rule-command.then > strong', { hasText: 'THEN' }).count(), 1);
        }
        const renderedActions = canonicalIds(await cards.evaluateAll((elements) =>
          elements.map((element) => element.getAttribute('data-action-id'))
        ));
        for (const actionId of [
          'alteration_orb',
          'augmentation_orb',
          'regal_orb',
          'exalted_orb',
          'scouring_orb',
          'transmutation_orb',
          'fracturing_orb',
          'restart_reacquire',
        ]) assert(renderedActions.includes(actionId), `Simple guide omitted ${actionId}`);
        assert(await simple.locator('[data-player-rule-stage="TERMINAL"] .stop-when').isVisible());
        assert.match(guideText, /Exalted Orb[\s\S]*not guaranteed|not guaranteed[\s\S]*Exalted Orb/i);

        await page.getByRole('button', { name: /Copy Playbook/ }).click();
        const playbook = await page.evaluate(() => navigator.clipboard.readText());
        for (const label of ['TARGETS', 'Required:', 'Acceptable:', 'Junk:', 'WHEN:', 'USE:', 'THEN:', 'IMPORTANT CAVEATS']) {
          assert(playbook.includes(label), `Copy Playbook omitted ${label}`);
        }
        assert.equal(playbook.match(/IMPORTANT CAVEATS/g)?.length, 1);
        assert.doesNotMatch(playbook, /represented states|expected visits/i);
        await page.getByRole('button', { name: 'Copy shopping list', exact: true }).click();
        const shoppingBefore = await page.evaluate(() => navigator.clipboard.readText());

        const constellation = await visibleConstellation(page);
        assert(await page.getByTestId('constellation-top-level').isVisible());
        const resultOrder = await page.evaluate(() => ({
          guide: document.querySelector('.craft-guide')?.getBoundingClientRect().top ?? -1,
          shopping: document.querySelector('.compact-shopping-list')?.getBoundingClientRect().top ?? -1,
          constellation: document.querySelector('[data-testid="constellation-top-level"]')
            ?.getBoundingClientRect().top ?? -1,
          cost: document.querySelector('[data-testid="cost-usage-disclosure"]')
            ?.getBoundingClientRect().top ?? -1,
        }));
        assert(resultOrder.guide < resultOrder.shopping);
        assert(resultOrder.shopping < resultOrder.constellation);
        assert(resultOrder.constellation < resultOrder.cost);
        assert.equal(await page.getByTestId('strategy-visualization-disclosure').count(), 0);
        for (const testId of [
          'search-proof-disclosure',
          'alternative-methods-disclosure',
          'cost-usage-disclosure',
          'research-diagnostics-disclosure',
        ]) assert.equal(await page.getByTestId(testId).count(), 1, `${testId} must have one owner`);

        const nodes = constellation.locator('.constellation-node-access-list button');
        assert(await nodes.count() > 0);
        await nodes.first().click();
        const nodeDetail = page.getByLabel('Selected constellation node details');
        await nodeDetail.waitFor({ state: 'visible' });
        const technicalPolicy = nodeDetail.getByText('Technical policy evidence');
        if (await technicalPolicy.count()) {
          await technicalPolicy.click();
          assert(await nodeDetail.isVisible());
        }

        await guide.getByRole('button', { name: 'Why this action?' }).first().click();
        const advanced = page.locator('.advanced-policy-evidence');
        await advanced.waitFor({ state: 'visible' });
        assert.match(await advanced.innerText(), /Policy rule indices/i);
        assert.match(await advanced.innerText(), /Source state identities/i);
        assert.match(await advanced.innerText(), /Expected visits reconciled/i);
        assert.equal(await guide.locator('details.craft-plan-decision-details').count(), 0,
          'Large Decision details must not repeat below instructions');
        await page.getByRole('button', { name: 'Copy shopping list', exact: true }).click();
        assert.equal(await page.evaluate(() => navigator.clipboard.readText()), shoppingBefore);

        const [download] = await Promise.all([
          page.waitForEvent('download'),
          guide.getByRole('button', { name: /Export Setup JSON/ }).click(),
        ]);
        const downloadPath = await download.path();
        assert(downloadPath);
        const exported = JSON.parse(readFileSync(downloadPath, 'utf8')) as JsonRecord;
        const exportSummary = jsonRecord(exported.resultSummary, 'Phase 3J export summary');
        assert(exportSummary.craftPlan);
        assert(exportSummary.policyExplanation);
        assert(exportSummary.policyRules);
        await guide.getByRole('button', { name: /Bug Report/ }).click();
        const bug = JSON.parse(await page.evaluate(() => navigator.clipboard.readText())) as JsonRecord;
        const bugSummary = jsonRecord(bug.resultSummary, 'Phase 3J bug summary');
        assert(bugSummary.craftPlan);
        assert(bugSummary.policyExplanation);
        assert(bugSummary.policyRules);

        const geometries: Record<string, unknown> = {};
        for (const width of [1440, 390, 420]) {
          await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
          const geometry = await page.evaluate(() => ({
            viewport: document.documentElement.clientWidth,
            documentWidth: document.documentElement.scrollWidth,
            bodyWidth: document.body.scrollWidth,
          }));
          assert(geometry.documentWidth <= geometry.viewport + 1);
          assert(geometry.bodyWidth <= geometry.viewport + 1);
          geometries[String(width)] = geometry;
        }
        const screenshotPath = join(ctx.invocation.artifactsDirectory, 'phase3j-strict-guide-visible-constellation.png');
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.screenshot({ path: screenshotPath, fullPage: true });
        ctx.artifacts.phase3jStrictGuide = relative(repositoryRoot, screenshotPath);
        return {
          J7: { strictCards: await cards.count(), renderedActions },
          J12: { copyPlaybookBytes: playbook.length, exactExportEvidence: true, exactBugEvidence: true },
          J14: { advancedPolicyEvidence: true, inlineDecisionDetails: 0 },
          J15: { alwaysVisible: true, ancestryExcluded: true, resultOrder },
          J16: { selectedNodeOverlay: true },
          J17: geometries,
          J18: { retainedGatesRegistered: true },
          artifact: ctx.artifacts.phase3jStrictGuide,
        };
      }, { viewport: { width: 1440, height: 900 } });

    case 'responsive-accessibility':
      return withPage(ctx, async (page) => {
        const input = fixture('cheap_one_mod');
        await optimizedFixture(page, ctx.appUrl, input);
        await visibleConstellation(page);
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
        await visibleConstellation(page);
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

    case 'constellation-scope-fit': {
      const field = loadFrozenPolicyFlow('policy-flow-phase3d-field-v1.json');
      const stress = loadFrozenPolicyFlow('policy-flow-phase3c-large-v1.json');
      const fieldObservation = await withPage(ctx, async (page) => {
        await optimizedFixture(page, ctx.appUrl, fixture('cheap_one_mod'));
        await visibleConstellation(page);
        const container = page.getByTestId('markov-constellation-container');
        await container.waitFor();
        await container.scrollIntoViewIfNeeded();
        assert.equal(
          await container.getAttribute('data-topology-fingerprint'),
          field.metadata.topologyFingerprint,
        );
        assert.equal(Number(await container.getAttribute('data-node-count')), 23);
        assert.equal(await container.getAttribute('data-acquisition-kind'), 'SELF_FRACTURE');
        assert.equal(await container.getAttribute('data-label-aware-fit'), 'true');
        assert(Number(await container.getAttribute('data-acquisition-scope-node-count')) > 0);
        assert(Number(await container.getAttribute('data-downstream-scope-node-count')) > 0);
        assert(Number(await container.getAttribute('data-certified-handoff-edge-count')) > 0);
        const acquisitionNodes = container.locator(
          '[data-node-anchor][data-policy-scope="ACQUISITION"]',
        );
        const downstreamNodes = container.locator(
          '[data-node-anchor][data-policy-scope="DOWNSTREAM"]',
        );
        assert(await acquisitionNodes.count() > 0);
        assert(await downstreamNodes.count() > 0);
        const acquisitionProgress = await acquisitionNodes.evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute('data-progress-label'))
        );
        const downstreamProgress = await downstreamNodes.evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute('data-progress-label'))
        );
        assert(acquisitionProgress.every((label) =>
          label?.startsWith('Prep target') || label?.startsWith('Fracture prep complete')
        ));
        assert(acquisitionProgress.every((label) => !label?.startsWith('Final targets')));
        assert(downstreamProgress.every((label) =>
          label?.startsWith('Final targets') || label === 'Final target complete'
        ));
        const headers = container.locator('.constellation-scope-header');
        assert.equal(await headers.count(), 2);
        assert.match(await headers.nth(0).innerText(), /SELF-FRACTURE PREPARATION|FINAL CRAFTING/);
        assert.match(await headers.nth(1).innerText(), /SELF-FRACTURE PREPARATION|FINAL CRAFTING/);
        const handoffs = container.locator(
          '[data-edge-anchor][data-edge-routing="SCOPE_HANDOFF"][data-scope-handoff="true"]',
        );
        assert.equal(
          await handoffs.count(),
          Number(await container.getAttribute('data-certified-handoff-edge-count')),
        );
        const handoffLabel = container.locator('.constellation-edge-label.scope-handoff-edge');
        await handoffLabel.first().waitFor();
        assert.match(await handoffLabel.first().innerText(), /Certified acquisition.*final crafting/i);
        await handoffs.first().focus();
        await page.keyboard.press('Enter');
        const edgeDetail = page.getByLabel('Selected constellation edge details');
        await edgeDetail.waitFor();
        assert.match(await edgeDetail.innerText(), /CERTIFIED ACQUISITION HANDOFF/);
        assert.match(String(await edgeDetail.textContent()), /CERTIFIED_SCOPE_HANDOFF/);
        await edgeDetail.getByRole('button', { name: 'Close selected edge details' }).click();
        await page.getByRole('button', { name: 'Fit All' }).click();
        await page.waitForTimeout(100);
        const desktopGeometry = await constellationFitGeometry(page);
        assert.deepEqual(desktopGeometry.outside, [], '23-node Fit All clipped a default label');
        assert.equal(desktopGeometry.collisionCount, 0, '23-node default labels overlap');
        assert(numberValue(desktopGeometry.visibleGoalLabelCount, 'visible Goal labels') >= 1);
        assert(Math.abs(
          numberValue(desktopGeometry.topGap, 'top occupied gap') -
          numberValue(desktopGeometry.bottomGap, 'bottom occupied gap')
        ) <= 190, '23-node graph is not reasonably vertically centered');
        mkdirSync(stableEvidenceDirectory, { recursive: true });
        const desktopPath = join(stableEvidenceDirectory, 'phase3d-constellation-scope-1440x900.png');
        await page.screenshot({ path: desktopPath, fullPage: true });

        await page.setViewportSize({ width: 1920, height: 1080 });
        await page.getByRole('button', { name: 'Fit All' }).click();
        await page.waitForTimeout(100);
        const wideGeometry = await constellationFitGeometry(page);
        assert.deepEqual(wideGeometry.outside, [], 'Wide Fit All clipped a default label');
        assert.equal(wideGeometry.collisionCount, 0);
        const widePath = join(stableEvidenceDirectory, 'phase3d-constellation-scope-1920x1080.png');
        await page.screenshot({ path: widePath, fullPage: true });

        await page.setViewportSize({ width: 390, height: 844 });
        await page.getByRole('button', { name: 'Fit All' }).click();
        await page.waitForTimeout(100);
        const mobileGeometry = await page.evaluate(() => ({
          viewport: document.documentElement.clientWidth,
          documentWidth: document.documentElement.scrollWidth,
          bodyWidth: document.body.scrollWidth,
        }));
        assert(numberValue(mobileGeometry.documentWidth, 'mobile document width') <=
          numberValue(mobileGeometry.viewport, 'mobile viewport width') + 1);
        assert(numberValue(mobileGeometry.bodyWidth, 'mobile body width') <=
          numberValue(mobileGeometry.viewport, 'mobile viewport width') + 1);
        const mobileFit = await constellationFitGeometry(page);
        assert.deepEqual(mobileFit.outside, [], 'Mobile Fit All clipped scope/header labels');
        const zoomBefore = Number(await container.getAttribute('data-camera-zoom'));
        await page.getByRole('button', { name: 'Zoom constellation in' }).click();
        assert(Number(await container.getAttribute('data-camera-zoom')) > zoomBefore);
        const mobilePath = join(stableEvidenceDirectory, 'phase3d-constellation-scope-390x844.png');
        await page.screenshot({ path: mobilePath, fullPage: true });
        ctx.artifacts.phase3dConstellationScopeDesktop = relative(repositoryRoot, desktopPath);
        ctx.artifacts.phase3dConstellationScopeWide = relative(repositoryRoot, widePath);
        ctx.artifacts.phase3dConstellationScopeMobile = relative(repositoryRoot, mobilePath);
        return {
          topologyFingerprint: field.metadata.topologyFingerprint,
          acquisitionProgress,
          downstreamProgress,
          handoffCount: await handoffs.count(),
          desktopGeometry,
          wideGeometry,
          mobileGeometry,
          mobileFit,
          screenshots: {
            desktop: ctx.artifacts.phase3dConstellationScopeDesktop,
            wide: ctx.artifacts.phase3dConstellationScopeWide,
            mobile: ctx.artifacts.phase3dConstellationScopeMobile,
          },
        };
      }, {
        frozenFlow: field.flow,
        frozenAcquisitionContext: { kind: 'SELF_FRACTURE' },
        viewport: { width: 1440, height: 900 },
      });

      const stressObservation = await withPage(ctx, async (page) => {
        await optimizedFixture(page, ctx.appUrl, fixture('cheap_one_mod'));
        await visibleConstellation(page);
        const container = page.getByTestId('markov-constellation-container');
        await container.waitFor();
        await container.scrollIntoViewIfNeeded();
        assert.equal(
          await container.getAttribute('data-topology-fingerprint'),
          stress.metadata.topologyFingerprint,
        );
        assert(Number(await container.getAttribute('data-node-count')) >= 40);
        assert.equal(await container.getAttribute('data-label-aware-fit'), 'true');
        assert(Number(await container.getAttribute('data-large-scc-node-count')) >= 40);
        await page.getByRole('button', { name: 'Fit All' }).click();
        await page.waitForTimeout(100);
        const geometry = await constellationFitGeometry(page);
        assert.deepEqual(geometry.outside, [], '40+ node Fit All clipped a default label');
        assert.equal(geometry.collisionCount, 0, '40+ node default labels overlap');
        assert(numberValue(geometry.visibleGoalLabelCount, 'stress visible Goal labels') >= 1);
        return {
          topologyFingerprint: stress.metadata.topologyFingerprint,
          nodeCount: Number(await container.getAttribute('data-node-count')),
          largeSccNodeCount: Number(await container.getAttribute('data-large-scc-node-count')),
          geometry,
        };
      }, {
        frozenFlow: stress.flow,
        viewport: { width: 1440, height: 900 },
      });
      return { field: fieldObservation, stress: stressObservation };
    }

    case 'constellation-detail-overlay-interaction':
      return withPage(ctx, async (page) => {
        const input = fixture('cheap_one_mod');
        const result = await optimizedFixture(page, ctx.appUrl, input);
        const flow = selectedPolicyFlow(result, 'Phase 3F overlay interaction flow');
        const nodes = arrayValue(flow.nodes, 'overlay nodes').map((entry) =>
          jsonRecord(entry, 'overlay node')
        );
        const edges = arrayValue(flow.edges, 'overlay edges').map((entry) =>
          jsonRecord(entry, 'overlay edge')
        );
        const selectedNode = nodes.find((node) =>
          arrayValue(node.matchedTargetModIds, 'matched target IDs').length > 0 &&
          edges.some((edge) => edge.sourceNodeId === node.id || edge.targetNodeId === node.id)
        );
        assert(selectedNode, 'Overlay gate found no connected node with technical modifier evidence');
        const selectedNodeId = String(selectedNode.id);
        const connectedEdge = edges.find((edge) =>
          edge.sourceNodeId === selectedNodeId || edge.targetNodeId === selectedNodeId
        );
        assert(connectedEdge, 'Overlay gate node has no connected edge');
        const connectedEdgeId = String(connectedEdge.id);
        await visibleConstellation(page);
        const container = page.getByTestId('markov-constellation-container');
        await container.waitFor();
        await container.scrollIntoViewIfNeeded();
        const nodeAnchor = () => container.locator(`[data-node-anchor="${selectedNodeId}"]`);
        const nodePosition = async () => ({
          x: Number(await nodeAnchor().getAttribute('data-node-x')),
          y: Number(await nodeAnchor().getAttribute('data-node-y')),
        });
        const edgeGeometry = async () => {
          const edge = container.locator(`[data-edge-anchor="${connectedEdgeId}"]`);
          return Promise.all([
            'data-edge-source-x',
            'data-edge-source-y',
            'data-edge-target-x',
            'data-edge-target-y',
            'data-edge-control-x',
            'data-edge-control-y',
          ].map(async (attribute) => Number(await edge.getAttribute(attribute))));
        };
        const drag = async (target: ReturnType<typeof container.locator>, x: number, y: number) => {
          const box = await target.boundingBox();
          assert(box, 'Overlay drag target has no geometry');
          const startX = box.x + box.width / 2;
          const startY = box.y + box.height / 2;
          await page.mouse.move(startX, startY);
          await page.mouse.down();
          await page.mouse.move(startX + x, startY + y, { steps: 8 });
          await page.mouse.up();
        };
        const selectTextWithPointer = async (locator: ReturnType<typeof container.locator>) => {
          const box = await locator.boundingBox();
          assert(box, 'Technical text has no browser geometry');
          await locator.dblclick({
            position: {
              x: Math.min(Math.max(box.width / 3, 8), box.width - 2),
              y: Math.min(Math.max(box.height / 2, 2), box.height - 2),
            },
          });
        };

        assert.equal(await container.getAttribute('data-manual-layout-mode'), 'LOCKED');
        const original = await nodePosition();
        const edgeBefore = await edgeGeometry();
        await page.getByRole('button', { name: 'Arrange constellation layout' }).click();
        await drag(nodeAnchor(), 132, 76);
        const moved = await nodePosition();
        assert(Math.hypot(moved.x - original.x, moved.y - original.y) > 50);
        assert.notDeepEqual(await edgeGeometry(), edgeBefore);
        const storageKey = String(await container.getAttribute('data-manual-layout-storage-key'));
        const savedBeforeOverlay = await page.evaluate((key) => localStorage.getItem(key), storageKey);
        assert(savedBeforeOverlay, 'Manual node move was not persisted before overlay interaction');

        await nodeAnchor().click();
        const nodeDetail = page.getByLabel('Selected constellation node details');
        await nodeDetail.waitFor();
        const modifierDetails = nodeDetail.locator('details')
          .filter({ hasText: 'Technical modifier details' });
        assert.equal(await modifierDetails.count(), 1, 'Selected node omitted technical modifier details');
        await modifierDetails.locator('summary').click();
        assert(await nodeDetail.isVisible(), 'Modifier details click closed the node overlay');
        const policyDetails = nodeDetail.locator('details')
          .filter({ hasText: 'Technical policy evidence' });
        await policyDetails.locator('summary').click();
        assert(await nodeDetail.isVisible(), 'Policy evidence click closed the node overlay');
        await selectTextWithPointer(policyDetails.locator('code').first());
        assert(await nodeDetail.isVisible(), 'Technical text selection closed the node overlay');
        const selectionLength = await page.evaluate(() => window.getSelection()?.toString().length ?? 0);
        assert(selectionLength > 0, 'Pointer interaction did not select technical overlay text');
        assert.deepEqual(await nodePosition(), moved, 'Node overlay interaction changed manual geometry');
        assert.equal(await page.evaluate((key) => localStorage.getItem(key), storageKey), savedBeforeOverlay);
        mkdirSync(stableEvidenceDirectory, { recursive: true });
        const screenshotPath = join(
          stableEvidenceDirectory,
          'phase3f-constellation-detail-overlay-1440x900.png',
        );
        await page.screenshot({ path: screenshotPath });
        ctx.artifacts.phase3fConstellationDetailOverlay = relative(repositoryRoot, screenshotPath);

        await nodeDetail.getByRole('button', { name: 'Close selected node details' }).click();
        const edgeAnchor = container.locator(`[data-edge-anchor="${connectedEdgeId}"]`);
        await edgeAnchor.focus();
        await page.keyboard.press('Enter');
        const edgeDetail = page.getByLabel('Selected constellation edge details');
        await edgeDetail.waitFor();
        const transitionDetails = edgeDetail.locator('details')
          .filter({ hasText: 'Technical transition evidence' });
        await transitionDetails.locator('summary').click();
        assert(await edgeDetail.isVisible(), 'Transition evidence click closed the edge overlay');
        await selectTextWithPointer(transitionDetails.locator('code').first());
        assert(await edgeDetail.isVisible(), 'Edge technical text selection closed the overlay');

        const emptyPoint = await page.evaluate(() => {
          const viewport = document.querySelector<HTMLElement>('.constellation-viewport');
          if (!viewport) throw new Error('Constellation viewport missing');
          const rect = viewport.getBoundingClientRect();
          const candidates = [
            [rect.left + 18, rect.top + 18],
            [rect.left + rect.width * 0.5, rect.top + 18],
            [rect.left + 18, rect.top + rect.height * 0.5],
          ];
          for (const [x, y] of candidates) {
            const hit = document.elementFromPoint(x, y) as HTMLElement | null;
            if (!hit?.closest('[data-node-id],[data-edge-id],[data-constellation-interaction-exclusion]')) {
              return { x, y };
            }
          }
          throw new Error('No empty graph point was available');
        });
        await page.mouse.click(emptyPoint.x, emptyPoint.y);
        await edgeDetail.waitFor({ state: 'detached' });
        assert.deepEqual(await nodePosition(), moved, 'Empty graph deselect changed manual geometry');

        await nodeAnchor().focus();
        await page.keyboard.press('Enter');
        await nodeDetail.waitFor();
        await page.keyboard.press('Escape');
        await nodeDetail.waitFor({ state: 'detached' });
        assert.deepEqual(await nodePosition(), moved, 'Escape close changed manual geometry');
        assert.equal(await page.evaluate((key) => localStorage.getItem(key), storageKey), savedBeforeOverlay);
        await page.getByRole('button', { name: 'Reset Layout' }).click();
        assert.deepEqual(await nodePosition(), original);
        assert.equal(await page.evaluate((key) => localStorage.getItem(key), storageKey), null);
        return {
          selectedNodeId,
          connectedEdgeId,
          manualDistanceGraph: Math.hypot(moved.x - original.x, moved.y - original.y),
          liveEdgeReroute: true,
          modifierDetailsRetained: true,
          policyDetailsRetained: true,
          technicalTextSelectionRetained: true,
          edgeDetailsRetained: true,
          emptyGraphClosed: true,
          escapeClosed: true,
          manualPositionRetained: true,
          persistenceRetained: true,
          resetLayoutRestored: true,
          screenshot: ctx.artifacts.phase3fConstellationDetailOverlay,
        };
      }, { viewport: { width: 1440, height: 900 } });

    case 'manual-constellation-layout': {
      const frozen = loadFrozenPolicyFlow('policy-flow-phase3e-manual-v1.json');
      return withPage(ctx, async (page, context) => {
        const input = fixture('cheap_one_mod');
        await optimizedFixture(page, ctx.appUrl, input);
        await visibleConstellation(page);
        let container = page.getByTestId('markov-constellation-container');
        await container.waitFor();
        await container.scrollIntoViewIfNeeded();

        const nodePosition = async (nodeId: string): Promise<{ x: number; y: number }> => {
          const anchor = container.locator(`[data-node-anchor="${nodeId}"]`);
          await anchor.waitFor();
          return {
            x: Number(await anchor.getAttribute('data-node-x')),
            y: Number(await anchor.getAttribute('data-node-y')),
          };
        };
        const nodeCanonicalPosition = async (nodeId: string): Promise<{ x: number; y: number }> => {
          const anchor = container.locator(`[data-node-anchor="${nodeId}"]`);
          return {
            x: Number(await anchor.getAttribute('data-canonical-node-x')),
            y: Number(await anchor.getAttribute('data-canonical-node-y')),
          };
        };
        const edgeGeometry = async (edgeId: string): Promise<number[]> => {
          const anchor = container.locator(`[data-edge-anchor="${edgeId}"]`);
          return Promise.all([
            'data-edge-source-x',
            'data-edge-source-y',
            'data-edge-target-x',
            'data-edge-target-y',
            'data-edge-control-x',
            'data-edge-control-y',
          ].map(async (attribute) => Number(await anchor.getAttribute(attribute))));
        };
        const truthSnapshot = async (): Promise<unknown> => container.evaluate((element) => ({
          policyFlowVersion: element.getAttribute('data-policy-flow-version'),
          policyFlowStatus: element.getAttribute('data-policy-flow-status'),
          sourceBundleId: element.getAttribute('data-source-bundle-id'),
          sourcePolicyFingerprint: element.getAttribute('data-source-policy-fingerprint'),
          topologyFingerprint: element.getAttribute('data-topology-fingerprint'),
          nodeCount: element.getAttribute('data-node-count'),
          edgeCount: element.getAttribute('data-edge-count'),
          nodes: [...element.querySelectorAll<HTMLElement>('[data-node-anchor]')]
            .map((node) => ({
              id: node.dataset.nodeAnchor,
              canonicalX: node.dataset.canonicalNodeX,
              canonicalY: node.dataset.canonicalNodeY,
              scope: node.dataset.policyScope,
              progress: node.dataset.progressLabel,
            }))
            .sort((left, right) => String(left.id).localeCompare(String(right.id))),
          edges: [...element.querySelectorAll<HTMLElement>('[data-edge-anchor]')]
            .map((edge) => ({
              id: edge.dataset.edgeAnchor,
              source: edge.dataset.edgeSource,
              target: edge.dataset.edgeTarget,
              probability: edge.dataset.conditionalProbability,
              expectedFlow: edge.dataset.expectedFlow,
              outcomeKind: edge.dataset.outcomeKind,
              evidenceKind: edge.dataset.evidenceKind,
              routing: edge.dataset.edgeRouting,
              scopeHandoff: edge.dataset.scopeHandoff,
            }))
            .sort((left, right) => String(left.id).localeCompare(String(right.id))),
        }));
        const drag = async (
          target: ReturnType<typeof container.locator>,
          deltaX: number,
          deltaY: number,
        ): Promise<void> => {
          const box = await target.boundingBox();
          assert(box, 'Drag target has no browser geometry');
          const startX = box.x + box.width / 2;
          const startY = box.y + box.height / 2;
          await page.mouse.move(startX, startY);
          await page.mouse.down();
          await page.mouse.move(startX + deltaX, startY + deltaY, { steps: 8 });
          await page.mouse.up();
        };
        const assertInsideViewport = async (locator: ReturnType<typeof container.locator>, label: string) => {
          const viewport = container.locator('.constellation-viewport');
          const [viewportBox, elementBox] = await Promise.all([viewport.boundingBox(), locator.boundingBox()]);
          assert(viewportBox && elementBox, `${label} has no visible browser geometry`);
          assert(elementBox.x >= viewportBox.x - 1, `${label} clips on the left`);
          assert(elementBox.y >= viewportBox.y - 1, `${label} clips on the top`);
          assert(elementBox.x + elementBox.width <= viewportBox.x + viewportBox.width + 1,
            `${label} clips on the right`);
          assert(elementBox.y + elementBox.height <= viewportBox.y + viewportBox.height + 1,
            `${label} clips on the bottom`);
        };

        assert.equal(await container.getAttribute('data-topology-fingerprint'), frozen.metadata.topologyFingerprint);
        assert.equal(await container.getAttribute('data-source-policy-fingerprint'), frozen.metadata.selectedPolicyFingerprint);
        assert.equal(Number(await container.getAttribute('data-node-count')), frozen.metadata.serializedSummary.nodeCount);
        assert.equal(Number(await container.getAttribute('data-edge-count')), frozen.metadata.serializedSummary.edgeCount);
        assert.equal(await container.getAttribute('data-manual-layout-schema'), 'MANUAL_CONSTELLATION_LAYOUT_V1');
        assert.equal(await container.getAttribute('data-manual-layout-mode'), 'LOCKED');
        assert.equal(await container.getAttribute('data-manual-layout-override-count'), '0');
        assert.equal(await container.getAttribute('data-manual-layout-persistence-eligible'), 'true');

        const frozenEdges = arrayValue(frozen.flow.edges, 'Phase 3E frozen edges')
          .map((entry) => jsonRecord(entry, 'Phase 3E frozen edge'));
        const visibleLabelIds = new Set(await container.locator('.constellation-node-label')
          .evaluateAll((labels) => labels.map((label) => label.getAttribute('data-node-id')).filter(Boolean)));
        const selfLoop = frozenEdges.find((edge) =>
          edge.sourceNodeId === edge.targetNodeId && edge.actionId === 'alteration_orb'
        );
        const candidateNodeIds = [
          selfLoop?.sourceNodeId,
          ...frozenEdges.map((edge) => edge.sourceNodeId),
        ].map(String);
        const movedNodeId = candidateNodeIds.find((nodeId) => visibleLabelIds.has(nodeId));
        assert(movedNodeId, 'No connected Phase 3E node has a visible label');
        const connectedEdge = frozenEdges.find((edge) =>
          edge.sourceNodeId === movedNodeId || edge.targetNodeId === movedNodeId
        );
        assert(connectedEdge, 'Selected manual-layout node has no connected edge');
        const connectedEdgeId = String(connectedEdge.id);
        const nodeAnchor = () => container.locator(`[data-node-anchor="${movedNodeId}"]`);
        const nodeLabel = () => container.locator(`.constellation-node-label[data-node-id="${movedNodeId}"]`);

        const truthBefore = await truthSnapshot();
        const original = await nodePosition(movedNodeId);
        await page.getByRole('button', { name: 'Arrange constellation layout' }).click();
        assert.equal(await container.getAttribute('data-manual-layout-mode'), 'ARRANGE');

        // Escape restores the pre-gesture override even after real pointer movement.
        let box = await nodeAnchor().boundingBox();
        assert(box);
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 + 86, box.y + box.height / 2 - 54, { steps: 6 });
        await page.keyboard.press('Escape');
        await page.mouse.up();
        assert.deepEqual(await nodePosition(movedNodeId), original);
        assert.equal(await container.getAttribute('data-manual-layout-override-count'), '0');

        const labelBefore = await nodeLabel().boundingBox();
        const edgeBefore = await edgeGeometry(connectedEdgeId);
        await drag(nodeAnchor(), 156, 92);
        await page.waitForFunction(() =>
          document.querySelector('[data-testid="markov-constellation-container"]')
            ?.getAttribute('data-manual-layout-override-count') === '1'
        );
        const moved = await nodePosition(movedNodeId);
        assert(Math.hypot(moved.x - original.x, moved.y - original.y) > 100,
          'Real node pointer drag was not meaningful in graph space');
        const edgeAfter = await edgeGeometry(connectedEdgeId);
        assert.notDeepEqual(edgeAfter, edgeBefore, 'Connected edge geometry did not reroute live');
        const labelAfter = await nodeLabel().boundingBox();
        assert(labelBefore && labelAfter);
        assert(Math.hypot(labelAfter.x - labelBefore.x, labelAfter.y - labelBefore.y) > 20,
          'Visible node label did not move with its node');
        assert.deepEqual(await truthSnapshot(), truthBefore,
          'Manual geometry changed DOM-surfaced PolicyFlow topology or proof truth');

        const storageKey = String(await container.getAttribute('data-manual-layout-storage-key'));
        const savedRecord = await page.evaluate((key) => localStorage.getItem(key), storageKey);
        assert(savedRecord, 'Committed node drag did not write browser-local layout');
        const savedJson = jsonRecord(JSON.parse(savedRecord), 'saved Phase 3E layout');
        assert.equal(savedJson.schemaVersion, 'MANUAL_CONSTELLATION_LAYOUT_V1');
        const savedIdentity = jsonRecord(savedJson.identity, 'saved Phase 3E identity');
        assert.equal(savedIdentity.sourcePolicyFingerprint, frozen.metadata.selectedPolicyFingerprint);
        assert.equal(savedIdentity.topologyFingerprint, frozen.metadata.topologyFingerprint);
        assert(jsonRecord(savedJson.positions, 'saved Phase 3E positions')[movedNodeId]);

        // Keyboard nudge is a graph-space edit and persists on keyup.
        await nodeAnchor().focus();
        const beforeNudge = await nodePosition(movedNodeId);
        await page.keyboard.press('ArrowUp');
        const afterNudge = await nodePosition(movedNodeId);
        assertNear(afterNudge.x, beforeNudge.x, 'keyboard nudge x');
        assertNear(afterNudge.y, beforeNudge.y - 12, 'keyboard nudge y');

        const compatiblePosition = await nodePosition(movedNodeId);
        await page.getByRole('button', { name: 'Screensaver' }).click();
        await page.waitForFunction(() => document.fullscreenElement !== null);
        assert.equal(await container.getAttribute('data-manual-layout-mode'), 'LOCKED');
        assert.deepEqual(await nodePosition(movedNodeId), compatiblePosition,
          'Screensaver discarded saved manual coordinates');
        await page.getByRole('button', { name: 'Toggle Fullscreen' }).click();
        await page.waitForFunction(() => document.fullscreenElement === null);
        await page.getByRole('button', { name: /Replay/ }).click();
        assert.deepEqual(await nodePosition(movedNodeId), compatiblePosition,
          'Replay discarded saved manual coordinates');

        // A document reload reconstructs the graph and loads only the strict identity match.
        await page.reload({ waitUntil: 'networkidle' });
        await optimizedFixture(page, ctx.appUrl, input);
        await visibleConstellation(page);
        container = page.getByTestId('markov-constellation-container');
        await container.waitFor();
        await container.scrollIntoViewIfNeeded();
        assert.equal(await container.getAttribute('data-manual-layout-mode'), 'LOCKED');
        assert.equal(await container.getAttribute('data-manual-layout-override-count'), '1');
        assert.deepEqual(await nodePosition(movedNodeId), compatiblePosition,
          'Strict manual position did not survive page reload');
        assert.deepEqual(await truthSnapshot(), truthBefore,
          'Reloaded manual geometry changed DOM-surfaced PolicyFlow truth');

        const storedBeforeResetView = await page.evaluate((key) => localStorage.getItem(key), storageKey);
        await page.getByRole('button', { name: 'Reset View' }).click();
        assert.deepEqual(await nodePosition(movedNodeId), compatiblePosition,
          'Reset View removed a manual node coordinate');
        assert.equal(await page.evaluate((key) => localStorage.getItem(key), storageKey), storedBeforeResetView,
          'Reset View changed persisted layout data');

        // In Arrange mode a background gesture pans but cannot add/move overrides.
        await page.getByRole('button', { name: 'Arrange constellation layout' }).click();
        const overrideCountBeforePan = await container.getAttribute('data-manual-layout-override-count');
        const nodeBeforePan = await nodePosition(movedNodeId);
        const panBefore = {
          x: Number(await container.getAttribute('data-camera-pan-x')),
          y: Number(await container.getAttribute('data-camera-pan-y')),
        };
        const background = await container.locator('.constellation-viewport').evaluate((viewport) => {
          const rect = viewport.getBoundingClientRect();
          const candidates = [
            [0.08, 0.88], [0.92, 0.88], [0.08, 0.5], [0.92, 0.5], [0.5, 0.92],
          ];
          for (const [xFraction, yFraction] of candidates) {
            const x = rect.left + rect.width * xFraction;
            const y = rect.top + rect.height * yFraction;
            const hit = document.elementFromPoint(x, y) as HTMLElement | null;
            if (hit && viewport.contains(hit) && !hit.closest('button, aside, [data-node-id], [data-edge-id]')) {
              return { x, y };
            }
          }
          throw new Error('No unobstructed Constellation background point was found');
        });
        await page.mouse.move(background.x, background.y);
        await page.mouse.down();
        await page.mouse.move(background.x + 74, background.y + 46, { steps: 6 });
        await page.mouse.up();
        const panAfter = {
          x: Number(await container.getAttribute('data-camera-pan-x')),
          y: Number(await container.getAttribute('data-camera-pan-y')),
        };
        assert(Math.hypot(panAfter.x - panBefore.x, panAfter.y - panBefore.y) > 50,
          'Background pointer drag did not pan the camera');
        assert.deepEqual(await nodePosition(movedNodeId), nodeBeforePan,
          'Background pointer drag changed graph-space node geometry');
        assert.equal(await container.getAttribute('data-manual-layout-override-count'), overrideCountBeforePan);

        // Locking turns a node-originating drag back into the normal camera pan gesture.
        await page.getByRole('button', { name: 'Lock constellation layout' }).click();
        const lockedNodePosition = await nodePosition(movedNodeId);
        const lockedPanBefore = Number(await container.getAttribute('data-camera-pan-x'));
        await drag(nodeAnchor(), -82, 34);
        assert.deepEqual(await nodePosition(movedNodeId), lockedNodePosition,
          'Locked layout allowed node movement');
        assert(Math.abs(Number(await container.getAttribute('data-camera-pan-x')) - lockedPanBefore) > 60,
          'Locked node-originating drag did not retain camera pan behavior');

        await page.getByRole('button', { name: 'Reset View' }).click();
        await page.getByRole('button', { name: 'Reset Layout' }).click();
        const automatic = await nodePosition(movedNodeId);
        const canonical = await nodeCanonicalPosition(movedNodeId);
        assertNear(automatic.x, canonical.x, 'Reset Layout automatic x');
        assertNear(automatic.y, canonical.y, 'Reset Layout automatic y');
        assert.equal(await container.getAttribute('data-manual-layout-override-count'), '0');
        assert.equal(await page.evaluate((key) => localStorage.getItem(key), storageKey), null);

        // Build a keyboard-positioned outlier, then prove both route and all fits use effective bounds.
        await page.getByRole('button', { name: 'Arrange constellation layout' }).click();
        await nodeAnchor().focus();
        await page.keyboard.press('ArrowUp');
        for (let index = 0; index < 30; index += 1) {
          await page.keyboard.press('Shift+ArrowRight');
        }
        const outlier = await nodePosition(movedNodeId);
        assert(outlier.x - canonical.x >= 1_400, 'Keyboard outlier did not exceed canonical bounds');
        await page.getByRole('button', { name: 'Route Focus' }).click();
        await page.waitForTimeout(100);
        await assertInsideViewport(nodeAnchor(), 'Route Focus manual node');
        await assertInsideViewport(nodeLabel(), 'Route Focus manual label');
        await page.getByRole('button', { name: 'Fit All' }).click();
        await page.waitForTimeout(100);
        await assertInsideViewport(nodeAnchor(), 'Fit All manual node');
        await assertInsideViewport(nodeLabel(), 'Fit All manual label');
        const desktopGeometry = await constellationFitGeometry(page);
        assert.deepEqual(desktopGeometry.outside, [], 'Manual Fit All clipped a visible label');
        mkdirSync(stableEvidenceDirectory, { recursive: true });
        const desktopPath = join(stableEvidenceDirectory, 'phase3e-manual-constellation-1440x900.png');
        await page.screenshot({ path: desktopPath, fullPage: true });
        const selectedNodeDetails = page.getByLabel('Selected constellation node details');
        if (await selectedNodeDetails.isVisible()) {
          await selectedNodeDetails.getByRole('button', { name: 'Close selected node details' }).click();
        }

        // Chromium's touch input path reaches the same pointer-capture implementation.
        await page.setViewportSize({ width: 390, height: 844 });
        await page.getByRole('button', { name: 'Fit All' }).click();
        await page.waitForTimeout(100);
        const mobileGeometry = await page.evaluate(() => ({
          viewport: document.documentElement.clientWidth,
          documentWidth: document.documentElement.scrollWidth,
          bodyWidth: document.body.scrollWidth,
        }));
        assert(mobileGeometry.documentWidth <= mobileGeometry.viewport + 1);
        assert(mobileGeometry.bodyWidth <= mobileGeometry.viewport + 1);
        const touchBefore = await nodePosition(movedNodeId);
        const touchPoint = await page.evaluate((nodeId) => {
          const controls = [...document.querySelectorAll<HTMLElement>('[data-node-id]')]
            .filter((element) => element.dataset.nodeId === nodeId);
          for (const control of controls) {
            const rect = control.getBoundingClientRect();
            const candidates = [
              [rect.left + rect.width / 2, rect.top + rect.height / 2],
              [rect.left + rect.width * 0.25, rect.top + rect.height * 0.25],
              [rect.left + rect.width * 0.75, rect.top + rect.height * 0.75],
            ];
            for (const [x, y] of candidates) {
              const hitNodeId = (document.elementFromPoint(x, y) as HTMLElement | null)
                ?.closest<HTMLElement>('[data-node-id]')?.dataset.nodeId;
              if (hitNodeId === nodeId) return { x, y };
            }
          }
          throw new Error(`No unobstructed touch point for ${nodeId}`);
        }, movedNodeId);
        const touchX = touchPoint.x;
        const touchY = touchPoint.y;
        const cdp = await context.newCDPSession(page);
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ x: touchX, y: touchY, radiusX: 4, radiusY: 4, force: 1, id: 1 }],
        });
        await page.waitForTimeout(40);
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: touchX - 24, y: touchY + 20, radiusX: 4, radiusY: 4, force: 1, id: 1 }],
        });
        await page.waitForTimeout(40);
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: touchX - 48, y: touchY + 40, radiusX: 4, radiusY: 4, force: 1, id: 1 }],
        });
        await page.waitForTimeout(40);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await page.waitForTimeout(40);
        const touchAfter = await nodePosition(movedNodeId);
        assert(Math.hypot(touchAfter.x - touchBefore.x, touchAfter.y - touchBefore.y) > 20,
          'Trusted mobile touch drag did not move the node in graph space');
        await page.getByRole('button', { name: 'Fit All' }).click();
        await page.waitForTimeout(100);
        await assertInsideViewport(nodeAnchor(), 'Mobile Fit All manual node');
        await assertInsideViewport(nodeLabel(), 'Mobile Fit All manual label');
        const mobilePath = join(stableEvidenceDirectory, 'phase3e-manual-constellation-390x844.png');
        await page.screenshot({ path: mobilePath, fullPage: true });
        await page.getByRole('button', { name: 'Reset Layout' }).click();

        ctx.artifacts.phase3eManualConstellationDesktop = relative(repositoryRoot, desktopPath);
        ctx.artifacts.phase3eManualConstellationMobile = relative(repositoryRoot, mobilePath);
        return {
          schema: 'MANUAL_CONSTELLATION_LAYOUT_V1',
          topologyFingerprint: frozen.metadata.topologyFingerprint,
          exactFlowFingerprint: frozen.metadata.exactFlowFingerprint,
          selectedPolicyFingerprint: frozen.metadata.selectedPolicyFingerprint,
          movedNodeId,
          connectedEdgeId,
          pointerDistanceGraph: Math.hypot(moved.x - original.x, moved.y - original.y),
          labelMoved: true,
          edgeRerouted: true,
          persistenceReload: true,
          resetViewPreserved: true,
          resetLayoutRemoved: true,
          backgroundPan: true,
          lockedPan: true,
          keyboardNudge: true,
          routeFocusEffectiveBounds: true,
          fitAllEffectiveBounds: true,
          replayScreensaverCompatible: true,
          fullscreen: true,
          trustedTouchDrag: true,
          mobileGeometry,
          screenshots: {
            desktop: ctx.artifacts.phase3eManualConstellationDesktop,
            mobile: ctx.artifacts.phase3eManualConstellationMobile,
          },
        };
      }, {
        frozenFlow: frozen.flow,
        frozenAcquisitionContext: { kind: 'SELF_FRACTURE' },
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
        await visibleConstellation(page);
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
        await visibleConstellation(page);
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
        await visibleConstellation(page);
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
        await visibleConstellation(page);
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
