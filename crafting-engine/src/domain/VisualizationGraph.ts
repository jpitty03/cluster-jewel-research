import {
  classifyCraftPlanAction,
  type CraftPlanSummary,
} from '../service/craftPlan.ts';
import type { MethodFamilyResult } from './MethodFamily.ts';
import type { RouteSummary } from '../service/optimizerService.ts';
import {
  playerizeModifierText,
  type ModifierDisplayDescriptor,
} from './ModifierDisplay.ts';

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
  /** Persistent, collision-managed player label. */
  label: string;
  sublabel?: string;
  fullLabel: string;
  stepNumber?: number;
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
  details: {
    title: string;
    phase?: string;
    instruction?: string;
    actions: string[];
    targetTexts: string[];
    expectedPhysicalActions?: number;
    estimatedManualTimeMs?: number;
    recoveryTargetStepId?: string;
    routeStatus: string;
    technicalModifiers: ModifierDisplayDescriptor[];
  };
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
  acquisitionContext: VisualizationAcquisitionContext;
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

export interface VisualizationAcquisitionContext {
  kind: 'CLEAN' | 'SELF_FRACTURE' | 'OTHER';
  candidateId?: string;
  methodId?: string;
  targetModId?: string;
}

export interface GraphBuildOptions {
  seed?: string;
  width?: number;
  height?: number;
  includeAlternatives?: boolean;
  modifierDescriptors?: ModifierDisplayDescriptor[];
  acquisitionContext?: VisualizationAcquisitionContext;
}

function compactStepLabel(step: CraftPlanSummary['steps'][number]): string {
  if (step.phase === 'ACQUIRE') return 'Acquire';
  if (step.phase === 'RECOVER') return 'Recover';
  if (step.phase === 'SUCCESS') return 'Complete';
  if (step.phase === 'FINISH') return 'Finish';
  for (const actionId of step.actionIds) {
    const classification = classifyCraftPlanAction(actionId);
    if (classification.kind === 'CRAFT_MECHANIC') return classification.compactLabel;
  }
  const phaseLabels: Record<string, string> = {
    INITIALIZE: 'Make Magic',
    ROLL: 'Roll Target',
    FILL: 'Fill Magic',
    PROMOTE: 'Promote',
  };
  return phaseLabels[step.phase] ?? 'Craft';
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
  const descriptors = options.modifierDescriptors ?? [];
  const descriptorById = new Map(descriptors.map((descriptor) => [descriptor.modId, descriptor]));
  const playerText = (text: string, form: 'primary' | 'compact' = 'compact') =>
    playerizeModifierText(text, descriptors, form);
  const allSteps = craftPlan.steps || [];
  const acquisitionContext = options.acquisitionContext ?? { kind: 'OTHER' };
  const acquisitionStep = allSteps.find((step) => step.phase === 'ACQUIRE');
  const steps = allSteps.filter((step) => step.phase !== 'ACQUIRE' && step.phase !== 'SUCCESS');
  const includeAcquisitionNode = acquisitionContext.kind !== 'CLEAN' && acquisitionStep !== undefined;
  const routeNodeCount = steps.length + (includeAcquisitionNode ? 1 : 0) + 2;
  const routeSpacing = 190;
  const width = Math.max(options.width ?? 1000, 180 + (routeNodeCount - 1) * routeSpacing);
  const alternativeFamilies = methodPortfolio.filter((family) =>
    family.spec.kind !== 'OPEN' && family.status !== 'SELECTED_WINNER'
  );
  const alternativeColumns = Math.max(1, Math.min(4, alternativeFamilies.length));
  const alternativeRows = Math.ceil(alternativeFamilies.length / alternativeColumns);
  const height = Math.max(options.height ?? 600, 480 + Math.max(0, alternativeRows - 1) * 115);
  const seed = options.seed ?? 'markov_constellation_default_seed';

  const nodes: VisualizationNode[] = [];
  const edges: VisualizationEdge[] = [];
  const selectedRouteNodeIds: string[] = [];
  const selectedRouteEdgeIds: string[] = [];
  const events: VisualizationEvent[] = [];

  const centerY = Math.min(240, height * 0.36);
  const isCertified = craftPlan.status === 'CERTIFIED';

  // 1. Starting state is explicit acquisition context, never an action-id substring inference.
  const startsClean = acquisitionContext.kind === 'CLEAN' || acquisitionContext.kind === 'SELF_FRACTURE';
  const startNodeId = 'node_start';
  const startNode: VisualizationNode = {
    id: startNodeId,
    label: startsClean ? 'Clean Base' : 'Starting Base',
    sublabel: startsClean ? 'Normal start' : 'Selected acquisition',
    fullLabel: recommendedRoute?.name ?? (startsClean ? 'Clean base' : 'Selected starting base'),
    kind: 'CLEAN_BASE',
    x: 90,
    y: centerY,
    radius: 20,
    glowIntensity: 0.8,
    isSelectedRoute: true,
    isDominated: false,
    isUnresolved: false,
    occupancyWeight: 1.0,
    details: {
      title: recommendedRoute?.name ?? (startsClean ? 'Clean base' : 'Selected starting base'),
      phase: 'ACQUIRE',
      actions: [],
      targetTexts: [],
      routeStatus: recommendedRoute?.name ?? 'Selected route start',
      technicalModifiers: [],
    },
  };
  nodes.push(startNode);
  selectedRouteNodeIds.push(startNodeId);

  events.push({
    type: 'EXPANSION_ROUND',
    timestampMs: 0,
    description: `Initialized start base: ${startNode.label}.`,
    activeNodeId: startNodeId,
  });

  // 2. Build the acquisition event and normal plan actions dynamically.
  let prevNodeId = startNodeId;
  let routeStepNumber = 0;
  const totalSteps = steps.length + (includeAcquisitionNode ? 1 : 0);

  if (includeAcquisitionNode && acquisitionStep) {
    routeStepNumber++;
    const targetDescriptor = acquisitionContext.targetModId
      ? descriptorById.get(acquisitionContext.targetModId)
      : undefined;
    const targetLabel = targetDescriptor?.compactText ?? 'selected target';
    const isSelfFracture = acquisitionContext.kind === 'SELF_FRACTURE';
    const acquisitionLabel = isSelfFracture
      ? `Create Fractured ${targetLabel}`
      : 'Acquire Starting Base';
    const acquisitionNodeId = 'node_acquisition';
    const acquisitionNode: VisualizationNode = {
      id: acquisitionNodeId,
      label: acquisitionLabel,
      sublabel: isSelfFracture ? targetLabel : 'Selected method',
      fullLabel: acquisitionLabel,
      stepNumber: routeStepNumber,
      kind: isSelfFracture ? 'FRACTURE_FAMILY' : 'CLEAN_BASE',
      x: 90 + routeStepNumber * routeSpacing,
      y: centerY - 48,
      radius: 18,
      glowIntensity: 0.78,
      isSelectedRoute: true,
      isDominated: false,
      isUnresolved: false,
      occupancyWeight: 0.95,
      details: {
        title: acquisitionLabel,
        phase: 'ACQUIRE',
        instruction: playerText(acquisitionStep.instruction, 'primary'),
        actions: acquisitionStep.actionNames.map((action) => playerText(action, 'primary')),
        targetTexts: targetDescriptor ? [targetDescriptor.primaryText] : [],
        expectedPhysicalActions: acquisitionStep.expectedPhysicalActions,
        estimatedManualTimeMs: acquisitionStep.estimatedManualTimeMs,
        routeStatus: isSelfFracture
          ? 'Selected self-fracture acquisition event'
          : 'Selected acquisition event',
        technicalModifiers: targetDescriptor ? [targetDescriptor] : [],
      },
    };
    nodes.push(acquisitionNode);
    selectedRouteNodeIds.push(acquisitionNodeId);
    const acquisitionEdgeId = `edge_${startNodeId}_to_${acquisitionNodeId}`;
    edges.push({
      id: acquisitionEdgeId,
      source: startNodeId,
      target: acquisitionNodeId,
      actionLabel: isSelfFracture ? `Create fractured ${targetLabel}` : 'Acquire starting base',
      probability: 1,
      expectedVisits: 1,
      isSelectedRoute: true,
      isDominated: false,
      isUnresolved: false,
      curvature: -0.12,
    });
    selectedRouteEdgeIds.push(acquisitionEdgeId);
    prevNodeId = acquisitionNodeId;
  }

  steps.forEach((step, idx) => {
    routeStepNumber++;
    const stepNodeId = `node_step_${step.id || idx + 1}`;
    const stepX = 90 + routeStepNumber * routeSpacing;
    const verticalOffset = routeStepNumber % 2 === 1 ? -48 : 48;
    const stepY = centerY + verticalOffset;
    const targetDescriptors = (step.preferredTargetModIds ?? [])
      .flatMap((modId) => descriptorById.get(modId) ?? []);
    const targetTexts = targetDescriptors.map((descriptor) => descriptor.compactText);
    const fullTitle = playerText(step.title, 'primary');

    const hasHarvestMechanic = step.actionIds.some((actionId) => {
      const classification = classifyCraftPlanAction(actionId);
      return classification.kind === 'CRAFT_MECHANIC' &&
        classification.actionType === 'HARVEST_REFORGE';
    });
    const stepKind: MacroStateKind = step.phase === 'INITIALIZE' || step.phase === 'ROLL'
        ? (routeStepNumber === 1 ? 'MAGIC_1_MOD' : 'MAGIC_2_MOD')
        : step.phase === 'PROMOTE'
          ? 'RARE_2_MOD'
        : hasHarvestMechanic
            ? 'HARVEST_REFORGE'
            : step.phase === 'RECOVER'
              ? 'RECOVERY_RESET'
              : 'RARE_3_MOD';

    const stepNode: VisualizationNode = {
      id: stepNodeId,
      label: compactStepLabel(step),
      sublabel: targetTexts[0],
      fullLabel: fullTitle,
      stepNumber: routeStepNumber,
      kind: stepKind,
      x: stepX,
      y: stepY,
      radius: 18,
      glowIntensity: 0.75,
      isSelectedRoute: true,
      isDominated: false,
      isUnresolved: false,
      occupancyWeight: Math.max(0.3, 1.0 - ((routeStepNumber - 1) * 0.15)),
      details: {
        title: fullTitle,
        phase: step.phase,
        instruction: playerText(step.instruction, 'primary'),
        actions: step.actionNames.map((action) => playerText(action, 'primary')),
        targetTexts,
        expectedPhysicalActions: step.expectedPhysicalActions,
        estimatedManualTimeMs: step.estimatedManualTimeMs,
        recoveryTargetStepId: step.recoveryTargetStepId,
        routeStatus: 'Selected policy route',
        technicalModifiers: targetDescriptors,
      },
    };
    nodes.push(stepNode);
    selectedRouteNodeIds.push(stepNodeId);

    // Forward Step Edge
    const edgeId = `edge_${prevNodeId}_to_${stepNodeId}`;
    const edge: VisualizationEdge = {
      id: edgeId,
      source: prevNodeId,
      target: stepNodeId,
      actionLabel: playerText(step.actionNames?.[0] ?? step.title),
      probability: 1.0 / routeStepNumber,
      expectedVisits: step.expectedPhysicalActions ? Math.max(1, step.expectedPhysicalActions / (totalSteps || 1)) : 1,
      isSelectedRoute: true,
      isDominated: false,
      isUnresolved: false,
      curvature: (routeStepNumber % 2 === 1 ? -0.15 : 0.15),
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
    label: isCertified ? 'Goal' : 'Unresolved Target',
    sublabel: isCertified ? 'Target certified' : 'Proof limit',
    fullLabel: isCertified ? 'Target complete' : 'Unresolved target',
    kind: isCertified ? 'TERMINAL_SUCCESS' : 'UNRESOLVED_FRONTIER',
    x: 90 + (routeNodeCount - 1) * routeSpacing,
    y: centerY,
    radius: 25,
    glowIntensity: isCertified ? 1.0 : 0.4,
    isSelectedRoute: isCertified,
    isDominated: false,
    isUnresolved: !isCertified,
    occupancyWeight: 1.0,
    details: {
      title: isCertified ? 'Target complete' : 'Unresolved target',
      phase: 'SUCCESS',
      actions: [],
      targetTexts: descriptors.map((descriptor) => descriptor.primaryText),
      routeStatus: isCertified ? 'Selected route terminal' : 'Unresolved frontier',
      technicalModifiers: descriptors,
    },
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
  let visibleAlternativeIndex = 0;
  methodPortfolio.forEach((family, fIdx) => {
    if (family.spec.kind === 'OPEN') return;
    const isWinner = family.status === 'SELECTED_WINNER';
    if (isWinner) return; // Already modeled in main chain

    const altNodeId = `node_alt_${family.spec.id || fIdx}`;
    const isSameSelectedPolicy = family.status === 'SAME_AS_SELECTED';
    const isDominated = family.status === 'DOMINATED' || family.status === 'MORE_EXPENSIVE';
    const isUnresolved = family.status === 'UNRESOLVED_AT_BUDGET';
    const targetDescriptor = family.spec.targetFractureModId
      ? descriptorById.get(family.spec.targetFractureModId)
      : undefined;
    const familyLabel = targetDescriptor && family.spec.kind === 'SELF_FRACTURE'
      ? `Self-fracture ${targetDescriptor.compactText}`
      : targetDescriptor && family.spec.kind === 'SELF_FRACTURE_HARVEST'
        ? `Fracture ${targetDescriptor.compactText} + Harvest`
        : playerText(family.spec.name);
    const column = visibleAlternativeIndex % alternativeColumns;
    const row = Math.floor(visibleAlternativeIndex / alternativeColumns);
    const laneWidth = (width - 240) / alternativeColumns;
    visibleAlternativeIndex += 1;

    const altNode: VisualizationNode = {
      id: altNodeId,
      label: familyLabel,
      sublabel: isSameSelectedPolicy
        ? 'Same selected policy'
        : isUnresolved ? 'Unresolved' : isDominated ? 'Dominated' : 'Alternative',
      fullLabel: familyLabel,
      kind: family.spec.kind === 'SELF_FRACTURE' ? 'FRACTURE_FAMILY' : family.spec.kind === 'HARVEST' ? 'HARVEST_REFORGE' : 'DOMINATED_BRANCH',
      x: 120 + laneWidth * (column + 0.5),
      y: 430 + row * 115,
      radius: 15,
      glowIntensity: 0.25,
      isSelectedRoute: false,
      isDominated,
      isUnresolved,
      occupancyWeight: 0.15,
      details: {
        title: familyLabel,
        phase: family.spec.kind,
        instruction: playerText(family.spec.description, 'primary'),
        actions: [],
        targetTexts: targetDescriptor ? [targetDescriptor.primaryText] : [],
        routeStatus: isSameSelectedPolicy
          ? 'Independently found the same selected policy'
          : isUnresolved ? 'Unresolved at budget' : isDominated ? 'Dominated alternative' : 'Explored alternative',
        technicalModifiers: targetDescriptor ? [targetDescriptor] : [],
      },
    };
    nodes.push(altNode);

    // Edge from start to alternative
    edges.push({
      id: `edge_start_to_${altNodeId}`,
      source: startNodeId,
      target: altNodeId,
      actionLabel: familyLabel,
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
    layoutVersion: '2V.1',
    acquisitionContext,
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
