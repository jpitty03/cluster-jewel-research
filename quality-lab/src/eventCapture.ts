/**
 * Installed before application JavaScript. It observes the real module Worker
 * boundary without requiring any hook in production code.
 */
export const WORKER_CAPTURE_INIT_SCRIPT = String.raw`
(() => {
  const events = [];
  const clone = (value) => {
    try { return JSON.parse(JSON.stringify(value)); }
    catch { return { uncloneable: true, text: String(value) }; }
  };
  const compactRoute = (route) => route && ({
    actionId: route.actionId,
    actionName: route.actionName,
    acquisitionCandidateId: route.acquisitionCandidateId,
    acquisitionMethodId: route.acquisitionMethodId,
    expectedTotalCostChaos: route.expectedTotalCostChaos,
    incumbentUpperBoundChaos: route.incumbentUpperBoundChaos,
    metrics: route.metrics,
  });
  const compactHarvestComparison = (comparison) => comparison && ({
    ...comparison,
    conventionalRoute: compactRoute(comparison.conventionalRoute),
    harvestRoute: compactRoute(comparison.harvestRoute),
  });
  const compactResult = (result) => result && ({
    target: result.target,
    recommendationStatus: result.recommendationStatus,
    recommended: compactRoute(result.recommended),
    expectedCostChaos: result.expectedCostChaos,
    alternatives: (result.alternatives ?? []).map(compactRoute),
    expectedActionUsage: result.expectedActionUsage,
    presentation: result.presentation,
    internalConsistency: result.internalConsistency,
    fullRouteUsage: result.fullRouteUsage,
    expectedCurrencies: result.expectedCurrencies,
    harvestComparison: compactHarvestComparison(result.harvestComparison),
    methodPortfolio: (result.methodPortfolio ?? []).map((family) => ({
      id: family.spec?.id,
      kind: family.spec?.kind,
      spec: family.spec && { id: family.spec.id, kind: family.spec.kind },
      status: family.status,
      objectiveEligibility: family.objectiveEligibility,
      evaluationSource: family.evaluationSource,
      acquisitionStatus: family.acquisitionStatus,
      downstreamStatus: family.downstreamStatus,
      fullRouteStatus: family.fullRouteStatus,
      fullRouteL: family.fullRouteL,
      fullRouteU: family.fullRouteU,
      route: compactRoute(family.route),
      requiredActionObservedOnPolicy: family.requiredActionObservedOnPolicy,
      onPolicyActionIds: family.onPolicyActionIds,
      expectedActionUsage: family.expectedActionUsage,
      policyHealth: family.policyHealth,
      repeatableRerollCertification: family.repeatableRerollCertification,
      retainedStates: family.retainedStates,
      budget: family.budget,
    })),
    paretoAlternatives: (result.paretoAlternatives ?? []).map((entry) => ({
      ...entry,
      route: compactRoute(entry.route),
    })),
    objective: result.objective,
    objectiveProofStatus: result.objectiveProofStatus,
    costCeilingChaos: result.costCeilingChaos,
    craftPlan: result.craftPlan,
    proof: result.proof,
    risk: result.risk,
    solver: result.solver && {
      searchStatus: result.solver.searchStatus,
      optimalityProof: result.solver.optimalityProof,
      diagnostics: result.solver.diagnostics,
    },
    policyRefinement: result.policyRefinement,
    search: result.search,
  });
  const compactCompletedResults = () => {
    for (const event of events) {
      if (event.kind !== 'MESSAGE_FROM_WORKER' || event.payload?.type !== 'RESULT') continue;
      if (event.payload.__qualityLabCompacted === true) continue;
      event.payload = {
        type: event.payload.type,
        requestId: event.payload.requestId,
        result: compactResult(event.payload.result),
        __qualityLabCompacted: true,
      };
    }
  };
  const record = (kind, detail = {}) => {
    events.push({
      sequence: events.length + 1,
      kind,
      elapsedMs: Math.round(performance.now() * 1000) / 1000,
      ...clone(detail),
    });
  };
  Object.defineProperty(window, '__QUALITY_LAB_EVENTS__', {
    configurable: false,
    enumerable: false,
    value: events,
    writable: false,
  });
  Object.defineProperty(window, '__QUALITY_LAB_COMPACT_WORKER_EVENTS__', {
    configurable: false,
    enumerable: false,
    value: compactCompletedResults,
    writable: false,
  });

  const NativeWorker = window.Worker;
  window.Worker = new Proxy(NativeWorker, {
    construct(Target, argumentsList, NewTarget) {
      const worker = Reflect.construct(Target, argumentsList, NewTarget);
      const scriptUrl = String(argumentsList[0]);
      const options = clone(argumentsList[1]);
      record('WORKER_SPAWN', { scriptUrl, options });

      const nativePostMessage = worker.postMessage.bind(worker);
      worker.postMessage = (...args) => {
        // Keep only one full terminal result in memory. The browser gates consume
        // that current result directly; older entries retain bounded protocol and
        // reconciliation evidence instead of multi-megabyte policy graphs.
        compactCompletedResults();
        record('POST_MESSAGE_TO_WORKER', { scriptUrl, payload: clone(args[0]) });
        return nativePostMessage(...args);
      };
      const nativeTerminate = worker.terminate.bind(worker);
      worker.terminate = () => {
        record('WORKER_TERMINATE', { scriptUrl });
        return nativeTerminate();
      };
      worker.addEventListener('message', (event) => {
        record('MESSAGE_FROM_WORKER', { scriptUrl, payload: clone(event.data) });
      });
      worker.addEventListener('error', (event) => {
        record('WORKER_RUNTIME_ERROR', { scriptUrl, message: event.message });
      });
      worker.addEventListener('messageerror', () => {
        record('WORKER_MESSAGE_ERROR', { scriptUrl });
      });
      return worker;
    },
  });
})();
`;

export interface CapturedWorkerEvent {
  sequence: number;
  kind: string;
  elapsedMs: number;
  scriptUrl?: string;
  payload?: Record<string, unknown>;
  message?: string;
}
