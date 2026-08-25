import type {
  OptimizeCraftInput,
  OptimizeCraftResult,
  OptimizerProgressSnapshot,
  OptimizerProgressCandidate,
} from '../../crafting-engine/src/service/optimizerService.ts';

export type { OptimizerProgressSnapshot, OptimizerProgressCandidate };

export interface OptimizerWorkerRequest {
  type: 'OPTIMIZE';
  requestId: string;
  input: OptimizeCraftInput;
}

export interface OptimizerWorkerProgressResponse {
  type: 'PROGRESS';
  requestId: string;
  progress: OptimizerProgressSnapshot;
}

export interface OptimizerWorkerResultResponse {
  type: 'RESULT';
  requestId: string;
  result: OptimizeCraftResult;
}

export interface OptimizerWorkerErrorResponse {
  type: 'ERROR';
  requestId: string;
  error: {
    name: string;
    message: string;
  };
}

export type OptimizerWorkerResponse =
  | OptimizerWorkerProgressResponse
  | OptimizerWorkerResultResponse
  | OptimizerWorkerErrorResponse;

export function isOptimizerWorkerResponse(value: unknown): value is OptimizerWorkerResponse {
  if (typeof value !== 'object' || value === null) return false;
  const response = value as Partial<OptimizerWorkerResponse>;
  return typeof response.requestId === 'string' &&
    (response.type === 'PROGRESS' || response.type === 'RESULT' || response.type === 'ERROR');
}
