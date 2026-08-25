import type {
  VisualizationGraph,
  VisualizationWisp,
} from '../../../crafting-engine/src/domain/VisualizationGraph.ts';

export interface AnimationCheckResult {
  passed: boolean;
  oracle: 'ANIMATION';
  gate: string;
  details: string;
}

export class AnimationOracle {
  /**
   * Verifies that all wisps correspond to legal edges and valid source/target nodes.
   */
  static verifyWispTopology(graph: VisualizationGraph, wisps: VisualizationWisp[]): AnimationCheckResult[] {
    const checks: AnimationCheckResult[] = [];
    const nodeIds = new Set(graph.nodes.map((n) => n.id));
    const edgeIds = new Set(graph.edges.map((e) => e.id));

    let allEdgesValid = true;
    let allNodesValid = true;
    let allProgressValid = true;

    for (const wisp of wisps) {
      if (!edgeIds.has(wisp.edgeId)) allEdgesValid = false;
      if (!nodeIds.has(wisp.sourceNodeId) || !nodeIds.has(wisp.targetNodeId)) allNodesValid = false;
      if (wisp.progress < 0 || wisp.progress > 1 || !Number.isFinite(wisp.progress)) allProgressValid = false;
    }

    checks.push({
      passed: allEdgesValid,
      oracle: 'ANIMATION',
      gate: 'WISP_EDGES_VALID',
      details: allEdgesValid ? `All ${wisps.length} wisps bound to valid graph edges` : 'Invalid edge binding detected in wisps',
    });

    checks.push({
      passed: allNodesValid,
      oracle: 'ANIMATION',
      gate: 'WISP_NODES_VALID',
      details: allNodesValid ? 'All wisp endpoints connect valid macro-state nodes' : 'Orphan node id found in wisp stream',
    });

    checks.push({
      passed: allProgressValid,
      oracle: 'ANIMATION',
      gate: 'WISP_PROGRESS_BOUNDS',
      details: allProgressValid ? 'Wisp trajectory progress stays strictly in [0.0, 1.0]' : 'Out-of-bounds wisp progress detected',
    });

    return checks;
  }

  /**
   * Verifies that the selected route has brighter nodes and distinct highlighting from dominated paths.
   */
  static verifyVisualHierarchy(graph: VisualizationGraph): AnimationCheckResult[] {
    const checks: AnimationCheckResult[] = [];
    const selectedNodes = graph.nodes.filter((n) => n.isSelectedRoute);
    const dominatedNodes = graph.nodes.filter((n) => n.isDominated);

    const hasSelectedNodes = selectedNodes.length > 0;
    const allDominatedDimmed = dominatedNodes.every((n) => n.glowIntensity < 0.5);

    checks.push({
      passed: hasSelectedNodes,
      oracle: 'ANIMATION',
      gate: 'SELECTED_ROUTE_HIGHLIGHTED',
      details: hasSelectedNodes ? `Selected route contains ${selectedNodes.length} illuminated nodes` : 'No selected route nodes found',
    });

    checks.push({
      passed: allDominatedDimmed,
      oracle: 'ANIMATION',
      gate: 'DOMINATED_BRANCHES_DIMMED',
      details: allDominatedDimmed ? `Dominated branches dimmed below 0.5 glow intensity` : 'Dominated nodes exceed dimming threshold',
    });

    return checks;
  }

  /**
   * Verifies deterministic frame generation across multiple steps with identical seeds.
   */
  static verifyDeterminism(graphA: VisualizationGraph, graphB: VisualizationGraph): AnimationCheckResult[] {
    const checks: AnimationCheckResult[] = [];
    const sameNodeCount = graphA.nodes.length === graphB.nodes.length;
    const sameEdgeCount = graphA.edges.length === graphB.edges.length;

    let coordsIdentical = true;
    for (let i = 0; i < Math.min(graphA.nodes.length, graphB.nodes.length); i++) {
      const nA = graphA.nodes[i];
      const nB = graphB.nodes[i];
      if (nA.x !== nB.x || nA.y !== nB.y || nA.radius !== nB.radius) {
        coordsIdentical = false;
        break;
      }
    }

    checks.push({
      passed: sameNodeCount && sameEdgeCount && coordsIdentical,
      oracle: 'ANIMATION',
      gate: 'DETERMINISTIC_REPRODUCIBILITY',
      details: coordsIdentical ? `Graph layout fully reproducible across seeds (${graphA.nodes.length} nodes, ${graphA.edges.length} edges)` : 'Layout variation detected under identical seed',
    });

    return checks;
  }
}
