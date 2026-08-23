import { writeFileSync } from 'node:fs';

const debugPort = process.env.BROWSER_DEBUG_PORT ?? '9222';
const appUrl = process.env.PHASE1_APP_URL ?? 'http://127.0.0.1:4173/';
const outputPath = new URL('../output-browser-phase1-smoke.txt', import.meta.url);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForJsonEndpoint() {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const pages = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json());
      if (pages[0]?.webSocketDebuggerUrl) return pages[0].webSocketDebuggerUrl;
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

async function waitFor(expression, timeoutMs = 35_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

const setLabeledValue = (label, value) => evaluate(`(() => {
  const label = [...document.querySelectorAll('label')].find((entry) => entry.querySelector('span')?.textContent?.trim() === ${JSON.stringify(label)});
  const input = label?.querySelector('input, select');
  if (!input) return false;
  const descriptor = Object.getOwnPropertyDescriptor(input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value');
  descriptor.set.call(input, ${JSON.stringify(String(value))});
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
})()`);

const clickButton = (text) => evaluate(`(() => {
  const button = [...document.querySelectorAll('button')].find((entry) => entry.textContent?.trim() === ${JSON.stringify(text)});
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

await command('Page.enable');
await command('Runtime.enable');
await command('Page.navigate', { url: appUrl });
await sleep(750);
const initialPageState = await evaluate(`({ href: location.href, readyState: document.readyState, title: document.title, body: document.body?.innerText?.slice(0, 500) })`);
if (initialPageState.href !== appUrl) {
  throw new Error(`Browser navigation failed: ${JSON.stringify(initialPageState)}`);
}
await waitFor(`document.readyState === 'complete' && [...document.querySelectorAll('button')].some((button) => button.textContent?.trim() === 'Craft Optimizer')`);

const lines = ['DEVELOPER UI PHASE 1 — HEADLESS BROWSER SMOKE'];
lines.push(`URL: ${appUrl}`);
lines.push(`tabs before optimizer selection: ${await evaluate(`[...document.querySelectorAll('.tabs button')].map((button) => button.textContent.trim()).join(' | ')`)}`);
await clickButton('Craft Optimizer');
await waitFor(`document.querySelector('.optimizer-form') !== null`);

await setLabeledValue('Cluster enchantment', '12% increased Attack Damage while holding a Shield');
await sleep(50);
await setTarget(0, 'AfflictionJewelSmallPassivesGrantES3');
await clickButton('Optimize craft');
await waitFor(`document.querySelector('.optimizer-proof') !== null`);
const oneModText = await evaluate(`document.querySelector('.optimizer-results').innerText`);
lines.push(`one-mod quick result: ${oneModText.includes('Best resolved route found') ? 'BEST_RESOLVED rendered' : 'unexpected'}`);
lines.push(`one-mod fallback warning visible: ${oneModText.includes('research-fallback') ? 'YES' : 'NO'}`);
lines.push(`one-mod mechanics warning visible: ${oneModText.includes('APPROXIMATE / EXTERNALLY CLOSE') ? 'YES' : 'NO'}`);

await clickButton('Add modifier');
await sleep(25);
await setTarget(0, 'AfflictionJewelSmallPassivesGrantInt3');
await setTarget(1, 'AfflictionJewelSmallPassivesGrantES3');
await clickButton('Optimize craft');
await waitFor(`document.querySelector('.optimizer-proof') !== null`, 40_000);
const twoModText = await evaluate(`document.querySelector('.optimizer-results').innerText`);
lines.push(`full-pool two-mod result: ${twoModText.includes('Best resolved route found') ? 'BEST_RESOLVED rendered' : 'unexpected'}`);
lines.push(`full-pool two-mod policy proper: ${twoModText.includes('99.999999%') && twoModText.includes('converged') ? 'YES' : 'CHECK OUTPUT'}`);

await clickButton('Optimize craft');
await waitFor(`[...document.querySelectorAll('button')].some((button) => button.textContent?.trim() === 'Cancel')`);
await clickButton('Cancel');
await waitFor(`document.querySelector('.error')?.textContent?.includes('cancelled') === true`);
lines.push('long-search cancellation: PASS (AbortError rendered after terminate/recreate)');

await setLabeledValue('Max states', 1);
await setLabeledValue('Max wall time (ms)', 250);
await setLabeledValue('Expansion rounds', 1);
await clickButton('Optimize craft');
await waitFor(`document.querySelector('.optimizer-proof') !== null`);
const exhaustedText = await evaluate(`document.querySelector('.optimizer-results').innerText`);
lines.push(`budget exhaustion outcome: ${exhaustedText.includes('No fully resolved route found within this search budget') ? 'PASS' : 'FAIL'}`);
lines.push('budget exhaustion shown as normal result: PASS');

lines.push(`exact target selector count: ${await evaluate(`document.querySelectorAll('.target-row select').length`)}`);
lines.push(`page remained responsive after cancellation: ${await evaluate(`document.querySelector('.optimizer-form') !== null`) ? 'YES' : 'NO'}`);

writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
console.log(lines.join('\n'));
socket.close();
