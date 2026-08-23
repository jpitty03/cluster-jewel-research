import type {
  OptimizeCraftInput,
  OptimizeCraftResult,
} from '../../crafting-engine/src/service/optimizerService.ts';

export interface OptimizerWorkerRequest {
  type: 'OPTIMIZE';
  requestId: string;
  input: OptimizeCraftInput;
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
  | OptimizerWorkerResultResponse
  | OptimizerWorkerErrorResponse;

export function isOptimizerWorkerResponse(value: unknown): value is OptimizerWorkerResponse {
  if (typeof value !== 'object' || value === null) return false;
  const response = value as Partial<OptimizerWorkerResponse>;
  return typeof response.requestId === 'string' &&
    (response.type === 'RESULT' || response.type === 'ERROR');
}
