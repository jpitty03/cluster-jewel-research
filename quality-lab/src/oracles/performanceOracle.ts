/**
 * Performance Oracle for Quality Lab.
 * Asserts solver completion speed, worker round-trip latency, and UI responsiveness.
 */

export interface PerformanceCheckResult {
  passed: boolean;
  oracle: 'PERFORMANCE';
  gate: string;
  durationMs: number;
  details: string;
}

export class PerformanceOracle {
  static verifyTiming(durationMs: number, maxAllowedMs: number, operationName: string): PerformanceCheckResult[] {
    const checks: PerformanceCheckResult[] = [];
    const withinBudget = durationMs <= maxAllowedMs;

    checks.push({
      passed: withinBudget,
      oracle: 'PERFORMANCE',
      gate: `${operationName.toUpperCase()}_LATENCY`,
      durationMs,
      details: withinBudget
        ? `${operationName} completed in ${durationMs.toFixed(1)}ms (budget: ${maxAllowedMs}ms)`
        : `${operationName} exceeded target budget: ${durationMs.toFixed(1)}ms > ${maxAllowedMs}ms`,
    });

    return checks;
  }
}
