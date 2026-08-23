import type { OptimizeCraftInput, OptimizeCraftResult } from '../../crafting-engine/src/service/optimizerService.ts';
import {
  isOptimizerWorkerResponse,
  type OptimizerWorkerRequest,
} from './optimizerWorkerProtocol.ts';

interface PendingRequest {
  resolve: (result: OptimizeCraftResult) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

export const SEARCH_WALL_TIME_GRACE_MS = 250;

export class SearchWallTimeExceededError extends Error {
  readonly code = 'SEARCH_WALL_TIME_EXCEEDED';
  readonly budgetMs: number;

  constructor(budgetMs: number) {
    super(`Search exceeded the configured ${budgetMs} ms wall-time budget`);
    this.name = 'SearchWallTimeExceededError';
    this.budgetMs = budgetMs;
  }
}

function cancellationError(): Error {
  const error = new Error('Optimization cancelled');
  error.name = 'AbortError';
  return error;
}

export class OptimizerWorkerClient {
  private worker: Worker;
  private nextRequestId = 1;
  private readonly pending = new Map<string, PendingRequest>();

  constructor() {
    this.worker = this.createWorker();
  }

  optimize(input: OptimizeCraftInput): Promise<OptimizeCraftResult> {
    const requestId = `optimizer_${this.nextRequestId++}`;
    const request: OptimizerWorkerRequest = { type: 'OPTIMIZE', requestId, input };
    const budgetMs = Math.max(1, input.searchBudget?.maxWallTimeMs ?? 30_000);
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        if (!this.pending.has(requestId)) return;
        this.replaceWorker(new SearchWallTimeExceededError(budgetMs));
      }, budgetMs + SEARCH_WALL_TIME_GRACE_MS);
      this.pending.set(requestId, { resolve, reject, timeoutId });
      this.worker.postMessage(request);
    });
  }

  /** A synchronous Bellman solve is cancelled by terminating and recreating its worker. */
  cancel(): void {
    if (this.pending.size === 0) return;
    this.replaceWorker(cancellationError());
  }

  dispose(): void {
    this.worker.terminate();
    const error = cancellationError();
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeoutId);
      pending.reject(error);
    }
    this.pending.clear();
  }

  private createWorker(): Worker {
    const worker = new Worker(new URL('./optimizer.worker.ts', import.meta.url), { type: 'module' });
    worker.addEventListener('message', (event: MessageEvent<unknown>) => {
      if (!isOptimizerWorkerResponse(event.data)) return;
      const pending = this.pending.get(event.data.requestId);
      if (!pending) return;
      this.pending.delete(event.data.requestId);
      clearTimeout(pending.timeoutId);
      if (event.data.type === 'RESULT') pending.resolve(event.data.result);
      else pending.reject(Object.assign(new Error(event.data.error.message), { name: event.data.error.name }));
    });
    worker.addEventListener('error', (event) => {
      this.replaceWorker(new Error(event.message || 'Optimizer worker failed'));
    });
    worker.addEventListener('messageerror', () => {
      this.replaceWorker(new Error('Optimizer worker returned a non-serializable response'));
    });
    return worker;
  }

  private replaceWorker(error: Error): void {
    this.worker.terminate();
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeoutId);
      pending.reject(error);
    }
    this.pending.clear();
    this.worker = this.createWorker();
  }
}
