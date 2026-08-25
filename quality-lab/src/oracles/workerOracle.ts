/**
 * Worker Oracle for Quality Lab.
 * Inspects captured Worker event telemetry to verify monotonicity, progress cadence,
 * and clean task completion.
 */

import type { CapturedWorkerEvent } from '../eventCapture.ts';

export interface WorkerCheckResult {
  passed: boolean;
  oracle: 'WORKER';
  gate: string;
  details: string;
}

export class WorkerOracle {
  static verifyEventStream(events: CapturedWorkerEvent[]): WorkerCheckResult[] {
    const checks: WorkerCheckResult[] = [];

    // 1. Worker Lifecycle
    const hasSpawn = events.some((e) => e.type === 'WORKER_SPAWN');
    const hasRequest = events.some((e) => e.type === 'POST_MESSAGE_TO_WORKER' && e.payload?.type === 'OPTIMIZE_REQUEST');
    const hasResult = events.some((e) => e.type === 'MESSAGE_FROM_WORKER' && e.payload?.type === 'RESULT');
    const hasErrors = events.some((e) => e.type === 'WORKER_ERROR' || (e.type === 'MESSAGE_FROM_WORKER' && e.payload?.type === 'ERROR'));

    checks.push({
      passed: hasSpawn,
      oracle: 'WORKER',
      gate: 'WORKER_SPAWN_DETECTED',
      details: hasSpawn ? 'Dedicated solver Web Worker was spawned successfully' : 'No Worker spawn detected',
    });

    checks.push({
      passed: hasRequest,
      oracle: 'WORKER',
      gate: 'WORKER_REQUEST_DISPATCHED',
      details: hasRequest ? 'Solver optimization request was dispatched' : 'No optimization request found',
    });

    checks.push({
      passed: hasResult,
      oracle: 'WORKER',
      gate: 'WORKER_RESULT_RECEIVED',
      details: hasResult ? 'Solver RESULT payload returned from worker' : 'Worker RESULT payload missing',
    });

    checks.push({
      passed: !hasErrors,
      oracle: 'WORKER',
      gate: 'ZERO_WORKER_EXCEPTIONS',
      details: !hasErrors ? 'No uncaught worker exceptions encountered' : 'Worker error events were recorded',
    });

    // 2. Progress Monotonicity
    const progressEvents = events
      .filter((e) => e.type === 'MESSAGE_FROM_WORKER' && e.payload?.type === 'PROGRESS')
      .map((e) => e.payload.snapshot);

    if (progressEvents.length > 1) {
      let monotonicStates = true;
      let monotonicElapsed = true;

      for (let i = 1; i < progressEvents.length; i++) {
        const prev = progressEvents[i - 1];
        const curr = progressEvents[i];
        if (curr.expandedStates < prev.expandedStates) monotonicStates = false;
        if (curr.elapsedWallTimeMs < prev.elapsedWallTimeMs) monotonicElapsed = false;
      }

      checks.push({
        passed: monotonicStates,
        oracle: 'WORKER',
        gate: 'PROGRESS_STATES_MONOTONIC',
        details: monotonicStates
          ? `Expanded state counts monotonically non-decreasing across ${progressEvents.length} progress events`
          : 'Expanded state count decreased between progress updates',
      });

      checks.push({
        passed: monotonicElapsed,
        oracle: 'WORKER',
        gate: 'PROGRESS_TIME_MONOTONIC',
        details: monotonicElapsed
          ? `Elapsed wall time monotonically non-decreasing`
          : 'Elapsed wall time decreased between progress updates',
      });
    }

    return checks;
  }
}
