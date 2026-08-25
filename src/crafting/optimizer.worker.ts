/// <reference lib="webworker" />

import { executeOptimizerWorkerRequest } from './optimizerWorkerEngine.ts';
import type { OptimizerWorkerRequest } from './optimizerWorkerProtocol.ts';

const workerScope = self as DedicatedWorkerGlobalScope;

workerScope.addEventListener('message', (event: MessageEvent<OptimizerWorkerRequest>) => {
  if (event.data?.type !== 'OPTIMIZE') return;
  const requestId = event.data.requestId;
  const response = executeOptimizerWorkerRequest(event.data, (progress) => {
    workerScope.postMessage({
      type: 'PROGRESS',
      requestId,
      progress,
    });
  });
  if (response.type === 'RESULT') {
    workerScope.postMessage({
      type: 'COMPLETE',
      requestId,
      completion: {
        recommendationStatus: response.result.recommendationStatus,
        selectedRouteName: response.result.presentation.selectedRouteName,
      },
    });
  }
  workerScope.postMessage(response);
});
export {};
