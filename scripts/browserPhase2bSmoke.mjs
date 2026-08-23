import { writeFileSync } from 'node:fs';

const debugPort = process.env.BROWSER_DEBUG_PORT ?? '9222';
const appUrl = process.env.PHASE2_APP_URL ?? 'http://127.0.0.1:4173/';
const outputPath = new URL('../output-browser-phase2b-smoke.txt', import.meta.url);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
  if (!message.id) return;
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
  const workersBefore = await evaluate(`window.__phase2bWorkerCreated ?? 0`);
  const started = Date.now();
  if (!(await clickButton('Optimize craft'))) throw new Error('Optimize craft button was unavailable');
  await sleep(50);
  await waitFor(`![...document.querySelectorAll('button')].some((button) => button.textContent?.trim() === 'Cancel')`, timeoutMs);
  return {
    elapsedMs: Date.now() - started,
    workersBefore,
    workersAfter: await evaluate(`window.__phase2bWorkerCreated ?? 0`),
    outcome: await evaluate(`document.querySelector('.optimizer-proof')?.textContent?.trim() ?? document.querySelector('.error')?.textContent?.trim() ?? 'NO OUTCOME'`),
  };
}

await command('Page.enable');
await command('Runtime.enable');
await command('Page.navigate', { url: appUrl });
await waitFor(`document.readyState === 'complete' && [...document.querySelectorAll('button')].some((button) => button.textContent?.trim() === 'Craft Optimizer')`, 10_000);

// Preserve the independent worker-kill failsafe fixture.
await evaluate(`(() => {
  const NativeWorker = window.Worker;
  let created = 0;
  window.__phase2bFakeWorkerTerminated = false;
  window.Worker = class Phase2BGuardWorker {
    constructor(url, options) {
      created += 1;
      window.__phase2bWorkerCreated = created;
      if (created > 1) return new NativeWorker(url, options);
    }
    addEventListener() {}
    postMessage() {}
    terminate() { window.__phase2bFakeWorkerTerminated = true; }
  };
})()`);

await clickButton('Craft Optimizer');
await waitFor(`document.querySelector('.optimizer-form') !== null`, 5_000);
await setLabeledValue('Cluster enchantment', '12% increased Attack Damage while holding a Shield');
await setLabeledValue('Clean base manual override (chaos)', 10);
await setTarget(0, 'AfflictionJewelSmallPassivesGrantES3');
await setLabeledValue('Max states', 5000);
await setLabeledValue('Max wall time (ms)', 100);
await setLabeledValue('Expansion rounds', 3);
const forcedGuard = await runSearch(2_000);
const forcedGuardState = await evaluate(`({ terminated: window.__phase2bFakeWorkerTerminated, workers: window.__phase2bWorkerCreated })`);

await setLabeledValue('Max states', 1);
await setLabeledValue('Max wall time (ms)', 250);
await setLabeledValue('Expansion rounds', 1);
const postGuardRecovery = await runSearch(3_000);

// Exact default-budget one-mod React -> worker -> service regression.
await setLabeledValue('Search intent', 'RECOMMEND');
await setLabeledValue('Final rarity', 'any');
await setLabeledValue('Max states', 5000);
await setLabeledValue('Max wall time (ms)', 30000);
await setLabeledValue('Expansion rounds', 3);
const oneModDefault = await runSearch(31_000);
const oneModEvidence = await evaluate(`({
  summary: document.querySelector('.optimizer-summary')?.innerText ?? '',
  acquisition: [...document.querySelectorAll('.optimizer-card')].find((card) => card.querySelector('h2')?.textContent === 'Recommended acquisition')?.innerText ?? '',
  health: [...document.querySelectorAll('.optimizer-card')].find((card) => card.querySelector('h2')?.textContent === 'Policy health')?.innerText ?? '',
  search: [...document.querySelectorAll('.optimizer-card')].find((card) => card.querySelector('h2')?.textContent === 'Search budget')?.innerText ?? '',
  target: document.querySelector('.target-summary')?.innerText ?? '',
  pricing: document.querySelector('.market-evidence')?.textContent ?? '',
  coverage: [...document.querySelectorAll('details')].find((entry) => entry.querySelector('summary')?.textContent === 'Currency mapping coverage')?.textContent ?? '',
  policy: [...document.querySelectorAll('.optimizer-card')].find((card) => card.querySelector('h2')?.textContent === 'Branching craft policy')?.innerText ?? '',
})`);

// The same real one-mod path under a short cooperative engine budget.
await setLabeledValue('Max wall time (ms)', 5000);
const oneModFiveSecond = await runSearch(6_000);
const responsiveAfterFive = await evaluate(`document.querySelector('.optimizer-form') !== null`);

// Preserve exact Rare two-mod parity.
await clickButton('Add modifier');
await setTarget(0, 'AfflictionJewelSmallPassivesGrantInt3');
await setTarget(1, 'AfflictionJewelSmallPassivesGrantES3');
await setLabeledValue('Final rarity', 'rare');
await setLabeledValue('Max wall time (ms)', 30000);
const twoMod = await runSearch(31_000);
const twoModSummary = await evaluate(`document.querySelector('.optimizer-summary')?.innerText ?? ''`);

// Retry deeper must switch intent and remain cancellable/recoverable.
const retryStarted = Date.now();
if (!(await clickButton('Retry deeper'))) throw new Error('Retry deeper button was unavailable');
await waitFor(`[...document.querySelectorAll('button')].some((button) => button.textContent?.trim() === 'Cancel')`, 2_000);
const retryIntent = await evaluate(`(() => {
  const label = [...document.querySelectorAll('label')].find((entry) => entry.querySelector('span')?.textContent?.trim() === 'Search intent');
  return label?.querySelector('select')?.value ?? 'MISSING';
})()`);
await clickButton('Cancel');
await waitFor(`document.querySelector('.error')?.textContent?.includes('cancelled') === true`, 2_000);
const retryCancelMs = Date.now() - retryStarted;

await setLabeledValue('Max states', 1);
await setLabeledValue('Max wall time (ms)', 250);
await setLabeledValue('Expansion rounds', 1);
await setLabeledValue('Search intent', 'RECOMMEND');
const postCancelRecovery = await runSearch(3_000);

const compact = (value) => value.replaceAll('\n', ' | ').replaceAll(/\s+/g, ' ').trim();
const normalOneModHostGuard = oneModDefault.workersAfter > oneModDefault.workersBefore || oneModDefault.outcome.includes('Search stopped');
const shortOneModHostGuard = oneModFiveSecond.workersAfter > oneModFiveSecond.workersBefore || oneModFiveSecond.outcome.includes('Search stopped');
const twoModHostGuard = twoMod.workersAfter > twoMod.workersBefore || twoMod.outcome.includes('Search stopped');
const lines = ['DEVELOPER UI PHASE 2B — REAL-PATH SEARCH USABILITY BROWSER SMOKE'];
lines.push(`URL: ${appUrl}`);
lines.push(`forced host failsafe: ${forcedGuard.outcome.includes('Search stopped') ? 'PASS' : 'FAIL'} in ${forcedGuard.elapsedMs}ms`);
lines.push(`forced termination/recreation: ${forcedGuardState.terminated && forcedGuardState.workers >= 2 ? 'PASS' : 'FAIL'} (workers=${forcedGuardState.workers})`);
lines.push(`worker after forced guard: ${postGuardRecovery.outcome !== 'NO OUTCOME' ? 'PASS' : 'FAIL'} in ${postGuardRecovery.elapsedMs}ms`);
lines.push(`default one-mod runtime / host guard: ${oneModDefault.elapsedMs}ms / ${normalOneModHostGuard ? 'TRIGGERED' : 'NO'}`);
lines.push(`default one-mod result: ${compact(oneModDefault.outcome)}`);
lines.push(`default one-mod acquisition: ${compact(oneModEvidence.acquisition)}`);
lines.push(`default one-mod policy health: ${compact(oneModEvidence.health)}`);
lines.push(`default one-mod search timing: ${compact(oneModEvidence.search)}`);
lines.push(`friendly target summary: ${compact(oneModEvidence.target)}`);
lines.push(`branching policy explanation: ${compact(oneModEvidence.policy)}`);
lines.push(`market evidence: ${compact(oneModEvidence.pricing)}`);
lines.push(`currency mapping coverage: ${compact(oneModEvidence.coverage)}`);
lines.push(`5-second one-mod runtime / host guard: ${oneModFiveSecond.elapsedMs}ms / ${shortOneModHostGuard ? 'TRIGGERED' : 'NO'}`);
lines.push(`5-second result returned: ${oneModFiveSecond.outcome.includes('Best resolved') ? 'PASS' : 'FAIL'}`);
lines.push(`page responsive after 5-second result: ${responsiveAfterFive ? 'PASS' : 'FAIL'}`);
lines.push(`30-second Rare two-mod runtime / host guard: ${twoMod.elapsedMs}ms / ${twoModHostGuard ? 'TRIGGERED' : 'NO'}`);
lines.push(`Rare two-mod result: ${compact(twoMod.outcome)}`);
lines.push(`Rare two-mod exact summary: ${compact(twoModSummary)}`);
lines.push(`Retry deeper intent / cancel: ${retryIntent} / PASS in ${retryCancelMs}ms`);
lines.push(`worker after cancel: ${postCancelRecovery.outcome !== 'NO OUTCOME' ? 'PASS' : 'FAIL'} in ${postCancelRecovery.elapsedMs}ms`);
writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
console.log(lines.join('\n'));
socket.close();
