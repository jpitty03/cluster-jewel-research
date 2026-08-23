import { writeFileSync } from 'node:fs';

const debugPort = process.env.BROWSER_DEBUG_PORT ?? '9222';
const appUrl = process.env.PHASE2_APP_URL ?? 'http://127.0.0.1:4173/';
const outputPath = new URL('../output-browser-phase2c-smoke.txt', import.meta.url);
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
  await waitFor(`[...document.querySelectorAll('button')].some((button) => button.textContent?.trim() === 'Cancel')`, 2_000);
  await waitFor(`![...document.querySelectorAll('button')].some((button) => button.textContent?.trim() === 'Cancel')`, timeoutMs);
  return {
    elapsedMs: Date.now() - started,
    proof: await evaluate(`document.querySelector('.optimizer-proof')?.innerText ?? document.querySelector('.error')?.innerText ?? 'NO OUTCOME'`),
    summary: await evaluate(`document.querySelector('.optimizer-summary')?.innerText ?? ''`),
    acquisition: await evaluate(`[...document.querySelectorAll('.optimizer-card')].find((card) => ['Recommended acquisition', 'Resolved incumbent acquisition'].includes(card.querySelector('h2')?.textContent))?.innerText ?? ''`),
    health: await evaluate(`[...document.querySelectorAll('.optimizer-card')].find((card) => card.querySelector('h2')?.textContent === 'Policy health')?.innerText ?? ''`),
    search: await evaluate(`[...document.querySelectorAll('.optimizer-card')].find((card) => card.querySelector('h2')?.textContent === 'Search budget')?.innerText ?? ''`),
    target: await evaluate(`document.querySelector('.target-summary')?.innerText ?? ''`),
  };
}

const compact = (value) => value.replaceAll('\n', ' | ').replaceAll(/\s+/g, ' ').trim();

await command('Page.enable');
await command('Runtime.enable');
await command('Page.navigate', { url: appUrl });
await waitFor(`document.readyState === 'complete' && [...document.querySelectorAll('button')].some((button) => button.textContent?.trim() === 'Craft Optimizer')`, 10_000);
await clickButton('Craft Optimizer');
await waitFor(`document.querySelector('.optimizer-form') !== null`, 5_000);
await setLabeledValue('Cluster enchantment', '10% increased Attack Damage');
await setLabeledValue('Clean base manual override (chaos)', 4);
await setLabeledValue('Final rarity', 'any');
await setLabeledValue('Extra affixes', 'allow-extra');
await setLabeledValue('Search intent', 'RECOMMEND');
await setLabeledValue('Max states', 5000);
await setLabeledValue('Max wall time (ms)', 30000);
await setLabeledValue('Expansion rounds', 3);

// Preserve the one-mod acceptance gate before switching to the exact live two-mod target.
await setTarget(0, 'AfflictionJewelSmallPassivesGrantES3');
const oneMod = await runSearch(31_000);

await clickButton('Add modifier');
await setTarget(0, 'AfflictionJewelSmallPassivesGrantES3');
await setTarget(1, 'AfflictionJewelSmallPassivesGrantInt3');
const rawTwoMod = await runSearch(31_000);

// The same exact target with the new terminal cleanliness contract.
await setLabeledValue('Extra affixes', 'no-unwanted');
const cleanTwoMod = await runSearch(31_000);

const oneModHealthy = oneMod.summary.includes('BEST_RESOLVED_ACQUISITION_SAFE') &&
  oneMod.summary.includes('Clean Base') && oneMod.health.includes('100.000000%') &&
  oneMod.health.includes('0.000000%') && oneMod.health.includes('converged');
const rawAcquisitionSafe = rawTwoMod.summary.includes('BEST_RESOLVED_ACQUISITION_SAFE') &&
  rawTwoMod.summary.includes('Clean Base') &&
  rawTwoMod.summary.includes('Acquisition safe') && rawTwoMod.summary.includes('yes');
const cleanConstraintRendered = cleanTwoMod.summary.includes('No unwanted affixes');
const cleanPolicyHealthy = cleanTwoMod.health.includes('100.000000%') &&
  cleanTwoMod.health.includes('0.000000%') && cleanTwoMod.health.includes('converged');

const lines = ['DEVELOPER UI PHASE 2C — LIVE TWO-MOD BROWSER REGRESSION'];
lines.push(`URL: ${appUrl}`);
lines.push(`one-mod gate: ${oneModHealthy ? 'PASS' : 'FAIL'} in ${oneMod.elapsedMs}ms`);
lines.push(`one-mod summary: ${compact(oneMod.summary)}`);
lines.push(`raw two-mod acquisition-safe clean-base recommendation: ${rawAcquisitionSafe ? 'PASS' : 'FAIL'} in ${rawTwoMod.elapsedMs}ms`);
lines.push(`raw two-mod proof: ${compact(rawTwoMod.proof)}`);
lines.push(`raw two-mod target form: ${compact(rawTwoMod.target)}`);
lines.push(`raw two-mod summary: ${compact(rawTwoMod.summary)}`);
lines.push(`raw two-mod acquisition: ${compact(rawTwoMod.acquisition)}`);
lines.push(`raw two-mod health: ${compact(rawTwoMod.health)}`);
lines.push(`raw two-mod search: ${compact(rawTwoMod.search)}`);
lines.push(`no-unwanted control rendered: ${cleanConstraintRendered ? 'PASS' : 'FAIL'}`);
lines.push(`no-unwanted selected policy healthy: ${cleanPolicyHealthy ? 'PASS' : 'FAIL'} in ${cleanTwoMod.elapsedMs}ms`);
lines.push(`no-unwanted summary: ${compact(cleanTwoMod.summary)}`);
writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
console.log(lines.join('\n'));
socket.close();
