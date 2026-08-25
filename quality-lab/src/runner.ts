import assert from 'node:assert/strict';
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
            status: family.status,
            evaluationSource: family.evaluationSource,
            acquisitionStatus: family.acquisitionStatus,
            downstreamStatus: family.downstreamStatus,
            fullRouteStatus: family.fullRouteStatus,
            fullRouteL: family.fullRouteL,
            fullRouteU: family.fullRouteU,
            requiredActionObservedOnPolicy: family.requiredActionObservedOnPolicy,
            onPolicyActionIds: family.onPolicyActionIds,
            policyHealth: family.policyHealth,
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
          expectedCostChaos: result.expectedCostChaos,
          presentation: result.presentation,
          fullRouteUsage: result.fullRouteUsage,
          expectedCurrencies: result.expectedCurrencies,
          harvestComparison: result.harvestComparison,
          methodPortfolio,
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
  const events = await workerEvents(page);
  const terminal = events.slice(eventOffset).find((event) => {
    if (event.kind !== 'MESSAGE_FROM_WORKER' || !event.payload) return false;
    const type = workerPayload(event).type;
    return type === 'RESULT' || type === 'ERROR';
  });
  assert(terminal, 'Terminal Worker response was not captured');
  return workerPayload(terminal);
}

async function runOptimization(page: Page, maxWallTimeMs: number): Promise<JsonRecord> {
  const offset = (await workerEvents(page)).length;
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
    const events = responseEvents(await workerEvents(page));
    const lastResult = [...events].reverse().find((event) => workerPayload(event).type === 'RESULT');
    assert(lastResult, 'No result exists when every method is already independently evaluated');
    return jsonRecord(workerPayload(lastResult).result, 'Worker result');
  }
  const offset = (await workerEvents(page)).length;
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
  return {
    acquisitionCost,
    downstreamCost,
    fullCost,
    difference,
    acquisitionRows: acquisition.length,
    downstreamRows: downstream.length,
    combinedRows: combined.length,
    currencies: combinedCurrencies,
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
  assert.equal(await hero.getAttribute('data-selected-route'), route || null);
  assert.equal(await hero.getAttribute('data-proof-label'), presentation.proofLabel);
  assert.equal(await hero.getAttribute('data-pricing-label'), presentation.pricingLabel);
  assert.equal(await page.getByLabel('Search Activity').getAttribute('data-selected-route'), route || null);
  const playbook = page.locator('.craft-guide [data-selected-route]').first();
  assert.equal(await playbook.getAttribute('data-selected-route'), route || null);
  const constellation = page.getByTestId('markov-constellation-container');
  if (await constellation.count()) {
    assert.equal(await constellation.getAttribute('data-selected-route'), route || null);
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
  return { selectedRoute: route, proofLabel: presentation.proofLabel, pricingLabel: presentation.pricingLabel };
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
    const events = await workerEvents(page);
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
    const eventOffset = (await workerEvents(page)).length;
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
    const offset = (await workerEvents(page)).length;
    await page.getByRole('button', { name: 'Find cheapest craft' }).click();
    await page.waitForFunction((start) => {
      const events = (window as Window & { __QUALITY_LAB_EVENTS__?: CapturedWorkerEvent[] }).__QUALITY_LAB_EVENTS__ ?? [];
      return events.slice(start).some((event) => event.kind === 'POST_MESSAGE_TO_WORKER');
    }, offset);
    await page.getByRole('button', { name: 'Cancel' }).first().click();
    await page.getByText(/Optimization cancelled\. The worker was replaced/).waitFor({ timeout: 5_000 });
    const cancelEvents = (await workerEvents(page)).slice(offset);
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
    const offset = (await workerEvents(page)).length;
    await page.getByRole('button', { name: 'Find cheapest craft' }).click();
    await page.getByText(/configured 1 ms runtime budget/).waitFor({ timeout: 4_000 });
    await stall.catch(() => undefined);
    const guardEvents = (await workerEvents(page)).slice(offset);
    assert(guardEvents.some((event) => event.kind === 'WORKER_TERMINATE'));
    assert(guardEvents.some((event) => event.kind === 'WORKER_SPAWN'));

    const cheap = fixture('cheap_one_mod');
    await importFixture(page, cheap);
    await setBudget(page, cheap.searchBudget);
    const recovered = await runOptimization(page, cheap.searchBudget.maxWallTimeMs);
    return { hostDeadlineMs: 251, terminateObserved: true, recoveredStatus: recovered.recommendationStatus };
  });

  await gate(evidence, scenario, 'real-worker-error-response', async () => {
    const events = await workerEvents(page);
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
    assert.equal(await page.getByRole('combobox', { name: /^Extra affixes/ }).inputValue(), input.extraAffixes);
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
    await page.keyboard.press('Enter');
    const offset = Math.max(0, (await workerEvents(page)).length - 2);
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
    await page.getByRole('button', { name: 'Focus selected route' }).click();
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
    four: ['four', 'objectives', 'consistency'],
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
    '# Phase 2T Real-Browser Release Gate',
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
      const tracePath = join(artifactsDirectory, 'phase2t-trace.zip');
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
    if (scenarioEnabled(requested, 'methods')) await runHarvestFixtures(page, evidence);
    if (scenarioEnabled(requested, 'responsive')) await runResponsiveAndKeyboard(page, evidence);
    if (scenarioEnabled(requested, 'animation')) await runConstellation(page, evidence, requested === 'nightly' ? 60_000 : 5_000);
    if (scenarioEnabled(requested, 'additional')) await runAdditionalFixtures(page, evidence);

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
  console.log(`Phase 2T Quality Lab: ${evidence.status} (${evidence.checks.filter((check) => check.passed).length}/${evidence.checks.length} gates)`);
  if (evidence.status !== 'PASSED') process.exitCode = 1;
}

void main();
