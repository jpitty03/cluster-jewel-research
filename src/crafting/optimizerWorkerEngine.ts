import { createBrowserOptimizerService } from './browserEngine.ts';
import type {
  OptimizerProgressSnapshot,
  OptimizerWorkerRequest,
  OptimizerWorkerResponse,
} from './optimizerWorkerProtocol.ts';

// Module initialization happens once per worker lifetime and repository caches
// are reused across requests until cancellation deliberately replaces the worker.
const optimizer = createBrowserOptimizerService();

export function executeOptimizerWorkerRequest(
  request: OptimizerWorkerRequest,
  onProgress?: (progress: OptimizerProgressSnapshot) => void
): OptimizerWorkerResponse {
  try {
    return {
      type: 'RESULT',
      requestId: request.requestId,
      result: optimizer.optimize(request.input, onProgress),
    };
  } catch (error) {
    return {
      type: 'ERROR',
      requestId: request.requestId,
      error: {
        name: error instanceof Error ? error.name : 'Error',
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
