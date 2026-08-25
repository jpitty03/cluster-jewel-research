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

  const NativeWorker = window.Worker;
  window.Worker = new Proxy(NativeWorker, {
    construct(Target, argumentsList, NewTarget) {
      const worker = Reflect.construct(Target, argumentsList, NewTarget);
      const scriptUrl = String(argumentsList[0]);
      const options = clone(argumentsList[1]);
      record('WORKER_SPAWN', { scriptUrl, options });

      const nativePostMessage = worker.postMessage.bind(worker);
      worker.postMessage = (...args) => {
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
