import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { OptimizeCraftInput } from '../crafting-engine/src/service/optimizerService.ts';
import {
  createPhase2k1ExactFixture,
  PHASE2K1_FROZEN_CURRENCY_RATES,
} from '../crafting-engine/scripts/phase2k1ExactFixture.ts';

const debugPort = process.env.BROWSER_DEBUG_PORT ?? '9222';
const appUrl = process.env.PHASE2_APP_URL ?? 'http://127.0.0.1:5173/';
const outputPath = fileURLToPath(new URL('../output-browser-phase2k-smoke.txt', import.meta.url));
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

const instrumentation = `(() => {
  const NativeWorker = window.Worker;
  const state = window.__phase2k1WorkerSmoke = {
    events: [],
    requests: [],
    terminations: [],
    workerCount: 0,
    workers: new Map(),
    workerMetadata: new Map(),
    messageErrors: 0,
    swallowNextOptimize: false,
    unknownInjected: false,
    lastProgress: null,
  };
  window.Worker = class Phase2K1ObservedWorker extends NativeWorker {
    constructor(url, options) {
      super(url, options);
      const workerId = ++state.workerCount;
      this.__phase2k1WorkerId = workerId;
      state.workers.set(workerId, this);
      state.workerMetadata.set(workerId, { url: String(url), options });
      super.addEventListener('message', (event) => {
        const data = event.data;
        state.events.push({
          sequence: state.events.length,
          workerId,
          type: data?.type ?? 'UNKNOWN',
          requestId: data?.requestId,
          phase: data?.progress?.phase,
          focus: data?.progress?.currentFocus,
          injected: data?.__phase2k1Injected === true,
        });
        if (data?.type === 'PROGRESS' && data?.progress) {
          state.lastProgress = structuredClone(data.progress);
          if (!state.unknownInjected && data.__phase2k1Injected !== true) {
            state.unknownInjected = true;
            this.dispatchEvent(new MessageEvent('message', {
              data: {
                ...data,
                requestId: 'phase2k1_unknown_request',
                progress: { ...data.progress, currentFocus: 'INJECTED UNKNOWN PROGRESS' },
                __phase2k1Injected: true,
              },
            }));
          }
        }
      });
      super.addEventListener('messageerror', () => { state.messageErrors += 1; });
    }
    postMessage(message, transfer) {
      if (message?.type === 'OPTIMIZE') {
        state.requests.push({
          sequence: state.requests.length,
          workerId: this.__phase2k1WorkerId,
          requestId: message.requestId,
        });
        if (state.swallowNextOptimize) {
          state.swallowNextOptimize = false;
          return;
        }
      }
      return transfer === undefined
        ? super.postMessage(message)
        : super.postMessage(message, transfer);
    }
    terminate() {
      state.terminations.push(this.__phase2k1WorkerId);
      return super.terminate();
    }
  };
  state.injectProgress = (workerId, requestId, focus) => {
    const worker = state.workers.get(workerId);
    const progress = state.lastProgress;
    if (!worker || !progress) return false;
    worker.dispatchEvent(new MessageEvent('message', {
      data: {
        type: 'PROGRESS',
        requestId,
        progress: { ...progress, currentFocus: focus },
        __phase2k1Injected: true,
      },
    }));
    return true;
  };
})()`;

await command('Page.enable');
await command('Runtime.enable');
await command('Page.addScriptToEvaluateOnNewDocument', { source: instrumentation });
await command('Page.navigate', { url: appUrl });

for (let attempt = 0; attempt < 100; attempt++) {
  if (await evaluate<boolean>("document.readyState === 'complete'")) break;
  await sleep(100);
}
requireGate(
  await evaluate<boolean>('Boolean(window.__phase2k1WorkerSmoke)'),
  'Worker instrumentation was not installed'
);

const quickWorkerFixture: OptimizeCraftInput = {
  baseType: 'Medium Cluster Jewel',
  clusterType: '10% increased Damage while affected by a Herald',
  itemLevel: 84,
  passiveCount: 4,
  target: {
    requiredRarity: 'rare',
    requiredMods: [{ modId: 'Empowered Envoy' }, { modId: 'Endbringer' }],
    finalStateConstraints: {},
  },
  prices: {
    currencyRates: { ...PHASE2K1_FROZEN_CURRENCY_RATES },
    cleanBaseCostChaos: 10,
    cleanBasePriceSource: 'manual',
    cleanBasePriceProvenance: 'Phase 2K.1 frozen actual-worker fixture',
  },
  allowResearchFallbackPrices: false,
  searchBudget: { maxStates: 3_000, maxWallTimeMs: 15_000, maxExpansionRounds: 3 },
  searchIntent: 'RECOMMEND',
};
const exactWorkerFixture = createPhase2k1ExactFixture();
const cancelFixture = createPhase2k1ExactFixture();

const harnessExpression = `(() => {
  const exactWorkerFixture = ${JSON.stringify(exactWorkerFixture)};
  const quickWorkerFixture = ${JSON.stringify(quickWorkerFixture)};
  const cancelFixture = ${JSON.stringify(cancelFixture)};
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  return import('/src/crafting/optimizerWorkerClient.ts').then(async ({ OptimizerWorkerClient }) => {
    const state = window.__phase2k1WorkerSmoke;
    const client = new OptimizerWorkerClient();

    const successCallbacks = [];
    const successStarted = performance.now();
    const successResult = await client.optimize(exactWorkerFixture, (progress) => {
      successCallbacks.push(structuredClone(progress));
    });
    const successElapsedMs = performance.now() - successStarted;
    await delay(100);
    const successRequest = state.requests.at(-1);
    const successEvents = state.events.filter((event) =>
      event.requestId === successRequest.requestId && !event.injected
    );
    const successObservedWorkerEvents = state.events.filter((event) =>
      event.workerId === successRequest.workerId && !event.injected
    );
    const successCallbackCountBeforeStale = successCallbacks.length;
    state.injectProgress(
      successRequest.workerId,
      successRequest.requestId,
      'INJECTED STALE POST-RESULT PROGRESS'
    );
    await delay(0);

    let cancelFirstProgressResolve;
    const cancelFirstProgress = new Promise((resolve) => { cancelFirstProgressResolve = resolve; });
    const cancelCallbacks = [];
    const cancelPromise = client.optimize(cancelFixture, (progress) => {
      cancelCallbacks.push(structuredClone(progress));
      cancelFirstProgressResolve();
    });
    await Promise.race([
      cancelFirstProgress,
      delay(5_000).then(() => { throw new Error('Cancel fixture produced no progress'); }),
    ]);
    const cancelRequest = state.requests.at(-1);
    const cancelCallbackCountAtCancel = cancelCallbacks.length;
    client.cancel();
    let cancelError;
    try { await cancelPromise; } catch (error) {
      cancelError = { name: error.name, message: error.message };
    }
    state.injectProgress(
      cancelRequest.workerId,
      cancelRequest.requestId,
      'INJECTED OLD CANCELLED PROGRESS'
    );
    await delay(100);

    state.swallowNextOptimize = true;
    const guardCallbacks = [];
    const guardInput = {
      ...quickWorkerFixture,
      searchBudget: { maxStates: 3_000, maxWallTimeMs: 100, maxExpansionRounds: 3 },
    };
    const guardPromise = client.optimize(guardInput, (progress) => {
      guardCallbacks.push(structuredClone(progress));
    });
    const guardRequest = state.requests.at(-1);
    let guardError;
    try { await guardPromise; } catch (error) {
      guardError = { name: error.name, message: error.message, code: error.code };
    }
    const guardCallbackCountAtReplacement = guardCallbacks.length;
    state.injectProgress(
      guardRequest.workerId,
      guardRequest.requestId,
      'INJECTED OLD HOST-GUARD PROGRESS'
    );
    await delay(100);

    const recoveryCallbacks = [];
    const recoveryResult = await client.optimize(quickWorkerFixture, (progress) => {
      recoveryCallbacks.push(structuredClone(progress));
    });
    const recoveryRequest = state.requests.at(-1);
    await delay(100);

    const latestMetadata = state.workerMetadata.get(state.workerCount);
    const errorWorker = new Worker(latestMetadata.url, latestMetadata.options);
    const errorWorkerId = errorWorker.__phase2k1WorkerId;
    const errorRequestId = 'phase2k1_error_request';
    const errorResponse = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Worker ERROR fixture timed out')), 5_000);
      errorWorker.addEventListener('message', (event) => {
        if (event.data?.requestId !== errorRequestId || event.data?.type !== 'ERROR') return;
        clearTimeout(timeout);
        resolve(structuredClone(event.data));
      });
      errorWorker.postMessage({
        type: 'OPTIMIZE',
        requestId: errorRequestId,
        input: { ...quickWorkerFixture, clusterType: 'NOT A REAL CLUSTER TYPE' },
      });
    });
    await delay(100);
    errorWorker.terminate();

    client.dispose();
    return {
      success: {
        elapsedMs: successElapsedMs,
        request: successRequest,
        events: successEvents,
        observedWorkerEvents: successObservedWorkerEvents,
        callbackPhases: successCallbacks.map((progress) => progress.phase),
        callbackFocuses: successCallbacks.map((progress) => progress.currentFocus),
        callbackCountBeforeStale: successCallbackCountBeforeStale,
        callbackCountAfterStale: successCallbacks.length,
        selected: successResult.recommended?.name,
        selectedAcquisitionMethodId: successResult.recommended?.acquisitionMethodId,
        expectedCostChaos: successResult.expectedCostChaos,
        candidateCount: successResult.acquisition.candidates.length,
        terminalFractureFullRouteCount: successCallbacks.at(-1)?.candidates.filter(
          (candidate) => candidate.kind === 'self-fracture' &&
            candidate.fullRouteUpperBoundChaos !== undefined
        ).length ?? 0,
        structuredCloneSucceeded: Boolean(structuredClone(successResult)),
      },
      cancel: {
        request: cancelRequest,
        error: cancelError,
        callbackCountAtCancel: cancelCallbackCountAtCancel,
        callbackCountAfterInjectedStale: cancelCallbacks.length,
        phases: cancelCallbacks.map((progress) => progress.phase),
        workerTerminated: state.terminations.includes(cancelRequest.workerId),
      },
      guard: {
        request: guardRequest,
        error: guardError,
        callbackCountAtReplacement: guardCallbackCountAtReplacement,
        callbackCountAfterInjectedStale: guardCallbacks.length,
        workerTerminated: state.terminations.includes(guardRequest.workerId),
        recoveryRequest,
        recoveryStatus: recoveryResult.recommendationStatus,
        recoveryLastPhase: recoveryCallbacks.at(-1)?.phase,
      },
      error: {
        workerId: errorWorkerId,
        response: errorResponse,
        events: state.events.filter((event) =>
          event.requestId === errorRequestId && !event.injected
        ),
      },
      unknownInjected: state.unknownInjected,
      messageErrors: state.messageErrors,
      workerCount: state.workerCount,
      terminations: state.terminations,
    };
  });
})()`;

interface BrowserSmokeResult {
  success: {
    elapsedMs: number;
    request: { workerId: number; requestId: string };
    events: Array<{ type: string; requestId: string; phase?: string }>;
    observedWorkerEvents: Array<{ type: string; requestId: string; phase?: string }>;
    callbackPhases: string[];
    callbackFocuses: string[];
    callbackCountBeforeStale: number;
    callbackCountAfterStale: number;
    selected?: string;
    selectedAcquisitionMethodId?: string;
    expectedCostChaos?: number;
    candidateCount: number;
    terminalFractureFullRouteCount: number;
    structuredCloneSucceeded: boolean;
  };
  cancel: {
    request: { workerId: number; requestId: string };
    error?: { name: string; message: string };
    callbackCountAtCancel: number;
    callbackCountAfterInjectedStale: number;
    phases: string[];
    workerTerminated: boolean;
  };
  guard: {
    request: { workerId: number; requestId: string };
    error?: { name: string; message: string; code?: string };
    callbackCountAtReplacement: number;
    callbackCountAfterInjectedStale: number;
    workerTerminated: boolean;
    recoveryRequest: { workerId: number; requestId: string };
    recoveryStatus: string;
    recoveryLastPhase?: string;
  };
  error: {
    workerId: number;
    response: { type: string; requestId: string; error: { name: string; message: string } };
    events: Array<{ type: string; requestId: string; phase?: string }>;
  };
  unknownInjected: boolean;
  messageErrors: number;
  workerCount: number;
  terminations: number[];
}

console.error('[browser-phase2k-smoke] actual browser Worker / client boundary');
const smoke = await evaluate<BrowserSmokeResult>(harnessExpression);

const resultIndex = smoke.success.events.findIndex((event) => event.type === 'RESULT');
const lastProgressBeforeResult = smoke.success.events
  .slice(0, resultIndex)
  .filter((event) => event.type === 'PROGRESS')
  .at(-1);
const actualProgressAfterResult = smoke.success.events
  .slice(resultIndex + 1)
  .some((event) => event.type === 'PROGRESS');
const errorIndex = smoke.error.events.findIndex((event) => event.type === 'ERROR');
const completeBeforeError = smoke.error.events
  .slice(0, errorIndex)
  .some((event) => event.type === 'PROGRESS' && event.phase === 'COMPLETE');
const progressAfterError = smoke.error.events
  .slice(errorIndex + 1)
  .some((event) => event.type === 'PROGRESS');

requireGate(resultIndex > 0, 'K3 actual Worker did not deliver RESULT after progress');
requireGate(lastProgressBeforeResult?.phase === 'COMPLETE', 'K4 last PROGRESS before RESULT was not COMPLETE');
requireGate(!actualProgressAfterResult, 'K3 actual progress arrived after terminal RESULT');
requireGate(
  smoke.success.observedWorkerEvents.length === smoke.success.events.length &&
    smoke.success.observedWorkerEvents.every(
      (event) => event.requestId === smoke.success.request.requestId
    ),
  'K3 actual Worker response requestId routing failed'
);
requireGate(
  smoke.success.candidateCount === 5 && smoke.success.terminalFractureFullRouteCount > 0,
  'K3 actual Worker success did not carry the exact five-candidate fracture portfolio'
);
requireGate(smoke.success.structuredCloneSucceeded && smoke.messageErrors === 0, 'K3 structured clone failed');
requireGate(
  smoke.unknownInjected &&
    !smoke.success.callbackFocuses.includes('INJECTED UNKNOWN PROGRESS') &&
    smoke.success.callbackCountAfterStale === smoke.success.callbackCountBeforeStale,
  'K3 unknown or stale progress mutated the client callback state'
);
requireGate(
  smoke.cancel.error?.name === 'AbortError' &&
    smoke.cancel.workerTerminated &&
    smoke.cancel.callbackCountAfterInjectedStale === smoke.cancel.callbackCountAtCancel &&
    !smoke.cancel.phases.includes('COMPLETE'),
  'K3 Cancel did not terminate/replace cleanly or accepted old progress'
);
requireGate(
  smoke.guard.error?.name === 'SearchWallTimeExceededError' &&
    smoke.guard.workerTerminated &&
    smoke.guard.callbackCountAfterInjectedStale === smoke.guard.callbackCountAtReplacement &&
    smoke.guard.recoveryLastPhase === 'COMPLETE',
  'K3 host guard did not replace/recover cleanly or accepted old progress'
);
requireGate(
  smoke.error.response.type === 'ERROR' &&
    smoke.error.response.requestId === 'phase2k1_error_request' &&
    !completeBeforeError &&
    !progressAfterError,
  'K3 ERROR terminal-message hygiene failed'
);

const lines = [
  'PHASE 2K.1 — ACTUAL BROWSER WORKER-BOUNDARY SMOKE',
  `URL: ${appUrl}`,
  '',
  'K3/K4 REAL OptimizerWorkerClient -> optimizer.worker.ts MESSAGE ORDER',
  `  request=${smoke.success.request.requestId}; worker=${smoke.success.request.workerId}; elapsed=${smoke.success.elapsedMs.toFixed(3)}ms`,
  `  sequence=${smoke.success.events.map((event) => event.type === 'PROGRESS' ? `PROGRESS:${event.phase}` : event.type).join(' -> ')}`,
  `  last PROGRESS before RESULT=${lastProgressBeforeResult?.phase}; progress after RESULT=${actualProgressAfterResult}; selected=${smoke.success.selected}; U=${smoke.success.expectedCostChaos?.toFixed(6)}c`,
  `  exact fixture candidates=${smoke.success.candidateCount}; executable fracture full routes in terminal progress=${smoke.success.terminalFractureFullRouteCount}; selected acquisition=${smoke.success.selectedAcquisitionMethodId}`,
  `  requestId routing=PASS over ${smoke.success.observedWorkerEvents.length} unfiltered actual-worker events; structured clone=PASS; messageerror count=${smoke.messageErrors}`,
  '  unknown request progress ignored=PASS; stale post-RESULT progress ignored=PASS',
  '',
  'CANCEL / HOST-GUARD / ERROR HYGIENE',
  `  Cancel: error=${smoke.cancel.error?.name}; workerTerminated=${smoke.cancel.workerTerminated}; callbacks at cancel/after stale=${smoke.cancel.callbackCountAtCancel}/${smoke.cancel.callbackCountAfterInjectedStale}; COMPLETE synthesized=${smoke.cancel.phases.includes('COMPLETE')}`,
  `  Host guard: error=${smoke.guard.error?.name}; workerTerminated=${smoke.guard.workerTerminated}; callbacks at replacement/after stale=${smoke.guard.callbackCountAtReplacement}/${smoke.guard.callbackCountAfterInjectedStale}; recovery=${smoke.guard.recoveryStatus}/${smoke.guard.recoveryLastPhase}`,
  `  ERROR: type=${smoke.error.response.type}; request=${smoke.error.response.requestId}; name=${smoke.error.response.error.name}; COMPLETE before ERROR=${completeBeforeError}; progress after ERROR=${progressAfterError}`,
  `  workers created=${smoke.workerCount}; terminated worker IDs=${JSON.stringify(smoke.terminations)}`,
  '',
  'ALL PHASE 2K.1 ACTUAL WORKER-BOUNDARY GATES: PASS',
  'Direct executeOptimizerWorkerRequest smoke substitution: NO',
  'Unit tests run: NO',
];

writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
console.log(lines.join('\n'));
socket.close();
