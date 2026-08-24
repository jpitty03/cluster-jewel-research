import { readFileSync, writeFileSync } from 'node:fs';

const debugPort = process.env.BROWSER_DEBUG_PORT ?? '9222';
const appUrl = process.env.PHASE2_APP_URL ?? 'http://127.0.0.1:4173/';
const outputPath = new URL('../output-browser-phase2g-smoke.txt', import.meta.url);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const ES_ID = 'AfflictionJewelSmallPassivesGrantES3';
const INT_ID = 'AfflictionJewelSmallPassivesGrantInt3';
const EVASION_IDS = [
  'AfflictionJewelSmallPassivesGrantEvasion3',
  'AfflictionJewelSmallPassivesGrantEvasion2__',
  'AfflictionJewelSmallPassivesGrantEvasion',
];
const BASE_TYPE = 'Large Cluster Jewel';
const CLUSTER_TYPE = '10% increased Attack Damage';
const EXPECTED_PRICE_CONTEXT = {
  currencyRates: {
    chaos: 1,
    divine: 193.9,
    fracturing: 355.8,
    annul: 8.67,
    exalt: 1.63,
    scour: 0.3711,
    alteration: 0.1405,
    transmutation: 0.01102,
    augmentation: 0.06493,
    regal: 0.119,
    wildLifeforce: 0.01838,
    vividLifeforce: 0.06815,
    primalLifeforce: 0.03697,
  },
  cleanBaseCostChaos: 4,
  cleanBasePriceSource: 'manual',
  cleanBasePriceProvenance: 'manual clean-base override supplied in Developer UI',
};
const snapshot = JSON.parse(readFileSync(
  new URL('../src/data/poedb-cluster-mods.json', import.meta.url),
  'utf8',
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
const compact = (value) => value.replaceAll('\n', ' | ').replaceAll(/\s+/g, ' ').trim();
const closeEnough = (left, right, tolerance = 0.01) =>
  typeof left === 'number' && Math.abs(left - right) <= tolerance;

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
  const before = await evaluate('window.__phase2gResults.length');
  const started = Date.now();
  if (!(await clickButton('Find cheapest craft'))) throw new Error('Find cheapest craft button was unavailable');
  await waitFor(`window.__phase2gResults.length > ${before} || document.querySelector('.error') !== null`, timeoutMs);
  const error = await evaluate(`document.querySelector('.error')?.innerText ?? ''`);
  if (error) throw new Error(`Optimizer UI returned an error: ${error}`);
  return evaluate(`(() => {
    const result = window.__phase2gResults.at(-1);
    const advanced = document.querySelector('.advanced-optimizer-details');
    const snapshot = {
      elapsedMs: ${Date.now()} - ${started},
      hero: document.querySelector('.recommendation-hero')?.innerText ?? '',
      proof: document.querySelector('.optimizer-proof')?.innerText ?? '',
      provisionalWarning: document.querySelector('.provisional-warning')?.innerText ?? '',
      noRouteWarning: document.querySelector('.no-route-warning')?.innerText ?? '',
      guideText: document.querySelector('.craft-guide')?.innerText ?? '',
      guideRules: [...document.querySelectorAll('.craft-rule')].map((rule) => ({
        condition: rule.dataset.condition,
        action: rule.dataset.action,
        actionId: rule.dataset.actionId,
      })),
      materialText: document.querySelector('.expected-materials')?.innerText ?? '',
      materialRows: [...document.querySelectorAll('.expected-materials tbody tr')].map((row) => ({
        actionId: row.dataset.actionId,
        expectedCount: Number(row.dataset.expectedCount),
        expectedCostChaos: Number(row.dataset.expectedCost),
        text: row.innerText,
      })),
      advancedInitiallyClosed: advanced instanceof HTMLDetailsElement && !advanced.open,
      advancedRawText: advanced?.textContent ?? '',
      fracturePlayerLabels: [...document.querySelectorAll('.self-fracture-portfolio tbody tr')].map((row) => ({
        candidateId: row.dataset.candidateId,
        playerLabel: row.dataset.playerLabel,
      })),
      targetSummary: document.querySelector('.target-summary')?.innerText ?? '',
      result: {
        target: result.target,
        recommendationStatus: result.recommendationStatus,
        expectedCostChaos: result.expectedCostChaos,
        expectedActionUsage: result.expectedActionUsage,
        policyExplanation: result.policyExplanation,
        recommended: result.recommended,
        acquisition: {
          selectedCandidateId: result.acquisition.selectedCandidateId,
          selectedMethodId: result.acquisition.selectedMethodId,
          selectionSafe: result.acquisition.selectionSafe,
          resolvedIncumbentUpperBoundChaos: result.acquisition.resolvedIncumbentUpperBoundChaos,
          bestUnresolvedLowerBoundChaos: result.acquisition.bestUnresolvedLowerBoundChaos,
          potentialGapChaos: result.acquisition.potentialGapChaos,
          stage: result.acquisition.stage,
          candidates: result.acquisition.candidates.map((candidate) => ({
            id: candidate.id,
            label: candidate.label,
            methods: candidate.methods,
            synthesis: candidate.synthesis ? {
              status: candidate.synthesis.status,
              expectedCostChaos: candidate.synthesis.expectedCostChaos,
              lowerBoundChaos: candidate.synthesis.lowerBoundChaos,
              expectedFracturingOrbs: candidate.synthesis.expectedFracturingOrbs,
              expectedRestarts: candidate.synthesis.expectedRestarts,
              wrongFractureRecovery: candidate.synthesis.wrongFractureRecovery,
            } : undefined,
          })),
        },
        risk: result.risk,
        solver: result.solver,
        proof: result.proof,
      },
    };
    if (advanced instanceof HTMLDetailsElement) advanced.open = true;
    snapshot.advancedVisibleText = advanced?.innerText ?? '';
    for (const details of document.querySelectorAll('.synthesis-explanations details')) details.open = true;
    snapshot.selfFractureExpandedText = document.querySelector('.self-fracture-portfolio')?.innerText ?? '';
    for (const details of document.querySelectorAll('.synthesis-explanations details')) details.open = false;
    if (advanced instanceof HTMLDetailsElement) advanced.open = false;
    return snapshot;
  })()`);
}

await command('Page.enable');
await command('Runtime.enable');
await command('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
  window.__phase2gOptimizerRequests = [];
  window.__phase2gResults = [];
  window.__phase2gCheapFracture = false;
  const originalPostMessage = Worker.prototype.postMessage;
  Worker.prototype.postMessage = function(message) {
    let outgoing = message;
    if (message?.type === 'OPTIMIZE' && window.__phase2gCheapFracture) {
      outgoing = JSON.parse(JSON.stringify(message));
      outgoing.input.prices.currencyRates.fracturing = 0.001;
      outgoing.input.searchBudget.acquisitionMaxStates = 500;
      outgoing.input.searchBudget.acquisitionMaxWallTimeMs = 4_000;
      outgoing.input.searchBudget.acquisitionMaxExpansionRounds = 3;
      window.__phase2gCheapFracture = false;
    }
    if (outgoing?.type === 'OPTIMIZE') window.__phase2gOptimizerRequests.push(JSON.parse(JSON.stringify(outgoing)));
    return originalPostMessage.call(this, outgoing);
  };
  const originalAddEventListener = Worker.prototype.addEventListener;
  Worker.prototype.addEventListener = function(type, listener, options) {
    if (type !== 'message') return originalAddEventListener.call(this, type, listener, options);
    const wrapped = function(event) {
      if (event.data?.type === 'RESULT') window.__phase2gResults.push(JSON.parse(JSON.stringify(event.data.result)));
      if (typeof listener === 'function') return listener.call(this, event);
      return listener.handleEvent(event);
    };
    return originalAddEventListener.call(this, type, wrapped, options);
  };
})()` });
await command('Page.navigate', { url: appUrl });
await waitFor(`document.readyState === 'complete' && [...document.querySelectorAll('button')].some((button) => button.textContent?.trim() === 'Craft Optimizer')`, 10_000);
await clickButton('Craft Optimizer');
await waitFor(`document.querySelector('.optimizer-form') !== null`, 5_000);
await setLabeledValue('Cluster enchantment', CLUSTER_TYPE);
await setLabeledValue('Clean base manual override (chaos)', 4);
await setLabeledValue('Final rarity', 'any');
await setLabeledValue('Extra affixes', 'allow-extra');
await setLabeledValue('Search intent', 'RECOMMEND');
await setLabeledValue('Max states', 5000);
await setLabeledValue('Max wall time (ms)', 30000);
await setLabeledValue('Expansion rounds', 3);

// Preserve the complete Phase 2F label and exact-mod-identity coverage.
await setModifierSearch('', ES_ID);
const esOption = await optionFor(ES_ID);
const intOption = await optionFor(INT_ID);
const ordinaryLabelPass = esOption?.text.includes(ES_STAT) && esOption.text.includes('(T1)') && !esOption.text.includes('Glowing');
await setModifierSearch('Glowing', ES_ID, INT_ID);
const technicalSearchOptions = await visibleOptions();
const technicalAliasPass = technicalSearchOptions.some((option) => option.value === ES_ID && option.technical === 'Glowing' && !option.text.includes('Glowing'));
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
const notablePass = notableOption?.text.includes('Vicious Skewering') && await setTarget(0, 'Vicious Skewering') === 'Vicious Skewering';
await setModifierSearch('', ES_ID);
await setTarget(0, ES_ID);
await waitFor(`document.querySelector('.target-summary li[data-mod-id=${JSON.stringify(ES_ID)}] strong') !== null`, 2_000);
const targetPrimary = await evaluate(`document.querySelector('.target-summary li[data-mod-id=${JSON.stringify(ES_ID)}] strong')?.textContent?.trim() ?? ''`);
const targetTechnical = await evaluate(`document.querySelector('.target-summary li[data-mod-id=${JSON.stringify(ES_ID)}] code')?.textContent?.trim() ?? ''`);
const targetConsistencyPass = targetPrimary === esOption?.primary && targetPrimary === `${ES_STAT} (T1)`;
const targetDebugIdentityPass = targetTechnical.includes('Glowing') && targetTechnical.includes(ES_ID);

const oneMod = await runSearch(31_500);

// Keep the Phase 2E artificial cheap-fracture counter-fixture on its certified
// one-mod target. It must stay provisional because its admissible fracture lower
// bound remains below the finite clean-base incumbent.
await evaluate('window.__phase2gCheapFracture = true');
const provisional = await runSearch(31_500);

await clickButton('Add modifier');
await waitFor(`document.querySelectorAll('.target-row select').length === 2`, 2_000);
await setTarget(0, ES_ID);
await setTarget(1, INT_ID);
const twoModAny = await runSearch(31_500);
await setLabeledValue('Extra affixes', 'no-unwanted');
const noUnwanted = await runSearch(31_500);

// Phase 2H's normal fracture bound makes the forced-Rare route safe.
await setLabeledValue('Extra affixes', 'allow-extra');
await setLabeledValue('Final rarity', 'rare');
await setLabeledValue('Max wall time (ms)', 60000);
const forcedRare = await runSearch(62_500);

// Bounded no-route presentation fixture exercises the fourth player-facing status without frontier work.
await setLabeledValue('Max states', 1);
await setLabeledValue('Max wall time (ms)', 250);
await setLabeledValue('Expansion rounds', 1);
const noRoute = await runSearch(3_000);

const requests = await evaluate(`window.__phase2gOptimizerRequests.map((request) => request.input)`);
const expectedRequests = [
  { mods: [ES_ID], rarity: undefined, maxUnmatchedAffixes: undefined, states: 5000, wall: 30000, rounds: 3 },
  { mods: [ES_ID], rarity: undefined, maxUnmatchedAffixes: undefined, states: 5000, wall: 30000, rounds: 3, cheapFracture: true },
  { mods: [ES_ID, INT_ID], rarity: undefined, maxUnmatchedAffixes: undefined, states: 5000, wall: 30000, rounds: 3 },
  { mods: [ES_ID, INT_ID], rarity: undefined, maxUnmatchedAffixes: 0, states: 5000, wall: 30000, rounds: 3 },
  { mods: [ES_ID, INT_ID], rarity: 'rare', maxUnmatchedAffixes: undefined, states: 5000, wall: 60000, rounds: 3 },
  { mods: [ES_ID, INT_ID], rarity: 'rare', maxUnmatchedAffixes: undefined, states: 1, wall: 250, rounds: 1 },
];
const requestIdentityPass = requests.length === expectedRequests.length && requests.every((request, index) => {
  const expected = expectedRequests[index];
  const expectedPrices = JSON.parse(JSON.stringify(EXPECTED_PRICE_CONTEXT));
  if (expected.cheapFracture) expectedPrices.currencyRates.fracturing = 0.001;
  return request.baseType === BASE_TYPE && request.clusterType === CLUSTER_TYPE &&
    request.itemLevel === 84 && request.passiveCount === 12 &&
    JSON.stringify(request.target.requiredMods.map((requirement) => requirement.modId)) === JSON.stringify(expected.mods) &&
    request.target.requiredRarity === expected.rarity &&
    request.target.finalStateConstraints?.maxUnmatchedAffixes === expected.maxUnmatchedAffixes &&
    JSON.stringify(request.prices) === JSON.stringify(expectedPrices) &&
    request.marketContext?.league === 'Allflame' &&
    JSON.stringify(request.marketContext) === JSON.stringify(requests[0].marketContext) &&
    request.allowResearchFallbackPrices === true && request.expectedSaleValueChaos === undefined &&
    request.searchBudget.maxStates === expected.states && request.searchBudget.maxWallTimeMs === expected.wall &&
    request.searchBudget.maxExpansionRounds === expected.rounds &&
    request.searchBudget.acquisitionMaxStates === (expected.cheapFracture ? 500 : undefined) &&
    request.searchBudget.acquisitionMaxWallTimeMs === (expected.cheapFracture ? 4_000 : undefined) &&
    request.searchBudget.acquisitionMaxExpansionRounds === (expected.cheapFracture ? 3 : undefined) &&
    request.searchIntent === 'RECOMMEND';
});

const expectedGuideRules = oneMod.result.policyExplanation.map(({ action, actionId }) => ({ action, actionId }));
const guidePass = expectedGuideRules.length > 0 && oneMod.guideRules.length === expectedGuideRules.length &&
  oneMod.guideRules.every((rule, index) => rule.condition && rule.action === expectedGuideRules[index].action &&
    rule.actionId === expectedGuideRules[index].actionId);
const materialsPass = oneMod.result.expectedActionUsage.length > 0 &&
  oneMod.result.expectedActionUsage.every((usage) => oneMod.materialRows.some((row) =>
    row.actionId === usage.actionId && row.expectedCount === usage.expectedCount &&
    row.expectedCostChaos === usage.expectedCostChaos
  )) && oneMod.materialRows.some((row) => /Alteration/i.test(row.text));
const oneModHealthy = oneMod.result.recommendationStatus === 'BEST_RESOLVED_ACQUISITION_SAFE' &&
  oneMod.result.acquisition.selectionSafe && closeEnough(oneMod.result.expectedCostChaos, 8.784) &&
  oneMod.result.risk.selectedPolicyProper && closeEnough(oneMod.result.risk.terminalAbsorptionProbability, 1, 1e-9) &&
  closeEnough(oneMod.result.risk.unresolvedOnPolicyProbability, 0, 1e-9) && oneMod.result.solver.bellmanConverged &&
  oneMod.result.solver.occupancyConverged;
const twoModHealthy = twoModAny.result.recommendationStatus === 'BEST_RESOLVED_ACQUISITION_SAFE' &&
  twoModAny.result.acquisition.selectionSafe && closeEnough(twoModAny.result.expectedCostChaos, 228.790) &&
  closeEnough(twoModAny.result.risk.terminalAbsorptionProbability, 1, 1e-9);
const noUnwantedHealthy = noUnwanted.result.target.finalStateConstraints?.maxUnmatchedAffixes === 0 &&
  noUnwanted.hero.includes('No unwanted affixes') && closeEnough(noUnwanted.result.expectedCostChaos, 228.790) &&
  closeEnough(noUnwanted.result.risk.terminalAbsorptionProbability, 1, 1e-9);
const provisionalHealthy = provisional.result.recommendationStatus === 'PROVISIONAL_RESOLVED' &&
  !provisional.result.acquisition.selectionSafe && provisional.hero.includes('Provisional route') &&
  provisional.hero.includes('Not acquisition-safe') && provisional.provisionalWarning.includes('cheaper unresolved route may exist') &&
  provisional.result.recommended !== null && provisional.hero.includes('Recommended start') &&
  closeEnough(provisional.result.expectedCostChaos, oneMod.result.expectedCostChaos);
const forcedRareHealthy = forcedRare.result.recommendationStatus === 'BEST_RESOLVED_ACQUISITION_SAFE' &&
  forcedRare.result.acquisition.selectionSafe && forcedRare.result.recommended !== null &&
  forcedRare.result.risk.selectedPolicyProper &&
  closeEnough(forcedRare.result.risk.terminalAbsorptionProbability, 1, 1e-9);
const noRoutePresentationHealthy = noRoute.result.recommendationStatus === 'NO_RESOLVED_ROUTE' &&
  noRoute.hero.includes('Search outcome') && noRoute.hero.includes('No resolved route') &&
  noRoute.hero.includes('No start certified under this budget') &&
  noRoute.noRouteWarning.includes('No craft recommendation is available') &&
  noRoute.guideText.includes('No certified acquisition route is available') &&
  noRoute.materialText === '' && noRoute.materialRows.length === 0 &&
  !noRoute.advancedVisibleText.includes('Acquire No start certified under this budget') &&
  (noRoute.result.expectedActionUsage.length === 0 ||
    noRoute.advancedVisibleText.includes('Uncertified exploratory policy usage'));
const fractureSyntheses = provisional.result.acquisition.candidates.filter((candidate) => candidate.synthesis);
const fracturePresentationEvidence = {
  relevantFamilies: fractureSyntheses.length > 0,
  expectedUse: fractureSyntheses.some((candidate) => candidate.synthesis.expectedFracturingOrbs !== undefined && candidate.synthesis.expectedRestarts !== undefined),
  recoveryModel: fractureSyntheses.some((candidate) => candidate.synthesis.wrongFractureRecovery?.note.includes('no in-place reset')),
  portfolioHeading: provisional.selfFractureExpandedText.includes('Self-fracture synthesis portfolio'),
  materialHeadings: /Fracturing Orbs/i.test(provisional.selfFractureExpandedText) && /Restarts/i.test(provisional.selfFractureExpandedText),
  restartCopy: provisional.selfFractureExpandedText.includes('restart/reacquisition'),
  playerLabelsResolved: fractureSyntheses.every((candidate) => provisional.fracturePlayerLabels.some((displayed) =>
    displayed.candidateId === candidate.id && displayed.playerLabel && displayed.playerLabel !== candidate.label &&
    (displayed.playerLabel.includes(ES_STAT) || displayed.playerLabel.includes(INT_STAT))
  )),
  methodsRestricted: provisional.result.acquisition.candidates.every((candidate) => candidate.methods.every((method) =>
    method.id.startsWith('clean-base') || method.id === 'self-fracture_executable'
  )),
};
const fracturePresentationPass = Object.values(fracturePresentationEvidence).every(Boolean);

const checks = {
  D1_human_status: !oneMod.hero.includes('BEST_RESOLVED_ACQUISITION_SAFE') &&
    oneMod.hero.includes('Recommended route found') && oneMod.advancedRawText.includes('BEST_RESOLVED_ACQUISITION_SAFE'),
  D2_primary_hierarchy: oneMod.hero.includes(ES_STAT) && oneMod.hero.includes('Recommended start') &&
    oneMod.hero.includes('Clean Base') && oneMod.hero.includes('8.784c') &&
    oneMod.hero.includes('Acquisition-safe') && oneMod.hero.includes('Extra affixes allowed') &&
    oneMod.advancedInitiallyClosed,
  D3_branch_aware_guide: guidePass,
  D4_expected_materials: materialsPass,
  D5_provisional_warning: provisionalHealthy,
  D6_advanced_diagnostics: provisional.advancedVisibleText.includes('Raw recommendation status') &&
    provisional.advancedVisibleText.includes('Resolved incumbent U') &&
    provisional.advancedVisibleText.includes('Best unresolved acquisition L') &&
    provisional.advancedVisibleText.includes('Policy health') &&
    provisional.advancedVisibleText.includes('Search budget and performance') && fracturePresentationPass,
  D7_phase2f_labels: Boolean(ordinaryLabelPass && technicalAliasPass && statSearchPass && tierPass && notablePass && targetConsistencyPass && targetDebugIdentityPass),
  D8_worker_identity: requestIdentityPass,
  R1_one_mod: oneModHealthy,
  R2_two_mod_any: twoModHealthy,
  R3_no_unwanted: noUnwantedHealthy,
  R4_forced_rare: forcedRareHealthy,
  R5_self_fracture_presentation: fracturePresentationPass,
  S1_no_route_presentation: noRoutePresentationHealthy,
};

const lines = ['PHASE 2G — PRODUCTION USER-FACING CRAFT GUIDE / WORKER SMOKE'];
lines.push(`URL: ${appUrl}`);
lines.push(`D1 human recommendation status: ${checks.D1_human_status ? 'PASS' : 'FAIL'}; ${compact(oneMod.proof)}`);
lines.push(`D2 primary result hierarchy: ${checks.D2_primary_hierarchy ? 'PASS' : 'FAIL'}; ${compact(oneMod.hero)}`);
lines.push(`D3 branch-aware craft guide exact result correspondence: ${checks.D3_branch_aware_guide ? 'PASS' : 'FAIL'}; displayed=${JSON.stringify(oneMod.guideRules)}; returned=${JSON.stringify(expectedGuideRules)}`);
lines.push(`D4 expected materials exact result correspondence: ${checks.D4_expected_materials ? 'PASS' : 'FAIL'}; ${compact(oneMod.materialText)}`);
lines.push(`D5 provisional result warning: ${checks.D5_provisional_warning ? 'PASS' : 'FAIL'}; ${compact(provisional.hero)}; alert=${compact(provisional.provisionalWarning)}`);
lines.push(`D6 advanced diagnostics retained: ${checks.D6_advanced_diagnostics ? 'PASS' : 'FAIL'}; U=${provisional.result.acquisition.resolvedIncumbentUpperBoundChaos}; L=${provisional.result.acquisition.bestUnresolvedLowerBoundChaos}; fractureFamilies=${fractureSyntheses.length}`);
lines.push(`D7 Phase 2F labels: ${checks.D7_phase2f_labels ? 'PASS' : 'FAIL'}; ordinary=${esOption?.text ?? 'MISSING'}; intelligence=${intOption?.text ?? 'MISSING'}; notable=${notableOption?.text ?? 'MISSING'}`);
lines.push(`D8 exact worker identity: ${checks.D8_worker_identity ? 'PASS' : 'FAIL'}; ${JSON.stringify(requests.map((request) => ({ baseType: request.baseType, clusterType: request.clusterType, itemLevel: request.itemLevel, passiveCount: request.passiveCount, target: request.target, prices: request.prices, marketContext: request.marketContext, expectedSaleValueChaos: request.expectedSaleValueChaos, allowResearchFallbackPrices: request.allowResearchFallbackPrices, searchBudget: request.searchBudget, searchIntent: request.searchIntent })))}`);
lines.push(`R1 one-mod T1 ES: ${checks.R1_one_mod ? 'PASS' : 'FAIL'} in ${oneMod.elapsedMs}ms; status=${oneMod.result.recommendationStatus}; acquisition=Clean Base; expected=${oneMod.result.expectedCostChaos}; absorption=${oneMod.result.risk.terminalAbsorptionProbability}; Bellman=${oneMod.result.solver.bellmanConverged}; occupancy=${oneMod.result.solver.occupancyConverged}`);
lines.push(`R2 two-mod T1 ES + T1 Int Any: ${checks.R2_two_mod_any ? 'PASS' : 'FAIL'} in ${twoModAny.elapsedMs}ms; status=${twoModAny.result.recommendationStatus}; expected=${twoModAny.result.expectedCostChaos}; absorption=${twoModAny.result.risk.terminalAbsorptionProbability}`);
lines.push(`R3 no-unwanted: ${checks.R3_no_unwanted ? 'PASS' : 'FAIL'} in ${noUnwanted.elapsedMs}ms; expected=${noUnwanted.result.expectedCostChaos}; constraint=${JSON.stringify(noUnwanted.result.target.finalStateConstraints)}`);
lines.push(`R4 forced-Rare normal-price proof: ${checks.R4_forced_rare ? 'PASS' : 'FAIL'} in ${forcedRare.elapsedMs}ms; status=${forcedRare.result.recommendationStatus}; safe=${forcedRare.result.acquisition.selectionSafe}; U=${forcedRare.result.acquisition.resolvedIncumbentUpperBoundChaos}; L=${forcedRare.result.acquisition.bestUnresolvedLowerBoundChaos}`);
lines.push(`R5 self-fracture presentation: ${checks.R5_self_fracture_presentation ? 'PASS' : 'FAIL'}; ${JSON.stringify(fractureSyntheses)}`);
lines.push(`R5 presentation evidence: ${JSON.stringify(fracturePresentationEvidence)}; expanded=${compact(provisional.selfFractureExpandedText)}`);
lines.push(`Supplemental no-route presentation: ${checks.S1_no_route_presentation ? 'PASS' : 'FAIL'} in ${noRoute.elapsedMs}ms; hero=${compact(noRoute.hero)}; alert=${compact(noRoute.noRouteWarning)}`);
writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
console.log(lines.join('\n'));
socket.close();

const failures = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
if (failures.length > 0) throw new Error(`Phase 2G browser smoke failed: ${failures.join(', ')}`);
