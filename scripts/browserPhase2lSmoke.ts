import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const debugPort = process.env.BROWSER_DEBUG_PORT ?? '9222';
const appUrl = process.env.PHASE2_APP_URL ?? 'http://127.0.0.1:5173/';
const outputPath = fileURLToPath(new URL('../output-browser-phase2l-smoke.txt', import.meta.url));
const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function requireGate(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function waitForJsonEndpoint(): Promise<string> {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const pages = await fetch(`http://127.0.0.1:${debugPort}/json/list`)
        .then((response) => response.json()) as Array<{
          type: string;
          url: string;
          webSocketDebuggerUrl?: string;
        }>;
      const page = pages.find((candidate) =>
        candidate.type === 'page' && !candidate.url.startsWith('chrome://')
      );
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(100);
  }
  throw new Error('Chrome DevTools endpoint did not become ready');
}

const socket = new WebSocket(await waitForJsonEndpoint());
await new Promise<void>((resolve, reject) => {
  socket.addEventListener('open', () => resolve(), { once: true });
  socket.addEventListener('error', () => reject(new Error('Chrome DevTools socket failed')), {
    once: true,
  });
});

let nextCommandId = 1;
const pending = new Map<number, {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}>();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(String(event.data)) as {
    id?: number;
    error?: { message: string };
    result?: unknown;
  };
  if (message.id === undefined) return;
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  if (message.error) request.reject(new Error(message.error.message));
  else request.resolve(message.result);
});

function command(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
  const id = nextCommandId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate<T>(expression: string): Promise<T> {
  const response = await command('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  }) as {
    exceptionDetails?: { text: string; exception?: { description?: string } };
    result: { value: T };
  };
  if (response.exceptionDetails) {
    throw new Error(
      response.exceptionDetails.exception?.description ?? response.exceptionDetails.text
    );
  }
  return response.result.value;
}

await command('Page.enable');
await command('Runtime.enable');
await command('Page.navigate', { url: appUrl });
for (let attempt = 0; attempt < 100; attempt++) {
  if (await evaluate<boolean>("document.readyState === 'complete'")) break;
  await sleep(100);
}

interface ProofUiResult {
  text: string;
  statusRoleText: string;
  retryCount: number;
  candidateCount: number;
}

const proofUi = await evaluate<ProofUiResult>(`(async () => {
  const moduleSource = await fetch('/src/SearchableModifierSelect.tsx').then((response) => response.text());
  const reactUrl = moduleSource.match(/from "(\\/node_modules\\/.vite\\/deps\\/react\\.js\\?v=[^"]+)/)[1];
  const dependencyQuery = reactUrl.slice(reactUrl.indexOf('?'));
  const React = (await import(reactUrl)).default;
  const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js' + dependencyQuery)).default;
  const { SearchActivityVisualizer } = await import('/src/CraftOptimizer.tsx');
  document.body.innerHTML = '<main id="phase2l-root"></main>';
  let retryCount = 0;
  const progress = {
    phase: 'COMPLETE',
    phaseDescription: 'Search complete',
    currentFocus: 'Selected acquisition safe',
    elapsedMs: 12345,
    totalStatesExpanded: 4321,
    retainedStatesReused: 2100,
    bestExecutableUpperBoundChaos: 4000,
    bestUnresolvedLowerBoundChaos: 4500,
    potentialGapChaos: 0,
    incumbentHistory: [],
    candidates: [
      {
        id: 'clean', label: 'Clean Base', kind: 'clean', status: 'DOMINATED',
        acquisitionLowerBoundChaos: 10, acquisitionUpperBoundChaos: 10,
        downstreamLowerBoundChaos: 5000, downstreamUpperBoundChaos: 6000,
        fullRouteLowerBoundChaos: 5010, fullRouteUpperBoundChaos: 6010,
        lowerBoundChaos: 5010, proofReason: 'DOMINATED_BY_FULL_ROUTE_BOUND',
        retainedAcquisitionStates: 0, retainedDownstreamStates: 1000,
        statesExpanded: 1000, retainedStates: 1000, elapsedMs: 1000, isActive: false,
      },
      {
        id: 'candidate_1', label: 'Glowing (T1)', kind: 'self-fracture', status: 'SELECTED',
        acquisitionLowerBoundChaos: 369, acquisitionUpperBoundChaos: 1500,
        downstreamLowerBoundChaos: 900, downstreamUpperBoundChaos: 2500,
        fullRouteLowerBoundChaos: 1269, fullRouteUpperBoundChaos: 4000,
        lowerBoundChaos: 1269, proofReason: 'SELECTED_EXECUTABLE_ROUTE',
        retainedAcquisitionStates: 1200, retainedDownstreamStates: 2121,
        statesExpanded: 3321, retainedStates: 3321, elapsedMs: 9000, isActive: false,
      },
    ],
    recentMilestones: ['Selected acquisition safe: every competing family is bounded'],
    portfolioProofStatus: 'SELECTED_ACQUISITION_SAFE',
    unresolvedCompetitiveCandidates: 0,
    resolvedCompetitiveCandidates: 0,
    dominatedCandidates: 1,
    sessionReuseStatus: 'RESUMED',
    sessionReuseMessage: 'Retained exact candidate-stage graphs',
  };
  const root = createRoot(document.getElementById('phase2l-root'));
  root.render(React.createElement(SearchActivityVisualizer, {
    progress,
    running: false,
    onRetryDeeper: () => { retryCount += 1; },
  }));
  await new Promise((resolve) => setTimeout(resolve, 100));
  const section = document.querySelector('.search-activity-card');
  section.querySelector('.search-activity-actions button').click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  return {
    text: section.innerText,
    statusRoleText: section.querySelector('[role="status"]').innerText,
    retryCount,
    candidateCount: section.querySelectorAll('.macro-candidate-node').length,
  };
})()`);

console.error('[browser-phase2l] proof UI', JSON.stringify(proofUi));

requireGate(proofUi.text.toLowerCase().includes('search complete'), 'L12 terminal COMPLETE label missing');
requireGate(proofUi.text.includes('Acquisition L:'), 'L12 Acquisition L missing');
requireGate(proofUi.text.includes('Acquisition U:'), 'L12 Acquisition U missing');
requireGate(proofUi.text.includes('Full-route L:'), 'L12 full-route L missing');
requireGate(proofUi.text.includes('Current Full-route U:'), 'L12 full-route U missing');
requireGate(
  proofUi.statusRoleText.includes('Selected acquisition is safe') &&
    proofUi.text.includes('SELECTED') && proofUi.text.includes('DOMINATED'),
  'L12 portfolio/candidate proof status missing'
);
requireGate(proofUi.retryCount === 1, 'L12 Retry Deeper callback did not continue');

interface SelectorResult {
  selected: string[];
  listboxIdsUnique: boolean;
  activeDescendantWired: boolean;
  duplicateSelectedExactly: boolean;
  disabledSkipped: boolean;
  escapeReturnedFocus: boolean;
  queryDidNotSelect: boolean;
  clearButtonsAreButtons: boolean;
  liveCount: string;
  rowCount: number;
}

const selectorResult = await evaluate<SelectorResult>(`(async () => {
  const moduleSource = await fetch('/src/SearchableModifierSelect.tsx').then((response) => response.text());
  const reactUrl = moduleSource.match(/from "(\\/node_modules\\/.vite\\/deps\\/react\\.js\\?v=[^"]+)/)[1];
  const dependencyQuery = reactUrl.slice(reactUrl.indexOf('?'));
  const React = (await import(reactUrl)).default;
  const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js' + dependencyQuery)).default;
  const { SearchableModifierSelect } = await import('/src/SearchableModifierSelect.tsx');
  const mods = [
    ['dup-a', 'Duplicate player label', 'InternalDuplicateAlpha', 'Prefix', 1, 84, false],
    ['dup-b', 'Duplicate player label', 'InternalDuplicateBeta', 'Suffix', 1, 84, false],
    ['long-c', 'A very long player-facing modifier name that must not overflow a narrow target row', 'InternalLongGamma', 'Prefix', 2, 75, false],
    ['notable-d', 'Deep Cuts', 'Deep Cuts', 'Prefix', 1, 1, true],
    ['plain-e', '+12 to Intelligence', 'InternalIntelligence', 'Suffix', 3, 68, false],
  ].map(([modId, displayName, technicalName, genType, tier, requiredItemLevel, isNotable]) => ({
    modId, displayName, selectionLabel: displayName, technicalName,
    technicalLabel: technicalName + ' [' + modId + ']',
    searchAliases: [], name: technicalName, statText: displayName,
    genType, modGroup: 'Phase2L_' + modId, tier, tierCount: 3,
    requiredItemLevel, weight: 1000, isNotable,
  }));
  document.body.innerHTML = '<main id="phase2l-selector-root"></main>';
  let latestValues = [];
  function Harness() {
    const [values, setValues] = React.useState(['', 'dup-a', '', '']);
    latestValues = values;
    return React.createElement('div', { className: 'optimizer-form phase2l-selector-harness' },
      values.map((value, index) => React.createElement('div', { className: 'target-row', key: index },
        React.createElement(SearchableModifierSelect, {
          value,
          eligibleMods: mods,
          disabledModIds: values.filter((id, other) => other !== index && id),
          ariaLabel: 'Smoke modifier ' + (index + 1),
          onChange: (next) => setValues((current) => current.map((id, other) =>
            other === index ? next : id
          )),
        })
      ))
    );
  }
  createRoot(document.getElementById('phase2l-selector-root')).render(React.createElement(Harness));
  const delay = () => new Promise((resolve) => setTimeout(resolve, 60));
  await delay();
  const rows = () => [...document.querySelectorAll('.target-row')];

  rows()[0].querySelector('.searchable-select-trigger').click();
  await delay();
  const input0 = rows()[0].querySelector('input[role="combobox"]');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(
    input0,
    'Duplicate'
  );
  input0.dispatchEvent(new Event('input', { bubbles: true }));
  await delay();
  input0.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
  await delay();
  const homeActive = input0.getAttribute('aria-activedescendant');
  const homeOption = homeActive && document.getElementById(homeActive);
  const disabledSkipped = homeOption?.dataset.modId === 'dup-b';
  input0.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
  input0.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await delay();
  const duplicateSelectedExactly = latestValues[0] === 'dup-b';

  rows()[2].querySelector('.searchable-select-trigger').click();
  await delay();
  const input2 = rows()[2].querySelector('input[role="combobox"]');
  const controlsId = input2.getAttribute('aria-controls');
  const activeId = input2.getAttribute('aria-activedescendant');
  const activeDescendantWired = Boolean(
    controlsId && document.getElementById(controlsId) && activeId && document.getElementById(activeId)
  );
  input2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await delay();
  const escapeReturnedFocus = document.activeElement ===
    rows()[2].querySelector('.searchable-select-trigger');

  const beforeQuery = JSON.stringify(latestValues);
  rows()[3].querySelector('.searchable-select-trigger').click();
  await delay();
  const input3 = rows()[3].querySelector('input[role="combobox"]');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(
    input3,
    '35% notable ilvl'
  );
  input3.dispatchEvent(new Event('input', { bubbles: true }));
  await delay();
  const queryDidNotSelect = JSON.stringify(latestValues) === beforeQuery;
  const liveCount = rows()[3].querySelector('[role="status"]').textContent;
  input3.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await delay();

  const listboxIds = [...document.querySelectorAll('[role="listbox"]')].map((node) => node.id);
  return {
    selected: latestValues,
    listboxIdsUnique: new Set(listboxIds).size === listboxIds.length,
    activeDescendantWired,
    duplicateSelectedExactly,
    disabledSkipped,
    escapeReturnedFocus,
    queryDidNotSelect,
    clearButtonsAreButtons: [...document.querySelectorAll('.clear-selection-btn, .search-clear-btn')]
      .every((node) => node.tagName === 'BUTTON'),
    liveCount,
    rowCount: rows().length,
  };
})()`);

console.error('[browser-phase2l] selector', JSON.stringify(selectorResult));

requireGate(selectorResult.rowCount === 4, 'L13 four-row selector harness missing rows');
requireGate(selectorResult.duplicateSelectedExactly, 'L13 duplicate label changed wrong mod ID');
requireGate(selectorResult.disabledSkipped, 'L13 keyboard did not skip disabled option');
requireGate(selectorResult.activeDescendantWired, 'L13 combobox/listbox active-descendant wiring failed');
requireGate(selectorResult.escapeReturnedFocus, 'L13 Escape did not return focus to trigger');
requireGate(selectorResult.queryDidNotSelect, 'L13 query text changed exact target identity');
requireGate(selectorResult.clearButtonsAreButtons, 'L13 clear control is not a real button');
requireGate(Boolean(selectorResult.liveCount), 'L13 live result-count announcement missing');

await command('Emulation.setDeviceMetricsOverride', {
  width: 320,
  height: 568,
  deviceScaleFactor: 1,
  mobile: true,
});
const mobileResult = await evaluate<{
  noHorizontalOverflow: boolean;
  rowsInViewport: boolean;
  opensUpward: boolean;
  popupInsideViewport: boolean;
}>(`(async () => {
  const delay = () => new Promise((resolve) => setTimeout(resolve, 80));
  const harness = document.querySelector('.phase2l-selector-harness');
  harness.style.paddingTop = '360px';
  const rows = [...document.querySelectorAll('.target-row')];
  const lastTrigger = rows.at(-1).querySelector('.searchable-select-trigger');
  lastTrigger.scrollIntoView({ block: 'end' });
  lastTrigger.click();
  await delay();
  const container = rows.at(-1).querySelector('.searchable-modifier-select');
  const popup = container.querySelector('.searchable-dropdown-popup');
  const rect = popup.getBoundingClientRect();
  return {
    noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth,
    rowsInViewport: rows.every((row) => row.getBoundingClientRect().width <= window.innerWidth),
    opensUpward: container.classList.contains('open-upward'),
    popupInsideViewport: rect.left >= -0.5 && rect.right <= window.innerWidth + 0.5 &&
      rect.top >= -0.5 && rect.bottom <= window.innerHeight + 0.5,
  };
})()`);

requireGate(mobileResult.noHorizontalOverflow, 'L13 320px page overflowed horizontally');
requireGate(mobileResult.rowsInViewport, 'L13 320px target row overflowed');
requireGate(mobileResult.opensUpward, 'L13 bottom-adjacent selector did not open upward');
requireGate(mobileResult.popupInsideViewport, 'L13 upward popup escaped viewport');

const lines = [
  'PHASE 2L — SEARCH ACTIVITY / MODIFIER SELECTOR BROWSER SMOKE',
  `URL: ${appUrl}`,
  '',
  'L12 SEARCH ACTIVITY PROOF UI',
  `  terminal COMPLETE=PASS; candidate cards=${proofUi.candidateCount}`,
  '  Acquisition L/U + Full-route L/U=PASS',
  `  semantic proof status=${proofUi.statusRoleText.replace(/\s+/g, ' ').trim()}`,
  `  selected/dominated lifecycle=PASS; Retry Deeper callbacks=${proofUi.retryCount}`,
  '',
  'L13 SEARCHABLE MODIFIER SELECTOR',
  `  exact duplicate-label selection=${selectorResult.selected[0]}; disabled skip=${selectorResult.disabledSkipped}`,
  `  aria controls/active descendant=${selectorResult.activeDescendantWired}; Escape focus return=${selectorResult.escapeReturnedFocus}`,
  `  query identity safety=${selectorResult.queryDidNotSelect}; real clear buttons=${selectorResult.clearButtonsAreButtons}`,
  `  live result announcement=${selectorResult.liveCount.trim()}`,
  `  four rows=${selectorResult.rowCount}; 320px no overflow=${mobileResult.noHorizontalOverflow}; upward popup=${mobileResult.opensUpward}/${mobileResult.popupInsideViewport}`,
  '',
  'ALL PHASE 2L BROWSER UI GATES: PASS',
  'Unit tests run: NO',
];

writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
console.log(lines.join('\n'));
await command('Emulation.clearDeviceMetricsOverride');
socket.close();
