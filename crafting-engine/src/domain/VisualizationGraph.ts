import type {
  PolicyFlowEdge,
  PolicyFlowOutcomeKind,
  PolicyFlowSummary,
  PolicyFlowTopology,
} from './PolicyFlow.ts';
import type { ModifierDisplayDescriptor } from './ModifierDisplay.ts';

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
  | 'UNRESOLVED_FRONTIER';

export interface VisualizationNode {
  id: string;
  label: string;
  sublabel?: string;
  fullLabel: string;
  stepNumber?: number;
  kind: MacroStateKind;
  x: number;
  y: number;
  radius: number;
  glowIntensity: number;
  isCurrentFocus?: boolean;
  isSelectedRoute: boolean;
  isDominated: boolean;
  isUnresolved: boolean;
  occupancyWeight: number;
  details: {
    title: string;
    phase?: string;
    instruction?: string;
    actions: string[];
    targetTexts: string[];
    expectedVisits: number;
    occupancyShare: number;
    exactStateCount: number;
    rarity?: 'normal' | 'magic' | 'rare';
    matchedTargetModIds: string[];
    fracturedTargetModIds: string[];
    representativeState?: string;
    representativeStateKey?: string;
    routeStatus: string;
    technicalModifiers: ModifierDisplayDescriptor[];
  };
}

export interface VisualizationEdge {
  id: string;
  source: string;
  target: string;
  actionLabel: string;
  probability: number;
  expectedVisits: number;
  exactTransitionCount: number;
  outcomeKind: PolicyFlowOutcomeKind;
  nextSelectedActionId?: string;
  nextSelectedActionName?: string;
  representativeOutcome?: string;
  representativeState?: string;
  evidenceKind: PolicyFlowEdge['evidenceKind'];
  isSelectedRoute: boolean;
  isDominated: boolean;
  isUnresolved: boolean;
  isRecovery: boolean;
  curvature: number;
  controlX: number;
  controlY: number;
  width: number;
  opacity: number;
  flowImportance: number;
}

export interface VisualizationWisp {
  id: string;
  edgeId: string;
  sourceNodeId: string;
  targetNodeId: string;
  progress: number;
  speed: number;
  size: number;
  opacity: number;
  color: string;
}

export interface VisualizationEvent {
  type: 'POLICY_ENTRY' | 'BRANCH_SPLIT' | 'RECOVERY_LOOP' | 'SEARCH_COMPLETE';
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
  policyFlowVersion: PolicyFlowSummary['version'];
  policyFlowStatus: PolicyFlowSummary['status'];
  sourceBundleId: string;
  sourcePolicyFingerprint?: string;
  acquisitionContext: VisualizationAcquisitionContext;
  selectedRouteNodeIds: string[];
  selectedRouteEdgeIds: string[];
  recoveryEdgeIds: string[];
  topology: PolicyFlowTopology;
  performance: {
    layoutMs: number;
    particleBudget: number;
  };
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
  modifierDescriptors?: ModifierDisplayDescriptor[];
  acquisitionContext?: VisualizationAcquisitionContext;
}

interface PositionedComponent {
  id: number;
  nodeIds: string[];
  rank: number;
  centerX: number;
  centerY: number;
  cyclic: boolean;
}

function now(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

function tarjan(
  nodeIds: readonly string[],
  edges: readonly Pick<PolicyFlowEdge, 'sourceNodeId' | 'targetNodeId'>[],
): string[][] {
  const adjacency = new Map(nodeIds.map((nodeId) => [nodeId, [] as string[]]));
  for (const edge of edges) adjacency.get(edge.sourceNodeId)?.push(edge.targetNodeId);
  for (const targets of adjacency.values()) targets.sort();
  let nextIndex = 0;
  const indices = new Map<string, number>();
  const lowLinks = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];
  const visit = (nodeId: string): void => {
    indices.set(nodeId, nextIndex);
    lowLinks.set(nodeId, nextIndex);
    nextIndex += 1;
    stack.push(nodeId);
    onStack.add(nodeId);
    for (const targetId of adjacency.get(nodeId) ?? []) {
      if (!indices.has(targetId)) {
        visit(targetId);
        lowLinks.set(nodeId, Math.min(lowLinks.get(nodeId)!, lowLinks.get(targetId)!));
      } else if (onStack.has(targetId)) {
        lowLinks.set(nodeId, Math.min(lowLinks.get(nodeId)!, indices.get(targetId)!));
      }
    }
    if (lowLinks.get(nodeId) !== indices.get(nodeId)) return;
    const component: string[] = [];
    while (stack.length > 0) {
      const member = stack.pop()!;
      onStack.delete(member);
      component.push(member);
      if (member === nodeId) break;
    }
    components.push(component.sort());
  };
  for (const nodeId of [...nodeIds].sort()) {
    if (!indices.has(nodeId)) visit(nodeId);
  }
  return components;
}

function componentLayout(flow: PolicyFlowSummary, width: number, height: number): {
  components: PositionedComponent[];
  positionByNodeId: Map<string, { x: number; y: number }>;
  width: number;
  height: number;
} {
  const componentNodes = tarjan(flow.nodes.map((node) => node.id), flow.edges);
  const componentByNode = new Map<string, number>();
  componentNodes.forEach((nodes, componentId) => {
    for (const nodeId of nodes) componentByNode.set(nodeId, componentId);
  });
  const outgoing = new Map<number, Set<number>>();
  const incomingCount = new Map<number, number>();
  for (let componentId = 0; componentId < componentNodes.length; componentId += 1) {
    outgoing.set(componentId, new Set());
    incomingCount.set(componentId, 0);
  }
  for (const edge of flow.edges) {
    const source = componentByNode.get(edge.sourceNodeId);
    const target = componentByNode.get(edge.targetNodeId);
    if (source === undefined || target === undefined || source === target) continue;
    const targets = outgoing.get(source)!;
    if (targets.has(target)) continue;
    targets.add(target);
    incomingCount.set(target, (incomingCount.get(target) ?? 0) + 1);
  }
  const queue = [...incomingCount.entries()]
    .filter(([, count]) => count === 0)
    .map(([componentId]) => componentId)
    .sort((left, right) => componentNodes[left][0].localeCompare(componentNodes[right][0]));
  const topological: number[] = [];
  while (queue.length > 0) {
    const componentId = queue.shift()!;
    topological.push(componentId);
    for (const target of [...(outgoing.get(componentId) ?? [])].sort()) {
      const remaining = (incomingCount.get(target) ?? 0) - 1;
      incomingCount.set(target, remaining);
      if (remaining === 0) {
        queue.push(target);
        queue.sort((left, right) =>
          componentNodes[left][0].localeCompare(componentNodes[right][0])
        );
      }
    }
  }
  const ranks = new Map<number, number>();
  for (const startNodeId of flow.startNodeIds) {
    const componentId = componentByNode.get(startNodeId);
    if (componentId !== undefined) ranks.set(componentId, 0);
  }
  for (const componentId of topological) {
    const rank = ranks.get(componentId) ?? 0;
    for (const target of outgoing.get(componentId) ?? []) {
      ranks.set(target, Math.max(ranks.get(target) ?? 0, rank + 1));
    }
  }
  const maximumRank = Math.max(0, ...ranks.values());
  const columns = maximumRank + 1;
  const computedWidth = Math.max(width, 260 + Math.max(0, columns - 1) * 260);
  const componentsByRank = new Map<number, number[]>();
  componentNodes.forEach((_, componentId) => {
    const rank = ranks.get(componentId) ?? 0;
    const row = componentsByRank.get(rank) ?? [];
    row.push(componentId);
    componentsByRank.set(rank, row);
  });
  const busiestRank = Math.max(1, ...[...componentsByRank.values()].map((row) => row.length));
  const computedHeight = Math.max(height, 240 + Math.max(0, busiestRank - 1) * 220);
  const selfLoops = new Set(flow.edges
    .filter((edge) => edge.sourceNodeId === edge.targetNodeId)
    .map((edge) => edge.sourceNodeId));
  const positions = new Map<string, { x: number; y: number }>();
  const positionedComponents: PositionedComponent[] = [];
  for (const [rank, componentIds] of [...componentsByRank.entries()].sort((a, b) => a[0] - b[0])) {
    componentIds.sort((left, right) => {
      const leftVisits = componentNodes[left].reduce((sum, nodeId) =>
        sum + (flow.nodes.find((node) => node.id === nodeId)?.expectedVisits ?? 0), 0);
      const rightVisits = componentNodes[right].reduce((sum, nodeId) =>
        sum + (flow.nodes.find((node) => node.id === nodeId)?.expectedVisits ?? 0), 0);
      return rightVisits - leftVisits || componentNodes[left][0].localeCompare(componentNodes[right][0]);
    });
    const rowHeight = computedHeight / (componentIds.length + 1);
    componentIds.forEach((componentId, rowIndex) => {
      const nodeIds = componentNodes[componentId];
      const centerX = columns === 1
        ? computedWidth / 2
        : 130 + rank * ((computedWidth - 260) / Math.max(1, columns - 1));
      const centerY = rowHeight * (rowIndex + 1);
      const cyclic = nodeIds.length > 1 || selfLoops.has(nodeIds[0]);
      positionedComponents.push({ id: componentId, nodeIds, rank, centerX, centerY, cyclic });
      if (nodeIds.length === 1) {
        positions.set(nodeIds[0], { x: centerX, y: centerY });
        return;
      }
      const ringRadius = Math.max(72, Math.min(125, 46 + nodeIds.length * 12));
      nodeIds.forEach((nodeId, nodeIndex) => {
        const angle = -Math.PI / 2 + nodeIndex * Math.PI * 2 / nodeIds.length;
        positions.set(nodeId, {
          x: centerX + Math.cos(angle) * ringRadius,
          y: centerY + Math.sin(angle) * ringRadius,
        });
      });
    });
  }
  return { components: positionedComponents, positionByNodeId: positions, width: computedWidth, height: computedHeight };
}

function macroKind(node: PolicyFlowSummary['nodes'][number]): MacroStateKind {
  if (node.terminal) return 'TERMINAL_SUCCESS';
  if (node.selectedActionId === 'restart_reacquire' || node.selectedActionId === 'scouring_orb') return 'RECOVERY_RESET';
  if (node.selectedActionId?.startsWith('harvest_reforge_')) return 'HARVEST_REFORGE';
  if (node.scope === 'ACQUISITION' || node.selectedActionId === 'fracturing_orb') return 'FRACTURE_FAMILY';
  const affixes = (node.prefixCount ?? 0) + (node.suffixCount ?? 0);
  if (node.rarity === 'normal') return 'CLEAN_BASE';
  if (node.rarity === 'magic') return affixes <= 1 ? 'MAGIC_1_MOD' : 'MAGIC_2_MOD';
  if (affixes <= 2) return 'RARE_2_MOD';
  if (affixes === 3) return 'RARE_3_MOD';
  return 'RARE_4_MOD';
}

function branchLabel(
  edge: PolicyFlowEdge,
  source: PolicyFlowSummary['nodes'][number] | undefined,
  target: PolicyFlowSummary['nodes'][number] | undefined,
): string {
  const probability = `${(edge.conditionalProbability * 100).toFixed(edge.conditionalProbability >= 0.1 ? 1 : 2)}%`;
  const sourceLabel = source?.label ?? edge.actionName;
  if (edge.sourceNodeId === edge.targetNodeId) return `${sourceLabel} repeat · ${probability}`;
  return `${sourceLabel} → ${target?.label ?? 'Next policy state'} · ${probability}`;
}

function deterministicPolicyOrder(flow: PolicyFlowSummary): string[] {
  const visited = new Set<string>();
  const queue = [...flow.startNodeIds];
  const result: string[] = [];
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);
    result.push(nodeId);
    const outgoing = flow.edges
      .filter((edge) => edge.sourceNodeId === nodeId)
      .sort((left, right) => right.expectedFlow - left.expectedFlow || left.targetNodeId.localeCompare(right.targetNodeId));
    for (const edge of outgoing) {
      if (!visited.has(edge.targetNodeId)) queue.push(edge.targetNodeId);
    }
  }
  for (const node of flow.nodes) {
    if (!visited.has(node.id)) result.push(node.id);
  }
  return result;
}

/** Deterministic, cycle-aware layout of the exact selected-policy flow summary. */
export function buildVisualizationGraph(
  flow: PolicyFlowSummary,
  options: GraphBuildOptions = {},
): VisualizationGraph {
  const layoutStarted = now();
  const seed = options.seed ?? `${flow.sourceBundleId}:${flow.sourcePolicyFingerprint ?? 'policy'}`;
  const acquisitionContext = options.acquisitionContext ?? { kind: 'OTHER' };
  const layout = componentLayout(flow, options.width ?? 1000, options.height ?? 620);
  const descriptorById = new Map((options.modifierDescriptors ?? []).map((descriptor) => [descriptor.modId, descriptor]));
  const maximumVisits = Math.max(1e-12, ...flow.nodes.map((node) => node.expectedVisits));
  const visitScale = Math.log1p(maximumVisits);
  const orderedIds = deterministicPolicyOrder(flow);
  const stepById = new Map(orderedIds.map((nodeId, index) => [nodeId, index + 1]));
  const nodes: VisualizationNode[] = flow.nodes.map((node) => {
    const position = layout.positionByNodeId.get(node.id) ?? { x: 100, y: layout.height / 2 };
    const normalizedVisits = visitScale > 0 ? Math.log1p(node.expectedVisits) / visitScale : 0;
    const technicalModifiers = [...new Set([...node.matchedTargetModIds, ...node.fracturedTargetModIds])]
      .flatMap((modId) => descriptorById.get(modId) ?? []);
    return {
      id: node.id,
      label: node.label,
      sublabel: node.stateSummary,
      fullLabel: node.terminal ? 'Goal: selected target satisfied' : `${node.label} — ${node.stateSummary}`,
      stepNumber: stepById.get(node.id),
      kind: macroKind(node),
      x: position.x,
      y: position.y,
      radius: node.terminal ? 25 : 16 + normalizedVisits * 6,
      glowIntensity: Math.max(0.18, normalizedVisits),
      isSelectedRoute: true,
      isDominated: false,
      isUnresolved: flow.status !== 'CERTIFIED',
      occupancyWeight: node.occupancyShare,
      details: {
        title: node.terminal ? 'Target complete' : node.stateSummary,
        phase: node.scope,
        instruction: node.terminal
          ? 'The selected policy reaches the requested target.'
          : `When the item is in this state class, the selected action is ${node.selectedActionName ?? node.label}.`,
        actions: node.selectedActionName ? [node.selectedActionName] : [],
        targetTexts: technicalModifiers.map((descriptor) => descriptor.primaryText),
        expectedVisits: node.expectedVisits,
        occupancyShare: node.occupancyShare,
        exactStateCount: node.exactStateCount,
        rarity: node.rarity,
        matchedTargetModIds: [...node.matchedTargetModIds],
        fracturedTargetModIds: [...node.fracturedTargetModIds],
        representativeState: node.representativeState,
        representativeStateKey: node.representativeStateKey,
        routeStatus: node.terminal
          ? 'Selected policy terminal success'
          : node.recoveryLike
            ? 'Selected recovery policy state'
            : 'Exact selected-policy macro state',
        technicalModifiers,
      },
    };
  });
  const maximumFlow = Math.max(1e-12, ...flow.edges.map((edge) => edge.expectedFlow));
  const flowScale = Math.log1p(maximumFlow);
  const outgoingIndex = new Map<string, number>();
  const edges: VisualizationEdge[] = flow.edges.map((edge) => {
    const source = nodes.find((node) => node.id === edge.sourceNodeId);
    const target = nodes.find((node) => node.id === edge.targetNodeId);
    const sameNode = edge.sourceNodeId === edge.targetNodeId;
    const branchIndex = outgoingIndex.get(edge.sourceNodeId) ?? 0;
    outgoingIndex.set(edge.sourceNodeId, branchIndex + 1);
    const flowImportance = flowScale > 0 ? Math.log1p(edge.expectedFlow) / flowScale : 0;
    const backwards = Boolean(source && target && target.x <= source.x);
    const recovery = edge.outcomeKind === 'RECOVERY' || edge.outcomeKind === 'REACQUIRE';
    const curvature = sameNode
      ? (branchIndex % 2 === 0 ? 0.72 : -0.72)
      : recovery || backwards
        ? (branchIndex % 2 === 0 ? 0.34 : -0.34)
        : (branchIndex % 2 === 0 ? -0.12 : 0.12);
    const sourceX = source?.x ?? 0;
    const sourceY = source?.y ?? 0;
    const targetX = target?.x ?? sourceX;
    const targetY = target?.y ?? sourceY;
    const midX = (sourceX + targetX) / 2;
    const midY = (sourceY + targetY) / 2;
    const dx = targetX - sourceX;
    const dy = targetY - sourceY;
    const distance = Math.hypot(dx, dy);
    const controlX = sameNode ? sourceX + (branchIndex % 2 === 0 ? 86 : -86) : midX + (-dy / (distance || 1)) * distance * curvature;
    const controlY = sameNode ? sourceY - 104 : midY + (dx / (distance || 1)) * distance * curvature;
    return {
      id: edge.id,
      source: edge.sourceNodeId,
      target: edge.targetNodeId,
      actionLabel: branchLabel(
        edge,
        flow.nodes.find((node) => node.id === edge.sourceNodeId),
        flow.nodes.find((node) => node.id === edge.targetNodeId),
      ),
      probability: edge.conditionalProbability,
      expectedVisits: edge.expectedFlow,
      exactTransitionCount: edge.exactTransitionCount,
      outcomeKind: edge.outcomeKind,
      nextSelectedActionId: edge.nextSelectedActionId,
      nextSelectedActionName: edge.nextSelectedActionName,
      representativeOutcome: edge.representativeOutcome,
      representativeState: edge.representativeState,
      evidenceKind: edge.evidenceKind,
      isSelectedRoute: true,
      isDominated: false,
      isUnresolved: flow.status !== 'CERTIFIED',
      isRecovery: recovery,
      curvature,
      controlX,
      controlY,
      width: 1.25 + Math.sqrt(Math.max(0, flowImportance)) * 4.75,
      opacity: Math.min(0.98, 0.2 + edge.conditionalProbability * 0.48 + flowImportance * 0.3),
      flowImportance,
    };
  });
  const events: VisualizationEvent[] = [];
  for (const startNodeId of flow.startNodeIds) {
    events.push({ type: 'POLICY_ENTRY', timestampMs: 0, description: 'Entered the exact selected policy.', activeNodeId: startNodeId });
  }
  for (const node of flow.nodes) {
    const outgoing = flow.edges.filter((edge) => edge.sourceNodeId === node.id);
    if (outgoing.length > 1) {
      events.push({
        type: 'BRANCH_SPLIT',
        timestampMs: events.length * 250 + 250,
        description: `${node.label} splits into ${outgoing.length} evidence-derived outcome classes.`,
        activeNodeId: node.id,
      });
    }
  }
  for (const edge of flow.edges.filter((candidate) => candidate.outcomeKind === 'RECOVERY' || candidate.outcomeKind === 'REACQUIRE')) {
    events.push({
      type: 'RECOVERY_LOOP',
      timestampMs: events.length * 250 + 250,
      description: `${edge.actionName} follows the actual selected-policy recovery destination.`,
      activeEdgeId: edge.id,
    });
  }
  events.push({
    type: 'SEARCH_COMPLETE',
    timestampMs: events.length * 250 + 250,
    description: `${nodes.length} macro states and ${edges.length} exact-flow branches rendered.`,
  });
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    minX = Math.min(minX, node.x - node.radius - 90);
    minY = Math.min(minY, node.y - node.radius - 100);
    maxX = Math.max(maxX, node.x + node.radius + 90);
    maxY = Math.max(maxY, node.y + node.radius + 100);
  }
  const particleBudget = Math.min(120, Math.max(edges.length, 24 + edges.length * 2));
  return {
    nodes,
    edges,
    events,
    seed,
    layoutVersion: 'SELECTED_POLICY_SCC_LAYOUT_V1',
    policyFlowVersion: flow.version,
    policyFlowStatus: flow.status,
    sourceBundleId: flow.sourceBundleId,
    sourcePolicyFingerprint: flow.sourcePolicyFingerprint,
    acquisitionContext,
    selectedRouteNodeIds: orderedIds,
    selectedRouteEdgeIds: edges.map((edge) => edge.id),
    recoveryEdgeIds: [...flow.recoveryEdges],
    topology: flow.topology,
    performance: { layoutMs: Math.max(0, now() - layoutStarted), particleBudget },
    bounds: {
      minX: Number.isFinite(minX) ? minX : 0,
      minY: Number.isFinite(minY) ? minY : 0,
      maxX: Number.isFinite(maxX) ? maxX : layout.width,
      maxY: Number.isFinite(maxY) ? maxY : layout.height,
      width: layout.width,
      height: layout.height,
    },
  };
}
