/// <reference lib="webworker" />

import { executeOptimizerWorkerRequest } from './optimizerWorkerEngine.ts';
import type { OptimizerWorkerRequest } from './optimizerWorkerProtocol.ts';

const workerScope = self as DedicatedWorkerGlobalScope;

workerScope.addEventListener('message', (event: MessageEvent<OptimizerWorkerRequest>) => {
  if (event.data?.type !== 'OPTIMIZE') return;
  workerScope.postMessage(executeOptimizerWorkerRequest(event.data));
});

export {};
