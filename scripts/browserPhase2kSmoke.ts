import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { executeOptimizerWorkerRequest } from '../src/crafting/optimizerWorkerEngine.ts';
import { getSearchRuntimeBudget } from '../crafting-engine/src/service/searchRuntime.ts';
import type {
  OptimizeCraftInput,
  OptimizeCraftResult,
  OptimizerProgressSnapshot,
} from '../crafting-engine/src/service/optimizerService.ts';

const outputPath = fileURLToPath(new URL('../output-browser-phase2k-smoke.txt', import.meta.url));

function finite(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? 'NONE'
    : `${value.toFixed(6)}c`;
}

function health(result: OptimizeCraftResult): string {
  return [
    `proper=${result.risk.selectedPolicyProper}`,
    `absorption=${result.risk.terminalAbsorptionProbability.toFixed(12)}`,
    `Bellman=${result.solver.bellmanConverged}`,
    `occupancy=${result.solver.occupancyConverged}`,
    `reconciled=${result.solver.costReconciled}`,
    `unresolvedOnPolicy=${result.risk.unresolvedOnPolicyProbability.toExponential(3)}`,
  ].join('; ');
}

function runSimulatedWorker(
  requestId: string,
  input: OptimizeCraftInput
): {
  result: OptimizeCraftResult;
  elapsedMs: number;
  hostGuardDeadlineMs: number;
  progressHistory: OptimizerProgressSnapshot[];
} {
  const budget = getSearchRuntimeBudget(input.searchBudget?.maxWallTimeMs);
  const progressHistory: OptimizerProgressSnapshot[] = [];
  const started = Date.now();
  const rawResponse = executeOptimizerWorkerRequest(
    {
      type: 'OPTIMIZE',
      requestId,
      input,
    },
    (progress) => {
      progressHistory.push(JSON.parse(JSON.stringify(progress)));
    }
  );
  const elapsedMs = Date.now() - started;
  if (rawResponse.type === 'ERROR') {
    throw new Error(`Worker error in ${requestId}: ${rawResponse.error.message}`);
  }
  if (elapsedMs > budget.hostGuardDeadlineMs) {
    throw new Error(`Worker execution exceeded host guard deadline: ${elapsedMs}ms > ${budget.hostGuardDeadlineMs}ms`);
  }
  const serialized = JSON.stringify(rawResponse);
  const deserialized = JSON.parse(serialized);
  return {
    result: deserialized.result,
    elapsedMs,
    hostGuardDeadlineMs: budget.hostGuardDeadlineMs,
    progressHistory,
  };
}

const lines: string[] = [
  'PHASE 2K — PRODUCTION BROWSER / WORKER SMOKE & VALIDATION REPORT',
  'Validation of Phase 2K multi-tranche resumable self-fracture acquisition, full-route ranking against clean incumbent, and live progress telemetry.',
  '',
];

console.error('[browser-phase2k-smoke] 1. Four-Mod Real World Fixture with Live Telemetry');
const fourModInput: OptimizeCraftInput = {
  baseType: 'Large Cluster Jewel',
  clusterType: '12% increased Attack Damage while Dual Wielding',
  itemLevel: 84,
  passiveCount: 8,
  target: {
    requiredMods: [
      { modId: 'AfflictionJewelSmallPassivesGrantInt3' },
      { modId: 'AfflictionJewelSmallPassivesHaveIncreasedEffect2' },
      { modId: 'AfflictionJewelSmallPassivesGrantAttributes3' },
      { modId: 'AfflictionJewelSmallPassivesGrantES3' },
    ],
    finalStateConstraints: { maxUnmatchedAffixes: 0 },
  },
  searchBudget: { maxStates: 5_000, maxWallTimeMs: 25_000, maxExpansionRounds: 3 },
  searchIntent: 'RECOMMEND',
};

const fourMod1 = runSimulatedWorker('four-mod-recommend', fourModInput);
lines.push(
  '--- 1. FOUR-MOD REAL WORLD FIXTURE ---',
  `Request elapsed: ${fourMod1.elapsedMs}ms (host guard: ${fourMod1.hostGuardDeadlineMs}ms)`,
  `Recommendation status: ${fourMod1.result.recommendationStatus}`,
  `Recommended start: ${fourMod1.result.recommended?.name}`,
  `Recommended expected cost: ${finite(fourMod1.result.expectedCostChaos)}`,
  `Health: ${health(fourMod1.result)}`,
  `Telemetry snapshots captured: ${fourMod1.progressHistory.length}`,
  `Final progress phase: ${fourMod1.progressHistory.at(-1)?.phase}`,
  `Final progress candidates: ${fourMod1.progressHistory.at(-1)?.candidates.map((c) => `${c.label} (${c.status})`).join(', ')}`,
  `Recent milestones: ${JSON.stringify(fourMod1.progressHistory.at(-1)?.recentMilestones)}`,
  ''
);

console.error('[browser-phase2k-smoke] 2. Same-Worker Retry Deeper Continuation Retention');
const deeperInput: OptimizeCraftInput = {
  ...fourModInput,
  searchBudget: { maxStates: 10_000, maxWallTimeMs: 25_000, maxExpansionRounds: 4 },
  searchIntent: 'DEEPEN',
};

const fourMod2 = runSimulatedWorker('four-mod-deepen', deeperInput);
lines.push(
  '--- 2. SAME-WORKER RETRY DEEPER CONTINUATION RETENTION ---',
  `Request elapsed: ${fourMod2.elapsedMs}ms (host guard: ${fourMod2.hostGuardDeadlineMs}ms)`,
  `Session reuse status: ${fourMod2.result.search.sessionReuse.status}`,
  `Retained states from prior request: ${fourMod2.result.search.sessionReuse.retainedStates}`,
  `Recommended expected cost: ${finite(fourMod2.result.expectedCostChaos)}`,
  `Health: ${health(fourMod2.result)}`,
  ''
);

console.error('[browser-phase2k-smoke] 3. Control Fixture: Clean-Dominance Optimization');
const controlInput: OptimizeCraftInput = {
  baseType: 'Medium Cluster Jewel',
  clusterType: '10% increased Damage while affected by a Herald',
  itemLevel: 84,
  passiveCount: 4,
  target: {
    requiredMods: [
      { modId: 'Endbringer' },
    ],
    finalStateConstraints: { maxUnmatchedAffixes: 0 },
  },
  searchBudget: { maxStates: 3_000, maxWallTimeMs: 10_000, maxExpansionRounds: 2 },
  searchIntent: 'RECOMMEND',
};

const control1 = runSimulatedWorker('control-clean-dominance', controlInput);
lines.push(
  '--- 3. CONTROL FIXTURE: CLEAN-DOMINANCE OPTIMIZATION ---',
  `Request elapsed: ${control1.elapsedMs}ms (host guard: ${control1.hostGuardDeadlineMs}ms)`,
  `Acquisition stage mode: ${control1.result.acquisition.stage.mode}`,
  `Recommended start: ${control1.result.recommended?.name}`,
  `Recommended expected cost: ${finite(control1.result.expectedCostChaos)}`,
  `Health: ${health(control1.result)}`,
  ''
);

writeFileSync(outputPath, lines.join('\n'), 'utf8');
console.error(`[browser-phase2k-smoke] Written to ${outputPath}`);
