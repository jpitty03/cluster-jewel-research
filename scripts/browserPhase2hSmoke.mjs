import { writeFileSync } from 'node:fs';

const debugPort = process.env.BROWSER_DEBUG_PORT ?? '9222';
const appUrl = process.env.PHASE2_APP_URL ?? 'http://127.0.0.1:4173/';
const outputPath = new URL('../output-browser-phase2h-smoke.txt', import.meta.url);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const CLUSTER_TYPE = '10% increased Damage while affected by a Herald';
const EMPOWERED = 'Empowered Envoy';
const ENDBRINGER = 'Endbringer';

async function waitForJsonEndpoint() {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const pages = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json());
      const page = pages.find((candidate) => candidate.type === 'page' && !candidate.url.startsWith('chrome://'));
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(100);
  }
  throw new Error('Chrome DevTools endpoint did not become ready');
}

const socket = new WebSocket(await waitForJsonEndpoint());
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
let nextId = 1;
const pending = new Map();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  if (message.error) request.reject(new Error(message.error.message));
  else request.resolve(message.result);
});
function command(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const response = await command('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
  return response.result.value;
}
async function waitFor(expression, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    await sleep(50);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}
const setLabeledValue = (label, value) => evaluate(`(() => {
  const label = [...document.querySelectorAll('label')].find((entry) => entry.querySelector('span')?.textContent?.trim() === ${JSON.stringify(label)});
  const input = label?.querySelector('input, select');
  if (!input) return false;
  const prototype = input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, ${JSON.stringify(String(value))});
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
})()`);
const clickButton = (text) => evaluate(`(() => {
  const button = [...document.querySelectorAll('button')].find((entry) => entry.textContent?.trim() === ${JSON.stringify(text)} && !entry.disabled);
  if (!button) return false;
  button.click();
  return true;
})()`);
const setTarget = (index, modId) => evaluate(`(() => {
  const select = document.querySelectorAll('.target-row select')[${index}];
  if (!select) return false;
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, ${JSON.stringify(modId)});
  select.dispatchEvent(new Event('change', { bubbles: true }));
  return select.value;
})()`);
async function runSearch(timeoutMs) {
  const before = await evaluate('window.__phase2hResults.length');
  const started = Date.now();
  if (!(await clickButton('Find cheapest craft'))) throw new Error('Find cheapest craft button unavailable');
  await waitFor(`window.__phase2hResults.length > ${before} || document.querySelector('.error') !== null`, timeoutMs);
  const error = await evaluate(`document.querySelector('.error')?.innerText ?? ''`);
  if (error) throw new Error(error);
  return evaluate(`(() => {
    const result = window.__phase2hResults.at(-1);
    const advanced = document.querySelector('.advanced-optimizer-details');
    const snapshot = {
      elapsedMs: ${Date.now()} - ${started},
      result,
      hero: document.querySelector('.recommendation-hero')?.innerText ?? '',
      guide: document.querySelector('.craft-guide')?.innerText ?? '',
      rules: [...document.querySelectorAll('.craft-rule')].map((rule) => ({
        condition: rule.dataset.condition,
        actionId: rule.dataset.actionId,
        action: rule.dataset.action,
      })),
      materialSectionPresent: document.querySelector('.expected-materials') !== null,
      materialText: document.querySelector('.expected-materials')?.innerText ?? '',
      materialRows: [...document.querySelectorAll('.expected-materials tbody tr')].map((row) => ({
        actionId: row.dataset.actionId,
        expectedCount: Number(row.dataset.expectedCount),
        expectedCostChaos: Number(row.dataset.expectedCost),
        text: row.innerText,
      })),
      advancedInitiallyClosed: advanced instanceof HTMLDetailsElement && !advanced.open,
    };
    if (advanced instanceof HTMLDetailsElement) advanced.open = true;
    snapshot.advancedText = advanced?.textContent ?? '';
    if (advanced instanceof HTMLDetailsElement) advanced.open = false;
    return snapshot;
  })()`);
}

await command('Page.enable');
await command('Runtime.enable');
await command('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
  window.__phase2hRequests = [];
  window.__phase2hResults = [];
  const post = Worker.prototype.postMessage;
  Worker.prototype.postMessage = function(message) {
    if (message?.type === 'OPTIMIZE') window.__phase2hRequests.push(JSON.parse(JSON.stringify(message.input)));
    return Reflect.apply(post, this, arguments);
  };
  const add = Worker.prototype.addEventListener;
  Worker.prototype.addEventListener = function(type, listener, options) {
    if (type !== 'message') return add.call(this, type, listener, options);
    const wrapped = function(event) {
      let deliveredEvent = event;
      if (
        window.__phase2hInjectNoRouteRawUsage === true &&
        event.data?.type === 'RESULT' &&
        event.data.result?.recommended === null
      ) {
        const payload = JSON.parse(JSON.stringify(event.data));
        payload.result.expectedActionUsage = [{
          actionId: 'browser_fixture_exploratory_usage',
          actionName: 'Acquire No start certified under this budget',
          expectedCount: 1.25,
          expectedCostChaos: 0.5,
        }];
        deliveredEvent = new MessageEvent('message', { data: payload });
        window.__phase2hInjectNoRouteRawUsage = false;
      }
      if (deliveredEvent.data?.type === 'RESULT') window.__phase2hResults.push(JSON.parse(JSON.stringify(deliveredEvent.data.result)));
      if (typeof listener === 'function') return listener.call(this, deliveredEvent);
      return listener.handleEvent(deliveredEvent);
    };
    return add.call(this, type, wrapped, options);
  };
})()` });
await command('Page.navigate', { url: appUrl });
await waitFor(`document.readyState === 'complete' && [...document.querySelectorAll('button')].some((button) => button.textContent?.trim() === 'Craft Optimizer')`, 10_000);
await clickButton('Craft Optimizer');
await waitFor(`document.querySelector('.optimizer-form') !== null`, 5_000);
await setLabeledValue('Base type', 'Medium Cluster Jewel');
await waitFor(`[...document.querySelectorAll('label')].find((entry) => entry.querySelector('span')?.textContent?.trim() === 'Cluster enchantment')?.querySelector('select')?.value !== ''`, 2_000);
await setLabeledValue('Cluster enchantment', CLUSTER_TYPE);
await setLabeledValue('Item level', 84);
await setLabeledValue('Passive skills', 6);
await setLabeledValue('Clean base manual override (chaos)', 10);
await setLabeledValue('Final rarity', 'any');
await setLabeledValue('Extra affixes', 'allow-extra');
await setLabeledValue('Search intent', 'RECOMMEND');
await setLabeledValue('Max states', 5000);
await setLabeledValue('Max wall time (ms)', 30000);
await setLabeledValue('Expansion rounds', 3);
await setLabeledValue('Search modifiers', EMPOWERED);
await waitFor(`[...document.querySelectorAll('.target-row select')[0].options].some((option) => option.value === ${JSON.stringify(EMPOWERED)})`, 2_000);
await setTarget(0, EMPOWERED);
await clickButton('Add modifier');
await waitFor(`document.querySelectorAll('.target-row select').length === 2`, 2_000);
await setLabeledValue('Search modifiers', ENDBRINGER);
await waitFor(`[...document.querySelectorAll('.target-row select')[1].options].some((option) => option.value === ${JSON.stringify(ENDBRINGER)})`, 2_000);
await setTarget(1, ENDBRINGER);

const herald = await runSearch(31_500);
const actionSets = new Map();
for (const rule of herald.rules) {
  const actions = actionSets.get(rule.condition) ?? new Set();
  actions.add(rule.actionId);
  actionSets.set(rule.condition, actions);
}
const collisions = [...actionSets].filter(([, actions]) => actions.size > 1);
const targetBranches = herald.rules.filter((rule) =>
  rule.condition.includes('1P/1S') &&
  (rule.condition.includes(EMPOWERED) || rule.condition.includes(ENDBRINGER))
).slice(0, 8);
const fractureCandidates = herald.result.acquisition.candidates.filter((candidate) => candidate.synthesis);
const boundsHealthy = fractureCandidates.length === 2 && fractureCandidates.every((candidate) => {
  const evidence = candidate.synthesis.lowerBoundEvidence;
  return candidate.synthesis.status === 'SKIPPED_DOMINATED' &&
    evidence.combinationRule === 'MAX_OF_ADMISSIBLE_BOUNDS' &&
    evidence.combinedLowerBoundChaos === Math.max(
      evidence.partialGraphLowerBoundChaos,
      evidence.mandatoryMechanicsLowerBoundChaos,
    ) && evidence.combinedLowerBoundChaos >= herald.result.expectedCostChaos;
});
const materialCorrespondence = herald.materialRows.length === herald.result.expectedActionUsage.length &&
  herald.result.expectedActionUsage.every((usage) => herald.materialRows.some((row) =>
    row.actionId === usage.actionId && row.expectedCount === usage.expectedCount &&
    row.expectedCostChaos === usage.expectedCostChaos
  ));

await setLabeledValue('Max states', 1);
await setLabeledValue('Max wall time (ms)', 250);
await setLabeledValue('Expansion rounds', 1);
// Presentation-only response fixture: a no-route result with non-empty exploratory usage proves
// the player-facing materials section remains absent while Advanced labels the raw data unsafe.
await evaluate('window.__phase2hInjectNoRouteRawUsage = true');
const noRoute = await runSearch(3_000);
const noRouteRawSafe = noRoute.result.expectedActionUsage.length > 0 &&
  noRoute.advancedText.includes('Uncertified exploratory policy usage') &&
  noRoute.advancedText.includes('Not a valid craft estimate') &&
  noRoute.advancedText.includes('Acquire No start certified under this budget');

const requests = await evaluate('window.__phase2hRequests');
const checks = {
  H1_default_certified: herald.result.recommended !== null &&
    herald.result.recommendationStatus === 'BEST_RESOLVED_ACQUISITION_SAFE' &&
    herald.result.acquisition.selectedCandidateId === 'candidate_0' &&
    herald.result.acquisition.selectionSafe && herald.result.risk.selectedPolicyProper &&
    Math.abs(herald.result.risk.terminalAbsorptionProbability - 1) < 1e-8 &&
    herald.result.solver.costReconciled,
  H2_exact_target_identity: JSON.stringify(herald.result.target.requiredMods.map((requirement) => requirement.modId)) ===
    JSON.stringify([EMPOWERED, ENDBRINGER]) && requests[0]?.baseType === 'Medium Cluster Jewel' &&
    requests[0]?.clusterType === CLUSTER_TYPE && requests[0]?.itemLevel === 84 && requests[0]?.passiveCount === 6,
  H3_policy_collision: collisions.length === 0 && targetBranches.some((rule) => rule.condition.includes('target present')) &&
    targetBranches.some((rule) => rule.condition.includes('target missing')),
  H4_no_route_material_safety: noRoute.result.recommendationStatus === 'NO_RESOLVED_ROUTE' &&
    !noRoute.materialSectionPresent && noRoute.materialRows.length === 0 &&
    !noRoute.materialText.includes('Acquire No start certified under this budget') && noRouteRawSafe,
  H5_admissible_bounds: boundsHealthy,
  H6_material_correspondence: herald.materialSectionPresent && materialCorrespondence,
  H7_progressive_disclosure: herald.advancedInitiallyClosed && herald.advancedText.includes('Combined L') &&
    herald.advancedText.includes('Persistent expansion work by round'),
  H8_no_market_or_bench: herald.result.acquisition.candidates.every((candidate) =>
    candidate.methods.every((method) => !method.id.startsWith('market'))
  ) && !herald.result.expectedActionUsage.some((usage) => /bench/i.test(usage.actionName)),
};

const lines = ['PHASE 2H — HERALD PRODUCTION BROWSER / WORKER SMOKE'];
lines.push(`URL: ${appUrl}`);
lines.push(`H1 default certified: ${checks.H1_default_certified ? 'PASS' : 'FAIL'}; status=${herald.result.recommendationStatus}; U=${herald.result.expectedCostChaos}; elapsed=${herald.elapsedMs}ms; proper=${herald.result.risk.selectedPolicyProper}; absorption=${herald.result.risk.terminalAbsorptionProbability}; reconciled=${herald.result.solver.costReconciled}`);
lines.push(`H2 exact fixture identity: ${checks.H2_exact_target_identity ? 'PASS' : 'FAIL'}; ${JSON.stringify(requests[0])}`);
lines.push(`H3 rendered condition collision audit: ${checks.H3_policy_collision ? 'PASS' : 'FAIL'}; collisions=${JSON.stringify(collisions)}; examples=${JSON.stringify(targetBranches)}`);
lines.push(`H4 no-route material safety (presentation-only injected raw usage): ${checks.H4_no_route_material_safety ? 'PASS' : 'FAIL'}; materialSection=${noRoute.materialSectionPresent}; rows=${noRoute.materialRows.length}; rawUsage=${noRoute.result.expectedActionUsage.length}; advancedExplicit=${noRouteRawSafe}; hero=${JSON.stringify(noRoute.hero)}`);
lines.push(`H5 admissible fracture bounds: ${checks.H5_admissible_bounds ? 'PASS' : 'FAIL'}; ${JSON.stringify(fractureCandidates.map((candidate) => ({ label: candidate.label, status: candidate.synthesis.status, evidence: candidate.synthesis.lowerBoundEvidence })))}`);
lines.push(`H6 certified material correspondence: ${checks.H6_material_correspondence ? 'PASS' : 'FAIL'}; displayed=${JSON.stringify(herald.materialRows)}; returned=${JSON.stringify(herald.result.expectedActionUsage)}`);
lines.push(`H7 progressive disclosure: ${checks.H7_progressive_disclosure ? 'PASS' : 'FAIL'}; advancedInitiallyClosed=${herald.advancedInitiallyClosed}`);
lines.push(`H8 market/Bench exclusions: ${checks.H8_no_market_or_bench ? 'PASS' : 'FAIL'}`);
writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
console.log(lines.join('\n'));
socket.close();

const failures = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
if (failures.length > 0) throw new Error(`Phase 2H browser smoke failed: ${failures.join(', ')}`);
