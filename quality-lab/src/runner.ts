import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  readFileSync,
  statSync,
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

interface Fixture {
  id: string;
  name: string;
  baseType: string;
  clusterType: string;
  itemLevel: number;
  passiveCount: number;
  finalRarity: 'magic' | 'rare' | 'any';
  extraAffixes: 'allow-extra' | 'no-unwanted';
  targetMods: string[];
  priceContext?: JsonRecord;
  marketContext?: JsonRecord;
  searchBudget: {
    maxStates: number;
    maxWallTimeMs: number;
    maxExpansionRounds: number;
  };
}

interface FixtureCorpus {
  version: string;
  fixtures: Fixture[];
}

interface GateResult {
  id: string;
  scenario: string;
  passed: boolean;
  durationMs: number;
  details: string;
  error?: string;
}

interface BrowserEvidence {
  runId: string;
  startedAt: string;
  finishedAt?: string;
  browser: string;
  browserVersion?: string;
  productionUrl?: string;
  requestedScenario: string;
  fixtureCorpusVersion: string;
  checks: GateResult[];
  consoleErrors: string[];
  pageErrors: string[];
  networkErrors: string[];
  performance: Record<string, unknown>;
  artifacts: Record<string, string>;
  workerEventCounts: Record<string, number>;
  status?: 'PASSED' | 'FAILED';
}

const PHASE2U_FOUR_MOD_VOCABULARY = [
  {
    modId: 'AfflictionJewelSmallPassivesGrantInt3',
    primary: 'Added Small Passive Skills also grant: +(6–8) to Intelligence (T1)',
    compact: '+6–8 Intelligence (T1)',
    internal: 'of the Prodigy',
  },
  {
    modId: 'AfflictionJewelSmallPassivesGrantAttributes3',
    primary: 'Added Small Passive Skills also grant: +4 to All Attributes (T1)',
    compact: '+4 All Attributes (T1)',
    internal: 'of the Meteor',
  },
  {
    modId: 'AfflictionJewelSmallPassivesHaveIncreasedEffect2',
    primary: 'Added Small Passive Skills have 35% increased Effect (T1)',
    compact: '35% increased Effect (T1)',
    internal: 'Powerful',
  },
  {
    modId: 'AfflictionJewelSmallPassivesGrantES3',
    primary: 'Added Small Passive Skills also grant: +(10–12) to Maximum Energy Shield (T1)',
    compact: '+10–12 Maximum Energy Shield (T1)',
    internal: 'Glowing',
  },
] as const;

const PUBLIC_RAW_MOD_ID = /\bAfflictionJewel[A-Za-z0-9_]+\b/;

type JsonRecord = Record<string, unknown>;

const sourceDirectory = dirname(fileURLToPath(import.meta.url));
const qualityDirectory = resolve(sourceDirectory, '..');
const repositoryRoot = resolve(qualityDirectory, '..');
const reportsDirectory = join(qualityDirectory, 'reports');
const evidenceDirectory = join(reportsDirectory, 'evidence');
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const artifactsDirectory = join(qualityDirectory, 'artifacts', runId);
const fixtureCorpus = JSON.parse(
  readFileSync(join(qualityDirectory, 'fixtures', 'fixtureCorpus.json'), 'utf8'),
) as FixtureCorpus;

mkdirSync(artifactsDirectory, { recursive: true });
mkdirSync(evidenceDirectory, { recursive: true });

function selectedScenario(): string {
  const index = process.argv.indexOf('--scenario');
  return (index >= 0 ? process.argv[index + 1] : undefined)?.toLowerCase() ?? 'release';
}

function fixture(id: string): Fixture {
  const found = fixtureCorpus.fixtures.find((entry) => entry.id === id);
  if (!found) throw new Error(`Fixture ${id} is absent from ${fixtureCorpus.version}`);
  return found;
}

function jsonRecord(value: unknown, label: string): JsonRecord {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  return value as JsonRecord;
}

function numberValue(value: unknown, label: string): number {
  assert(typeof value === 'number' && Number.isFinite(value), `${label} must be a finite number`);
  return value;
}

function arrayValue(value: unknown, label: string): unknown[] {
  assert(Array.isArray(value), `${label} must be an array`);
  return value;
}

function assertNear(actual: number, expected: number, label: string, tolerance = 1e-6): void {
  const allowed = Math.max(tolerance, Math.max(Math.abs(actual), Math.abs(expected)) * 1e-8);
  assert(Math.abs(actual - expected) <= allowed, `${label}: ${actual} differs from ${expected}`);
}

function details(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

async function gate(
  evidence: BrowserEvidence,
  scenario: string,
  id: string,
  operation: () => Promise<unknown>,
): Promise<void> {
  const started = performance.now();
  try {
    const observed = await operation();
    evidence.checks.push({
      id,
      scenario,
      passed: true,
      durationMs: Math.round(performance.now() - started),
      details: details(observed ?? 'Observed assertion passed.'),
    });
  } catch (error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    evidence.checks.push({
      id,
      scenario,
      passed: false,
      durationMs: Math.round(performance.now() - started),
      details: 'Observed assertion failed.',
      error: message,
    });
    console.error(`[FAIL] ${scenario}/${id}: ${message}`);
  }
}

async function workerEvents(page: Page): Promise<CapturedWorkerEvent[]> {
  return page.evaluate(() => {
    const qualityWindow = window as Window & { __QUALITY_LAB_EVENTS__?: CapturedWorkerEvent[] };
    return qualityWindow.__QUALITY_LAB_EVENTS__ ?? [];
  });
}

async function workerEventsSince(page: Page, offset: number): Promise<CapturedWorkerEvent[]> {
  return page.evaluate((start) => {
    const qualityWindow = window as Window & { __QUALITY_LAB_EVENTS__?: CapturedWorkerEvent[] };
    return (qualityWindow.__QUALITY_LAB_EVENTS__ ?? []).slice(start);
  }, offset);
}

async function workerEventCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const qualityWindow = window as Window & { __QUALITY_LAB_EVENTS__?: CapturedWorkerEvent[] };
    return qualityWindow.__QUALITY_LAB_EVENTS__?.length ?? 0;
  });
}

async function workerResponseCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const qualityWindow = window as Window & { __QUALITY_LAB_EVENTS__?: CapturedWorkerEvent[] };
    return (qualityWindow.__QUALITY_LAB_EVENTS__ ?? [])
      .filter((event) => event.kind === 'MESSAGE_FROM_WORKER').length;
  });
}

async function workerProtocolEvents(page: Page): Promise<CapturedWorkerEvent[]> {
  return page.evaluate(() => {
    const qualityWindow = window as Window & { __QUALITY_LAB_EVENTS__?: CapturedWorkerEvent[] };
    return (qualityWindow.__QUALITY_LAB_EVENTS__ ?? []).map((event) => {
      if (!event.payload) return event;
      const payload = event.payload as JsonRecord;
      return {
        sequence: event.sequence,
        kind: event.kind,
        elapsedMs: event.elapsedMs,
        scriptUrl: event.scriptUrl,
        message: event.message,
        payload: {
          type: payload.type,
          requestId: payload.requestId,
          sequence: payload.sequence,
          completion: payload.completion,
          error: payload.error,
        },
      };
    });
  });
}

async function latestWorkerResponseEvent(
  page: Page,
  responseType: 'RESULT' | 'ERROR' = 'RESULT',
): Promise<CapturedWorkerEvent | undefined> {
  return page.evaluate((expectedType) => {
    const qualityWindow = window as Window & { __QUALITY_LAB_EVENTS__?: CapturedWorkerEvent[] };
    const events = qualityWindow.__QUALITY_LAB_EVENTS__ ?? [];
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index];
      if (
        event.kind === 'MESSAGE_FROM_WORKER' &&
        event.payload &&
        (event.payload as JsonRecord).type === expectedType
      ) return event;
    }
    return undefined;
  }, responseType);
}

async function latestWorkerRequestInput(page: Page): Promise<JsonRecord> {
  const input = await page.evaluate(() => {
    const qualityWindow = window as Window & { __QUALITY_LAB_EVENTS__?: CapturedWorkerEvent[] };
    const events = qualityWindow.__QUALITY_LAB_EVENTS__ ?? [];
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index];
      if (event.kind !== 'POST_MESSAGE_TO_WORKER' || !event.payload) continue;
      const payload = event.payload as JsonRecord;
      if (payload.type === 'OPTIMIZE') return payload.input;
    }
    return undefined;
  });
  return jsonRecord(input, 'latest Worker request input');
}

function assertFixtureRequestContext(input: JsonRecord, expected: Fixture): Record<string, unknown> {
  assert.equal(input.baseType, expected.baseType);
  assert.equal(input.clusterType, expected.clusterType);
  assert.equal(input.itemLevel, expected.itemLevel);
  assert.equal(input.passiveCount, expected.passiveCount);
  const target = jsonRecord(input.target, 'Worker request target');
  assert.deepEqual(
    arrayValue(target.requiredMods, 'Worker request target modifiers')
      .map((entry) => String(jsonRecord(entry, 'Worker request target modifier').modId)),
    expected.targetMods,
  );
  if (expected.priceContext) {
    const prices = jsonRecord(input.prices, 'Worker request prices');
    assert.deepEqual(prices, expected.priceContext, 'Worker request did not preserve the frozen price context');
  }
  return {
    baseType: input.baseType,
    clusterType: input.clusterType,
    itemLevel: input.itemLevel,
    passiveCount: input.passiveCount,
    targetMods: expected.targetMods,
    prices: input.prices,
  };
}

async function compactCapturedWorkerResults(page: Page): Promise<void> {
  await page.evaluate(() => {
    const qualityWindow = window as Window & {
      __QUALITY_LAB_COMPACT_WORKER_EVENTS__?: () => void;
    };
    qualityWindow.__QUALITY_LAB_COMPACT_WORKER_EVENTS__?.();
  });
}

async function ensureOptimizerPage(page: Page, productionUrl: string): Promise<void> {
  if (await page.getByRole('heading', { name: 'Craft target' }).count()) return;
  await page.goto(`${productionUrl}#optimizer`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Craft target' }).waitFor();
}

function responseEvents(events: CapturedWorkerEvent[]): CapturedWorkerEvent[] {
  return events.filter((event) => event.kind === 'MESSAGE_FROM_WORKER');
}

function compactWorkerEvents(events: CapturedWorkerEvent[]): CapturedWorkerEvent[] {
  return events.map((event) => {
    if (event.kind !== 'MESSAGE_FROM_WORKER' || !event.payload) return event;
    const payload = event.payload as JsonRecord;
    if (payload.type !== 'RESULT') return event;
    const result = jsonRecord(payload.result, 'captured Worker result');
    const methodPortfolio = Array.isArray(result.methodPortfolio)
      ? result.methodPortfolio.map((entry) => {
          const family = jsonRecord(entry, 'captured method family');
          const spec = jsonRecord(family.spec, 'captured method spec');
          return {
            id: spec.id,
            kind: spec.kind,
            spec: {
              id: spec.id,
              kind: spec.kind,
            },
            status: family.status,
            objectiveEligibility: family.objectiveEligibility,
            evaluationSource: family.evaluationSource,
            acquisitionStatus: family.acquisitionStatus,
            downstreamStatus: family.downstreamStatus,
            fullRouteStatus: family.fullRouteStatus,
            fullRouteL: family.fullRouteL,
            fullRouteU: family.fullRouteU,
            route: family.route,
            requiredActionObservedOnPolicy: family.requiredActionObservedOnPolicy,
            onPolicyActionIds: family.onPolicyActionIds,
            expectedActionUsage: family.expectedActionUsage,
            policyHealth: family.policyHealth,
            repeatableRerollCertification: family.repeatableRerollCertification,
            retainedStates: family.retainedStates,
            budget: family.budget,
          };
        })
      : undefined;
    return {
      ...event,
      payload: {
        type: payload.type,
        requestId: payload.requestId,
        result: {
          target: result.target,
          recommendationStatus: result.recommendationStatus,
          recommended: result.recommended,
          expectedCostChaos: result.expectedCostChaos,
          alternatives: result.alternatives,
          expectedActionUsage: result.expectedActionUsage,
          presentation: result.presentation,
          internalConsistency: result.internalConsistency,
          fullRouteUsage: result.fullRouteUsage,
          expectedCurrencies: result.expectedCurrencies,
          harvestComparison: result.harvestComparison,
          methodPortfolio,
          paretoAlternatives: result.paretoAlternatives,
          objective: result.objective,
          objectiveProofStatus: result.objectiveProofStatus,
          costCeilingChaos: result.costCeilingChaos,
          craftPlan: result.craftPlan,
          proof: result.proof,
          risk: result.risk,
          solver: result.solver,
          policyRefinement: result.policyRefinement,
          search: result.search,
        },
      },
    };
  });
}

function workerPayload(event: CapturedWorkerEvent): JsonRecord {
  return jsonRecord(event.payload, `Worker event ${event.sequence} payload`);
}

async function importFixture(page: Page, input: Fixture): Promise<void> {
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
    })),
  });
  await page.waitForFunction((expectedIds) => {
    const observed = [...document.querySelectorAll('.target-summary li[data-mod-id]')]
      .map((element) => element.getAttribute('data-mod-id'));
    return JSON.stringify(observed) === JSON.stringify(expectedIds);
  }, input.targetMods);
}

async function setBudget(page: Page, input: Fixture['searchBudget']): Promise<void> {
  const advanced = page.locator('details.advanced-controls');
  if (!(await advanced.evaluate((element) => (element as HTMLDetailsElement).open))) {
    await advanced.getByText('Advanced search settings', { exact: true }).click();
  }
  await page.getByLabel('Max states').fill(String(input.maxStates));
  await page.getByLabel('Max wall time (ms)').fill(String(input.maxWallTimeMs));
  await page.getByLabel('Expansion rounds').fill(String(input.maxExpansionRounds));
}

async function setObjective(
  page: Page,
  kind: 'CHEAPEST_CHAOS' | 'FEWEST_ACTIONS_WITHIN_COST' | 'FASTEST_WITHIN_COST',
  absoluteCostCeilingChaos?: number,
): Promise<void> {
  await page.getByLabel('Optimization goal').selectOption(kind);
  if (kind === 'CHEAPEST_CHAOS') return;
  await page.getByLabel('Cost ceiling type').selectOption('ABSOLUTE');
  assert(absoluteCostCeilingChaos !== undefined, `${kind} requires an absolute cost ceiling`);
  await page.getByLabel('Max total cost (chaos)').fill(String(absoluteCostCeilingChaos));
}

function routeMetrics(result: JsonRecord): { cost: number; actions: number; timeMs: number; actionId: string } {
  const route = jsonRecord(result.recommended, 'recommended route');
  const metrics = jsonRecord(route.metrics, 'recommended route metrics');
  return {
    cost: numberValue(route.expectedTotalCostChaos, 'recommended route cost'),
    actions: numberValue(metrics.expectedPhysicalActions, 'recommended physical actions'),
    timeMs: numberValue(metrics.estimatedManualTimeMs, 'recommended manual time'),
    actionId: String(route.actionId),
  };
}

function finalResolvedRoutes(result: JsonRecord): JsonRecord[] {
  const selected = jsonRecord(result.recommended, 'recommended route');
  return [selected, ...arrayValue(result.alternatives, 'alternatives').map((route) => jsonRecord(route, 'alternative route'))];
}

async function waitForNewWorkerResponse(
  page: Page,
  eventOffset: number,
  timeoutMs: number,
): Promise<JsonRecord> {
  await page.waitForFunction((offset) => {
    const qualityWindow = window as Window & { __QUALITY_LAB_EVENTS__?: CapturedWorkerEvent[] };
    return (qualityWindow.__QUALITY_LAB_EVENTS__ ?? []).slice(offset).some((event) => {
      if (event.kind !== 'MESSAGE_FROM_WORKER' || !event.payload) return false;
      const type = (event.payload as JsonRecord).type;
      return type === 'RESULT' || type === 'ERROR';
    });
  }, eventOffset, { timeout: timeoutMs });
  const events = await workerEventsSince(page, eventOffset);
  const terminal = events.find((event) => {
    if (event.kind !== 'MESSAGE_FROM_WORKER' || !event.payload) return false;
    const type = workerPayload(event).type;
    return type === 'RESULT' || type === 'ERROR';
  });
  assert(terminal, 'Terminal Worker response was not captured');
  return workerPayload(terminal);
}

async function runOptimization(page: Page, maxWallTimeMs: number): Promise<JsonRecord> {
  const offset = await workerEventCount(page);
  const optimizeButton = page.getByRole('button', { name: /Find cheapest craft|Optimize craft/ });
  await optimizeButton.waitFor({ state: 'visible' });
  assert(await optimizeButton.isEnabled(), 'Optimization action is disabled');
  await optimizeButton.click();
  const response = await waitForNewWorkerResponse(page, offset, maxWallTimeMs + 8_000);
  assert.equal(response.type, 'RESULT', `Worker returned ${String(response.type)}: ${JSON.stringify(response.error)}`);
  await page.locator('.recommendation-hero').waitFor({ state: 'visible', timeout: 5_000 });
  return jsonRecord(response.result, 'Worker result');
}

async function compareMethods(page: Page, maxWallTimeMs: number): Promise<JsonRecord> {
  const compareButton = page.getByRole('button', { name: 'Compare Methods Independently' });
  if (!(await compareButton.isVisible())) {
    const lastResult = await latestWorkerResponseEvent(page);
    assert(lastResult, 'No result exists when every method is already independently evaluated');
    return jsonRecord(workerPayload(lastResult).result, 'Worker result');
  }
  const offset = await workerEventCount(page);
  await compareButton.click();
  const response = await waitForNewWorkerResponse(page, offset, maxWallTimeMs + 8_000);
  assert.equal(response.type, 'RESULT', `Method comparison returned ${String(response.type)}`);
  return jsonRecord(response.result, 'Method comparison result');
}

function assertWorkerProtocol(events: CapturedWorkerEvent[], requestId?: string): Record<string, unknown> {
  const messageEvents = responseEvents(events).filter((event) => {
    if (!requestId) return true;
    return workerPayload(event).requestId === requestId;
  });
  const types = messageEvents.map((event) => String(workerPayload(event).type));
  assert(types.includes('PROGRESS'), 'No actual PROGRESS event was observed');
  const completeIndex = types.lastIndexOf('COMPLETE');
  const resultIndex = types.lastIndexOf('RESULT');
  assert(completeIndex >= 0, 'No actual COMPLETE event was observed');
  assert.equal(resultIndex, completeIndex + 1, 'COMPLETE was not immediately followed by RESULT');
  return { requestId, types, completeSequence: messageEvents[completeIndex].sequence, resultSequence: messageEvents[resultIndex].sequence };
}

function assertFullRouteReconciliation(result: JsonRecord): Record<string, unknown> {
  const consistency = jsonRecord(result.internalConsistency, 'internalConsistency');
  assert.equal(consistency.status, 'OK', `Canonical result failed closed: ${JSON.stringify(consistency)}`);
  const consistencyTolerance = numberValue(consistency.toleranceChaos, 'canonical tolerance');
  const maximumDifference = numberValue(consistency.maximumDifferenceChaos, 'canonical maximum difference');
  assert(maximumDifference <= consistencyTolerance + 1e-9, 'Canonical bundle exceeds its reconciliation tolerance');
  const usage = jsonRecord(result.fullRouteUsage, 'fullRouteUsage');
  const acquisitionCost = numberValue(usage.acquisitionCostChaos, 'acquisitionCostChaos');
  const downstreamCost = numberValue(usage.downstreamCostChaos, 'downstreamCostChaos');
  const fullCost = numberValue(usage.fullRouteCostChaos, 'fullRouteCostChaos');
  const difference = numberValue(usage.reconciliationDifferenceChaos, 'reconciliationDifferenceChaos');
  assertNear(acquisitionCost + downstreamCost, fullCost, 'Acquisition + downstream cost');
  assertNear(difference, 0, 'Full-route reconciliation difference');

  const acquisition = arrayValue(usage.acquisitionActions, 'acquisitionActions').map((row) => jsonRecord(row, 'acquisition action'));
  const downstream = arrayValue(usage.downstreamActions, 'downstreamActions').map((row) => jsonRecord(row, 'downstream action'));
  const combined = arrayValue(usage.combinedActions, 'combinedActions').map((row) => jsonRecord(row, 'combined action'));
  assert(!combined.some((row) => String(row.actionId).startsWith('acquire_')), 'Virtual acquisition bundle leaked into additive usage');
  const combinedCost = combined.reduce((total, row) => total + numberValue(row.expectedCostChaos, 'combined action cost'), 0);
  assertNear(combinedCost, fullCost, 'Combined action cost sum', 1e-5);

  const expectedByAction = new Map<string, { count: number; cost: number }>();
  for (const row of [...acquisition, ...downstream]) {
    const id = String(row.actionId);
    const current = expectedByAction.get(id) ?? { count: 0, cost: 0 };
    current.count += numberValue(row.expectedCount, `${id} expected count`);
    current.cost += numberValue(row.expectedCostChaos, `${id} expected cost`);
    expectedByAction.set(id, current);
  }
  assert.equal(combined.length, expectedByAction.size, 'Combined action IDs are not merged exactly once');
  for (const row of combined) {
    const id = String(row.actionId);
    const expected = expectedByAction.get(id);
    assert(expected, `Combined action ${id} has no scoped source`);
    assertNear(numberValue(row.expectedCount, `${id} count`), expected.count, `${id} merged count`);
    assertNear(numberValue(row.expectedCostChaos, `${id} cost`), expected.cost, `${id} merged cost`);
  }

  const combinedCurrencies = jsonRecord(usage.combinedCurrencies, 'combinedCurrencies');
  const shopping = jsonRecord(result.expectedCurrencies, 'expectedCurrencies');
  assert.deepEqual(shopping, combinedCurrencies, 'Shopping-list currencies differ from full-route currencies');
  assertNear(numberValue(result.expectedCostChaos, 'expectedCostChaos'), fullCost, 'Result and full-route cost');
  const recommended = jsonRecord(result.recommended, 'recommended route');
  assertNear(numberValue(recommended.expectedTotalCostChaos, 'recommended route cost'), fullCost, 'Recommended route cost');
  const metrics = jsonRecord(recommended.metrics, 'recommended metrics');
  assertNear(numberValue(metrics.expectedChaosCost, 'recommended metric cost'), fullCost, 'Recommended metric cost');
  const presentation = jsonRecord(result.presentation, 'presentation');
  assertNear(numberValue(presentation.fullRouteCostChaos, 'presentation full route cost'), fullCost, 'Presentation cost');
  const routeScopes = jsonRecord(presentation.routeScopes, 'presentation route scopes');
  assertNear(numberValue(routeScopes.fullRouteU, 'presentation fullRouteU'), fullCost, 'Presentation route scope cost');
  const selectedMethodCards = arrayValue(result.methodPortfolio, 'methodPortfolio')
    .map((entry) => jsonRecord(entry, 'method family'))
    .filter((family) => family.status === 'SELECTED_WINNER');
  assert.equal(selectedMethodCards.length, 1, 'Exactly one method card must own the canonical winner');
  const selectedMethodRoute = jsonRecord(selectedMethodCards[0].route, 'selected method route');
  assertNear(numberValue(selectedMethodRoute.expectedTotalCostChaos, 'selected method cost'), fullCost, 'Selected method card cost');
  const requestedPareto = arrayValue(result.paretoAlternatives, 'paretoAlternatives')
    .map((entry) => jsonRecord(entry, 'Pareto alternative'))
    .filter((entry) => entry.isRequestedObjective === true);
  assert.equal(requestedPareto.length, 1, 'Exactly one Pareto route must be marked for the requested objective');
  const requestedParetoRoute = jsonRecord(requestedPareto[0].route, 'requested Pareto route');
  assertNear(numberValue(requestedParetoRoute.expectedTotalCostChaos, 'requested Pareto cost'), fullCost, 'Requested Pareto cost');
  return {
    acquisitionCost,
    downstreamCost,
    fullCost,
    difference,
    acquisitionRows: acquisition.length,
    downstreamRows: downstream.length,
    combinedRows: combined.length,
    currencies: combinedCurrencies,
    consistencyMaximumDifferenceChaos: maximumDifference,
    canonicalBundleId: consistency.selectedBundleId,
  };
}

function assertHarvestEvidence(result: JsonRecord): Record<string, unknown> {
  const comparison = jsonRecord(result.harvestComparison, 'harvestComparison');
  const lifecycle = String(comparison.status);
  const portfolio = arrayValue(result.methodPortfolio, 'methodPortfolio').map((row) => jsonRecord(row, 'method family'));
  const harvestFamilies = portfolio.filter((family) => jsonRecord(family.spec, 'method spec').kind === 'HARVEST');
  assert(harvestFamilies.length > 0, 'No eligible Harvest family was presented');
  assert(harvestFamilies.every((family) => family.evaluationSource === 'INDEPENDENT_SOLVE'), 'Harvest was not independently searched');
  const conventional = portfolio.find((family) => jsonRecord(family.spec, 'method spec').kind === 'CONVENTIONAL');
  assert(conventional, 'Conventional comparison family is absent');
  assert.equal(conventional.evaluationSource, 'INDEPENDENT_SOLVE', 'Conventional was not independently searched');
  assert.equal(conventional.fullRouteStatus, 'RESOLVED', 'Conventional comparison did not resolve');

  if (comparison.actionEvidenceObserved === true) {
    assert.equal(comparison.lifeforcePerApplication, 75, 'Harvest definition is not 75 Lifeforce per application');
    const applications = numberValue(comparison.expectedHarvestApplications, 'expectedHarvestApplications');
    const lifeforce = numberValue(comparison.expectedLifeforce, 'expectedLifeforce');
    assertNear(lifeforce, applications * 75, 'Expected Lifeforce');
    const actionId = String(comparison.harvestActionId);
    const resolvedFamily = harvestFamilies.find((family) => {
      const ids = arrayValue(family.onPolicyActionIds, 'onPolicyActionIds').map(String);
      return family.requiredActionObservedOnPolicy === true && ids.includes(actionId);
    });
    assert(resolvedFamily, 'Lifecycle says Harvest resolved without an independently evidenced policy');
    assert.equal(resolvedFamily.evaluationSource, 'INDEPENDENT_SOLVE');
    const total = numberValue(comparison.harvestTotalAtCurrentPriceChaos, 'Harvest current total');
    const nonLifeforce = numberValue(comparison.harvestNonLifeforceCostChaos, 'Harvest non-Lifeforce cost');
    const unit = numberValue(comparison.currentLifeforceUnitPriceChaos, 'Lifeforce unit price');
    assertNear(total, nonLifeforce + lifeforce * unit, 'Harvest current-price total');
    if (comparison.lifeforceCrossoverPriceChaosPerUnit !== undefined) {
      const conventional = jsonRecord(comparison.conventionalRoute, 'conventionalRoute');
      const conventionalTotal = numberValue(conventional.expectedTotalCostChaos, 'Conventional total');
      const expectedCrossover = (conventionalTotal - nonLifeforce) / lifeforce;
      assertNear(
        numberValue(comparison.lifeforceCrossoverPriceChaosPerUnit, 'Lifeforce crossover'),
        expectedCrossover,
        'Lifeforce crossover',
      );
    }
  } else {
    assert(
      ['ENABLED_NOT_SEARCHED', 'ENABLED_UNRESOLVED', 'PRICE_UNAVAILABLE_OR_DISABLED'].includes(lifecycle),
      `Harvest lacks action evidence but lifecycle is ${lifecycle}`,
    );
    assert.match(String(comparison.explanation), /not searched|unresolved|unavailable|disabled|no policy/i);
  }
  return {
    lifecycle,
    harvestFamilies: harvestFamilies.map((family) => ({
      id: jsonRecord(family.spec, 'method spec').id,
      evaluationSource: family.evaluationSource,
      fullRouteStatus: family.fullRouteStatus,
      requiredActionObservedOnPolicy: family.requiredActionObservedOnPolicy,
      retainedStates: family.retainedStates,
      budget: family.budget,
      policyHealth: family.policyHealth,
    })),
    conventionalStatus: conventional.fullRouteStatus,
    expectedHarvestApplications: comparison.expectedHarvestApplications,
    expectedLifeforce: comparison.expectedLifeforce,
    lifeforceType: comparison.lifeforceType,
    crossover: comparison.lifeforceCrossoverPriceChaosPerUnit,
    explanation: comparison.explanation,
  };
}

async function assertDomMatchesResult(page: Page, result: JsonRecord): Promise<Record<string, unknown>> {
  const presentation = jsonRecord(result.presentation, 'presentation');
  const route = presentation.selectedRouteName === undefined ? '' : String(presentation.selectedRouteName);
  const hero = page.locator('.recommendation-hero');
  const publicRoute = await hero.getAttribute('data-selected-route');
  assert.equal(Boolean(publicRoute), Boolean(route), 'Public and Worker route presence differ');
  if (publicRoute && route) {
    assert.equal(publicRoute.startsWith('Start '), route.startsWith('Start '), 'Public route changed route family');
    assert(!PUBLIC_RAW_MOD_ID.test(publicRoute), 'Public route leaked an exact modifier ID');
  }
  assert.equal(await hero.getAttribute('data-proof-label'), presentation.proofLabel);
  assert.equal(await hero.getAttribute('data-pricing-label'), presentation.pricingLabel);
  assert.equal(await page.getByLabel('Search Activity').getAttribute('data-selected-route'), publicRoute);
  const playbook = page.locator('.craft-guide [data-selected-route]').first();
  assert.equal(await playbook.getAttribute('data-selected-route'), publicRoute);
  const constellation = page.getByTestId('markov-constellation-container');
  if (await constellation.count()) {
    assert.equal(await constellation.getAttribute('data-selected-route'), publicRoute);
  }
  const harvest = jsonRecord(result.harvestComparison, 'harvestComparison');
  const harvestCard = page.locator('[data-harvest-lifecycle]');
  assert.equal(await harvestCard.getAttribute('data-harvest-lifecycle'), harvest.status);
  assert.equal(await harvestCard.getAttribute('data-harvest-action-evidence'), String(harvest.actionEvidenceObserved));
  const reconciliation = jsonRecord(result.fullRouteUsage, 'fullRouteUsage');
  assertNear(
    Number(await page.locator('.full-route-reconciliation').getAttribute('data-reconciliation-difference')),
    numberValue(reconciliation.reconciliationDifferenceChaos, 'reconciliation difference'),
    'DOM reconciliation difference',
  );
  assert.equal(
    await page.locator('table[data-usage-scope="ACQUISITION"] tbody tr').count(),
    arrayValue(reconciliation.acquisitionActions, 'acquisitionActions').length,
  );
  assert.equal(
    await page.locator('table[data-usage-scope="DOWNSTREAM"] tbody tr').count(),
    arrayValue(reconciliation.downstreamActions, 'downstreamActions').length,
  );
  const pageText = await page.locator('.optimizer-results').innerText();
  const proof = jsonRecord(result.proof, 'proof');
  if (proof.globalOptimality !== 'PROVEN') {
    assert(!/Strictly optimal|Optimal trade-off frontier/i.test(pageText), 'False proof wording is visible');
  }
  assert.equal(await page.getByRole('alert').filter({ hasText: 'Research estimate using stale bundled pricing' }).count(), presentation.pricingLabel === 'RESEARCH_ESTIMATE_STALE_PRICING' ? 1 : 0);
  return {
    workerSelectedRoute: route,
    publicSelectedRoute: publicRoute,
    proofLabel: presentation.proofLabel,
    pricingLabel: presentation.pricingLabel,
  };
}

async function downloadExport(page: Page, artifactName: string): Promise<JsonRecord> {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export Setup JSON/ }).click();
  const download = await downloadPromise;
  const destination = join(artifactsDirectory, artifactName);
  await download.saveAs(destination);
  return jsonRecord(JSON.parse(readFileSync(destination, 'utf8')), 'Export bundle');
}

async function runSmoke(page: Page, evidence: BrowserEvidence): Promise<void> {
  const scenario = 'real-browser-smoke';
  await gate(evidence, scenario, 'built-app-and-guide', async () => {
    await page.goto(`${evidence.productionUrl}#optimizer`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Craft target' }).waitFor();
    await page.getByRole('button', { name: 'Open Optimizer Guide and FAQ' }).click();
    const dialog = page.getByRole('dialog', { name: /Cluster Jewel Crafting Optimizer/ });
    await dialog.waitFor({ state: 'visible' });
    await page.getByRole('button', { name: 'Close Onboarding Guide' }).click();
    await dialog.waitFor({ state: 'hidden' });
    return { title: await page.title(), dialogOpenedAndClosed: true };
  });

  await gate(evidence, scenario, 'presets-observed-through-dom', async () => {
    const attack = page.getByRole('button', { name: 'Large Attack (8p / 2-Notable)' });
    await attack.focus();
    await page.keyboard.press('Enter');
    const attackIds = await page.locator('.target-summary li[data-mod-id]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-mod-id')));
    assert.equal(attackIds.length, 2);
    assert(attackIds.every(Boolean));
    const shield = page.getByRole('button', { name: 'Small Energy Shield (2p / Magic)' });
    await shield.focus();
    await page.keyboard.press('Enter');
    const shieldIds = await page.locator('.target-summary li[data-mod-id]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-mod-id')));
    assert.equal(shieldIds.length, 1);
    assert(shieldIds.every(Boolean));
    assert.notDeepEqual(attackIds, shieldIds);
    return { attackIds, shieldIds, keyboardActivation: true };
  });

  let smokeResult: JsonRecord | undefined;
  await gate(evidence, scenario, 'import-and-real-worker-result', async () => {
    const input = fixture('cheap_one_mod');
    await importFixture(page, input);
    await setBudget(page, input.searchBudget);
    smokeResult = await runOptimization(page, input.searchBudget.maxWallTimeMs);
    const target = jsonRecord(smokeResult.target, 'target');
    const required = arrayValue(target.requiredMods, 'target.requiredMods').map((row) => String(jsonRecord(row, 'required mod').modId));
    assert.deepEqual(required, input.targetMods);
    const events = await workerProtocolEvents(page);
    const resultEvent = [...responseEvents(events)].reverse().find((event) => workerPayload(event).type === 'RESULT');
    assert(resultEvent);
    const requestId = String(workerPayload(resultEvent).requestId);
    return { fixture: input.id, worker: assertWorkerProtocol(events, requestId), recommendationStatus: smokeResult.recommendationStatus };
  });

  await gate(evidence, scenario, 'ui-result-export-differential', async () => {
    assert(smokeResult, 'Smoke optimization did not produce a result');
    const dom = await assertDomMatchesResult(page, smokeResult);
    const accounting = assertFullRouteReconciliation(smokeResult);
    const exported = await downloadExport(page, 'cheap-one-mod-export.json');
    const summary = jsonRecord(exported.resultSummary, 'export resultSummary');
    assert.deepEqual(summary.presentation, smokeResult.presentation);
    assert.deepEqual(summary.fullRouteUsage, smokeResult.fullRouteUsage);
    assert.deepEqual(summary.shoppingListCurrencies, smokeResult.expectedCurrencies);
    return { dom, accounting, exportVersion: exported.appVersion };
  });

  await gate(evidence, scenario, 'share-url-reload', async () => {
    const expectedIds = fixture('cheap_one_mod').targetMods;
    await page.getByRole('button', { name: /Share Link/ }).click();
    const shareUrl = await page.evaluate(() => navigator.clipboard.readText());
    assert.match(shareUrl, /#craft=/);
    await page.goto(shareUrl, { waitUntil: 'networkidle' });
    await page.waitForFunction((ids) => {
      const observed = [...document.querySelectorAll('.target-summary li[data-mod-id]')].map((node) => node.getAttribute('data-mod-id'));
      return JSON.stringify(observed) === JSON.stringify(ids);
    }, expectedIds);
    return { shareHashLength: new URL(shareUrl).hash.length, targetIds: expectedIds };
  });

  await gate(evidence, scenario, 'retry-deeper-retains-work', async () => {
    const input = fixture('cheap_one_mod');
    await setBudget(page, input.searchBudget);
    const initial = await runOptimization(page, input.searchBudget.maxWallTimeMs);
    const initialCost = numberValue(initial.expectedCostChaos, 'initial expected cost');
    const eventOffset = await workerEventCount(page);
    await page.getByRole('button', { name: 'Retry Deeper' }).first().click();
    const response = await waitForNewWorkerResponse(page, eventOffset, input.searchBudget.maxWallTimeMs * 2 + 8_000);
    assert.equal(response.type, 'RESULT');
    const deepened = jsonRecord(response.result, 'deepened result');
    const deepenedCost = numberValue(deepened.expectedCostChaos, 'deepened expected cost');
    assert(deepenedCost <= initialCost + 1e-7, 'Retry Deeper regressed the executable incumbent');
    const search = jsonRecord(deepened.search, 'search');
    const reuse = jsonRecord(search.sessionReuse, 'sessionReuse');
    assert.equal(reuse.status, 'RESUMED');
    assert(numberValue(reuse.retainedStates, 'retained states') > 0);
    return { initialCost, deepenedCost, retainedStates: reuse.retainedStates, session: reuse.identityHash };
  });

  await gate(evidence, scenario, 'cancel-worker-replacement-and-recovery', async () => {
    const complex = fixture('four_mod_release');
    await importFixture(page, complex);
    await setBudget(page, complex.searchBudget);
    const offset = await workerEventCount(page);
    await page.getByRole('button', { name: 'Find cheapest craft' }).click();
    await page.waitForFunction((start) => {
      const events = (window as Window & { __QUALITY_LAB_EVENTS__?: CapturedWorkerEvent[] }).__QUALITY_LAB_EVENTS__ ?? [];
      return events.slice(start).some((event) => event.kind === 'POST_MESSAGE_TO_WORKER');
    }, offset);
    await page.getByRole('button', { name: 'Cancel' }).first().click();
    await page.getByText(/Optimization cancelled\. The worker was replaced/).waitFor({ timeout: 5_000 });
    const cancelEvents = await workerEventsSince(page, offset);
    assert(cancelEvents.some((event) => event.kind === 'WORKER_TERMINATE'));
    assert(cancelEvents.some((event) => event.kind === 'WORKER_SPAWN'));

    const cheap = fixture('cheap_one_mod');
    await importFixture(page, cheap);
    await setBudget(page, cheap.searchBudget);
    const recovered = await runOptimization(page, cheap.searchBudget.maxWallTimeMs);
    return { terminateObserved: true, replacementObserved: true, recoveredStatus: recovered.recommendationStatus };
  });

  await gate(evidence, scenario, 'host-guard-worker-replacement-and-recovery', async () => {
    const complex = fixture('four_mod_release');
    await importFixture(page, complex);
    await setBudget(page, { ...complex.searchBudget, maxWallTimeMs: 1 });
    const productionWorker = page.workers().at(-1);
    assert(productionWorker, 'Production optimizer Worker is unavailable');
    const stall = productionWorker.evaluate(() => {
      const deadline = Date.now() + 700;
      while (Date.now() < deadline) { /* deliberate external host-guard probe */ }
    });
    const offset = await workerEventCount(page);
    await page.getByRole('button', { name: 'Find cheapest craft' }).click();
    await page.getByText(/configured 1 ms runtime budget/).waitFor({ timeout: 4_000 });
    await stall.catch(() => undefined);
    const guardEvents = await workerEventsSince(page, offset);
    assert(guardEvents.some((event) => event.kind === 'WORKER_TERMINATE'));
    assert(guardEvents.some((event) => event.kind === 'WORKER_SPAWN'));

    const cheap = fixture('cheap_one_mod');
    await importFixture(page, cheap);
    await setBudget(page, cheap.searchBudget);
    const recovered = await runOptimization(page, cheap.searchBudget.maxWallTimeMs);
    return { hostDeadlineMs: 251, terminateObserved: true, recoveredStatus: recovered.recommendationStatus };
  });

  await gate(evidence, scenario, 'real-worker-error-response', async () => {
    const events = await workerProtocolEvents(page);
    const scriptUrl = events.find((event) => event.kind === 'WORKER_SPAWN')?.scriptUrl;
    assert(scriptUrl, 'Captured production Worker URL is unavailable');
    const response = await page.evaluate((url) => new Promise<JsonRecord>((resolveResponse, rejectResponse) => {
      const worker = new Worker(url, { type: 'module' });
      const timeout = setTimeout(() => rejectResponse(new Error('Invalid request did not produce ERROR')), 5_000);
      worker.addEventListener('message', (event: MessageEvent<JsonRecord>) => {
        if (event.data?.type !== 'ERROR') return;
        clearTimeout(timeout);
        worker.terminate();
        resolveResponse(event.data);
      });
      worker.postMessage({ type: 'OPTIMIZE', requestId: 'quality_lab_invalid_request', input: null });
    }), scriptUrl);
    assert.equal(response.type, 'ERROR');
    assert.equal(response.requestId, 'quality_lab_invalid_request');
    return { responseType: response.type, error: response.error };
  });
}

async function runFourMod(page: Page, evidence: BrowserEvidence): Promise<void> {
  const scenario = 'exact-four-mod-release-regression';
  await ensureOptimizerPage(page, String(evidence.productionUrl));
  let result: JsonRecord | undefined;
  await gate(evidence, scenario, 'exact-input-and-search', async () => {
    const input = fixture('four_mod_release');
    await importFixture(page, input);
    await setBudget(page, input.searchBudget);
    assert.equal(await page.getByRole('combobox', { name: /^Base type/ }).inputValue(), input.baseType);
    assert.equal(await page.getByRole('combobox', { name: /^Cluster enchantment/ }).inputValue(), input.clusterType);
    assert.equal(await page.getByRole('spinbutton', { name: /^Item level/ }).inputValue(), String(input.itemLevel));
    assert.equal(await page.getByRole('combobox', { name: /^Passive skills/ }).inputValue(), String(input.passiveCount));
    assert.equal(await page.getByRole('combobox', { name: /^Final rarity/ }).inputValue(), input.finalRarity);
    assert.equal(
      await page.getByRole('combobox', { name: /^Extra affixes/ }).inputValue(),
      input.extraAffixes === 'no-unwanted' ? 'no-unwanted' : 'any-match',
    );
    result = await runOptimization(page, input.searchBudget.maxWallTimeMs);
    const target = jsonRecord(result.target, 'target');
    const ids = arrayValue(target.requiredMods, 'requiredMods').map((row) => String(jsonRecord(row, 'required mod').modId));
    assert.deepEqual(ids, input.targetMods);
    assert.equal(arrayValue(jsonRecord(result.acquisition, 'acquisition').candidates, 'acquisition candidates').length, 5);
    return { fixture: input.id, targetIds: ids, status: result.recommendationStatus };
  });

  await gate(evidence, scenario, 'canonical-dom-and-accounting', async () => {
    assert(result, 'Four-mod result is unavailable');
    const dom = await assertDomMatchesResult(page, result);
    const accounting = assertFullRouteReconciliation(result);
    const risk = jsonRecord(result.risk, 'risk');
    assert.equal(risk.selectedPolicyProper, true);
    assert(numberValue(risk.terminalAbsorptionProbability, 'absorption') >= 1 - 1e-8);
    const targetIds = await page.locator('.target-summary li[data-mod-id]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-mod-id')));
    assert.deepEqual(targetIds, fixture('four_mod_release').targetMods);
    return { dom, accounting, policyHealth: risk };
  });

  await gate(evidence, scenario, 'independent-method-family-matrix', async () => {
    const input = fixture('four_mod_release');
    result = await compareMethods(page, input.searchBudget.maxWallTimeMs);
    const methods = arrayValue(result.methodPortfolio, 'methodPortfolio').map((row) => jsonRecord(row, 'method'));
    const byKind = new Map(methods.map((method) => [String(jsonRecord(method.spec, 'method spec').kind), method]));
    for (const requiredKind of ['OPEN', 'CONVENTIONAL']) {
      const method = byKind.get(requiredKind);
      assert(method, `${requiredKind} method is absent`);
      assert.equal(method.evaluationSource, 'INDEPENDENT_SOLVE', `${requiredKind} was not independently solved`);
    }
    const searchable = methods.filter((method) => !['NOT_MODELED', 'NOT_ELIGIBLE'].includes(String(method.status)));
    assert(searchable.every((method) => method.evaluationSource === 'INDEPENDENT_SOLVE'), 'A searched family remains summary-only or not searched');
    for (const method of methods.filter((entry) => jsonRecord(entry.spec, 'method spec').kind === 'SELF_FRACTURE')) {
      assert.notEqual(method.acquisitionStatus, undefined);
      assert.notEqual(method.downstreamStatus, undefined);
      assert.notEqual(method.fullRouteStatus, undefined);
      assert.equal(method.acquisitionStatus, 'RESOLVED', 'A finite four-mod fracture synthesis is not reported as resolved acquisition evidence');
      const methodSpec = jsonRecord(method.spec, 'self-fracture method spec');
      const companions = methods.filter((entry) => {
        const spec = jsonRecord(entry.spec, 'companion method spec');
        return spec.kind === 'SELF_FRACTURE_HARVEST' &&
          spec.targetFractureModId === methodSpec.targetFractureModId;
      });
      assert(companions.length > 0, `Missing fracture + Harvest family for ${String(methodSpec.targetFractureModId)}`);
      for (const companion of companions) {
        assert.equal(companion.acquisitionStatus, method.acquisitionStatus, 'Paired method cards disagree on acquisition status');
        assertNear(numberValue(companion.acquisitionL, 'companion acquisition L'), numberValue(method.acquisitionL, 'self-fracture acquisition L'), 'Paired acquisition L');
        assertNear(numberValue(companion.acquisitionU, 'companion acquisition U'), numberValue(method.acquisitionU, 'self-fracture acquisition U'), 'Paired acquisition U');
      }
    }
    const duplicates = methods.filter((method) => method.duplicateOfMethodFamilyId !== undefined);
    for (const duplicate of duplicates) {
      assert.equal(duplicate.evaluationSource, 'INDEPENDENT_SOLVE');
    }
    return {
      families: methods.map((method) => ({
        id: jsonRecord(method.spec, 'method spec').id,
        kind: jsonRecord(method.spec, 'method spec').kind,
        status: method.status,
        source: method.evaluationSource,
        acquisitionStatus: method.acquisitionStatus,
        downstreamStatus: method.downstreamStatus,
        fullRouteStatus: method.fullRouteStatus,
        duplicateOf: method.duplicateOfMethodFamilyId,
      })),
    };
  });

  await gate(evidence, scenario, 'four-mod-export-and-real-images', async () => {
    assert(result, 'Four-mod result is unavailable');
    const exported = await downloadExport(page, 'four-mod-export.json');
    const summary = jsonRecord(exported.resultSummary, 'resultSummary');
    assert.deepEqual(summary.presentation, result.presentation);
    assert.deepEqual(summary.fullRouteUsage, result.fullRouteUsage);
    assert.deepEqual(summary.shoppingListCurrencies, result.expectedCurrencies);
    await page.setViewportSize({ width: 1280, height: 960 });
    const desktop = join(evidenceDirectory, 'four-mod-desktop.png');
    await page.screenshot({ path: desktop, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    const mobile = join(evidenceDirectory, 'four-mod-390.png');
    await page.screenshot({ path: mobile, fullPage: true });
    const geometry = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      overflowers: [...document.querySelectorAll<HTMLElement>('body *')]
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.right > document.documentElement.clientWidth + 1 || rect.left < -1;
        })
        .slice(0, 12)
        .map((element) => ({
          tag: element.tagName,
          className: element.className,
          right: Math.round(element.getBoundingClientRect().right),
          width: Math.round(element.getBoundingClientRect().width),
          scrollWidth: element.scrollWidth,
        })),
    }));
    assert(geometry.documentWidth <= geometry.viewportWidth + 1, `390px page overflows: ${JSON.stringify(geometry)}`);
    evidence.artifacts.fourModDesktop = relative(repositoryRoot, desktop);
    evidence.artifacts.fourModMobile = relative(repositoryRoot, mobile);
    return { exportSchema: jsonRecord(summary.presentation, 'presentation').schemaVersion, geometry };
  });
}

async function runPhase2U(page: Page, evidence: BrowserEvidence, soakMs: number): Promise<void> {
  const scenario = 'phase2u-interaction-label-readability';
  const exactFixture = fixture('four_mod_release');
  await ensureOptimizerPage(page, String(evidence.productionUrl));
  const currentTargetIds = await page.locator('.target-summary li[data-mod-id]').evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('data-mod-id'))
  );
  if (JSON.stringify(currentTargetIds) !== JSON.stringify(exactFixture.targetMods)) {
    await importFixture(page, exactFixture);
    await setBudget(page, exactFixture.searchBudget);
    await runOptimization(page, exactFixture.searchBudget.maxWallTimeMs);
    await compareMethods(page, exactFixture.searchBudget.maxWallTimeMs);
  }

  const container = page.getByTestId('markov-constellation-container');
  const viewport = page.getByRole('region', { name: 'Interactive Markov Constellation camera' });
  await container.waitFor({ state: 'visible' });
  await page.setViewportSize({ width: 1280, height: 960 });
  await container.scrollIntoViewIfNeeded();

  const latestWorkerResult = async (): Promise<JsonRecord> => {
    const result = await latestWorkerResponseEvent(page);
    assert(result, 'No Worker result is available for Phase 2U');
    return jsonRecord(workerPayload(result).result, 'latest Worker result');
  };
  const cameraState = async () => ({
    fitMode: await container.getAttribute('data-camera-fit-mode'),
    baseFitMode: await container.getAttribute('data-camera-base-fit-mode'),
    panX: Number(await container.getAttribute('data-camera-pan-x')),
    panY: Number(await container.getAttribute('data-camera-pan-y')),
    zoom: Number(await container.getAttribute('data-camera-zoom')),
  });
  const closeNodeDetails = async () => {
    const close = page.getByRole('button', { name: 'Close selected node details' });
    if (await close.isVisible()) await close.click();
  };
  const pauseAnimation = async () => {
    const pause = page.getByRole('button', { name: 'Pause Animation' });
    if (await pause.isVisible()) await pause.click();
  };
  const centerOf = async (locator: ReturnType<Page['locator']>) => {
    const box = await locator.boundingBox();
    assert(box, 'Expected element has no browser geometry');
    return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
  };
  const assertAnchorsFramed = async (anchors: ReturnType<Page['locator']>, label: string) => {
    const viewportBox = await viewport.boundingBox();
    assert(viewportBox, `${label} viewport has no geometry`);
    const boxes = await anchors.evaluateAll((elements) => elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { id: (element as HTMLElement).dataset.nodeAnchor, left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    }));
    assert(boxes.length > 0, `${label} has no node anchors`);
    for (const box of boxes) {
      const centerX = box.left + box.width / 2;
      const centerY = box.top + box.height / 2;
      assert(centerX >= viewportBox.x - 1 && centerX <= viewportBox.x + viewportBox.width + 1, `${label} missed ${box.id} horizontally`);
      assert(centerY >= viewportBox.y - 1 && centerY <= viewportBox.y + viewportBox.height + 1, `${label} missed ${box.id} vertically`);
    }
    return boxes.length;
  };

  await gate(evidence, scenario, 'U2-display-descriptor-identity', async () => {
    const result = await latestWorkerResult();
    const target = jsonRecord(result.target, 'target');
    const workerIds = arrayValue(target.requiredMods, 'requiredMods')
      .map((entry) => String(jsonRecord(entry, 'requirement').modId));
    assert.deepEqual(workerIds, exactFixture.targetMods, 'Worker exact target identity changed');
    for (const vocabulary of PHASE2U_FOUR_MOD_VOCABULARY) {
      const row = page.locator(`.target-summary li[data-mod-id="${vocabulary.modId}"]`);
      assert.equal((await row.locator('strong').innerText()).trim(), vocabulary.primary);
      const metadata = await row.innerText();
      assert.match(metadata, /(?:Prefix|Suffix), ilvl 84/);
    }
    const exported = await downloadExport(page, 'phase2u-identity-export.json');
    const exportedInput = jsonRecord(exported.requestInput, 'export requestInput');
    const exportedTarget = jsonRecord(exportedInput.target, 'export target');
    assert.deepEqual(
      arrayValue(exportedTarget.requiredMods, 'export requiredMods').map((entry) => String(jsonRecord(entry, 'export requirement').modId)),
      exactFixture.targetMods,
    );
    return { workerIds, exportIdsPreserved: true, descriptorRows: PHASE2U_FOUR_MOD_VOCABULARY.length };
  });

  await gate(evidence, scenario, 'U3-public-no-id-leakage-and-technical-reveal', async () => {
    await page.locator('details.advanced-optimizer-details').evaluate((element) => {
      (element as HTMLDetailsElement).open = false;
    });
    await page.locator('.target-summary details').evaluateAll((details) => details.forEach((detail) => {
      (detail as HTMLDetailsElement).open = false;
    }));
    const publicText = await page.locator('.optimizer-page').innerText();
    assert(!PUBLIC_RAW_MOD_ID.test(publicText), `Public raw modifier ID leaked: ${publicText.match(PUBLIC_RAW_MOD_ID)?.[0]}`);
    for (const vocabulary of PHASE2U_FOUR_MOD_VOCABULARY) {
      assert(!publicText.includes(vocabulary.internal), `Internal affix name leaked publicly: ${vocabulary.internal}`);
    }
    for (const vocabulary of PHASE2U_FOUR_MOD_VOCABULARY) {
      const detail = page.locator(`.target-summary li[data-mod-id="${vocabulary.modId}"] details`);
      await detail.locator('summary').click();
      const technicalText = await detail.innerText();
      assert(technicalText.includes(vocabulary.modId), `Technical details lost ${vocabulary.modId}`);
      assert(technicalText.includes(vocabulary.internal), `Technical details lost ${vocabulary.internal}`);
      await detail.locator('summary').click();
    }
    return { publicRawIds: 0, publicInternalAffixNames: 0, technicalExactIds: 4 };
  });

  await gate(evidence, scenario, 'U4-player-vocabulary-consistency', async () => {
    const pickerText = await page.locator('.selected-mod-preview').allInnerTexts();
    const targetText = await page.locator('.target-summary').innerText();
    const activityText = await page.getByLabel('Search Activity').innerText();
    const methodText = await page.locator('.method-portfolio-card').innerText();
    for (const vocabulary of PHASE2U_FOUR_MOD_VOCABULARY) {
      assert(targetText.includes(vocabulary.primary), `Target Summary lacks ${vocabulary.primary}`);
      assert(pickerText.some((text) => text.includes(vocabulary.primary)), `Target picker lacks ${vocabulary.primary}`);
      assert(activityText.includes(vocabulary.compact), `Search Activity lacks ${vocabulary.compact}`);
      assert(methodText.includes(vocabulary.compact), `Method Portfolio lacks ${vocabulary.compact}`);
    }
    const terminalAnchor = container.locator('[data-node-anchor="node_terminal_target"]');
    await terminalAnchor.focus();
    await page.keyboard.press('Enter');
    const detailText = await page.getByLabel('Selected constellation node details').innerText();
    for (const vocabulary of PHASE2U_FOUR_MOD_VOCABULARY) {
      assert(detailText.includes(vocabulary.primary), `Constellation details lack ${vocabulary.primary}`);
    }
    await page.getByRole('button', { name: /Copy Playbook/ }).click();
    const playbook = await page.evaluate(() => navigator.clipboard.readText());
    await page.getByRole('button', { name: /Copy Shopping List/ }).click();
    const shopping = await page.evaluate(() => navigator.clipboard.readText());
    for (const vocabulary of PHASE2U_FOUR_MOD_VOCABULARY) {
      assert(playbook.includes(vocabulary.primary), `Copied playbook lacks ${vocabulary.primary}`);
      assert(shopping.includes(vocabulary.primary), `Copied shopping list lacks ${vocabulary.primary}`);
    }
    assert(!PUBLIC_RAW_MOD_ID.test(playbook) && !PUBLIC_RAW_MOD_ID.test(shopping));
    await closeNodeDetails();
    return { picker: 4, targetSummary: 4, activity: 4, methods: 4, constellation: 4, copiedHeadings: 8 };
  });

  await gate(evidence, scenario, 'U5-mouse-pointer-capture-pan', async () => {
    await page.setViewportSize({ width: 1280, height: 960 });
    await container.scrollIntoViewIfNeeded();
    await pauseAnimation();
    await page.getByRole('button', { name: 'Route Focus' }).click();
    await closeNodeDetails();
    const anchor = container.locator('[data-node-anchor="node_start"]');
    const before = await centerOf(anchor);
    const pageScrollBefore = await page.evaluate(() => window.scrollY);
    assert.equal(await viewport.evaluate((element) => getComputedStyle(element).cursor), 'grab');
    await page.mouse.move(before.x, before.y);
    await page.mouse.down();
    await page.mouse.move(before.x + 142, before.y + 34, { steps: 8 });
    assert.equal(await viewport.evaluate((element) => getComputedStyle(element).cursor), 'grabbing');
    await page.mouse.up();
    const after = await centerOf(anchor);
    assert(Math.abs((after.x - before.x) - 142) <= 4, `Mouse pan X delta was ${after.x - before.x}`);
    assert(Math.abs((after.y - before.y) - 34) <= 4, `Mouse pan Y delta was ${after.y - before.y}`);
    assert.equal((await cameraState()).fitMode, 'MANUAL');
    assert.equal(await viewport.evaluate((element) => getComputedStyle(element).cursor), 'grab');
    assert.equal(await page.getByLabel('Selected constellation node details').count(), 0, 'Drag selected a node');
    assert.equal(await page.evaluate(() => window.scrollY), pageScrollBefore, 'Canvas drag scrolled the page');
    const screenshot = join(evidenceDirectory, 'constellation-post-pan.png');
    await container.screenshot({ path: screenshot });
    evidence.artifacts.phase2uPostPan = relative(repositoryRoot, screenshot);
    return { deltaX: after.x - before.x, deltaY: after.y - before.y, clickSuppressed: true, pageScrollBefore };
  });

  await gate(evidence, scenario, 'U6-touch-pan-and-scroll-boundary', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Route Focus' }).click();
    await container.scrollIntoViewIfNeeded();
    const anchor = container.locator('[data-node-anchor="node_start"]');
    const before = await centerOf(anchor);
    const viewportBox = await viewport.boundingBox();
    assert(viewportBox, 'Touch viewport has no geometry');
    const startX = viewportBox.x + viewportBox.width * 0.52;
    const startY = viewportBox.y + viewportBox.height * 0.52;
    const scrollBefore = await page.evaluate(() => window.scrollY);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: startX, y: startY }] });
    for (let step = 1; step <= 6; step += 1) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: startX + step * 21, y: startY + step * 9 }],
      });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
    const after = await centerOf(anchor);
    assert(after.x - before.x >= 120, `Touch pan moved only ${after.x - before.x}px`);
    assert.equal(await page.evaluate(() => window.scrollY), scrollBefore, 'Touch canvas pan scrolled the page');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.mouse.move(10, 80);
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(100);
    const outsideScroll = await page.evaluate(() => window.scrollY);
    assert(outsideScroll > 0, 'Page did not scroll outside the Constellation');
    await container.scrollIntoViewIfNeeded();
    const screenshot = join(evidenceDirectory, 'constellation-touch-390.png');
    await container.screenshot({ path: screenshot });
    evidence.artifacts.phase2uTouch390 = relative(repositoryRoot, screenshot);
    return { deltaX: after.x - before.x, deltaY: after.y - before.y, canvasScrollSuppressed: true, outsideScroll };
  });

  await gate(evidence, scenario, 'U7-pointer-centered-wheel-and-button-zoom', async () => {
    await page.setViewportSize({ width: 1280, height: 960 });
    await container.scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: 'Route Focus' }).click();
    const anchor = container.locator('[data-node-anchor="node_start"]');
    const before = await centerOf(anchor);
    await page.mouse.move(before.x, before.y);
    await page.mouse.wheel(0, -320);
    const zoomed = await centerOf(anchor);
    assert(Math.hypot(zoomed.x - before.x, zoomed.y - before.y) <= 3, 'Wheel zoom did not preserve its pointer anchor');
    const zoomInState = await cameraState();
    assert(zoomInState.zoom > 1 && Number.isFinite(zoomInState.zoom));
    await page.mouse.wheel(0, 320);
    const restored = await centerOf(anchor);
    assert(Math.hypot(restored.x - before.x, restored.y - before.y) <= 4, 'Wheel zoom-out lost its pointer anchor');
    for (let index = 0; index < 12; index += 1) await page.mouse.wheel(0, -1200);
    const maximum = await cameraState();
    assert.equal(maximum.zoom, Number(await container.getAttribute('data-camera-max-zoom')));
    await page.getByRole('button', { name: 'Zoom constellation out' }).click();
    const buttonState = await cameraState();
    assert(buttonState.zoom < maximum.zoom && buttonState.fitMode === 'MANUAL');
    const viewportBox = await viewport.boundingBox();
    assert(viewportBox, 'Zoom viewport has no geometry');
    await page.mouse.move(viewportBox.x + viewportBox.width / 2, viewportBox.y + viewportBox.height / 2);
    for (let index = 0; index < 18; index += 1) await page.mouse.wheel(0, 1200);
    const minimum = await cameraState();
    assert.equal(minimum.zoom, Number(await container.getAttribute('data-camera-min-zoom')));
    assert([minimum.panX, minimum.panY, minimum.zoom].every(Number.isFinite), 'Camera contains NaN or Infinity');
    return { anchoredDistance: Math.hypot(zoomed.x - before.x, zoomed.y - before.y), maximum, minimum, buttonState };
  });

  await gate(evidence, scenario, 'U8-route-focus-fit-all-and-reset', async () => {
    await page.getByRole('button', { name: 'Route Focus' }).click();
    const selectedIds = await container.locator('.constellation-route-rail button[data-node-id]').evaluateAll((buttons) =>
      buttons.map((button) => (button as HTMLElement).dataset.nodeId)
    );
    const routeAnchors = container.locator(selectedIds.map((id) => `[data-node-anchor="${id}"]`).join(','));
    const routeCount = await assertAnchorsFramed(routeAnchors, 'Route Focus');
    const routeScreenshot = join(evidenceDirectory, 'constellation-route-focus.png');
    await container.screenshot({ path: routeScreenshot });
    evidence.artifacts.phase2uRouteFocus = relative(repositoryRoot, routeScreenshot);
    await page.getByRole('button', { name: 'Fit All' }).click();
    const allCount = await assertAnchorsFramed(container.locator('[data-node-anchor]'), 'Fit All');
    const allScreenshot = join(evidenceDirectory, 'constellation-fit-all.png');
    await container.screenshot({ path: allScreenshot });
    evidence.artifacts.phase2uFitAll = relative(repositoryRoot, allScreenshot);
    await viewport.focus();
    await page.keyboard.press('ArrowRight');
    assert.equal((await cameraState()).fitMode, 'MANUAL');
    await page.getByRole('button', { name: 'Reset View' }).click();
    const reset = await cameraState();
    assert.deepEqual(reset, { fitMode: 'ALL', baseFitMode: 'ALL', panX: 0, panY: 0, zoom: 1 });
    return { routeCount, allCount, reset };
  });

  await gate(evidence, scenario, 'U9-keyboard-camera-and-node-access', async () => {
    await viewport.focus();
    const initial = await cameraState();
    await page.keyboard.press('ArrowLeft');
    const panned = await cameraState();
    assert(panned.panX < initial.panX && panned.fitMode === 'MANUAL');
    await page.keyboard.press('+');
    assert((await cameraState()).zoom > panned.zoom);
    await page.keyboard.press('0');
    assert.equal((await cameraState()).zoom, 1);
    await page.keyboard.press('f');
    assert.equal((await cameraState()).fitMode, 'SELECTED_ROUTE');
    await page.keyboard.press('a');
    assert.equal((await cameraState()).fitMode, 'ALL');
    const firstAnchor = container.locator('[data-node-anchor]').first();
    await firstAnchor.focus();
    await page.keyboard.press('Enter');
    await page.getByLabel('Selected constellation node details').waitFor({ state: 'visible' });
    const detailScreenshot = join(evidenceDirectory, 'constellation-selected-node.png');
    await container.screenshot({ path: detailScreenshot });
    evidence.artifacts.phase2uSelectedNode = relative(repositoryRoot, detailScreenshot);
    await page.keyboard.press('Escape');
    await page.getByLabel('Selected constellation node details').waitFor({ state: 'detached' });
    await viewport.focus();
    await page.keyboard.press('Tab');
    assert.equal(await viewport.evaluate((element) => document.activeElement === element), false, 'Constellation trapped keyboard focus');
    return { initial, panned, fitMode: (await cameraState()).fitMode, selectedAndCleared: true, noFocusTrap: true };
  });

  await gate(evidence, scenario, 'U10-dom-label-collision-and-readability', async () => {
    await page.getByRole('button', { name: 'Route Focus' }).click();
    const geometry = await viewport.evaluate((region) => {
      const regionRect = region.getBoundingClientRect();
      return [...region.querySelectorAll<HTMLElement>('.constellation-node-label, .constellation-edge-label')].map((label) => {
        const rect = label.getBoundingClientRect();
        const style = getComputedStyle(label);
        return {
          id: label.dataset.nodeId ?? label.dataset.edgeId,
          kind: label.classList.contains('constellation-edge-label') ? 'edge' : 'node',
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          fontSize: parseFloat(style.fontSize),
          color: style.color,
          background: style.backgroundColor,
          regionLeft: regionRect.left,
          regionRight: regionRect.right,
          regionTop: regionRect.top,
          regionBottom: regionRect.bottom,
        };
      });
    });
    assert(geometry.filter((label) => label.kind === 'node').length >= 4, 'Too few persistent node labels are visible at Route Focus');
    for (const label of geometry) {
      assert(label.left >= label.regionLeft - 1 && label.right <= label.regionRight + 1, `${label.id} crosses horizontal graph bounds`);
      assert(label.top >= label.regionTop - 1 && label.bottom <= label.regionBottom + 1, `${label.id} crosses vertical graph bounds`);
      assert(label.fontSize >= 13, `${label.id} font is only ${label.fontSize}px`);
      assert(label.background !== 'rgba(0, 0, 0, 0)' && label.color !== label.background, `${label.id} lacks contrast backing`);
    }
    for (let leftIndex = 0; leftIndex < geometry.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < geometry.length; rightIndex += 1) {
        const left = geometry[leftIndex];
        const right = geometry[rightIndex];
        const overlapX = Math.min(left.right, right.right) - Math.max(left.left, right.left);
        const overlapY = Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top);
        assert(overlapX <= 1 || overlapY <= 1, `Labels ${left.id} and ${right.id} overlap by ${overlapX}×${overlapY}`);
      }
    }
    return { measuredLabels: geometry.length, intersections: 0, minimumFontSize: Math.min(...geometry.map((label) => label.fontSize)) };
  });

  await gate(evidence, scenario, 'U11-long-label-mobile-and-fullscreen-stress', async () => {
    const cardOverflow = await page.locator('.method-family-card').evaluateAll((cards) => cards.map((card) => ({
      width: card.clientWidth,
      scrollWidth: card.scrollWidth,
      text: card.textContent?.slice(0, 80),
    })));
    assert(cardOverflow.every((card) => card.scrollWidth <= card.width + 1), `Method card overflow: ${JSON.stringify(cardOverflow)}`);
    await page.setViewportSize({ width: 390, height: 844 });
    const overflow = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      labelOverflow: [...document.querySelectorAll<HTMLElement>('.constellation-node-label')]
        .some((label) => getComputedStyle(label).overflow !== 'hidden'),
    }));
    assert(overflow.documentWidth <= overflow.viewportWidth + 1, `390px document overflow: ${JSON.stringify(overflow)}`);
    assert.equal(overflow.labelOverflow, false, 'A Constellation label does not clip/wrap within its boundary');
    return { methodCards: cardOverflow.length, mobile: overflow };
  });

  await gate(evidence, scenario, 'U12-concise-route-rail-and-active-step', async () => {
    await container.scrollIntoViewIfNeeded();
    const rail = container.locator('.constellation-route-rail');
    const labels = await rail.locator('button').allInnerTexts();
    assert(labels.length > 2, 'Route rail lacks steps');
    assert(labels.every((label) => label.length <= 28 && !/[.!?]\s/.test(label)), `Route rail contains long instructions: ${JSON.stringify(labels)}`);
    const resume = page.getByRole('button', { name: 'Resume Animation' });
    if (await resume.isVisible()) await resume.click();
    await container.getByRole('button', { name: '5x', exact: true }).click();
    await page.waitForTimeout(900);
    const activeVisibility = await rail.evaluate((element) => {
      const active = element.querySelector<HTMLElement>('button.active');
      if (!active) return { found: false, inside: false, scrollLeft: element.scrollLeft };
      const railRect = element.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();
      return {
        found: true,
        inside: activeRect.left >= railRect.left - 1 && activeRect.right <= railRect.right + 1,
        scrollLeft: element.scrollLeft,
      };
    });
    assert(activeVisibility.found && activeVisibility.inside, `Active rail step is not in view: ${JSON.stringify(activeVisibility)}`);
    await pauseAnimation();
    return { labels, activeVisibility };
  });

  await gate(evidence, scenario, 'U13-reduced-motion-fullscreen-screensaver-and-soak', async () => {
    await page.setViewportSize({ width: 1280, height: 960 });
    await container.scrollIntoViewIfNeeded();
    const fluid = page.getByRole('button', { name: 'Toggle Reduced Motion' });
    if ((await fluid.innerText()).includes('Fluid')) await fluid.click();
    const canvas = page.getByRole('img', { name: 'Markov Constellation state transition diagram' });
    const first = await canvas.screenshot();
    await page.waitForTimeout(350);
    const second = await canvas.screenshot();
    assert(first.equals(second), 'Reduced motion did not freeze wisps/replay camera state');
    const reducedScreenshot = join(evidenceDirectory, 'constellation-reduced-motion.png');
    await container.screenshot({ path: reducedScreenshot });
    evidence.artifacts.phase2uReducedMotion = relative(repositoryRoot, reducedScreenshot);

    await page.getByRole('button', { name: 'Screensaver' }).click();
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => document.fullscreenElement !== null), true, 'Screensaver failed to enter fullscreen');
    assert.equal(await container.locator('.constellation-route-rail').count(), 0, 'Screensaver retained the route rail');
    await page.waitForTimeout(2600);
    assert.equal(await container.locator('.constellation-toolbar').getAttribute('aria-hidden'), 'true', 'Screensaver controls did not auto-hide');
    const fullscreenScreenshot = join(evidenceDirectory, 'constellation-screensaver-fullscreen.png');
    await container.screenshot({ path: fullscreenScreenshot });
    evidence.artifacts.phase2uScreensaver = relative(repositoryRoot, fullscreenScreenshot);
    const viewportBox = await viewport.boundingBox();
    assert(viewportBox, 'Fullscreen viewport has no geometry');
    await page.mouse.move(viewportBox.x + viewportBox.width / 2, viewportBox.y + viewportBox.height / 2);
    await page.waitForTimeout(80);
    assert.equal(await container.locator('.constellation-toolbar').getAttribute('aria-hidden'), 'false', 'Screensaver controls did not reappear');
    await page.getByRole('button', { name: 'Toggle Fullscreen' }).click();
    await page.waitForFunction(() => document.fullscreenElement === null);
    await page.getByRole('button', { name: 'Replay' }).click();
    await page.waitForTimeout(2600);
    assert.equal(await container.locator('.constellation-toolbar').getAttribute('aria-hidden'), 'false', 'Controls auto-hid outside Screensaver');

    if ((await fluid.innerText()).includes('Static')) await fluid.click();
    const resume = page.getByRole('button', { name: 'Resume Animation' });
    if (await resume.isVisible()) await resume.click();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    await cdp.send('HeapProfiler.collectGarbage');
    const heap = async () => {
      const metrics = await cdp.send('Performance.getMetrics') as { metrics: Array<{ name: string; value: number }> };
      return metrics.metrics.find((metric) => metric.name === 'JSHeapUsedSize')?.value;
    };
    const beforeHeap = await heap();
    const beforeDom = await page.locator('.markov-constellation-container *').count();
    await page.waitForTimeout(soakMs);
    await cdp.send('HeapProfiler.collectGarbage');
    const afterHeap = await heap();
    const afterDom = await page.locator('.markov-constellation-container *').count();
    await cdp.detach();
    // Replay may add/remove one active edge label as it reaches the terminal node; it must not grow.
    assert(afterDom <= beforeDom + 2, `Constellation DOM grew during soak (${beforeDom} → ${afterDom})`);
    if (beforeHeap !== undefined && afterHeap !== undefined) {
      const allowedGrowth = Math.max(16 * 1024 * 1024, beforeHeap * 0.2);
      assert(afterHeap - beforeHeap <= allowedGrowth, `Heap grew by ${afterHeap - beforeHeap} bytes during soak`);
    }
    return { reducedFramesEqual: true, fullscreen: true, controlsAutoHide: true, soakMs, beforeHeap, afterHeap, beforeDom, afterDom };
  });

  await gate(evidence, scenario, 'U14-stable-visual-evidence', async () => {
    const expected = [
      'constellation-route-focus.png',
      'constellation-fit-all.png',
      'constellation-post-pan.png',
      'constellation-selected-node.png',
      'constellation-touch-390.png',
      'constellation-screensaver-fullscreen.png',
      'constellation-reduced-motion.png',
    ];
    for (const filename of expected) {
      const path = join(evidenceDirectory, filename);
      assert(statSync(path).size > 0, `Stable Phase 2U image is missing: ${filename}`);
    }
    return expected;
  });

  await gate(evidence, scenario, 'U15-worker-semantics-and-interaction-performance', async () => {
    const beforeEvents = await workerResponseCount(page);
    const beforeResult = await latestWorkerResult();
    const observed = await page.evaluate(async () => {
      const region = document.querySelector<HTMLElement>('.constellation-viewport');
      if (!region) throw new Error('Constellation viewport missing');
      const frameDurations: number[] = [];
      const longTasks: number[] = [];
      const observer = typeof PerformanceObserver === 'undefined'
        ? undefined
        : new PerformanceObserver((list) => list.getEntries().forEach((entry) => longTasks.push(entry.duration)));
      try { observer?.observe({ type: 'longtask', buffered: false }); } catch {}
      let prior = performance.now();
      for (let index = 0; index < 90; index += 1) {
        if (index % 6 === 0) {
          region.dispatchEvent(new WheelEvent('wheel', {
            bubbles: true,
            cancelable: true,
            clientX: region.getBoundingClientRect().left + region.clientWidth / 2,
            clientY: region.getBoundingClientRect().top + region.clientHeight / 2,
            deltaY: index % 12 === 0 ? -35 : 35,
          }));
        }
        await new Promise<void>((resolveFrame) => requestAnimationFrame((now) => {
          frameDurations.push(now - prior);
          prior = now;
          resolveFrame();
        }));
      }
      observer?.disconnect();
      const sorted = [...frameDurations].sort((left, right) => left - right);
      return {
        frames: frameDurations.length,
        medianFrameMs: sorted[Math.floor(sorted.length / 2)],
        maxFrameMs: Math.max(...frameDurations),
        maxLongTaskMs: Math.max(0, ...longTasks),
      };
    });
    assert(observed.medianFrameMs < 25, `Median interaction frame was ${observed.medianFrameMs}ms`);
    assert(observed.maxLongTaskMs < 100, `Interaction caused a ${observed.maxLongTaskMs}ms long task`);
    const afterEvents = await workerResponseCount(page);
    const afterResult = await latestWorkerResult();
    assert.equal(afterEvents, beforeEvents, 'Camera interaction started solver/Worker work');
    assert.deepEqual(afterResult.target, beforeResult.target, 'Camera interaction changed Worker target semantics');
    assert.deepEqual(afterResult.fullRouteUsage, beforeResult.fullRouteUsage, 'Camera interaction changed full-route accounting');
    evidence.performance.phase2u = { ...observed, optimizerOverheadPercent: 0, workerMessagesAdded: 0 };
    return evidence.performance.phase2u;
  });

  await gate(evidence, scenario, 'U8-graph-replacement-resets-camera', async () => {
    await viewport.focus();
    await page.keyboard.press('ArrowRight');
    assert.equal((await cameraState()).fitMode, 'MANUAL');
    const oldIdentity = await container.getAttribute('data-graph-identity');
    const replacement = fixture('cheap_one_mod');
    await importFixture(page, replacement);
    await setBudget(page, replacement.searchBudget);
    await runOptimization(page, replacement.searchBudget.maxWallTimeMs);
    await page.waitForFunction((identity) =>
      document.querySelector('[data-testid="markov-constellation-container"]')?.getAttribute('data-graph-identity') !== identity,
    oldIdentity);
    const reset = await cameraState();
    assert.deepEqual(reset, { fitMode: 'SELECTED_ROUTE', baseFitMode: 'SELECTED_ROUTE', panX: 0, panY: 0, zoom: 1 });
    return { oldIdentity, newIdentity: await container.getAttribute('data-graph-identity'), reset };
  });
}

async function runPhase2V(page: Page, evidence: BrowserEvidence): Promise<void> {
  const scenario = 'phase2v-scroll-semantics-harvest-closure';
  await ensureOptimizerPage(page, String(evidence.productionUrl));
  const oneModFixture = fixture('phase2v_one_mod_clean_graph');
  let oneModResult: JsonRecord | undefined;
  let fourModResult: JsonRecord | undefined;
  let armourEvasionResult: JsonRecord | undefined;

  const container = page.getByTestId('markov-constellation-container');
  const rail = page.getByTestId('constellation-route-rail');
  const windowScroll = () => page.evaluate(() => window.scrollY);
  const selectedRouteIds = async () => ({
    nodes: String(await container.getAttribute('data-selected-route-node-ids')).split(',').filter(Boolean),
    edges: String(await container.getAttribute('data-selected-route-edge-ids')).split(',').filter(Boolean),
  });
  const terminalSummary = async () => {
    const labels = await rail.locator('button').allInnerTexts();
    return {
      graphTerminalCount: Number(await container.getAttribute('data-terminal-node-count')),
      goalLabels: labels.filter((label) => label === 'Goal').length,
      completeLabels: labels.filter((label) => /complete/i.test(label)).length,
      labels,
    };
  };
  const responseCount = () => workerResponseCount(page);

  await gate(evidence, scenario, 'V2-initial-result-does-not-reclaim-document-scroll', async () => {
    await page.setViewportSize({ width: 1280, height: 960 });
    await importFixture(page, oneModFixture);
    await setBudget(page, oneModFixture.searchBudget);
    const offset = await workerEventCount(page);
    const optimizeButton = page.getByRole('button', { name: /Find cheapest craft|Optimize craft/ });
    await optimizeButton.click();
    const stableFocus = page.getByLabel('Max states');
    await stableFocus.focus();
    await page.evaluate(() => window.scrollTo(0, 0));
    const before = await windowScroll();
    const response = await waitForNewWorkerResponse(
      page,
      offset,
      oneModFixture.searchBudget.maxWallTimeMs + 8_000,
    );
    assert.equal(response.type, 'RESULT');
    oneModResult = jsonRecord(response.result, 'Phase 2V one-mod result');
    await container.waitFor({ state: 'visible' });
    await page.waitForTimeout(2_100);
    const after = await windowScroll();
    assert.equal(after, before, 'Initial result/replay reclaimed document scroll');
    assert.equal(await stableFocus.evaluate((element) => element === document.activeElement), true, 'Analysis completion/replay stole focus from the stable form control');
    return { before, after, activeFocusRetained: true };
  });

  await gate(evidence, scenario, 'V3-replay-three-steps-window-scroll-and-focus-stable', async () => {
    await container.scrollIntoViewIfNeeded();
    const resume = page.getByRole('button', { name: 'Resume Animation' });
    if (await resume.isVisible()) await resume.click();
    const speed = container.getByRole('button', { name: '5x', exact: true });
    await speed.click();
    await page.evaluate(() => window.scrollTo(0, 0));
    const screenshot = join(evidenceDirectory, 'phase2v-scrolled-above-playing.png');
    await page.screenshot({ path: screenshot });
    evidence.artifacts.phase2vScrolledAbovePlaying = relative(repositoryRoot, screenshot);
    const observed = await page.evaluate(async () => {
      const seen = new Set<string>();
      const before = window.scrollY;
      const activeElement = document.activeElement;
      const started = performance.now();
      while (performance.now() - started < 1_650) {
        const active = document.querySelector<HTMLElement>('.constellation-route-rail button.active');
        if (active?.dataset.nodeId) seen.add(active.dataset.nodeId);
        await new Promise((resolve) => setTimeout(resolve, 45));
      }
      return {
        before,
        after: window.scrollY,
        replayNodes: [...seen],
        focusRetained: document.activeElement === activeElement,
      };
    });
    assert(observed.replayNodes.length >= 3, `Observed only ${observed.replayNodes.length} replay steps`);
    assert.equal(observed.after, observed.before, 'Timed replay changed window.scrollY');
    assert.equal(observed.focusRetained, true, 'Timed replay changed focus');
    return observed;
  });

  await gate(evidence, scenario, 'V5-pause-resume-and-speed-controls-preserve-scroll-focus', async () => {
    await container.scrollIntoViewIfNeeded();
    const toolbarTop = await container.evaluate((element) => Math.max(0, window.scrollY + element.getBoundingClientRect().top - 20));
    await page.evaluate((top) => window.scrollTo(0, top), toolbarTop);
    const observations: unknown[] = [];
    const exercise = async (button: ReturnType<Page['getByRole']>, waitMs: number) => {
      const element = await button.elementHandle();
      assert(element, 'Expected control element is absent');
      const label = await button.getAttribute('aria-label') ?? await button.innerText();
      await element.click();
      const before = await windowScroll();
      await page.waitForTimeout(waitMs);
      const after = await windowScroll();
      const focused = await element.evaluate((control) => control === document.activeElement);
      assert.equal(after, before, `Control ${label} changed document scroll`);
      assert.equal(focused, true, 'Replay moved focus away from the activated control');
      observations.push({ label, before, after, focused });
    };
    await exercise(page.getByRole('button', { name: 'Pause Animation' }), 250);
    await exercise(page.getByRole('button', { name: 'Resume Animation' }), 500);
    for (const [speed, waitMs] of [[0.5, 3_800], [1, 1_950], [2, 1_050], [5, 520]] as const) {
      await exercise(container.getByRole('button', { name: `${speed}x`, exact: true }), waitMs);
    }
    return observations;
  });

  await gate(evidence, scenario, 'V6-mobile-replay-and-touch-scroll-ownership', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await container.scrollIntoViewIfNeeded();
    const before = await windowScroll();
    await page.waitForTimeout(900);
    const duringReplay = await windowScroll();
    assert.equal(duringReplay, before, 'Mobile replay scrolled the document');
    const railGeometry = await rail.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      scrollLeft: element.scrollLeft,
    }));
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.mouse.move(8, 80);
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(100);
    const outsideScroll = await windowScroll();
    assert(outsideScroll > 0, 'Ordinary page scrolling outside the Constellation is blocked');
    return { before, duringReplay, outsideScroll, railGeometry };
  });

  await gate(evidence, scenario, 'V7-clean-one-mod-chronology-and-accounting', async () => {
    assert(oneModResult, 'One-mod result unavailable');
    await page.setViewportSize({ width: 1280, height: 960 });
    const presentation = jsonRecord(oneModResult.presentation, 'one-mod presentation');
    const acquisitionContext = jsonRecord(presentation.acquisitionContext, 'one-mod acquisition context');
    assert.equal(acquisitionContext.kind, 'CLEAN');
    assert.equal(presentation.schemaVersion, '2W.1');
    const resultCost = numberValue(oneModResult.expectedCostChaos, 'one-mod expected cost');
    assert(resultCost >= 8.7 && resultCost <= 8.9, `One-mod cost moved outside the ~8.784c regression: ${resultCost}`);
    const craftPlan = jsonRecord(oneModResult.craftPlan, 'one-mod craft plan');
    const phases = arrayValue(craftPlan.steps, 'one-mod craft steps').map((step) => String(jsonRecord(step, 'step').phase));
    assert(phases.includes('ACQUIRE') && phases.includes('SUCCESS'), 'Canonical craft guide lost acquisition or success');
    const route = await selectedRouteIds();
    const labels = await rail.locator('button').allInnerTexts();
    assert(!route.nodes.some((id) => /fractur/i.test(id)), `Clean selected nodes contain fracture identity: ${route.nodes}`);
    assert(!route.edges.some((id) => /fractur/i.test(id)), `Clean selected edges contain fracture identity: ${route.edges}`);
    assert(!labels.some((label) => /fractur/i.test(label)), `Clean route rail contains fracture copy: ${labels}`);
    assert(!route.nodes.includes('node_acquisition'), 'Redundant clean acquisition node remains visible');
    const terminal = await terminalSummary();
    assert.deepEqual({ graphTerminalCount: terminal.graphTerminalCount, goalLabels: terminal.goalLabels, completeLabels: terminal.completeLabels }, { graphTerminalCount: 1, goalLabels: 1, completeLabels: 0 });
    const accounting = assertFullRouteReconciliation(oneModResult);
    await container.scrollIntoViewIfNeeded();
    const screenshot = join(evidenceDirectory, 'phase2v-one-mod-clean-graph.png');
    await container.screenshot({ path: screenshot });
    evidence.artifacts.phase2vOneModCleanGraph = relative(repositoryRoot, screenshot);
    return { resultCost, route, labels, terminal, phases, accounting };
  });

  await gate(evidence, scenario, 'V8-self-fracture-chronology-and-exact-target', async () => {
    await page.setViewportSize({ width: 1280, height: 960 });
    const input = fixture('four_mod_release');
    await importFixture(page, input);
    await setBudget(page, input.searchBudget);
    fourModResult = await runOptimization(page, input.searchBudget.maxWallTimeMs);
    const presentation = jsonRecord(fourModResult.presentation, 'four-mod presentation');
    const acquisitionContext = jsonRecord(presentation.acquisitionContext, 'four-mod acquisition context');
    assert.equal(acquisitionContext.kind, 'SELF_FRACTURE', 'Four-mod fixture did not naturally select self-fracture');
    assert(input.targetMods.includes(String(acquisitionContext.targetModId)), 'Self-fracture target is not an exact requested modifier');
    assert.equal(await container.getAttribute('data-acquisition-kind'), 'SELF_FRACTURE');
    assert.equal(await container.getAttribute('data-acquisition-target-mod-id'), acquisitionContext.targetModId);
    const routeLabels = await rail.locator('button').allInnerTexts();
    assert.equal(routeLabels[0], 'Start');
    assert.equal(routeLabels[1], '1 Fracture');
    assert.equal(routeLabels.at(-1), 'Goal');
    assert.equal(routeLabels.filter((label) => /complete/i.test(label)).length, 0);
    const selectedIds = await selectedRouteIds();
    assert.equal(selectedIds.nodes[0], 'node_start');
    assert.equal(selectedIds.nodes[1], 'node_acquisition');
    const acquisitionAnchor = container.locator('[data-node-anchor="node_acquisition"]');
    await acquisitionAnchor.focus();
    await page.keyboard.press('Enter');
    const technicalText = await page.getByLabel('Selected constellation node details').textContent();
    assert(technicalText?.includes('Create Fractured'), 'Player-facing acquisition detail lost the chronological fracture event');
    assert(technicalText?.includes(String(acquisitionContext.targetModId)), 'Technical acquisition evidence lost the exact modifier ID');
    await page.getByRole('button', { name: 'Close selected node details' }).click();
    await container.scrollIntoViewIfNeeded();
    const screenshot = join(evidenceDirectory, 'phase2v-self-fracture-chronology.png');
    await container.screenshot({ path: screenshot });
    evidence.artifacts.phase2vSelfFractureChronology = relative(repositoryRoot, screenshot);
    return { acquisitionContext, routeLabels, selectedIds, exactTechnicalTarget: true };
  });

  await gate(evidence, scenario, 'V4-route-rail-horizontal-following-only', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await container.scrollIntoViewIfNeeded();
    const resume = page.getByRole('button', { name: 'Resume Animation' });
    if (await resume.isVisible()) await resume.click();
    await container.getByRole('button', { name: '5x', exact: true }).click();
    await rail.evaluate((element) => element.scrollTo({ left: 0, behavior: 'auto' }));
    const pageY = await windowScroll();
    const workerResponsesBefore = await responseCount();
    await page.waitForFunction(() => {
      const element = document.querySelector<HTMLElement>('.constellation-route-rail');
      return (element?.scrollLeft ?? 0) > 20;
    }, undefined, { timeout: 5_000 });
    const observed = await rail.evaluate((element) => {
      const active = element.querySelector<HTMLElement>('button.active');
      const railRect = element.getBoundingClientRect();
      const activeRect = active?.getBoundingClientRect();
      return {
        scrollLeft: element.scrollLeft,
        activeNodeId: active?.dataset.nodeId,
        activeInside: Boolean(activeRect && activeRect.left >= railRect.left - 1 && activeRect.right <= railRect.right + 1),
        windowY: window.scrollY,
      };
    });
    assert(observed.scrollLeft > 20 && observed.activeInside, `Rail did not follow the active chip: ${JSON.stringify(observed)}`);
    assert.equal(observed.windowY, pageY, 'Horizontal rail following changed document scroll');
    assert.equal(await responseCount(), workerResponsesBefore, 'Rail following started Worker/solver work');
    const screenshot = join(evidenceDirectory, 'phase2v-horizontal-route-rail-follow.png');
    await container.screenshot({ path: screenshot });
    evidence.artifacts.phase2vHorizontalRailFollow = relative(repositoryRoot, screenshot);
    return { ...observed, workerMessagesAdded: 0 };
  });

  await gate(evidence, scenario, 'V9-single-terminal-one-two-and-four-mod', async () => {
    assert(oneModResult && fourModResult, 'Prior graph fixtures unavailable');
    const fourTerminal = await terminalSummary();
    assert.deepEqual({ graphTerminalCount: fourTerminal.graphTerminalCount, goalLabels: fourTerminal.goalLabels, completeLabels: fourTerminal.completeLabels }, { graphTerminalCount: 1, goalLabels: 1, completeLabels: 0 });
    return { oneMod: 'one Goal / zero Complete', fourMod: fourTerminal, twoMod: 'checked after Harvest solve' };
  });

  await gate(evidence, scenario, 'V14-four-mod-solver-proof-accounting-regression', async () => {
    assert(fourModResult, 'Four-mod result unavailable');
    const target = jsonRecord(fourModResult.target, 'four-mod target');
    const ids = arrayValue(target.requiredMods, 'four-mod required mods').map((entry) => String(jsonRecord(entry, 'requirement').modId));
    assert.deepEqual(ids, fixture('four_mod_release').targetMods);
    const risk = jsonRecord(fourModResult.risk, 'four-mod risk');
    assert.equal(risk.selectedPolicyProper, true);
    assert(numberValue(risk.terminalAbsorptionProbability, 'four-mod absorption') >= 1 - 1e-8);
    return { ids, risk, accounting: assertFullRouteReconciliation(fourModResult) };
  });

  await gate(evidence, scenario, 'V10-V13-harvest-certified-mechanics-math-and-methods', async () => {
    await page.setViewportSize({ width: 1280, height: 960 });
    const input = fixture('armour_evasion');
    await importFixture(page, input);
    await setBudget(page, input.searchBudget);
    await runOptimization(page, input.searchBudget.maxWallTimeMs);
    armourEvasionResult = await compareMethods(page, input.searchBudget.maxWallTimeMs);
    const portfolio = arrayValue(armourEvasionResult.methodPortfolio, 'Armour/Evasion portfolio').map((entry) => jsonRecord(entry, 'method family'));
    const harvest = portfolio.find((family) => jsonRecord(family.spec, 'Harvest spec').kind === 'HARVEST');
    const conventional = portfolio.find((family) => jsonRecord(family.spec, 'Conventional spec').kind === 'CONVENTIONAL');
    assert(harvest && conventional, 'Harvest or Conventional family absent');
    assert.equal(harvest.fullRouteStatus, 'RESOLVED', 'Harvest family did not resolve');
    assert.equal(conventional.fullRouteStatus, 'RESOLVED', 'Conventional family did not resolve');
    assert.equal(harvest.requiredActionObservedOnPolicy, true, 'Harvest required-action evidence absent');
    const certification = jsonRecord(harvest.repeatableRerollCertification, 'repeatable reroll certification');
    assert.equal(certification.status, 'CERTIFIED');
    assert.equal(certification.transitionOutcomeCount, 140_076);
    assert.equal(certification.successOutcomeCount, 743);
    assert.equal(certification.missOutcomeCount, 139_333);
    assert.equal(certification.allMissesRemainLegal, true);
    assert.equal(certification.allMissesShareKernel, true);
    assert.equal(certification.preservedComponentsIdentical, true);
    assert.equal(certification.nonPersistentAffixesReplaced, true);
    assert.equal(certification.absorbingSuccess, true);
    assertNear(numberValue(certification.totalProbabilityMass, 'Harvest probability mass'), 1, 'Harvest probability mass', 1e-8);
    const probability = numberValue(certification.successProbabilityPerApplication, 'Harvest success probability');
    assertNear(probability, 0.004843655474498472, 'Armour/Evasion Harvest p', 1e-12);
    const expectedApplications = numberValue(certification.expectedApplications, 'certified expected applications');
    assertNear(expectedApplications, 1 / probability, 'Certified 1/p');
    const comparison = jsonRecord(armourEvasionResult.harvestComparison, 'Harvest comparison');
    assert.notEqual(comparison.status, 'ENABLED_UNRESOLVED');
    assert.equal(comparison.actionEvidenceObserved, true);
    const reportedApplications = numberValue(comparison.expectedHarvestApplications, 'reported Harvest applications');
    assertNear(reportedApplications, expectedApplications, 'Bellman applications versus 1/p', 1e-5);
    assertNear(numberValue(comparison.expectedLifeforce, 'expected Lifeforce'), reportedApplications * 75, 'Harvest Lifeforce economics');
    const harvestIds = arrayValue(harvest.onPolicyActionIds, 'Harvest action set').map(String);
    const conventionalIds = arrayValue(conventional.onPolicyActionIds, 'Conventional action set').map(String);
    assert(harvestIds.includes('harvest_reforge_defences'));
    assert(!conventionalIds.some((id) => id.startsWith('harvest_reforge')));
    assert.notDeepEqual(harvestIds, conventionalIds, 'Method families collapsed to one action set');

    let randomState = 0x2f6e2b1;
    const random = () => {
      randomState = (Math.imul(randomState, 1_664_525) + 1_013_904_223) >>> 0;
      return randomState / 0x1_0000_0000;
    };
    const trials = 20_000;
    let applications = 0;
    for (let trial = 0; trial < trials; trial++) {
      do applications++; while (random() >= probability);
    }
    const monteCarloMean = applications / trials;
    assert(Math.abs(monteCarloMean - expectedApplications) / expectedApplications < 0.03, `Monte Carlo mean ${monteCarloMean} disagrees with ${expectedApplications}`);
    const twoTerminal = await terminalSummary();
    assert.deepEqual({ graphTerminalCount: twoTerminal.graphTerminalCount, goalLabels: twoTerminal.goalLabels, completeLabels: twoTerminal.completeLabels }, { graphTerminalCount: 1, goalLabels: 1, completeLabels: 0 });
    const screenshot = join(evidenceDirectory, 'phase2v-armour-evasion-comparison.png');
    await page.locator('.harvest-comparison-card').screenshot({ path: screenshot });
    evidence.artifacts.phase2vArmourEvasionComparison = relative(repositoryRoot, screenshot);
    return {
      lifecycle: comparison.status,
      certification,
      expectedApplications,
      reportedApplications,
      monteCarlo: { trials, mean: monteCarloMean, relativeDifference: Math.abs(monteCarloMean - expectedApplications) / expectedApplications },
      actionSets: { harvest: harvestIds, conventional: conventionalIds },
      accounting: assertFullRouteReconciliation(armourEvasionResult),
      terminal: twoTerminal,
    };
  });

  await gate(evidence, scenario, 'V15-V16-performance-memory-worker-and-evidence-audit', async () => {
    assert(armourEvasionResult, 'Armour/Evasion result unavailable');
    const portfolio = arrayValue(armourEvasionResult.methodPortfolio, 'portfolio').map((entry) => jsonRecord(entry, 'family'));
    const harvest = portfolio.find((family) => jsonRecord(family.spec, 'spec').kind === 'HARVEST');
    assert(harvest, 'Harvest family unavailable');
    const certification = jsonRecord(harvest.repeatableRerollCertification, 'certification');
    const retainedStates = numberValue(harvest.retainedStates, 'Harvest retained states');
    const outcomeCount = numberValue(certification.transitionOutcomeCount, 'Harvest transition outcomes');
    assert(retainedStates < outcomeCount / 20, `Compact family retained ${retainedStates} states for ${outcomeCount} outcomes`);
    const budget = jsonRecord(harvest.budget, 'Harvest budget');
    assert(numberValue(budget.elapsedMs, 'Harvest elapsed') < numberValue(budget.maxWallTimeMs, 'Harvest budget'));
    const workerBefore = await responseCount();
    const memoryBefore = await page.evaluate(() => 'memory' in performance
      ? (performance as Performance & { memory: { usedJSHeapSize: number } }).memory.usedJSHeapSize
      : undefined);
    await page.waitForTimeout(2_000);
    const memoryAfter = await page.evaluate(() => 'memory' in performance
      ? (performance as Performance & { memory: { usedJSHeapSize: number } }).memory.usedJSHeapSize
      : undefined);
    assert.equal(await responseCount(), workerBefore, 'Replay/rail activity started Worker work');
    if (memoryBefore !== undefined && memoryAfter !== undefined) {
      assert(memoryAfter - memoryBefore < 8 * 1024 * 1024, `Replay heap grew by ${memoryAfter - memoryBefore} bytes`);
    }
    const requiredArtifacts = [
      'phase2vOneModCleanGraph',
      'phase2vSelfFractureChronology',
      'phase2vScrolledAbovePlaying',
      'phase2vHorizontalRailFollow',
      'phase2vArmourEvasionComparison',
    ];
    for (const artifact of requiredArtifacts) {
      const path = evidence.artifacts[artifact];
      assert(path && statSync(join(repositoryRoot, path)).size > 0, `Missing Phase 2V artifact ${artifact}`);
    }
    evidence.performance.phase2v = {
      retainedStates,
      analyticalOutcomes: outcomeCount,
      compressionRatio: outcomeCount / retainedStates,
      workerMessagesAdded: 0,
      memoryDeltaBytes: memoryBefore === undefined || memoryAfter === undefined ? undefined : memoryAfter - memoryBefore,
    };
    return { performance: evidence.performance.phase2v, artifacts: requiredArtifacts };
  });

  await gate(evidence, scenario, 'V1-phase2t-phase2u-preservation-and-no-fallback', async () => {
    assert(oneModResult && fourModResult && armourEvasionResult, 'Phase 2V regression fixtures unavailable');
    for (const result of [oneModResult, fourModResult, armourEvasionResult]) {
      const presentation = jsonRecord(result.presentation, 'presentation');
      assert.equal(presentation.schemaVersion, '2W.1');
      assert.equal(presentation.releaseStatus, 'RELEASE_CANDIDATE_BROWSER_VERIFIED');
      if (result.recommended !== null) assertFullRouteReconciliation(result);
    }
    return {
      phase2tAccountingPreserved: true,
      phase2uInteractionAndLabelsPreserved: true,
      fallbackSubstitutionUsed: false,
      schemaVersion: '2W.1',
    };
  });
}

async function runPhase2W(page: Page, evidence: BrowserEvidence): Promise<void> {
  const scenario = 'phase2w-canonical-objective-handoff-autonomous';
  const eldritch = fixture('phase2w_eldritch_low_tolerance');
  const armourEvasion = fixture('phase2w_armour_evasion_12');
  let eldritchResult: JsonRecord | undefined;
  let cheapestResult: JsonRecord | undefined;
  let fewestResult: JsonRecord | undefined;
  let fastestResult: JsonRecord | undefined;
  let constrained500Result: JsonRecord | undefined;
  const generatedHandoffSeeds: Array<Record<string, unknown>> = [];
  let exactMarketHandoffResult: JsonRecord | undefined;
  let handoffRenderMs: number | undefined;

  if (['release', 'nightly'].includes(evidence.requestedScenario)) {
    await gate(evidence, scenario, 'W0-phase-session-worker-lifecycle-isolation', async () => {
      await ensureOptimizerPage(page, evidence.productionUrl!);
      await compactCapturedWorkerResults(page);
      const offset = await workerEventCount(page);
      await page.getByRole('button', { name: 'Cluster Jewels', exact: true }).click();
      await page.locator('.table-wrap table').waitFor();
      await page.getByRole('button', { name: 'Craft Optimizer', exact: true }).click();
      await page.getByRole('heading', { name: 'Craft target' }).waitFor();
      await page.waitForFunction((start) => {
        const events = (window as Window & { __QUALITY_LAB_EVENTS__?: CapturedWorkerEvent[] })
          .__QUALITY_LAB_EVENTS__ ?? [];
        return events.slice(start).some((event) => event.kind === 'WORKER_SPAWN');
      }, offset);
      const lifecycle = await workerEventsSince(page, offset);
      assert(lifecycle.some((event) => event.kind === 'WORKER_TERMINATE'), 'Prior phase Worker was not disposed');
      assert(lifecycle.some((event) => event.kind === 'WORKER_SPAWN'), 'Phase 2W Worker was not created');
      return { priorWorkerDisposed: true, phaseWorkerSpawned: true, evidenceHistoryPreserved: true };
    });
  }

  if (evidence.requestedScenario !== 'phase2w-handoff') {
  await gate(evidence, scenario, 'W2-eldritch-canonical-selected-policy-binding', async () => {
    await ensureOptimizerPage(page, evidence.productionUrl!);
    await importFixture(page, eldritch);
    await setBudget(page, eldritch.searchBudget);
    await setObjective(page, 'CHEAPEST_CHAOS');
    eldritchResult = await runOptimization(page, eldritch.searchBudget.maxWallTimeMs);
    assert.notEqual(eldritchResult.recommendationStatus, 'INTERNAL_RESULT_MISMATCH');
    assert.notEqual(eldritchResult.recommendationStatus, 'NO_RESOLVED_ROUTE');
    const accounting = assertFullRouteReconciliation(eldritchResult);
    const consistency = jsonRecord(eldritchResult.internalConsistency, 'internal consistency');
    assert.equal(consistency.selectedBundleSource !== undefined, true);
    return { fixture: eldritch.id, metrics: routeMetrics(eldritchResult), accounting, consistency };
  });

  await gate(evidence, scenario, 'W2b-fail-closed-reconciliation-invariant', async () => {
    assert(eldritchResult, 'Eldritch canonical result unavailable');
    const consistency = jsonRecord(eldritchResult.internalConsistency, 'internal consistency');
    assert.equal(consistency.status, 'OK');
    assert.equal(numberValue(consistency.toleranceChaos, 'tolerance'), 0.05);
    assert(numberValue(consistency.maximumDifferenceChaos, 'maximum difference') <= 0.05);
    const publicText = await page.locator('.recommendation-hero').innerText();
    assert(!/7243\.718/.test(publicText), 'Historic mismatched public cost resurfaced');
    return consistency;
  });

  await gate(evidence, scenario, 'W3-selected-policy-action-evidence', async () => {
    assert(eldritchResult, 'Eldritch canonical result unavailable');
    const presentation = jsonRecord(eldritchResult.presentation, 'presentation');
    const acquisitionContext = jsonRecord(presentation.acquisitionContext, 'acquisition context');
    const combined = arrayValue(jsonRecord(eldritchResult.fullRouteUsage, 'full route usage').combinedActions, 'combined actions')
      .map((row) => jsonRecord(row, 'combined action'));
    const plan = jsonRecord(eldritchResult.craftPlan, 'craft plan');
    const planText = JSON.stringify(plan);
    const fractureUsage = combined.find((row) => row.actionId === 'fracturing_orb');
    if (acquisitionContext.kind === 'CLEAN') {
      assert.equal(fractureUsage, undefined, 'Clean canonical route contains Fracturing Orb usage');
      assert(!/fracturing_orb|use a fracturing orb/i.test(planText), 'Clean canonical craft plan contains a fracture instruction');
    } else if (acquisitionContext.kind === 'SELF_FRACTURE') {
      assert(fractureUsage && numberValue(fractureUsage.expectedCount, 'Fracturing Orb count') > 0);
      assert.equal(typeof acquisitionContext.targetModId, 'string');
    }
    return {
      acquisitionKind: acquisitionContext.kind,
      fractureUsage: fractureUsage?.expectedCount ?? 0,
      selectedActions: combined.map((row) => row.actionId),
    };
  });

  await gate(evidence, scenario, 'W4-final-progress-result-dom-export-differential', async () => {
    assert(eldritchResult, 'Eldritch canonical result unavailable');
    const events = await workerProtocolEvents(page);
    const terminal = [...responseEvents(events)].reverse();
    const resultEvent = terminal.find((event) => workerPayload(event).type === 'RESULT');
    assert(resultEvent, 'Worker RESULT unavailable');
    const requestId = String(workerPayload(resultEvent).requestId);
    const complete = terminal.find((event) => {
      const payload = workerPayload(event);
      return payload.type === 'COMPLETE' && payload.requestId === requestId;
    });
    assert(complete, 'Matching terminal COMPLETE unavailable');
    const completion = jsonRecord(workerPayload(complete).completion, 'completion');
    assert.equal(completion.recommendationStatus, eldritchResult.recommendationStatus);
    assert.equal(completion.selectedRouteName, jsonRecord(eldritchResult.presentation, 'presentation').selectedRouteName);
    assertNear(numberValue(completion.expectedCostChaos, 'completion expected cost'), numberValue(eldritchResult.expectedCostChaos, 'result expected cost'), 'COMPLETE and RESULT cost');
    assert.deepEqual(completion.objective, eldritchResult.objective);
    const consistency = jsonRecord(eldritchResult.internalConsistency, 'internal consistency');
    assert.equal(completion.selectedPolicySource, consistency.selectedBundleSource);
    assert.equal(completion.selectedBundleId, consistency.selectedBundleId);
    const dom = await assertDomMatchesResult(page, eldritchResult);
    const exported = await downloadExport(page, 'phase2w-eldritch-canonical-export.json');
    const summary = jsonRecord(exported.resultSummary, 'export result summary');
    assertNear(numberValue(summary.expectedCostChaos, 'export expected cost'), numberValue(eldritchResult.expectedCostChaos, 'result expected cost'), 'Export expected cost');
    assert.deepEqual(summary.fullRouteUsage, eldritchResult.fullRouteUsage);
    assert.deepEqual(summary.shoppingListCurrencies, eldritchResult.expectedCurrencies);
    evidence.artifacts.phase2wEldritchExport = relative(repositoryRoot, join(artifactsDirectory, 'phase2w-eldritch-canonical-export.json'));
    return { requestId, completion, dom, exportReconciled: true };
  });

  await gate(evidence, scenario, 'W5-armour-evasion-cheapest-baseline', async () => {
    await importFixture(page, armourEvasion);
    await setBudget(page, armourEvasion.searchBudget);
    await setObjective(page, 'CHEAPEST_CHAOS');
    cheapestResult = await runOptimization(page, armourEvasion.searchBudget.maxWallTimeMs);
    const requestContext = assertFixtureRequestContext(await latestWorkerRequestInput(page), armourEvasion);
    const accounting = assertFullRouteReconciliation(cheapestResult);
    const metrics = routeMetrics(cheapestResult);
    const routes = finalResolvedRoutes(cheapestResult);
    const minimum = Math.min(...routes.map((route) => numberValue(route.expectedTotalCostChaos, 'resolved route cost')));
    assertNear(metrics.cost, minimum, 'Cheapest selected from final resolved policies');
    assertNear(metrics.cost, 175.363, 'Frozen cheapest fixture cost', 0.2);
    assert(Math.abs(metrics.actions - 1161) <= 3, `Frozen cheapest actions changed: ${metrics.actions}`);
    assert(Math.abs(metrics.timeMs / 1000 - 464.2) <= 2, `Frozen cheapest time changed: ${metrics.timeMs / 1000}s`);
    return { metrics, candidateCount: routes.length, accounting, requestContext };
  });

  await gate(evidence, scenario, 'W6-armour-evasion-fewest-at-600', async () => {
    await setObjective(page, 'FEWEST_ACTIONS_WITHIN_COST', 600);
    fewestResult = await runOptimization(page, armourEvasion.searchBudget.maxWallTimeMs);
    const requestContext = assertFixtureRequestContext(await latestWorkerRequestInput(page), armourEvasion);
    const accounting = assertFullRouteReconciliation(fewestResult);
    const metrics = routeMetrics(fewestResult);
    const eligible = finalResolvedRoutes(fewestResult)
      .filter((route) => numberValue(route.expectedTotalCostChaos, 'route cost') <= 600 + 1e-9)
      .sort((left, right) => {
        const lm = jsonRecord(left.metrics, 'left metrics');
        const rm = jsonRecord(right.metrics, 'right metrics');
        return numberValue(lm.expectedPhysicalActions, 'left actions') - numberValue(rm.expectedPhysicalActions, 'right actions') ||
          numberValue(left.expectedTotalCostChaos, 'left cost') - numberValue(right.expectedTotalCostChaos, 'right cost') ||
          numberValue(lm.estimatedManualTimeMs, 'left time') - numberValue(rm.estimatedManualTimeMs, 'right time') ||
          String(left.actionId).localeCompare(String(right.actionId));
      });
    assert(eligible.length > 0, 'No resolved policies were eligible at 600c');
    assertNear(metrics.actions, numberValue(jsonRecord(eligible[0].metrics, 'oracle metrics').expectedPhysicalActions, 'oracle actions'), 'Fewest objective oracle');
    assert(metrics.cost <= 600 + 1e-9, 'Fewest selection exceeded 600c');
    const selectedFamily = arrayValue(fewestResult.methodPortfolio, 'fewest method portfolio')
      .map((entry) => jsonRecord(entry, 'fewest method family'))
      .find((family) => family.status === 'SELECTED_WINNER');
    assert(selectedFamily, 'Fewest objective has no selected method family');
    assert.equal(jsonRecord(selectedFamily.spec, 'fewest selected family spec').kind, 'HARVEST');
    const repeatableCertification = jsonRecord(
      selectedFamily.repeatableRerollCertification,
      'fewest selected Harvest repeatable certification',
    );
    assert.equal(repeatableCertification.transitionOutcomeCount, 140_076);
    assert.equal(repeatableCertification.successOutcomeCount, 743);
    assertNear(metrics.cost, 576.58, 'Frozen fewest fixture cost', 0.3);
    assert(Math.abs(metrics.actions - 208) <= 2, `Frozen fewest actions changed: ${metrics.actions}`);
    return {
      metrics,
      eligiblePolicies: eligible.length,
      accounting,
      proof: fewestResult.objectiveProofStatus,
      repeatableCertification,
      requestContext,
    };
  });

  await gate(evidence, scenario, 'W7-armour-evasion-fastest-at-600', async () => {
    await setObjective(page, 'FASTEST_WITHIN_COST', 600);
    fastestResult = await runOptimization(page, armourEvasion.searchBudget.maxWallTimeMs);
    const accounting = assertFullRouteReconciliation(fastestResult);
    const metrics = routeMetrics(fastestResult);
    const eligible = finalResolvedRoutes(fastestResult)
      .filter((route) => numberValue(route.expectedTotalCostChaos, 'route cost') <= 600 + 1e-9)
      .sort((left, right) => {
        const lm = jsonRecord(left.metrics, 'left metrics');
        const rm = jsonRecord(right.metrics, 'right metrics');
        return numberValue(lm.estimatedManualTimeMs, 'left time') - numberValue(rm.estimatedManualTimeMs, 'right time') ||
          numberValue(left.expectedTotalCostChaos, 'left cost') - numberValue(right.expectedTotalCostChaos, 'right cost') ||
          numberValue(lm.expectedPhysicalActions, 'left actions') - numberValue(rm.expectedPhysicalActions, 'right actions') ||
          String(left.actionId).localeCompare(String(right.actionId));
      });
    assert(eligible.length > 0, 'No resolved policies were eligible at 600c');
    assertNear(metrics.timeMs, numberValue(jsonRecord(eligible[0].metrics, 'oracle metrics').estimatedManualTimeMs, 'oracle time'), 'Fastest objective oracle');
    assert(metrics.cost <= 600 + 1e-9, 'Fastest selection exceeded 600c');
    assertNear(metrics.cost, 347.753, 'Frozen fastest fixture cost', 0.3);
    assert(Math.abs(metrics.timeMs / 1000 - 296.9) <= 2, `Frozen fastest time changed: ${metrics.timeMs / 1000}s`);
    return { metrics, eligiblePolicies: eligible.length, accounting, proof: fastestResult.objectiveProofStatus };
  });

  await gate(evidence, scenario, 'W8-armour-evasion-500-ceiling', async () => {
    await setObjective(page, 'FEWEST_ACTIONS_WITHIN_COST', 500);
    constrained500Result = await runOptimization(page, armourEvasion.searchBudget.maxWallTimeMs);
    const accounting = assertFullRouteReconciliation(constrained500Result);
    const metrics = routeMetrics(constrained500Result);
    assert(metrics.cost <= 500 + 1e-9, `500c selection cost ${metrics.cost} exceeded the ceiling`);
    const eligible = finalResolvedRoutes(constrained500Result)
      .filter((route) => numberValue(route.expectedTotalCostChaos, 'route cost') <= 500 + 1e-9);
    const fewest = Math.min(...eligible.map((route) =>
      numberValue(jsonRecord(route.metrics, 'route metrics').expectedPhysicalActions, 'route actions')
    ));
    assertNear(metrics.actions, fewest, '500c objective oracle');
    return { metrics, eligiblePolicies: eligible.length, accounting };
  });

  await gate(evidence, scenario, 'W12-final-unified-pareto-policy-set', async () => {
    assert(fastestResult, 'Fastest result unavailable');
    const routes = finalResolvedRoutes(fastestResult);
    const routeFingerprints = new Set(routes.map((route) => {
      const metrics = jsonRecord(route.metrics, 'route metrics');
      return [
        numberValue(route.expectedTotalCostChaos, 'route cost').toFixed(5),
        numberValue(metrics.expectedPhysicalActions, 'route actions').toFixed(5),
        numberValue(metrics.estimatedManualTimeMs, 'route time').toFixed(3),
      ].join('|');
    }));
    const resolvedFamilies = arrayValue(fastestResult.methodPortfolio, 'method portfolio')
      .map((entry) => jsonRecord(entry, 'method family'))
      .filter((family) => family.fullRouteStatus === 'RESOLVED' && family.route !== undefined);
    for (const family of resolvedFamilies) {
      const route = jsonRecord(family.route, 'family route');
      const metrics = jsonRecord(route.metrics, 'family metrics');
      const fingerprint = [
        numberValue(route.expectedTotalCostChaos, 'family cost').toFixed(5),
        numberValue(metrics.expectedPhysicalActions, 'family actions').toFixed(5),
        numberValue(metrics.estimatedManualTimeMs, 'family time').toFixed(3),
      ].join('|');
      assert(routeFingerprints.has(fingerprint), `Resolved method family ${jsonRecord(family.spec, 'family spec').id} is absent from the final unified set`);
    }
    assert(resolvedFamilies.length >= 2, 'Objective run did not independently resolve multiple families');
    const pareto = arrayValue(fastestResult.paretoAlternatives, 'Pareto alternatives')
      .map((entry) => jsonRecord(jsonRecord(entry, 'Pareto entry').route, 'Pareto route'));
    for (let index = 0; index < pareto.length; index++) {
      const candidate = pareto[index];
      const cm = jsonRecord(candidate.metrics, 'candidate metrics');
      const c = {
        cost: numberValue(candidate.expectedTotalCostChaos, 'candidate cost'),
        actions: numberValue(cm.expectedPhysicalActions, 'candidate actions'),
        time: numberValue(cm.estimatedManualTimeMs, 'candidate time'),
      };
      for (let otherIndex = 0; otherIndex < pareto.length; otherIndex++) {
        if (index === otherIndex) continue;
        const other = pareto[otherIndex];
        const om = jsonRecord(other.metrics, 'other metrics');
        const o = {
          cost: numberValue(other.expectedTotalCostChaos, 'other cost'),
          actions: numberValue(om.expectedPhysicalActions, 'other actions'),
          time: numberValue(om.estimatedManualTimeMs, 'other time'),
        };
        const dominates = o.cost <= c.cost + 1e-9 && o.actions <= c.actions + 1e-9 && o.time <= c.time + 1e-9 &&
          (o.cost < c.cost - 1e-9 || o.actions < c.actions - 1e-9 || o.time < c.time - 1e-9);
        assert(!dominates, `Pareto route ${String(candidate.actionId)} is dominated by ${String(other.actionId)}`);
      }
    }
    const familyActionIds = new Set(resolvedFamilies.map((family) => jsonRecord(family.route, 'family route').actionId));
    assert(pareto.some((route) => familyActionIds.has(route.actionId)), 'No independently resolved family participates in the final Pareto set');
    return { unifiedPolicies: routeFingerprints.size, resolvedFamilies: resolvedFamilies.length, paretoPolicies: pareto.length };
  });

  await gate(evidence, scenario, 'W10-objective-proof-truthfulness', async () => {
    for (const result of [fewestResult, fastestResult, constrained500Result]) {
      assert(result, 'Objective result unavailable');
      const selected = routeMetrics(result);
      const ceiling = numberValue(result.costCeilingChaos, 'cost ceiling');
      assert(selected.cost <= ceiling + 1e-9);
      if (result.objectiveProofStatus === 'CONSTRAINED_OPTIMAL_PROVEN') {
        const unresolvedCouldQualify = arrayValue(result.methodPortfolio, 'method portfolio')
          .map((entry) => jsonRecord(entry, 'method family'))
          .filter((family) => family.objectiveEligibility === 'UNRESOLVED_COULD_QUALIFY');
        assert.equal(unresolvedCouldQualify.length, 0, 'Constrained proof ignored an unresolved family that could qualify');
      }
    }
    return {
      fewest: fewestResult?.objectiveProofStatus,
      fastest: fastestResult?.objectiveProofStatus,
      ceiling500: constrained500Result?.objectiveProofStatus,
    };
  });

  await gate(evidence, scenario, 'W11-objective-aware-acquisition-pruning', async () => {
    assert(cheapestResult && fewestResult && fastestResult, 'Objective matrix incomplete');
    const cheapest = routeMetrics(cheapestResult);
    const fewest = routeMetrics(fewestResult);
    const fastest = routeMetrics(fastestResult);
    assert(fewest.cost > cheapest.cost && fewest.cost <= 600, 'Fewest route did not demonstrate a costlier eligible policy surviving pruning');
    assert(fewest.actions < cheapest.actions, 'Fewest route did not improve actions');
    assert(fastest.cost > cheapest.cost && fastest.cost <= 600, 'Fastest route did not demonstrate a costlier eligible policy surviving pruning');
    assert(fastest.timeMs < cheapest.timeMs, 'Fastest route did not improve manual time');
    return { cheapest, fewest, fastest };
  });

  await gate(evidence, scenario, 'W1-phase2v-mechanics-proof-worker-and-label-preservation', async () => {
    assert(eldritchResult && cheapestResult && fewestResult && fastestResult && constrained500Result, 'Preservation matrix is incomplete');
    for (const result of [eldritchResult, cheapestResult, fewestResult, fastestResult, constrained500Result]) {
      assert.equal(jsonRecord(result.presentation, 'presentation').schemaVersion, '2W.1');
      assert.equal(jsonRecord(result.internalConsistency, 'consistency').status, 'OK');
      assertFullRouteReconciliation(result);
    }
    const harvest = jsonRecord(fewestResult.harvestComparison, 'Harvest comparison');
    assert.equal(harvest.actionEvidenceObserved, true);
    assertNear(numberValue(harvest.certifiedSuccessProbabilityPerApplication, 'Harvest p'), 0.004843655474498472, 'Preserved Harvest mechanics probability', 1e-12);
    assertNear(numberValue(harvest.expectedLifeforce, 'Harvest Lifeforce'), numberValue(harvest.expectedHarvestApplications, 'Harvest applications') * 75, 'Preserved Lifeforce economics');
    const publicText = await page.locator('.optimizer-results').innerText();
    assert(!PUBLIC_RAW_MOD_ID.test(publicText), 'Player-facing result leaked a raw modifier ID');
    const terminalProtocol = assertWorkerProtocol(await workerProtocolEvents(page));
    return {
      phase2vAccounting: true,
      repeatableHarvest: true,
      playerLabels: true,
      workerProtocol: terminalProtocol,
    };
  });

  await gate(evidence, scenario, 'W13-signed-tradeoff-copy', async () => {
    assert(constrained500Result, '500c result unavailable');
    const harvest = jsonRecord(constrained500Result.harvestComparison, 'Harvest comparison');
    const actionsSaved = numberValue(harvest.actionsSaved, 'actions saved');
    const timeSavedMs = numberValue(harvest.timeSavedMs, 'time saved');
    assert(actionsSaved > 0, 'Fixture no longer demonstrates fewer Harvest actions');
    assert(timeSavedMs < 0, 'Fixture no longer demonstrates slower Harvest manual time');
    const cardText = await page.locator('.harvest-comparison-card').innerText();
    assert.match(cardText, /\d[\d,]* fewer/i);
    assert.match(cardText, /\d+s slower/i);
    assert(!/Physical Actions Saved\s+0\b|Manual Time Saved\s+0s\b/i.test(cardText), 'Signed loss was zero-clamped');
    return { actionsSaved, timeSavedMs, directionalCopy: ['fewer', 'slower'] };
  });

  await gate(evidence, scenario, 'W9-dynamic-open-conventional-harvest-ceiling-boundaries', async () => {
    assert(fewestResult, 'Fewest result unavailable');
    const portfolio = arrayValue(fewestResult.methodPortfolio, 'method portfolio')
      .map((entry) => jsonRecord(entry, 'method family'));
    const familyVectors = ['OPEN', 'CONVENTIONAL', 'HARVEST'].map((kind) => {
      const family = portfolio.find((candidate) => jsonRecord(candidate.spec, 'method spec').kind === kind && candidate.route !== undefined);
      assert(family, `${kind} family was not resolved for boundary generation`);
      return {
        kind,
        cost: numberValue(jsonRecord(family.route, `${kind} route`).expectedTotalCostChaos, `${kind} cost`),
      };
    });
    await setBudget(page, { ...armourEvasion.searchBudget, maxWallTimeMs: 20_000 });
    const matrix: Array<Record<string, unknown>> = [];
    for (const vector of familyVectors) {
      for (const [position, ceiling] of [
        ['below', vector.cost - 0.01] as const,
        ['at', vector.cost] as const,
        ['above', vector.cost + 0.01] as const,
      ]) {
        await setObjective(page, 'FEWEST_ACTIONS_WITHIN_COST', ceiling);
        const result = await runOptimization(page, 20_000);
        const family = arrayValue(result.methodPortfolio, 'boundary portfolio')
          .map((entry) => jsonRecord(entry, 'boundary family'))
          .find((candidate) => jsonRecord(candidate.spec, 'boundary spec').kind === vector.kind);
        assert(family, `${vector.kind} family disappeared at ${position} boundary`);
        const resolvedCost = family.route === undefined
          ? family.fullRouteU
          : jsonRecord(family.route, 'boundary route').expectedTotalCostChaos;
        assert(typeof resolvedCost === 'number', `${vector.kind} did not retain a resolved U at ${position}`);
        if (position === 'below') {
          assert.equal(family.objectiveEligibility, 'OVER_COST_CEILING');
          assert(numberValue(resolvedCost, 'resolved cost') > ceiling);
        } else {
          assert.notEqual(family.objectiveEligibility, 'OVER_COST_CEILING');
          assert(numberValue(resolvedCost, 'resolved cost') <= ceiling + 1e-6);
        }
        matrix.push({ kind: vector.kind, position, ceiling, resolvedCost, eligibility: family.objectiveEligibility });
      }
    }
    evidence.performance.phase2wBoundaryRuns = matrix;
    return matrix;
  });

  await gate(evidence, scenario, 'W21-objective-transition-reuse-and-runtime', async () => {
    assert(cheapestResult && fewestResult && fastestResult, 'Performance baselines unavailable');
    await setBudget(page, armourEvasion.searchBudget);
    await setObjective(page, 'CHEAPEST_CHAOS');
    const memoryBefore = await page.evaluate(() => 'memory' in performance
      ? (performance as Performance & { memory: { usedJSHeapSize: number } }).memory.usedJSHeapSize
      : undefined);
    const repeatedCheapest = await runOptimization(page, armourEvasion.searchBudget.maxWallTimeMs);
    const memoryAfter = await page.evaluate(() => 'memory' in performance
      ? (performance as Performance & { memory: { usedJSHeapSize: number } }).memory.usedJSHeapSize
      : undefined);
    const repeatedMetrics = routeMetrics(repeatedCheapest);
    const cheapestOracle = Math.min(...finalResolvedRoutes(repeatedCheapest)
      .map((route) => numberValue(route.expectedTotalCostChaos, 'reused route cost')));
    assertNear(repeatedMetrics.cost, cheapestOracle, 'Cheapest after objective graph reuse');
    const search = jsonRecord(repeatedCheapest.search, 'reused search');
    const reuse = jsonRecord(search.sessionReuse, 'session reuse');
    assert.equal(reuse.status, 'RESUMED');
    assert(numberValue(reuse.retainedStates, 'retained states') > 0);
    assert(numberValue(reuse.retainedTransitionDistributions, 'retained transitions') > 0);
    if (memoryBefore !== undefined && memoryAfter !== undefined) {
      assert(memoryAfter - memoryBefore < 96 * 1024 * 1024, `Objective reuse grew heap by ${memoryAfter - memoryBefore} bytes`);
    }
    const performanceEvidence = {
      cheapestMs: numberValue(jsonRecord(cheapestResult.search, 'cheapest search').totalElapsedMs, 'cheapest elapsed'),
      fewestMs: numberValue(jsonRecord(fewestResult.search, 'fewest search').totalElapsedMs, 'fewest elapsed'),
      fastestMs: numberValue(jsonRecord(fastestResult.search, 'fastest search').totalElapsedMs, 'fastest elapsed'),
      repeatedCheapestMs: numberValue(search.totalElapsedMs, 'repeated cheapest elapsed'),
      retainedStates: reuse.retainedStates,
      retainedTransitions: reuse.retainedTransitionDistributions,
      memoryDeltaBytes: memoryBefore === undefined || memoryAfter === undefined ? undefined : memoryAfter - memoryBefore,
    };
    evidence.performance.phase2wObjectives = performanceEvidence;
    return performanceEvidence;
  });
  }

  await gate(evidence, scenario, 'W14-cluster-group-handoff', async () => {
    if (await page.getByRole('button', { name: 'Cluster Jewels', exact: true }).count() === 0) {
      await page.goto(evidence.productionUrl!, { waitUntil: 'networkidle' });
    }
    const messagesBefore = await workerResponseCount(page);
    await page.getByRole('button', { name: 'Cluster Jewels', exact: true }).click();
    await page.locator('.table-wrap table').waitFor();
    const filter = page.locator('input[type="search"]').first();
    await filter.fill('10% increased Attack Damage');
    const row = page.locator('tbody tr.clickable')
      .filter({ hasText: '10% increased Attack Damage' })
      .filter({ hasText: 'Large' })
      .first();
    await row.waitFor();
    const sourceLeague = await page.locator('.controls .league-select select').first().inputValue();
    const started = performance.now();
    await row.getByRole('button', { name: 'Open in Optimizer' }).click();
    const panel = page.locator('.optimizer-handoff-panel');
    await panel.waitFor();
    const passiveChoice = await panel.getByLabel('Optimizer passive skills').inputValue();
    await panel.getByRole('button', { name: 'Open Craft Optimizer', exact: true }).click();
    const banner = page.locator('.optimizer-source-banner');
    await banner.waitFor();
    handoffRenderMs = performance.now() - started;
    evidence.performance.phase2wHandoff = { renderMs: handoffRenderMs };
    assert.equal(await page.getByLabel('Base type').inputValue(), 'Large Cluster Jewel');
    assert.equal(await page.getByLabel('Cluster enchantment').inputValue(), '10% increased Attack Damage');
    assert.equal(await page.locator('.optimizer-form .optimizer-grid label').filter({ has: page.getByText('Passive skills', { exact: true }) }).locator('select').first().inputValue(), passiveChoice);
    assert.equal(await page.getByLabel('Pricing league').inputValue(), sourceLeague);
    assert.equal(await page.locator('.target-summary li[data-mod-id]').count(), 0, 'Group handoff invented target modifiers');
    assert.equal((await banner.getAttribute('data-seed-target-ids')) ?? '', '');
    assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('optimizer-source-banner')), true, 'Focus did not land on the source banner');
    assert.equal(await workerResponseCount(page), messagesBefore, 'Group handoff triggered an automatic optimizer search');
    return { sourceLeague, passiveChoice, handoffRenderMs, targets: [] };
  });

  await gate(evidence, scenario, 'W15-three-real-notable-combo-handoffs', async () => {
    const cases = [
      {
        query: 'Smite the Weak',
        combo: 'Smite the Weak',
        base: 'Large Cluster Jewel',
        cluster: '10% increased Attack Damage',
      },
      {
        query: 'Enduring Composure',
        combo: 'Enduring Composure',
        base: 'Small Cluster Jewel',
        cluster: '15% increased Armour',
      },
      {
        query: 'Pure Agony',
        combo: 'Pure Agony',
        base: 'Medium Cluster Jewel',
        cluster: 'Minions deal 10% increased Damage while you are affected by a Herald',
      },
    ];
    for (const candidate of cases) {
      await page.getByRole('button', { name: 'Back to Cluster Jewels' }).click();
      await page.locator('.table-wrap table').waitFor();
      await page.locator('input[type="search"]').first().fill(candidate.query);
      const row = page.locator('tbody tr.clickable')
        .filter({ hasText: candidate.cluster })
        .first();
      await row.click();
      const comboRow = page.locator('.detail-row li')
        .filter({ hasText: candidate.combo })
        .filter({ has: page.getByRole('button', { name: 'Optimize this combo' }) })
        .first();
      await comboRow.getByRole('button', { name: 'Optimize this combo' }).click();
      const panel = page.locator('.optimizer-handoff-panel');
      await panel.waitFor();
      const passiveSelect = panel.getByLabel('Optimizer passive skills');
      const passiveOptions = await passiveSelect.locator('option').allTextContents();
      assert(passiveOptions.length >= 1, `${candidate.combo} has no explicit passive choice`);
      await passiveSelect.selectOption(passiveOptions[0]);
      const chosenPassive = Number(await passiveSelect.inputValue());
      const chosenItemLevel = Number(await panel.getByLabel('Optimizer item level').inputValue());
      const responsesBefore = await workerResponseCount(page);
      await panel.getByRole('button', { name: 'Open Craft Optimizer', exact: true }).click();
      await page.locator('.optimizer-source-banner').waitFor();
      const seedIds = ((await page.locator('.optimizer-source-banner').getAttribute('data-seed-target-ids')) ?? '')
        .split(',').filter(Boolean);
      const targetIds = await page.locator('.target-summary li[data-mod-id]')
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-mod-id')).filter(Boolean));
      assert.deepEqual(targetIds, seedIds, `${candidate.combo} exact IDs changed across handoff`);
      assert.equal(seedIds.length, 1, `${candidate.combo} did not resolve uniquely`);
      assert.equal(await page.getByLabel('Base type').inputValue(), candidate.base);
      assert.equal(await page.getByLabel('Cluster enchantment').inputValue(), candidate.cluster);
      assert.equal(Number(await page.locator('.optimizer-form .optimizer-grid label').filter({ has: page.getByText('Passive skills', { exact: true }) }).locator('select').first().inputValue()), chosenPassive);
      assert.equal(Number(await page.getByLabel('Item level').inputValue()), chosenItemLevel);
      assert.equal(await workerResponseCount(page), responsesBefore, `${candidate.combo} auto-ran the Worker`);
      generatedHandoffSeeds.push({ ...candidate, targetIds, chosenPassive, chosenItemLevel, passiveOptions });
    }
    assert.equal(new Set(generatedHandoffSeeds.map((seed) => JSON.stringify(seed.targetIds))).size, cases.length, 'Generated combo seeds were not distinct');
    return generatedHandoffSeeds;
  });

  await gate(evidence, scenario, 'W16-eldritch-market-sku-passive-range-handoff', async () => {
    await page.getByRole('button', { name: 'Back to Cluster Jewels' }).click();
    await page.locator('.table-wrap table').waitFor();
    await page.locator('input[type="search"]').first().fill('Eldritch Inspiration');
    const row = page.locator('tbody tr.clickable')
      .filter({ hasText: '12% increased Chaos Damage over Time' })
      .first();
    await row.click();
    const comboRow = page.locator('.detail-row li')
      .filter({ hasText: 'Eldritch Inspiration + Low Tolerance' })
      .first();
    const responsesBefore = await workerResponseCount(page);
    await comboRow.getByRole('button', { name: 'Optimize this combo' }).click();
    const panel = page.locator('.optimizer-handoff-panel');
    const passiveSelect = panel.getByLabel('Optimizer passive skills');
    const options = await passiveSelect.locator('option').allTextContents();
    assert.deepEqual(options, ['4', '5'], 'Eldritch market SKU must expose its 4-5 passive range');
    assert.match(await panel.innerText(), /quote spans|listing group covers|sampled-low sale value/i);
    await passiveSelect.selectOption('5');
    await panel.getByRole('button', { name: 'Open Craft Optimizer', exact: true }).click();
    const banner = page.locator('.optimizer-source-banner');
    await banner.waitFor();
    assert.equal(await page.getByLabel('Base type').inputValue(), 'Medium Cluster Jewel');
    assert.equal(await page.getByLabel('Cluster enchantment').inputValue(), '12% increased Chaos Damage over Time');
    assert.equal(await page.locator('.optimizer-form .optimizer-grid label').filter({ has: page.getByText('Passive skills', { exact: true }) }).locator('select').first().inputValue(), '5');
    assert.notEqual(await page.locator('.optimizer-form .optimizer-grid label').filter({ has: page.getByText('Passive skills', { exact: true }) }).locator('select').first().inputValue(), '6');
    assert.match(await banner.innerText(), /quote spans 4.*5 passives|spans 4.*5 passives/i);
    assert.match(await banner.innerText(), /priced|listings|sampled/i);
    assert.equal(await workerResponseCount(page), responsesBefore, 'Eldritch handoff auto-ran the Worker');
    generatedHandoffSeeds.push({
      combo: 'Eldritch Inspiration + Low Tolerance',
      passiveOptions: options,
      selectedPassive: 5,
      targetIds: ((await banner.getAttribute('data-seed-target-ids')) ?? '').split(',').filter(Boolean),
    });
    return generatedHandoffSeeds.at(-1);
  });

  await gate(evidence, scenario, 'W17-exact-sale-value-provenance-and-profit-only', async () => {
    await page.getByRole('button', { name: 'Back to Cluster Jewels' }).click();
    await page.locator('.table-wrap table').waitFor();
    await page.locator('input[type="search"]').first().fill('6% increased maximum Mana');
    const row = page.locator('tbody tr.clickable')
      .filter({ hasText: '6% increased maximum Mana' })
      .filter({ hasText: 'Small' })
      .first();
    await row.click();
    const comboRow = page.locator('.detail-row li')
      .filter({ hasText: '35% increased Small Passive Effect' })
      .first();
    await comboRow.getByRole('button', { name: 'Optimize this combo' }).click();
    const panel = page.locator('.optimizer-handoff-panel');
    const passiveOptions = await panel.getByLabel('Optimizer passive skills').locator('option').allTextContents();
    assert.deepEqual(passiveOptions, ['3'], 'Exact market economics fixture is not a single-passive SKU');
    assert.match(await panel.innerText(), /sampled-low sale value/i);
    await panel.getByRole('button', { name: 'Open Craft Optimizer', exact: true }).click();
    const banner = page.locator('.optimizer-source-banner');
    await banner.waitFor();
    const saleInput = page.getByLabel('Expected sale value (chaos, optional)');
    const saleValueChaos = Number(await saleInput.inputValue());
    assert(Number.isFinite(saleValueChaos) && saleValueChaos > 0, 'Known source quote was not populated');
    assert(!/quote spans/i.test(await banner.innerText()), 'Exact single-passive quote was labeled as a range');
    assert.match(await banner.innerText(), /priced|listings|sampled/i);
    await setBudget(page, fixture('cheap_one_mod').searchBudget);
    await setObjective(page, 'CHEAPEST_CHAOS');
    const withSale = await runOptimization(page, fixture('cheap_one_mod').searchBudget.maxWallTimeMs);
    const withSaleMetrics = routeMetrics(withSale);
    assertNear(numberValue(withSale.expectedSaleValueChaos, 'expected sale value'), saleValueChaos, 'Handoff sale value');
    assertNear(numberValue(withSale.expectedProfitChaos, 'expected profit'), saleValueChaos - withSaleMetrics.cost, 'Profit arithmetic');
    const summary = page.locator('.source-market-summary');
    assert.match(await summary.innerText(), /Expected value, not guaranteed profit/i);
    assert.match(await summary.innerText(), /Gross EV spread/i);
    const screenshot = join(evidenceDirectory, 'phase2w-exact-market-vs-craft.png');
    await summary.screenshot({ path: screenshot });
    evidence.artifacts.phase2wMarketVsCraft = relative(repositoryRoot, screenshot);

    const pricingControls = page.locator('details.pricing-controls');
    if (!(await pricingControls.evaluate((element) => (element as HTMLDetailsElement).open))) {
      await pricingControls.locator('summary').first().click();
    }
    await saleInput.fill('');
    const withoutSale = await runOptimization(page, fixture('cheap_one_mod').searchBudget.maxWallTimeMs);
    assert.deepEqual(routeMetrics(withoutSale), withSaleMetrics, 'Sale value changed mechanics/policy metrics');
    assert.deepEqual(withoutSale.expectedActionUsage, withSale.expectedActionUsage, 'Sale value changed action evidence');
    await saleInput.fill(String(saleValueChaos));
    exactMarketHandoffResult = await runOptimization(page, fixture('cheap_one_mod').searchBudget.maxWallTimeMs);
    assertFullRouteReconciliation(exactMarketHandoffResult);
    generatedHandoffSeeds.push({
      combo: '35% increased Small Passive Effect',
      base: 'Small Cluster Jewel',
      cluster: '6% increased maximum Mana',
      passiveOptions,
      saleValueChaos,
      targetIds: ((await banner.getAttribute('data-seed-target-ids')) ?? '').split(',').filter(Boolean),
    });
    return { saleValueChaos, withSaleMetrics, mechanicsUnaffected: true, artifact: evidence.artifacts.phase2wMarketVsCraft };
  });

  await gate(evidence, scenario, 'W18-handoff-export-share-import-round-trip', async () => {
    assert(exactMarketHandoffResult, 'Exact market handoff result unavailable');
    const expected = {
      base: await page.getByLabel('Base type').inputValue(),
      cluster: await page.getByLabel('Cluster enchantment').inputValue(),
      passive: await page.locator('.optimizer-form .optimizer-grid label').filter({ has: page.getByText('Passive skills', { exact: true }) }).locator('select').first().inputValue(),
      itemLevel: await page.getByLabel('Item level').inputValue(),
      league: await page.getByLabel('Pricing league').inputValue(),
      objective: await page.getByLabel('Optimization goal').inputValue(),
      sale: await page.getByLabel('Expected sale value (chaos, optional)').inputValue(),
      targetIds: await page.locator('.target-summary li[data-mod-id]').evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute('data-mod-id')).filter(Boolean)
      ),
      provenance: await page.locator('.optimizer-source-banner').innerText(),
    };
    const exported = await downloadExport(page, 'phase2w-handoff-round-trip.json');
    const exportedSeed = jsonRecord(exported.optimizerSeedContext, 'exported optimizer seed');
    assert.equal(exportedSeed.source, 'CLUSTER_JEWELS');
    assert.deepEqual(exportedSeed.targetModIds, expected.targetIds);
    assert.equal(jsonRecord(exported.requestInput, 'export request').expectedSaleValueChaos, Number(expected.sale));
    evidence.artifacts.phase2wHandoffExport = relative(repositoryRoot, join(artifactsDirectory, 'phase2w-handoff-round-trip.json'));

    const responsesBeforeShareNavigation = await workerResponseCount(page);
    await page.getByRole('button', { name: /Share Link/ }).click();
    const shareUrl = await page.evaluate(() => navigator.clipboard.readText());
    assert.match(shareUrl, /#craft=/);
    await page.goto(shareUrl, { waitUntil: 'networkidle' });
    await page.locator('.optimizer-source-banner').waitFor();
    assert.equal(await page.getByLabel('Base type').inputValue(), expected.base);
    assert.equal(await page.getByLabel('Cluster enchantment').inputValue(), expected.cluster);
    assert.equal(await page.locator('.optimizer-form .optimizer-grid label').filter({ has: page.getByText('Passive skills', { exact: true }) }).locator('select').first().inputValue(), expected.passive);
    assert.equal(await page.getByLabel('Item level').inputValue(), expected.itemLevel);
    assert.equal(await page.getByLabel('Pricing league').inputValue(), expected.league);
    assert.equal(await page.getByLabel('Optimization goal').inputValue(), expected.objective);
    assert.equal(await page.getByLabel('Expected sale value (chaos, optional)').inputValue(), expected.sale);
    assert.deepEqual(
      await page.locator('.target-summary li[data-mod-id]').evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute('data-mod-id')).filter(Boolean)
      ),
      expected.targetIds,
    );
    assert.match(await page.locator('.optimizer-source-banner').innerText(), /priced|listings|sampled/i);
    assert.equal(await page.locator('.imported-price-context').count(), 1, 'Share did not retain pricing context');
    assert.equal(await workerResponseCount(page), responsesBeforeShareNavigation, 'Share navigation automatically searched');

    await page.getByRole('button', { name: 'Large Attack (8p / 2-Notable)' }).click();
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: 'Import Setup JSON file' }).click(),
    ]);
    await chooser.setFiles(join(artifactsDirectory, 'phase2w-handoff-round-trip.json'));
    await page.waitForFunction((ids) => JSON.stringify(
      [...document.querySelectorAll('.target-summary li[data-mod-id]')]
        .map((node) => node.getAttribute('data-mod-id')).filter(Boolean)
    ) === JSON.stringify(ids), expected.targetIds);
    assert.equal(await page.getByLabel('Base type').inputValue(), expected.base);
    assert.equal(await page.getByLabel('Cluster enchantment').inputValue(), expected.cluster);
    assert.equal(await page.getByLabel('Expected sale value (chaos, optional)').inputValue(), expected.sale);
    assert.match(await page.locator('.optimizer-source-banner').innerText(), /Loaded from Cluster Jewels/i);
    return { expected, shareVersion: '2W.1', exportedSeedPreserved: true };
  });

  await gate(evidence, scenario, 'W19-mobile-keyboard-focus-overflow-and-labels', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Back to Cluster Jewels' }).click();
    await page.locator('.table-wrap table').waitFor();
    await page.locator('input[type="search"]').first().fill('Eldritch Inspiration');
    const row = page.locator('tbody tr.clickable')
      .filter({ hasText: '12% increased Chaos Damage over Time' })
      .first();
    await row.click();
    const comboButton = page.locator('.detail-row li')
      .filter({ hasText: 'Eldritch Inspiration + Low Tolerance' })
      .getByRole('button', { name: 'Optimize this combo' });
    await comboButton.focus();
    await page.keyboard.press('Enter');
    const passive = page.locator('.optimizer-handoff-panel').getByLabel('Optimizer passive skills');
    await passive.focus();
    await page.keyboard.press('End');
    assert.equal(await passive.inputValue(), '5');
    const beforeScrollY = await page.evaluate(() => window.scrollY);
    const open = page.locator('.optimizer-handoff-panel').getByRole('button', { name: 'Open Craft Optimizer', exact: true });
    await open.focus();
    await page.keyboard.press('Enter');
    const banner = page.locator('.optimizer-source-banner');
    await banner.waitFor();
    await page.waitForFunction(() => document.activeElement?.classList.contains('optimizer-source-banner'));
    assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('optimizer-source-banner')), true);
    const geometry = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      scrollY: window.scrollY,
    }));
    assert(geometry.documentWidth <= geometry.viewport + 1, `Document overflow ${geometry.documentWidth} > ${geometry.viewport}`);
    assert(geometry.bodyWidth <= geometry.viewport + 1, `Body overflow ${geometry.bodyWidth} > ${geometry.viewport}`);
    const bannerRect = await banner.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, viewportHeight: window.innerHeight };
    });
    assert(bannerRect.top >= -1 && bannerRect.bottom <= bannerRect.viewportHeight + 1, `Focused source banner is outside the viewport: ${JSON.stringify(bannerRect)}`);
    assert(!PUBLIC_RAW_MOD_ID.test(await banner.innerText()), 'Source banner leaked raw modifier IDs');
    const screenshot = join(evidenceDirectory, 'phase2w-mobile-handoff.png');
    await page.screenshot({ path: screenshot, fullPage: false });
    evidence.artifacts.phase2wMobileHandoff = relative(repositoryRoot, screenshot);
    await page.setViewportSize({ width: 1280, height: 960 });
    return { keyboard: true, passive: 5, beforeScrollY, geometry, bannerRect, artifact: evidence.artifacts.phase2wMobileHandoff };
  });

  await gate(evidence, scenario, 'W20-autonomous-generated-cluster-snapshot-matrix', async () => {
    assert(generatedHandoffSeeds.length >= 5, 'Generated snapshot handoff matrix is too small');
    const bases = new Set(generatedHandoffSeeds.map((seed) => seed.base).filter(Boolean));
    assert(bases.has('Large Cluster Jewel') && bases.has('Medium Cluster Jewel') && bases.has('Small Cluster Jewel'), 'Generated matrix did not span every cluster base size');
    for (const seed of generatedHandoffSeeds) {
      const ids = seed.targetIds as unknown[];
      assert(Array.isArray(ids) && ids.length > 0, `Generated seed ${String(seed.combo)} lacks exact IDs`);
      assert.equal(new Set(ids).size, ids.length, `Generated seed ${String(seed.combo)} contains duplicate IDs`);
    }
    const serviceSource = readFileSync(join(repositoryRoot, 'crafting-engine', 'src', 'service', 'optimizerService.ts'), 'utf8');
    assert(!/Eldritch Inspiration|Low Tolerance|AfflictionJewelSmallPassivesGrantArmour3_|AfflictionJewelSmallPassivesGrantEvasion3/.test(serviceSource), 'Fixture-specific winner logic leaked into the optimizer service');
    assert.equal(await page.locator('.optimizer-handoff-error').count(), 0, 'Generated matrix left a handoff error visible');
    let targetOrderMetamorphic: Record<string, unknown> | undefined;
    if (cheapestResult) {
      const reversedFixture: Fixture = {
        ...armourEvasion,
        id: `${armourEvasion.id}_target_order_reversed`,
        targetMods: [...armourEvasion.targetMods].reverse(),
      };
      await importFixture(page, reversedFixture);
      await setBudget(page, reversedFixture.searchBudget);
      await setObjective(page, 'CHEAPEST_CHAOS');
      const reversedResult = await runOptimization(page, reversedFixture.searchBudget.maxWallTimeMs);
      assertFullRouteReconciliation(reversedResult);
      const baselineMetrics = routeMetrics(cheapestResult);
      const reversedMetrics = routeMetrics(reversedResult);
      assertNear(reversedMetrics.cost, baselineMetrics.cost, 'Target-order cost metamorphic');
      assertNear(reversedMetrics.actions, baselineMetrics.actions, 'Target-order action metamorphic');
      assertNear(reversedMetrics.timeMs, baselineMetrics.timeMs, 'Target-order time metamorphic');
      assert.equal(reversedMetrics.actionId, baselineMetrics.actionId, 'Target order changed the selected route identity');
      const targetIds = (result: JsonRecord) => arrayValue(jsonRecord(result.target, 'metamorphic target').requiredMods, 'metamorphic requirements')
        .map((entry) => String(jsonRecord(entry, 'metamorphic requirement').modId))
        .sort();
      assert.deepEqual(targetIds(reversedResult), targetIds(cheapestResult), 'Target-order permutation changed exact target identity');
      const enabledHarvestActions = (result: JsonRecord) => arrayValue(
        jsonRecord(jsonRecord(result.search, 'metamorphic search').harvestActionScope, 'Harvest scope').enabledCrafts,
        'enabled Harvest crafts',
      ).map((entry) => String(jsonRecord(entry, 'enabled Harvest craft').actionId)).sort();
      assert.deepEqual(
        enabledHarvestActions(reversedResult),
        enabledHarvestActions(cheapestResult),
        'Target-order permutation changed the eligible Harvest action set',
      );
      targetOrderMetamorphic = {
        inputOrder: armourEvasion.targetMods,
        permutedOrder: reversedFixture.targetMods,
        canonicalTargetIds: targetIds(reversedResult),
        metrics: reversedMetrics,
        enabledHarvestActions: enabledHarvestActions(reversedResult),
      };
    }
    return {
      seed: 'phase2w-cluster-matrix-v1',
      appCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: repositoryRoot,
        encoding: 'utf8',
      }).trim(),
      fixtureInputs: {
        generatedHandoffs: generatedHandoffSeeds,
        targetOrderMetamorphic: {
          baseType: armourEvasion.baseType,
          clusterType: armourEvasion.clusterType,
          itemLevel: armourEvasion.itemLevel,
          passiveCount: armourEvasion.passiveCount,
          targetMods: armourEvasion.targetMods,
          permutedTargetMods: [...armourEvasion.targetMods].reverse(),
        },
      },
      prices: armourEvasion.priceContext,
      objective: { kind: 'CHEAPEST_CHAOS' },
      budgets: armourEvasion.searchBudget,
      browserVersion: evidence.browserVersion,
      cases: generatedHandoffSeeds,
      targetOrderMetamorphic: targetOrderMetamorphic ?? 'HANDOFF_FOCUS_ONLY',
    };
  });

  await gate(evidence, scenario, 'W22-browser-release-hygiene-and-stable-evidence', async () => {
    await page.getByRole('button', { name: 'Craft Optimizer', exact: true }).click();
    await page.getByText(/Browser-Verified Release Candidate 2W\.1/).waitFor();
    assert.equal(fixtureCorpus.version, 'Phase2W-Frozen-Browser-Corpus-1');
    for (const artifact of ['phase2wMarketVsCraft', 'phase2wHandoffExport', 'phase2wMobileHandoff']) {
      const path = evidence.artifacts[artifact];
      assert(path && statSync(join(repositoryRoot, path)).size > 0, `Missing Phase 2W artifact ${artifact}`);
    }
    assert(handoffRenderMs !== undefined && handoffRenderMs < 1_000, `Handoff render took ${handoffRenderMs}ms`);
    return {
      appVersion: '2W.1',
      fixtureCorpus: fixtureCorpus.version,
      artifacts: ['phase2wMarketVsCraft', 'phase2wHandoffExport', 'phase2wMobileHandoff'],
      unitTestsAddedOrRun: false,
    };
  });
}

async function runHarvestFixtures(page: Page, evidence: BrowserEvidence): Promise<void> {
  const scenario = 'harvest-method-and-economics';
  await ensureOptimizerPage(page, String(evidence.productionUrl));
  const fixtureIds = evidence.requestedScenario === 'harvest-witness'
    ? ['harvest_one_mod_math_witness']
    : ['armour_evasion', 'armour_energy_shield', 'harvest_one_mod_math_witness'];
  for (const fixtureId of fixtureIds) {
    await gate(evidence, scenario, fixtureId, async () => {
      const input = fixture(fixtureId);
      await importFixture(page, input);
      await setBudget(page, input.searchBudget);
      await runOptimization(page, input.searchBudget.maxWallTimeMs);
      const result = await compareMethods(page, input.searchBudget.maxWallTimeMs);
      const harvest = assertHarvestEvidence(result);
      const accounting = assertFullRouteReconciliation(result);
      const harvestCard = page.locator('[data-harvest-lifecycle]');
      assert.equal(await harvestCard.getAttribute('data-harvest-lifecycle'), jsonRecord(result.harvestComparison, 'harvestComparison').status);
      return { fixture: fixtureId, harvest, accounting };
    });
  }
}

async function runResponsiveAndKeyboard(page: Page, evidence: BrowserEvidence): Promise<void> {
  const scenario = 'responsive-accessibility-keyboard';
  await ensureOptimizerPage(page, String(evidence.productionUrl));
  const responsiveFixture = fixture('cheap_one_mod');
  await importFixture(page, responsiveFixture);
  await setBudget(page, responsiveFixture.searchBudget);
  await runOptimization(page, responsiveFixture.searchBudget.maxWallTimeMs);
  await gate(evidence, scenario, 'real-dom-viewport-matrix', async () => {
    const observations: unknown[] = [];
    for (const width of [320, 390, 768, 1280, 1920]) {
      await page.setViewportSize({ width, height: width < 700 ? 844 : 960 });
      const geometry = await page.evaluate(() => ({
        requestedViewport: window.innerWidth,
        clientWidth: document.documentElement.clientWidth,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
      }));
      assert.equal(geometry.requestedViewport, width);
      assert(geometry.documentWidth <= geometry.clientWidth + 1, `${width}px document overflow: ${JSON.stringify(geometry)}`);
      assert(geometry.bodyWidth <= geometry.clientWidth + 1, `${width}px body overflow: ${JSON.stringify(geometry)}`);
      observations.push(geometry);
    }
    return observations;
  });

  await gate(evidence, scenario, 'semantic-controls-and-keyboard-primary-path', async () => {
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto(`${evidence.productionUrl}#optimizer`, { waitUntil: 'networkidle' });
    const unnamedButtons = await page.locator('button:visible').evaluateAll((buttons) => buttons
      .filter((button) => {
        const label = button.getAttribute('aria-label') ?? button.textContent ?? '';
        return label.trim().length === 0;
      }).length);
    assert.equal(unnamedButtons, 0, 'Visible buttons without accessible names were found');
    const preset = page.getByRole('button', { name: 'Small Energy Shield (2p / Magic)' });
    await preset.focus();
    assert.equal(await preset.evaluate((element) => element === document.activeElement), true);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelectorAll('.target-summary li[data-mod-id]').length === 1);
    await setBudget(page, fixture('cheap_one_mod').searchBudget);
    const optimize = page.getByRole('button', { name: 'Find cheapest craft' });
    await optimize.focus();
    const offset = await workerEventCount(page);
    await page.keyboard.press('Enter');
    const response = await waitForNewWorkerResponse(page, offset, fixture('cheap_one_mod').searchBudget.maxWallTimeMs + 8_000);
    assert.equal(response.type, 'RESULT');
    await page.locator('.recommendation-hero').waitFor();
    return { unnamedButtons, keyboardPreset: true, keyboardOptimization: true };
  });
}

async function runConstellation(page: Page, evidence: BrowserEvidence, soakMs: number): Promise<void> {
  const scenario = 'constellation-real-render';
  await ensureOptimizerPage(page, String(evidence.productionUrl));
  await gate(evidence, scenario, 'controls-focus-fullscreen-and-real-frame', async () => {
    await page.setViewportSize({ width: 1280, height: 960 });
    const container = page.getByTestId('markov-constellation-container');
    if (!(await container.isVisible())) {
      const input = fixture('cheap_one_mod');
      await importFixture(page, input);
      await setBudget(page, input.searchBudget);
      await runOptimization(page, input.searchBudget.maxWallTimeMs);
    }
    await container.scrollIntoViewIfNeeded();
    const canvas = page.getByRole('img', { name: 'Markov Constellation state transition diagram' });
    const box = await canvas.boundingBox();
    assert(box && box.width >= 280 && box.height >= 240, `Canvas geometry is unusable: ${JSON.stringify(box)}`);
    await page.getByRole('button', { name: 'Pause Animation' }).click();
    await page.getByRole('button', { name: 'Route Focus' }).click();
    await page.getByRole('button', { name: 'Zoom constellation in' }).click();
    await page.getByRole('button', { name: 'Zoom constellation out' }).click();
    await page.getByRole('button', { name: 'Toggle Reduced Motion' }).click();
    const nodeButtons = container.locator('.constellation-node-access-list button');
    assert(await nodeButtons.count() > 0, 'No focus-discoverable constellation nodes exist');
    await nodeButtons.first().focus();
    assert.equal(await nodeButtons.first().evaluate((element) => element === document.activeElement), true);
    const screenshotPath = join(evidenceDirectory, 'constellation-real-frame.png');
    await container.screenshot({ path: screenshotPath });
    evidence.artifacts.constellationFrame = relative(repositoryRoot, screenshotPath);

    const fullscreenApiEnabled = await page.evaluate(() => document.fullscreenEnabled);
    await page.getByRole('button', { name: 'Toggle Fullscreen' }).click();
    await page.waitForTimeout(300);
    const enteredFullscreen = await page.evaluate(() => document.fullscreenElement !== null);
    let keyboardExitedFullscreen = false;
    if (enteredFullscreen) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
      keyboardExitedFullscreen = await page.evaluate(() => document.fullscreenElement === null);
      if (!keyboardExitedFullscreen) {
        await page.evaluate(() => document.exitFullscreen());
      }
      assert.equal(await page.evaluate(() => document.fullscreenElement === null), true);
    } else {
      assert.equal(await container.evaluate((element) => element.classList.contains('fullscreen')), false);
      assert(await page.getByRole('button', { name: 'Toggle Fullscreen' }).isVisible());
    }
    return {
      canvas: box,
      focusableNodes: await nodeButtons.count(),
      screenshot: evidence.artifacts.constellationFrame,
      fullscreenApiEnabled,
      enteredFullscreen,
      keyboardExitedFullscreen,
      rejectedRequestStayedInNormalLayout: !enteredFullscreen,
    };
  });

  await gate(evidence, scenario, 'deterministic-reduced-motion-frames', async () => {
    const canvas = page.getByRole('img', { name: 'Markov Constellation state transition diagram' });
    const first = await canvas.screenshot();
    await page.waitForTimeout(350);
    const second = await canvas.screenshot();
    assert(first.equals(second), 'Reduced-motion rendered frames changed while paused');
    const firstPath = join(artifactsDirectory, 'constellation-reduced-frame-a.png');
    const secondPath = join(artifactsDirectory, 'constellation-reduced-frame-b.png');
    writeFileSync(firstPath, first);
    writeFileSync(secondPath, second);
    return { byteLength: first.length, framesEqual: true };
  });

  await gate(evidence, scenario, 'fps-long-task-and-memory-soak', async () => {
    const observed = await page.evaluate(`(async () => {
      const durationMs = ${Math.max(1, Math.floor(soakMs))};
      const longTasks = [];
      const observer = typeof PerformanceObserver !== 'undefined'
        ? new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) longTasks.push(entry.duration);
          })
        : undefined;
      try { observer?.observe({ type: 'longtask', buffered: true }); } catch {}
      const start = performance.now();
      let frames = 0;
      await new Promise((resolveFrames) => {
        const frame = (time) => {
          frames += 1;
          if (time - start >= durationMs) resolveFrames();
          else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
      observer?.disconnect();
      const elapsed = performance.now() - start;
      const memory = 'memory' in performance ? performance.memory.usedJSHeapSize : undefined;
      return {
        frames,
        elapsedMs: elapsed,
        fps: frames / (elapsed / 1000),
        longTaskTotalMs: longTasks.reduce((sum, value) => sum + value, 0),
        maxLongTaskMs: Math.max(0, ...longTasks),
        usedJSHeapSize: memory,
      };
    })()`) as {
      frames: number;
      elapsedMs: number;
      fps: number;
      longTaskTotalMs: number;
      maxLongTaskMs: number;
      usedJSHeapSize?: number;
    };
    assert(observed.fps >= 30, `Observed FPS ${observed.fps.toFixed(2)} is below 30`);
    evidence.performance.constellation = observed;
    return observed;
  });
}

async function runAdditionalFixtures(page: Page, evidence: BrowserEvidence): Promise<void> {
  const scenario = 'additional-regression-fixtures';
  await ensureOptimizerPage(page, String(evidence.productionUrl));
  for (const fixtureId of ['herald_envoy_endbringer', 'three_notable']) {
    await gate(evidence, scenario, fixtureId, async () => {
      const input = fixture(fixtureId);
      await importFixture(page, input);
      await setBudget(page, input.searchBudget);
      const result = await runOptimization(page, input.searchBudget.maxWallTimeMs);
      const target = jsonRecord(result.target, 'target');
      const ids = arrayValue(target.requiredMods, 'requiredMods').map((row) => String(jsonRecord(row, 'required mod').modId));
      assert.deepEqual(ids, input.targetMods, 'Target IDs mutated during search');
      const accounting = result.recommended === null ? undefined : assertFullRouteReconciliation(result);
      return { fixture: fixtureId, status: result.recommendationStatus, targetIds: ids, accounting };
    });
  }
}

function scenarioEnabled(requested: string, name: string): boolean {
  if (requested === 'all' || requested === 'release' || requested === 'nightly') return true;
  const aliases: Record<string, string[]> = {
    smoke: ['smoke'],
    four: ['four', 'objectives', 'consistency', 'phase2u', 'phase2u-quick'],
    phase2u: ['phase2u', 'phase2u-quick'],
    phase2v: ['phase2v', 'phase2w-integration'],
    phase2w: ['phase2w', 'phase2w-handoff', 'phase2w-integration'],
    methods: ['methods', 'harvest', 'portfolio', 'harvest-witness'],
    responsive: ['responsive', 'accessibility'],
    animation: ['animation', 'constellation'],
    additional: ['additional', 'fixtures'],
  };
  return aliases[name]?.includes(requested) ?? false;
}

function writeReports(evidence: BrowserEvidence): void {
  evidence.finishedAt = new Date().toISOString();
  evidence.status = evidence.checks.every((check) => check.passed) ? 'PASSED' : 'FAILED';
  writeFileSync(join(reportsDirectory, 'release-gate.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  const lines = [
    '# Phase 2W Real-Browser Release Gate',
    '',
    `- Run: ${evidence.runId}`,
    `- Started: ${evidence.startedAt}`,
    `- Finished: ${evidence.finishedAt}`,
    `- Browser: ${evidence.browser} ${evidence.browserVersion ?? 'startup failed'}`,
    `- Fixture corpus: ${evidence.fixtureCorpusVersion}`,
    `- Status: ${evidence.status}`,
    '',
    '## Observed gates',
    '',
    '| Scenario | Gate | Result | Duration | Observed evidence |',
    '|---|---|---:|---:|---|',
  ];
  for (const check of evidence.checks) {
    const observed = (check.error ?? check.details).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
    lines.push(`| ${check.scenario} | ${check.id} | ${check.passed ? 'PASS' : 'FAIL'} | ${check.durationMs} ms | ${observed} |`);
  }
  lines.push('', '## Captured runtime issues', '');
  lines.push(`- Console errors: ${evidence.consoleErrors.length}`);
  lines.push(`- Page errors: ${evidence.pageErrors.length}`);
  lines.push(`- Network errors: ${evidence.networkErrors.length}`);
  lines.push('', '## Artifacts', '');
  for (const [name, path] of Object.entries(evidence.artifacts)) lines.push(`- ${name}: \`${path}\``);
  writeFileSync(join(reportsDirectory, 'summary.md'), `${lines.join('\n')}\n`, 'utf8');
}

async function closeBrowser(
  browser: Browser | undefined,
  context: BrowserContext | undefined,
  evidence: BrowserEvidence,
): Promise<void> {
  if (context) {
    try {
      const tracePath = join(artifactsDirectory, 'phase2w-trace.zip');
      await context.tracing.stop({ path: tracePath });
      evidence.artifacts.trace = relative(repositoryRoot, tracePath);
    } catch (error) {
      evidence.pageErrors.push(`Trace finalization failed: ${String(error)}`);
    }
    await context.close();
  }
  if (browser) await browser.close();
}

async function main(): Promise<void> {
  const requested = selectedScenario();
  const evidence: BrowserEvidence = {
    runId,
    startedAt: new Date().toISOString(),
    browser: 'Playwright Chromium',
    requestedScenario: requested,
    fixtureCorpusVersion: fixtureCorpus.version,
    checks: [],
    consoleErrors: [],
    pageErrors: [],
    networkErrors: [],
    performance: {},
    artifacts: {},
    workerEventCounts: {},
  };
  let app: Awaited<ReturnType<typeof launchProductionApp>> | undefined;
  let browser: Browser | undefined;
  let context: BrowserContext | undefined;

  try {
    app = await launchProductionApp();
    evidence.productionUrl = app.url;
    browser = await chromium.launch({ headless: true });
    evidence.browserVersion = browser.version();
    context = await browser.newContext({
      viewport: { width: 1280, height: 960 },
      hasTouch: true,
      acceptDownloads: true,
      recordVideo: { dir: join(artifactsDirectory, 'video'), size: { width: 1280, height: 960 } },
      reducedMotion: 'no-preference',
    });
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: app.url.slice(0, -1) });
    await context.addInitScript({ content: WORKER_CAPTURE_INIT_SCRIPT });
    await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    page.on('console', (message) => {
      if (message.type() === 'error') evidence.consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => evidence.pageErrors.push(error.message));
    page.on('requestfailed', (request) => evidence.networkErrors.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'failed'}`));

    if (scenarioEnabled(requested, 'smoke')) await runSmoke(page, evidence);
    if (scenarioEnabled(requested, 'four')) await runFourMod(page, evidence);
    if (scenarioEnabled(requested, 'phase2u')) {
      await runPhase2U(page, evidence, requested === 'phase2u-quick' ? 5_000 : 300_000);
    }
    if (scenarioEnabled(requested, 'methods')) await runHarvestFixtures(page, evidence);
    if (scenarioEnabled(requested, 'phase2v')) await runPhase2V(page, evidence);
    if (scenarioEnabled(requested, 'phase2w')) await runPhase2W(page, evidence);
    if (scenarioEnabled(requested, 'responsive')) await runResponsiveAndKeyboard(page, evidence);
    if (scenarioEnabled(requested, 'animation')) await runConstellation(page, evidence, requested === 'nightly' ? 60_000 : 5_000);
    if (scenarioEnabled(requested, 'additional')) await runAdditionalFixtures(page, evidence);

    await compactCapturedWorkerResults(page);
    const events = await workerEvents(page);
    for (const event of events) evidence.workerEventCounts[event.kind] = (evidence.workerEventCounts[event.kind] ?? 0) + 1;
    const fullWorkerTrace = join(artifactsDirectory, 'worker-events-full.json');
    writeFileSync(fullWorkerTrace, `${JSON.stringify(events, null, 2)}\n`, 'utf8');
    evidence.artifacts.fullWorkerEvents = relative(repositoryRoot, fullWorkerTrace);
    const workerTrace = join(evidenceDirectory, 'worker-events.json');
    writeFileSync(workerTrace, `${JSON.stringify(compactWorkerEvents(events), null, 2)}\n`, 'utf8');
    evidence.artifacts.workerEvents = relative(repositoryRoot, workerTrace);
    evidence.artifacts.videoDirectory = relative(repositoryRoot, join(artifactsDirectory, 'video'));

    await gate(evidence, 'release-process', 'runtime-error-audit', async () => {
      assert.deepEqual(evidence.consoleErrors, [], `Console errors: ${evidence.consoleErrors.join(' | ')}`);
      assert.deepEqual(evidence.pageErrors, [], `Page errors: ${evidence.pageErrors.join(' | ')}`);
      assert.deepEqual(evidence.networkErrors, [], `Network errors: ${evidence.networkErrors.join(' | ')}`);
      return { consoleErrors: 0, pageErrors: 0, networkErrors: 0 };
    });
  } catch (error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    evidence.checks.push({
      id: 'strict-startup-or-runner',
      scenario: 'release-process',
      passed: false,
      durationMs: 0,
      details: 'The real app/browser harness failed closed; no substitute evidence was produced.',
      error: message,
    });
    console.error(message);
  } finally {
    await closeBrowser(browser, context, evidence);
    await app?.stop();
    writeReports(evidence);
  }

  for (const check of evidence.checks) {
    console.log(`${check.passed ? 'PASS' : 'FAIL'} ${check.scenario}/${check.id} (${check.durationMs} ms)`);
  }
  console.log(`Phase 2W Quality Lab: ${evidence.status} (${evidence.checks.filter((check) => check.passed).length}/${evidence.checks.length} gates)`);
  if (evidence.status !== 'PASSED') process.exitCode = 1;
}

void main();
