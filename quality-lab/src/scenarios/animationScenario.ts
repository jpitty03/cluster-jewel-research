import {
  buildVisualizationGraph,
  type VisualizationWisp,
} from '../../../crafting-engine/src/domain/VisualizationGraph.ts';
import { AnimationOracle, type AnimationCheckResult } from '../oracles/animationOracle.ts';
import { PerformanceOracle, type PerformanceCheckResult } from '../oracles/performanceOracle.ts';

export interface AnimationScenarioResult {
  scenarioName: string;
  passed: boolean;
  durationMs: number;
  checks: Array<AnimationCheckResult | PerformanceCheckResult>;
}

export async function runAnimationScenario(_appUrl: string): Promise<AnimationScenarioResult> {
  const startT = performance.now();
  const checks: Array<AnimationCheckResult | PerformanceCheckResult> = [];

  // Mock craft plan & portfolio for scenario testing
  const mockPlan = {
    steps: [
      {
        id: 'step_1',
        title: 'Transmute and Alteration',
        instruction: 'Roll magic base until desired mod appears.',
        actionIds: ['transmutation_orb', 'alteration_orb'],
        actionNames: ['Orb of Transmutation', 'Orb of Alteration'],
        decisionDetails: [],
      },
    ],
    status: 'CERTIFIED' as const,
    summary: 'Mock certified craft plan',
  };

  const mockPortfolio = [
    {
      spec: { id: 'f_open', kind: 'OPEN' as const, name: 'Open Policy', badge: 'Recommended' },
      status: 'SELECTED_WINNER' as const,
    },
    {
      spec: { id: 'f_fracture', kind: 'SELF_FRACTURE' as const, name: 'Self-Fracture', badge: 'Fracture' },
      status: 'DOMINATED' as const,
    },
  ];

  // 1. Build graph & verify determinism
  const graphA = buildVisualizationGraph(mockPlan, mockPortfolio, undefined, { seed: 'test_seed' });
  const graphB = buildVisualizationGraph(mockPlan, mockPortfolio, undefined, { seed: 'test_seed' });

  checks.push(...AnimationOracle.verifyDeterminism(graphA, graphB));

  // 2. Verify visual hierarchy
  checks.push(...AnimationOracle.verifyVisualHierarchy(graphA));

  // 3. Verify wisp topology
  const simulatedWisps: VisualizationWisp[] = graphA.edges.map((edge, i) => ({
    id: `wisp_${i}`,
    edgeId: edge.id,
    sourceNodeId: edge.source,
    targetNodeId: edge.target,
    progress: (i * 0.25) % 1.0,
    speed: 0.001,
    size: 3,
    opacity: 0.9,
    color: '#38bdf8',
  }));

  checks.push(...AnimationOracle.verifyWispTopology(graphA, simulatedWisps));

  const durationMs = performance.now() - startT;
  checks.push(...PerformanceOracle.verifyTiming(durationMs, 2000, 'Animation Scenario'));

  return {
    scenarioName: 'Markov Constellation & Animation Scenario',
    passed: checks.every((c) => c.passed),
    durationMs,
    checks,
  };
}
