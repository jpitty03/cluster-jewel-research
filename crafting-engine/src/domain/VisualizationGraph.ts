import type { CraftPlanSummary } from '../service/craftPlan.ts';
import type { MethodFamilyResult } from './MethodFamily.ts';
import type { RouteSummary } from '../service/optimizerService.ts';

export type MacroStateKind =
  | 'CLEAN_BASE'
  | 'FRACTURE_FAMILY'
  | 'MAGIC_1_MOD'
  | 'MAGIC_2_MOD'
  | 'RARE_2_MOD'
  | 'RARE_3_MOD'
  | 'RARE_4_MOD'
  | 'HARVEST_REFORGE'
  | 'RECOVERY_RESET'
  | 'TERMINAL_SUCCESS'
  | 'UNRESOLVED_FRONTIER'
  | 'DOMINATED_BRANCH';

export interface VisualizationNode {
  id: string;
  label: string;
  sublabel?: string;
  kind: MacroStateKind;
  x: number;
  y: number;
  radius: number;
  glowIntensity: number; // 0.0 to 1.0
  isCurrentFocus?: boolean;
  isSelectedRoute: boolean;
  isDominated: boolean;
  isUnresolved: boolean;
  occupancyWeight: number; // 0.0 to 1.0 (relative visit volume)
}

export interface VisualizationEdge {
  id: string;
  source: string;
  target: string;
  actionLabel: string;
  probability: number; // 0.0 to 1.0
  expectedVisits: number;
  isSelectedRoute: boolean;
  isDominated: boolean;
  isUnresolved: boolean;
  curvature: number; // -0.5 to 0.5 for organic arcs
}

export interface VisualizationWisp {
  id: string;
  edgeId: string;
  sourceNodeId: string;
  targetNodeId: string;
  progress: number; // 0.0 to 1.0 along the edge
  speed: number;
  size: number;
  opacity: number;
  color: string;
}

export interface VisualizationEvent {
  type: 'EXPANSION_ROUND' | 'INCUMBENT_UPDATE' | 'BRANCH_DOMINATED' | 'SEARCH_COMPLETE';
  timestampMs: number;
  description: string;
  activeNodeId?: string;
  activeEdgeId?: string;
}

export interface VisualizationGraph {
  nodes: VisualizationNode[];
  edges: VisualizationEdge[];
  events: VisualizationEvent[];
  seed: string;
  layoutVersion: string;
  selectedRouteNodeIds: string[];
  selectedRouteEdgeIds: string[];
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
  };
}

export interface GraphBuildOptions {
  seed?: string;
  width?: number;
  height?: number;
  includeAlternatives?: boolean;
}

/**
 * Builds a deterministic, macro-state visualization graph dynamically derived
 * from the actual optimizer craft plan, recommended route, and method portfolio.
 */
export function buildVisualizationGraph(
  craftPlan: CraftPlanSummary,
  methodPortfolio: MethodFamilyResult[] = [],
  recommendedRoute?: RouteSummary,
  options: GraphBuildOptions = {}
): VisualizationGraph {
  const width = options.width ?? 1000;
  const height = options.height ?? 600;
  const seed = options.seed ?? 'markov_constellation_default_seed';

  const nodes: VisualizationNode[] = [];
  const edges: VisualizationEdge[] = [];
  const selectedRouteNodeIds: string[] = [];
  const selectedRouteEdgeIds: string[] = [];
  const events: VisualizationEvent[] = [];

  const centerY = height / 2;
  const steps = craftPlan.steps || [];
  const isCertified = craftPlan.status === 'CERTIFIED';

  // 1. Starting State Node
  const isFractureStart = Boolean(recommendedRoute?.actionId?.includes('candidate_') && !recommendedRoute?.actionId?.includes('candidate_clean'));
  const startNodeId = 'node_start';
  const startNode: VisualizationNode = {
    id: startNodeId,
    label: isFractureStart ? 'Fractured Base' : 'Clean Base',
    sublabel: isFractureStart ? 'Fracturing Prep' : 'Normal Base',
    kind: isFractureStart ? 'FRACTURE_FAMILY' : 'CLEAN_BASE',
    x: 90,
    y: centerY,
    radius: 20,
    glowIntensity: 0.8,
    isSelectedRoute: true,
    isDominated: false,
    isUnresolved: false,
    occupancyWeight: 1.0,
  };
  nodes.push(startNode);
  selectedRouteNodeIds.push(startNodeId);

  events.push({
    type: 'EXPANSION_ROUND',
    timestampMs: 0,
    description: `Initialized start base: ${startNode.label}.`,
    activeNodeId: startNodeId,
  });

  // 2. Build Plan Steps Dynamically
  let prevNodeId = startNodeId;
  const totalSteps = steps.length;
  const stepSpacing = (width - 240) / Math.max(1, totalSteps + 1);

  steps.forEach((step, idx) => {
    const stepNodeId = `node_step_${step.id || idx + 1}`;
    const stepX = 90 + (idx + 1) * stepSpacing;
    const verticalOffset = idx % 2 === 0 ? -45 : 35;
    const stepY = Math.max(80, Math.min(height - 180, centerY + verticalOffset));

    const stepKind: MacroStateKind = step.phase === 'ACQUIRE'
      ? 'FRACTURE_FAMILY'
      : step.phase === 'INITIALIZE' || step.phase === 'ROLL'
        ? (idx === 0 ? 'MAGIC_1_MOD' : 'MAGIC_2_MOD')
        : step.phase === 'PROMOTE'
          ? 'RARE_2_MOD'
          : step.phase === 'SPECIALIZED'
            ? 'HARVEST_REFORGE'
            : step.phase === 'RECOVER'
              ? 'RECOVERY_RESET'
              : 'RARE_3_MOD';

    const stepNode: VisualizationNode = {
      id: stepNodeId,
      label: step.title,
      sublabel: step.actionNames?.length > 0 ? step.actionNames.join(', ') : undefined,
      kind: stepKind,
      x: stepX,
      y: stepY,
      radius: 18,
      glowIntensity: 0.75,
      isSelectedRoute: true,
      isDominated: false,
      isUnresolved: false,
      occupancyWeight: Math.max(0.3, 1.0 - (idx * 0.15)),
    };
    nodes.push(stepNode);
    selectedRouteNodeIds.push(stepNodeId);

    // Forward Step Edge
    const edgeId = `edge_${prevNodeId}_to_${stepNodeId}`;
    const edge: VisualizationEdge = {
      id: edgeId,
      source: prevNodeId,
      target: stepNodeId,
      actionLabel: step.actionNames?.length > 0 ? step.actionNames[0] : step.title,
      probability: 1.0 / (idx + 1),
      expectedVisits: step.expectedPhysicalActions ? Math.max(1, step.expectedPhysicalActions / (totalSteps || 1)) : 1,
      isSelectedRoute: true,
      isDominated: false,
      isUnresolved: false,
      curvature: (idx % 2 === 0 ? -0.15 : 0.15),
    };
    edges.push(edge);
    selectedRouteEdgeIds.push(edgeId);

    // Recovery Loop if step misses and resets
    if (step.recoveryTargetStepId !== undefined) {
      const recEdgeId = `edge_recovery_${stepNodeId}`;
      edges.push({
        id: recEdgeId,
        source: stepNodeId,
        target: startNodeId,
        actionLabel: 'Miss -> Recovery Loop',
        probability: 0.5,
        expectedVisits: 0.5,
        isSelectedRoute: true,
        isDominated: false,
        isUnresolved: false,
        curvature: 0.35,
      });
    }

    prevNodeId = stepNodeId;
  });

  // 3. Terminal Target Node
  const terminalNodeId = 'node_terminal_target';
  const terminalNode: VisualizationNode = {
    id: terminalNodeId,
    label: isCertified ? 'Target Certified' : 'Unresolved Target',
    sublabel: isCertified ? (recommendedRoute?.name ?? 'Optimal Route') : 'Proof Limit Reached',
    kind: isCertified ? 'TERMINAL_SUCCESS' : 'UNRESOLVED_FRONTIER',
    x: width - 100,
    y: centerY,
    radius: 25,
    glowIntensity: isCertified ? 1.0 : 0.4,
    isSelectedRoute: isCertified,
    isDominated: false,
    isUnresolved: !isCertified,
    occupancyWeight: 1.0,
  };
  nodes.push(terminalNode);
  if (isCertified) {
    selectedRouteNodeIds.push(terminalNodeId);
  }

  // Edge to Terminal Node
  const finalEdgeId = `edge_${prevNodeId}_to_${terminalNodeId}`;
  const finalEdge: VisualizationEdge = {
    id: finalEdgeId,
    source: prevNodeId,
    target: terminalNodeId,
    actionLabel: isCertified ? 'Finish / Target Achieved' : 'Continuation Search',
    probability: 1.0,
    expectedVisits: 1.0,
    isSelectedRoute: isCertified,
    isDominated: false,
    isUnresolved: !isCertified,
    curvature: 0.05,
  };
  edges.push(finalEdge);
  if (isCertified) {
    selectedRouteEdgeIds.push(finalEdgeId);
  }

  events.push({
    type: 'INCUMBENT_UPDATE',
    timestampMs: 500,
    description: isCertified
      ? `Winning crafting route resolved (${recommendedRoute?.name ?? 'Clean Base'}).`
      : 'Search frontier reached allocated state budget.',
    activeNodeId: terminalNodeId,
  });

  // 4. Alternative & Dominated Starting Methods from Portfolio
  let altY = centerY + 140;
  methodPortfolio.forEach((family, fIdx) => {
    if (family.spec.kind === 'OPEN') return;
    const isWinner = family.status === 'SELECTED_WINNER';
    if (isWinner) return; // Already modeled in main chain

    const altNodeId = `node_alt_${family.spec.id || fIdx}`;
    const isDominated = family.status === 'DOMINATED' || family.status === 'MORE_EXPENSIVE';
    const isUnresolved = family.status === 'UNRESOLVED_AT_BUDGET';

    const altNode: VisualizationNode = {
      id: altNodeId,
      label: family.spec.name,
      sublabel: family.whyNotSelectedExplanation ? family.whyNotSelectedExplanation.slice(0, 32) + '...' : undefined,
      kind: family.spec.kind === 'SELF_FRACTURE' ? 'FRACTURE_FAMILY' : family.spec.kind === 'HARVEST' ? 'HARVEST_REFORGE' : 'DOMINATED_BRANCH',
      x: 240 + (fIdx * 160) % (width - 400),
      y: Math.min(height - 60, altY),
      radius: 15,
      glowIntensity: 0.25,
      isSelectedRoute: false,
      isDominated,
      isUnresolved,
      occupancyWeight: 0.15,
    };
    nodes.push(altNode);

    // Edge from start to alternative
    edges.push({
      id: `edge_start_to_${altNodeId}`,
      source: startNodeId,
      target: altNodeId,
      actionLabel: family.spec.name,
      probability: 0.2,
      expectedVisits: 0.2,
      isSelectedRoute: false,
      isDominated: true,
      isUnresolved,
      curvature: 0.35,
    });

    // Edge from alternative to terminal
    edges.push({
      id: `edge_${altNodeId}_to_terminal`,
      source: altNodeId,
      target: terminalNodeId,
      actionLabel: 'Alternative Path',
      probability: 0.2,
      expectedVisits: 0.2,
      isSelectedRoute: false,
      isDominated: true,
      isUnresolved,
      curvature: -0.25,
    });

    altY += 55;
  });

  events.push({
    type: 'SEARCH_COMPLETE',
    timestampMs: 1000,
    description: `Visualization graph constructed with ${nodes.length} macro states and ${edges.length} transitions.`,
  });

  // Calculate tight bounds
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  nodes.forEach((n) => {
    minX = Math.min(minX, n.x - n.radius - 40);
    minY = Math.min(minY, n.y - n.radius - 40);
    maxX = Math.max(maxX, n.x + n.radius + 40);
    maxY = Math.max(maxY, n.y + n.radius + 40);
  });

  return {
    nodes,
    edges,
    events,
    seed,
    layoutVersion: '2Q.2',
    selectedRouteNodeIds,
    selectedRouteEdgeIds,
    bounds: {
      minX: Math.max(0, minX),
      minY: Math.max(0, minY),
      maxX: Math.max(width, maxX),
      maxY: Math.max(height, maxY),
      width: Math.max(width, maxX - minX),
      height: Math.max(height, maxY - minY),
    },
  };
}
