/**
 * Transparent Worker Event Interception Script for Quality Lab.
 * Injected into browser contexts via page.addInitScript to capture worker messages
 * without modifying any production application source code.
 */

export const WORKER_CAPTURE_INIT_SCRIPT = `
(() => {
  window.__QUALITY_LAB_EVENTS__ = window.__QUALITY_LAB_EVENTS__ || [];
  const OriginalWorker = window.Worker;

  window.Worker = function(scriptURL, options) {
    const worker = new OriginalWorker(scriptURL, options);
    const workerId = 'worker_' + Math.random().toString(36).slice(2, 8);

    window.__QUALITY_LAB_EVENTS__.push({
      timestamp: Date.now(),
      workerId,
      type: 'WORKER_SPAWN',
      scriptURL: String(scriptURL),
    });

    const origPostMessage = worker.postMessage.bind(worker);
    worker.postMessage = function(message, transfer) {
      window.__QUALITY_LAB_EVENTS__.push({
        timestamp: Date.now(),
        workerId,
        type: 'POST_MESSAGE_TO_WORKER',
        payload: typeof message === 'object' ? JSON.parse(JSON.stringify(message)) : message,
      });
      return origPostMessage(message, transfer);
    };

    worker.addEventListener('message', (event) => {
      window.__QUALITY_LAB_EVENTS__.push({
        timestamp: Date.now(),
        workerId,
        type: 'MESSAGE_FROM_WORKER',
        payload: typeof event.data === 'object' ? JSON.parse(JSON.stringify(event.data)) : event.data,
      });
    });

    worker.addEventListener('error', (error) => {
      window.__QUALITY_LAB_EVENTS__.push({
        timestamp: Date.now(),
        workerId,
        type: 'WORKER_ERROR',
        message: error.message,
      });
    });

    return worker;
  };
})();
`;

export interface CapturedWorkerEvent {
  timestamp: number;
  workerId: string;
  type: 'WORKER_SPAWN' | 'POST_MESSAGE_TO_WORKER' | 'MESSAGE_FROM_WORKER' | 'WORKER_ERROR';
  scriptURL?: string;
  payload?: any;
  message?: string;
}
