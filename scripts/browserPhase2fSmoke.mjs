import { readFileSync, writeFileSync } from 'node:fs';

const debugPort = process.env.BROWSER_DEBUG_PORT ?? '9222';
const appUrl = process.env.PHASE2_APP_URL ?? 'http://127.0.0.1:4173/';
const outputPath = new URL('../output-browser-phase2f-smoke.txt', import.meta.url);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const ES_ID = 'AfflictionJewelSmallPassivesGrantES3';
const INT_ID = 'AfflictionJewelSmallPassivesGrantInt3';
const EVASION_IDS = [
  'AfflictionJewelSmallPassivesGrantEvasion3',
  'AfflictionJewelSmallPassivesGrantEvasion2__',
  'AfflictionJewelSmallPassivesGrantEvasion',
];
const snapshot = JSON.parse(readFileSync(
  new URL('../src/data/poedb-cluster-mods.json', import.meta.url),
  'utf8'
));
const statTextFor = (modId) => {
  for (const base of Object.values(snapshot.baseMods)) {
    const mod = base.mods.find((candidate) => candidate.modId === modId);
    if (mod) return mod.statText;
  }
  throw new Error(`Committed browser snapshot is missing ${modId}`);
};
const ES_STAT = statTextFor(ES_ID);
const INT_STAT = statTextFor(INT_ID);

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

const optionFor = (modId, index = 0) => evaluate(`(() => {
  const option = [...document.querySelectorAll('.target-row select')[${index}].options].find((entry) => entry.value === ${JSON.stringify(modId)});
  return option ? { value: option.value, text: option.textContent.trim(), primary: option.dataset.primaryLabel, technical: option.dataset.technicalName } : null;
})()`);

const visibleOptions = (index = 0) => evaluate(`[...document.querySelectorAll('.target-row select')[${index}].options].filter((option) => option.value).map((option) => ({ value: option.value, text: option.textContent.trim(), primary: option.dataset.primaryLabel, technical: option.dataset.technicalName }))`);

async function setModifierSearch(value, expectedModId, excludedModId) {
  if (!(await setLabeledValue('Search modifiers', value))) throw new Error('Modifier search input was unavailable');
  if (expectedModId) {
    await waitFor(`(() => {
      const options = [...document.querySelectorAll('.target-row select')[0].options];
      return options.some((option) => option.value === ${JSON.stringify(expectedModId)}) &&
        ${excludedModId ? `!options.some((option) => option.value === ${JSON.stringify(excludedModId)})` : 'true'};
    })()`, 2_000);
  } else {
    await sleep(50);
  }
}

async function runSearch(timeoutMs) {
  const started = Date.now();
  if (!(await clickButton('Optimize craft'))) throw new Error('Optimize craft button was unavailable');
  await waitFor(`[...document.querySelectorAll('button')].some((button) => button.textContent?.trim() === 'Cancel')`, 2_000);
  await waitFor(`![...document.querySelectorAll('button')].some((button) => button.textContent?.trim() === 'Cancel')`, timeoutMs);
  return {
    elapsedMs: Date.now() - started,
    proof: await evaluate(`document.querySelector('.optimizer-proof')?.innerText ?? document.querySelector('.error')?.innerText ?? 'NO OUTCOME'`),
    summary: await evaluate(`document.querySelector('.optimizer-summary')?.innerText ?? ''`),
    health: await evaluate(`[...document.querySelectorAll('.optimizer-card')].find((card) => card.querySelector('h2')?.textContent === 'Policy health')?.innerText ?? ''`),
    target: await evaluate(`document.querySelector('.target-summary')?.innerText ?? ''`),
  };
}

const compact = (value) => value.replaceAll('\n', ' | ').replaceAll(/\s+/g, ' ').trim();

await command('Page.enable');
await command('Runtime.enable');
await command('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
  window.__phase2fOptimizerRequests = [];
  const originalPostMessage = Worker.prototype.postMessage;
  Worker.prototype.postMessage = function(message) {
    if (message?.type === 'OPTIMIZE') {
      window.__phase2fOptimizerRequests.push(JSON.parse(JSON.stringify(message)));
    }
    return Reflect.apply(originalPostMessage, this, arguments);
  };
})()` });
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

await setModifierSearch('', ES_ID);
const esOption = await optionFor(ES_ID);
const intOption = await optionFor(INT_ID);
const ordinaryLabelPass = esOption?.text.includes(ES_STAT) &&
  esOption.text.includes('(T1)') && !esOption.text.includes('Glowing');

await setModifierSearch('Glowing', ES_ID, INT_ID);
const technicalSearchOptions = await visibleOptions();
const technicalAliasPass = technicalSearchOptions.some((option) =>
  option.value === ES_ID && option.technical === 'Glowing' && !option.text.includes('Glowing')
);

await setModifierSearch('Energy Shield', ES_ID, INT_ID);
const statSearchOptions = await visibleOptions();
const statSearchPass = statSearchOptions.some((option) => option.value === ES_ID && option.text.includes(ES_STAT));

await setModifierSearch('Evasion', EVASION_IDS[0], ES_ID);
const evasionOptions = (await visibleOptions()).filter((option) => EVASION_IDS.includes(option.value));
const tierPass = EVASION_IDS.every((modId) => evasionOptions.some((option) => option.value === modId)) &&
  ['(T1)', '(T2)', '(T3)'].every((tier) => evasionOptions.some((option) => option.text.includes(tier))) &&
  new Set(evasionOptions.map((option) => option.text)).size === EVASION_IDS.length;

await setModifierSearch('Vicious Skewering', 'Vicious Skewering', ES_ID);
const notableOption = await optionFor('Vicious Skewering');
const notableSelectable = notableOption?.text.includes('Vicious Skewering') &&
  await setTarget(0, 'Vicious Skewering') === 'Vicious Skewering';

await setModifierSearch('', ES_ID);
await setTarget(0, ES_ID);
await waitFor(`document.querySelector('.target-summary li[data-mod-id=${JSON.stringify(ES_ID)}] strong') !== null`, 2_000);
const targetPrimary = await evaluate(`document.querySelector('.target-summary li[data-mod-id=${JSON.stringify(ES_ID)}] strong')?.textContent?.trim() ?? ''`);
const targetTechnical = await evaluate(`document.querySelector('.target-summary li[data-mod-id=${JSON.stringify(ES_ID)}] code')?.textContent?.trim() ?? ''`);
const targetConsistencyPass = targetPrimary === esOption?.primary && targetPrimary === `${ES_STAT} (T1)`;
const targetDebugIdentityPass = targetTechnical.includes('Glowing') && targetTechnical.includes(ES_ID);

const oneMod = await runSearch(31_000);
await clickButton('Add modifier');
await waitFor(`document.querySelectorAll('.target-row select').length === 2`, 2_000);
await setTarget(0, ES_ID);
await setTarget(1, INT_ID);
const rawTwoMod = await runSearch(31_000);
await setLabeledValue('Extra affixes', 'no-unwanted');
const cleanTwoMod = await runSearch(31_000);

const workerTargetIds = await evaluate(`window.__phase2fOptimizerRequests.map((request) => request.input.target.requiredMods.map((requirement) => requirement.modId))`);
const exactIdentityPass = JSON.stringify(workerTargetIds) === JSON.stringify([
  [ES_ID],
  [ES_ID, INT_ID],
  [ES_ID, INT_ID],
]);
const oneModHealthy = oneMod.summary.includes('BEST_RESOLVED_ACQUISITION_SAFE') &&
  oneMod.summary.includes('Clean Base') && oneMod.summary.includes('8.784c') &&
  oneMod.health.includes('100.000000%') && oneMod.health.includes('0.000000%') &&
  oneMod.health.includes('converged');
const rawTwoModHealthy = rawTwoMod.summary.includes('BEST_RESOLVED_ACQUISITION_SAFE') &&
  rawTwoMod.summary.includes('Clean Base') && rawTwoMod.summary.includes('228.790c') &&
  rawTwoMod.summary.includes('Acquisition safe') && rawTwoMod.summary.includes('yes') &&
  rawTwoMod.health.includes('100.000000%');
const cleanConstraintRendered = cleanTwoMod.summary.includes('No unwanted affixes');
const cleanPolicyHealthy = cleanTwoMod.summary.includes('228.790c') &&
  cleanTwoMod.health.includes('100.000000%') && cleanTwoMod.health.includes('0.000000%') &&
  cleanTwoMod.health.includes('converged');

const checks = {
  D1_ordinary_stat_label: Boolean(ordinaryLabelPass),
  D2_internal_name_alias: technicalAliasPass,
  D3_stat_text_search: statSearchPass,
  D4_multiple_tiers: tierPass,
  D5_notable: Boolean(notableSelectable),
  D6_target_summary_consistency: targetConsistencyPass,
  D7_exact_target_identity: exactIdentityPass && targetDebugIdentityPass,
  R3_one_mod: oneModHealthy,
  R4_two_mod_any: rawTwoModHealthy,
  R5_no_unwanted: cleanConstraintRendered && cleanPolicyHealthy,
};

const lines = ['DEVELOPER UI PHASE 2F — PRODUCTION MODIFIER-LABEL / WORKER SMOKE'];
lines.push(`URL: ${appUrl}`);
lines.push(`D1 ordinary statText primary label: ${checks.D1_ordinary_stat_label ? 'PASS' : 'FAIL'}; ${esOption?.text ?? 'MISSING'}`);
lines.push(`D2 internal-name search alias: ${checks.D2_internal_name_alias ? 'PASS' : 'FAIL'}; query=Glowing; visible=${technicalSearchOptions.map((option) => option.text).join(' | ')}`);
lines.push(`D3 stat-text search: ${checks.D3_stat_text_search ? 'PASS' : 'FAIL'}; query=Energy Shield; matches=${statSearchOptions.length}`);
lines.push(`D4 multi-tier labels: ${checks.D4_multiple_tiers ? 'PASS' : 'FAIL'}; ${evasionOptions.map((option) => option.text).join(' | ')}`);
lines.push(`D5 notable understandable/selectable: ${checks.D5_notable ? 'PASS' : 'FAIL'}; ${notableOption?.text ?? 'MISSING'}`);
lines.push(`D6 selector / Target Summary consistency: ${checks.D6_target_summary_consistency ? 'PASS' : 'FAIL'}; primary=${targetPrimary}`);
lines.push(`D7 exact worker target IDs unchanged: ${checks.D7_exact_target_identity ? 'PASS' : 'FAIL'}; requests=${JSON.stringify(workerTargetIds)}`);
lines.push(`T1 Intelligence player label: ${intOption?.text ?? 'MISSING'}; expected stat=${INT_STAT}`);
lines.push(`R3 one-mod T1 ES: ${checks.R3_one_mod ? 'PASS' : 'FAIL'} in ${oneMod.elapsedMs}ms; ${compact(oneMod.summary)}`);
lines.push(`R4 two-mod T1 ES + T1 Int Any: ${checks.R4_two_mod_any ? 'PASS' : 'FAIL'} in ${rawTwoMod.elapsedMs}ms; ${compact(rawTwoMod.summary)}`);
lines.push(`R5 no-unwanted semantics: ${checks.R5_no_unwanted ? 'PASS' : 'FAIL'} in ${cleanTwoMod.elapsedMs}ms; ${compact(cleanTwoMod.summary)}`);
lines.push(`worker proof: ${compact(rawTwoMod.proof)}`);
lines.push(`Target Summary: ${compact(rawTwoMod.target)}`);
writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
console.log(lines.join('\n'));
socket.close();

const failures = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
if (failures.length > 0) throw new Error(`Phase 2F browser smoke failed: ${failures.join(', ')}`);
