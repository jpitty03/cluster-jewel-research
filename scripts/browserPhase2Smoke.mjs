import { writeFileSync } from 'node:fs';

const debugPort = process.env.BROWSER_DEBUG_PORT ?? '9222';
const appUrl = process.env.PHASE2_APP_URL ?? 'http://127.0.0.1:4173/';
const outputPath = new URL('../output-browser-phase2-smoke.txt', import.meta.url);
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
  const started = Date.now();
  if (!(await clickButton('Optimize craft'))) throw new Error('Optimize craft button was unavailable');
  await sleep(50);
  await waitFor(`![...document.querySelectorAll('button')].some((button) => button.textContent?.trim() === 'Cancel')`, timeoutMs);
  return {
    elapsedMs: Date.now() - started,
    outcome: await evaluate(`document.querySelector('.optimizer-proof')?.textContent?.trim() ?? document.querySelector('.error')?.textContent?.trim() ?? 'NO OUTCOME'`),
  };
}

await command('Page.enable');
await command('Runtime.enable');
await command('Page.navigate', { url: appUrl });
await waitFor(`document.readyState === 'complete' && [...document.querySelectorAll('button')].some((button) => button.textContent?.trim() === 'Craft Optimizer')`, 10_000);

// Force the first worker to ignore messages. This deterministically exercises
// the host-side timer, typed timeout UI, termination, and worker recreation.
await evaluate(`(() => {
  const NativeWorker = window.Worker;
  let created = 0;
  window.__phase2FakeWorkerTerminated = false;
  window.Worker = class Phase2GuardWorker {
    constructor(url, options) {
      created += 1;
      window.__phase2WorkerCreated = created;
      if (created > 1) return new NativeWorker(url, options);
    }
    addEventListener() {}
    postMessage() {}
    terminate() { window.__phase2FakeWorkerTerminated = true; }
  };
})()`);

await clickButton('Craft Optimizer');
await waitFor(`document.querySelector('.optimizer-form') !== null`, 5_000);
await setLabeledValue('Cluster enchantment', '12% increased Attack Damage while holding a Shield');
await setTarget(0, 'AfflictionJewelSmallPassivesGrantES3');
await setLabeledValue('Max states', 5000);
await setLabeledValue('Max wall time (ms)', 100);
await setLabeledValue('Expansion rounds', 3);
const hardGuard = await runSearch(2_000);
const guardState = await evaluate(`({ terminated: window.__phase2FakeWorkerTerminated, workers: window.__phase2WorkerCreated })`);

await setLabeledValue('Max states', 1);
await setLabeledValue('Max wall time (ms)', 250);
await setLabeledValue('Expansion rounds', 1);
const postTimeoutRecovery = await runSearch(3_000);

await clickButton('Add modifier');
await setTarget(0, 'AfflictionJewelSmallPassivesGrantInt3');
await setTarget(1, 'AfflictionJewelSmallPassivesGrantES3');
await setLabeledValue('Final rarity', 'rare');
const targetSummary = await evaluate(`document.querySelector('.target-summary')?.innerText ?? ''`);

await setLabeledValue('Max states', 50000);
await setLabeledValue('Max wall time (ms)', 5000);
await setLabeledValue('Expansion rounds', 10);
await sleep(100);
const fiveSecond = await runSearch(7_000);
const responsiveAfterFive = await evaluate(`document.querySelector('.optimizer-form') !== null && !document.querySelector('button')?.disabled`);

await setLabeledValue('Max states', 5000);
await setLabeledValue('Max wall time (ms)', 30000);
await setLabeledValue('Expansion rounds', 3);
await sleep(100);
const thirtySecond = await runSearch(33_000);

await setLabeledValue('Max states', 50000);
await setLabeledValue('Max wall time (ms)', 30000);
await setLabeledValue('Expansion rounds', 10);
await sleep(100);
const cancelStarted = Date.now();
await clickButton('Optimize craft');
await waitFor(`[...document.querySelectorAll('button')].some((button) => button.textContent?.trim() === 'Cancel')`, 2_000);
await clickButton('Cancel');
await waitFor(`document.querySelector('.error')?.textContent?.includes('cancelled') === true`, 2_000);
const cancelElapsedMs = Date.now() - cancelStarted;

await setLabeledValue('Max states', 1);
await setLabeledValue('Max wall time (ms)', 250);
await setLabeledValue('Expansion rounds', 1);
const postBenchmarkRecovery = await runSearch(3_000);

const lines = ['DEVELOPER UI PHASE 2 — HARD RUNTIME / TARGET-PARITY BROWSER SMOKE'];
lines.push(`URL: ${appUrl}`);
lines.push(`typed hard guard: ${hardGuard.outcome.includes('Search stopped at the configured') ? 'PASS' : 'FAIL'} in ${hardGuard.elapsedMs}ms`);
lines.push(`hard guard termination/recreation: ${guardState.terminated && guardState.workers >= 2 ? 'PASS' : 'FAIL'} (workers=${guardState.workers})`);
lines.push(`worker usable after forced timeout: ${postTimeoutRecovery.outcome !== 'NO OUTCOME' ? 'PASS' : 'FAIL'} in ${postTimeoutRecovery.elapsedMs}ms`);
lines.push(`exact two-mod target summary: ${targetSummary.replaceAll('\n', ' | ')}`);
lines.push(`5-second browser search: ${fiveSecond.elapsedMs}ms; ${fiveSecond.outcome.slice(0, 180)}`);
lines.push(`5-second ceiling: ${fiveSecond.elapsedMs <= 5_750 ? 'PASS' : 'FAIL'}`);
lines.push(`page responsive after 5-second stop: ${responsiveAfterFive ? 'PASS' : 'FAIL'}`);
lines.push(`30-second two-mod browser search: ${thirtySecond.elapsedMs}ms; ${thirtySecond.outcome.slice(0, 180)}`);
lines.push(`30-second ceiling: ${thirtySecond.elapsedMs <= 30_750 ? 'PASS' : 'FAIL'}`);
lines.push(`explicit cancellation: PASS in ${cancelElapsedMs}ms`);
lines.push(`worker usable after two-mod stop: ${postBenchmarkRecovery.outcome !== 'NO OUTCOME' ? 'PASS' : 'FAIL'} in ${postBenchmarkRecovery.elapsedMs}ms`);
writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
console.log(lines.join('\n'));
socket.close();
