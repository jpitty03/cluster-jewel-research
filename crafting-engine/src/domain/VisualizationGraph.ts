import type {
  PolicyFlowEdge,
  PolicyFlowOutcomeKind,
  PolicyFlowScope,
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
  semanticBand: VisualizationSemanticBand;
  recoveryLane: boolean;
  scope: PolicyFlowScope;
  scopeLabel: string;
  progressLabel: string;
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
    requiredTargetModIds: string[];
    matchedRequiredTargetModIds: string[];
    acceptableTargetBranches: string[][];
    matchedAcceptableTargetModIds: string[];
    acceptableAlternativeSatisfied: boolean;
    satisfiedAcceptableBranchIndices: number[];
    fracturedTargetModIds: string[];
    representativeState?: string;
    representativeStateKey?: string;
    routeStatus: string;
    technicalStateSummary: string;
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
  routing: 'PROGRESS' | 'BACK_EDGE' | 'RECOVERY_CORRIDOR' | 'SELF_LOOP' | 'SCOPE_HANDOFF';
  isScopeHandoff: boolean;
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
  layoutEvidence: VisualizationLayoutEvidence;
  scopeEvidence: VisualizationScopeEvidence;
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
  };
}

export type VisualizationSemanticBand =
  | 'ACQUISITION_NORMAL'
  | 'MAGIC_ROLLING'
  | 'PROMOTION'
  | 'RARE_FINISHING'
  | 'RECOVERY'
  | 'GOAL';

export interface VisualizationLayoutEvidence {
  mode: 'SCC_HYBRID_SEMANTIC_V2';
  largeSccThreshold: number;
  largeSccCount: number;
  largeSccNodeCount: number;
  semanticBandCount: number;
  horizontalSpan: number;
  verticalSpan: number;
  minimumNodeCenterDistance: number;
  recoveryCorridorEdgeCount: number;
  defaultChronologicalOrdinals: false;
  labelAwareFit: true;
  fitMarginsPx: { left: number; right: number; top: number; bottom: number };
}

export interface VisualizationScopeEvidence {
  acquisitionNodeIds: string[];
  downstreamNodeIds: string[];
  handoffEdgeIds: string[];
  acquisitionHeader: string;
  downstreamHeader: string;
  acquisitionCenterX?: number;
  downstreamCenterX?: number;
  headerY: number;
  boundaryX?: number;
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
  layoutMode: 'SINGLE' | 'RING' | 'SEMANTIC_LAYERED';
}

const LARGE_SCC_THRESHOLD = 8;
const SEMANTIC_COLUMN_SPACING = 280;
const SEMANTIC_ROW_SPACING = 112;

function semanticBand(
  node: PolicyFlowSummary['nodes'][number],
): { index: number; name: VisualizationSemanticBand } {
  if (node.terminal) return { index: 5, name: 'GOAL' };
  // Scope says which exact solver component supplied the state, not where that
  // state belongs visually. Acquisition synthesis contains its own Magic/Rare
  // rolling loop, so classify those nodes by craft semantics as well. Recovery
  // must win over scope/rarity so every reset uses the separate corridor band.
  if (node.recoveryLike) return { index: 4, name: 'RECOVERY' };
  if (
    node.acquisitionMenu || node.rarity === 'normal' ||
    (node.scope === 'ACQUISITION' && node.rarity === undefined)
  ) {
    return { index: 0, name: 'ACQUISITION_NORMAL' };
  }
  if (node.rarity === 'magic') {
    return node.selectedActionId === 'regal_orb'
      ? { index: 2, name: 'PROMOTION' }
      : { index: 1, name: 'MAGIC_ROLLING' };
  }
  if (node.rarity === 'rare') return { index: 3, name: 'RARE_FINISHING' };
  return { index: 3, name: 'RARE_FINISHING' };
}

function minimumNodeDistance(
  positions: ReadonlyMap<string, { x: number; y: number }>,
): number {
  const entries = [...positions.values()];
  let minimum = Infinity;
  for (let left = 0; left < entries.length; left += 1) {
    for (let right = left + 1; right < entries.length; right += 1) {
      minimum = Math.min(
        minimum,
        Math.hypot(entries[left].x - entries[right].x, entries[left].y - entries[right].y),
      );
    }
  }
  return Number.isFinite(minimum) ? minimum : 0;
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
  evidence: Omit<VisualizationLayoutEvidence,
    'mode' | 'recoveryCorridorEdgeCount' | 'defaultChronologicalOrdinals' |
    'labelAwareFit' | 'fitMarginsPx'>;
} {
  const nodeById = new Map(flow.nodes.map((node) => [node.id, node]));
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
  const componentsByRank = new Map<number, number[]>();
  componentNodes.forEach((_, componentId) => {
    const rank = ranks.get(componentId) ?? 0;
    const row = componentsByRank.get(rank) ?? [];
    row.push(componentId);
    componentsByRank.set(rank, row);
  });
  const selfLoops = new Set(flow.edges
    .filter((edge) => edge.sourceNodeId === edge.targetNodeId)
    .map((edge) => edge.sourceNodeId));
  const componentSpan = new Map<number, number>();
  const componentHeight = new Map<number, number>();
  const largeComponents = new Set<number>();
  componentNodes.forEach((nodeIds, componentId) => {
    if (nodeIds.length > LARGE_SCC_THRESHOLD) {
      largeComponents.add(componentId);
      const bands = nodeIds.map((nodeId) => semanticBand(nodeById.get(nodeId)!).index);
      const bandGroups = new Map<number, number>();
      for (const band of bands) bandGroups.set(band, (bandGroups.get(band) ?? 0) + 1);
      const span = Math.max(...bands) - Math.min(...bands) + 1;
      const largestBand = Math.max(1, ...bandGroups.values());
      componentSpan.set(componentId, span);
      componentHeight.set(componentId, 176 + Math.max(0, largestBand - 1) * SEMANTIC_ROW_SPACING);
    } else if (nodeIds.length > 1) {
      const ringRadius = Math.max(72, Math.min(125, 46 + nodeIds.length * 12));
      componentSpan.set(componentId, 1);
      componentHeight.set(componentId, ringRadius * 2 + 130);
    } else {
      componentSpan.set(componentId, 1);
      componentHeight.set(componentId, 180);
    }
  });

  const rankStartColumn = new Map<number, number>();
  let nextColumn = 0;
  for (let rank = 0; rank <= maximumRank; rank += 1) {
    rankStartColumn.set(rank, nextColumn);
    const span = Math.max(
      1,
      ...(componentsByRank.get(rank) ?? []).map((componentId) =>
        componentSpan.get(componentId) ?? 1
      ),
    );
    nextColumn += span;
  }
  const computedWidth = Math.max(
    width,
    260 + Math.max(0, nextColumn - 1) * SEMANTIC_COLUMN_SPACING,
  );
  const rankContentHeights = new Map<number, number>();
  for (const [rank, componentIds] of componentsByRank) {
    rankContentHeights.set(
      rank,
      componentIds.reduce(
        (sum, componentId) => sum + (componentHeight.get(componentId) ?? 180),
        0,
      ) + Math.max(0, componentIds.length - 1) * 64,
    );
  }
  const computedHeight = Math.max(height, 120 + Math.max(0, ...rankContentHeights.values()));
  const positions = new Map<string, { x: number; y: number }>();
  const positionedComponents: PositionedComponent[] = [];
  for (const [rank, componentIds] of [...componentsByRank.entries()].sort((a, b) => a[0] - b[0])) {
    componentIds.sort((left, right) => {
      const leftVisits = componentNodes[left].reduce((sum, nodeId) =>
        sum + (nodeById.get(nodeId)?.expectedVisits ?? 0), 0);
      const rightVisits = componentNodes[right].reduce((sum, nodeId) =>
        sum + (nodeById.get(nodeId)?.expectedVisits ?? 0), 0);
      return rightVisits - leftVisits || componentNodes[left][0].localeCompare(componentNodes[right][0]);
    });
    const contentHeight = rankContentHeights.get(rank) ?? 0;
    let cursorY = (computedHeight - contentHeight) / 2;
    componentIds.forEach((componentId) => {
      const nodeIds = componentNodes[componentId];
      const requiredHeight = componentHeight.get(componentId) ?? 180;
      const span = componentSpan.get(componentId) ?? 1;
      const startColumn = rankStartColumn.get(rank) ?? rank;
      const centerX = 130 + (startColumn + (span - 1) / 2) * SEMANTIC_COLUMN_SPACING;
      const centerY = cursorY + requiredHeight / 2;
      const cyclic = nodeIds.length > 1 || selfLoops.has(nodeIds[0]);
      const layoutMode = largeComponents.has(componentId)
        ? 'SEMANTIC_LAYERED' as const
        : nodeIds.length > 1
          ? 'RING' as const
          : 'SINGLE' as const;
      positionedComponents.push({
        id: componentId,
        nodeIds,
        rank,
        centerX,
        centerY,
        cyclic,
        layoutMode,
      });
      if (nodeIds.length === 1) {
        positions.set(nodeIds[0], { x: centerX, y: centerY });
      } else if (layoutMode === 'RING') {
        const ringRadius = Math.max(72, Math.min(125, 46 + nodeIds.length * 12));
        nodeIds.forEach((nodeId, nodeIndex) => {
          const angle = -Math.PI / 2 + nodeIndex * Math.PI * 2 / nodeIds.length;
          positions.set(nodeId, {
            x: centerX + Math.cos(angle) * ringRadius,
            y: centerY + Math.sin(angle) * ringRadius,
          });
        });
      } else {
        const bandGroups = new Map<number, string[]>();
        for (const nodeId of nodeIds) {
          const band = semanticBand(nodeById.get(nodeId)!).index;
          const group = bandGroups.get(band) ?? [];
          group.push(nodeId);
          bandGroups.set(band, group);
        }
        const baseCompare = (leftId: string, rightId: string): number => {
          const left = nodeById.get(leftId)!;
          const right = nodeById.get(rightId)!;
          const leftAffixes = (left.prefixCount ?? 0) + (left.suffixCount ?? 0);
          const rightAffixes = (right.prefixCount ?? 0) + (right.suffixCount ?? 0);
          return structuredProgressScore(right) - structuredProgressScore(left) ||
            leftAffixes - rightAffixes ||
            (left.selectedActionId ?? '').localeCompare(right.selectedActionId ?? '') ||
            right.expectedVisits - left.expectedVisits ||
            leftId.localeCompare(rightId);
        };
        for (const group of bandGroups.values()) group.sort(baseCompare);
        const internalEdges = flow.edges.filter((edge) =>
          nodeIds.includes(edge.sourceNodeId) && nodeIds.includes(edge.targetNodeId) &&
          edge.sourceNodeId !== edge.targetNodeId &&
          edge.outcomeKind !== 'RECOVERY' && edge.outcomeKind !== 'REACQUIRE'
        );
        for (let sweep = 0; sweep < 4; sweep += 1) {
          const order = new Map<string, number>();
          for (const group of bandGroups.values()) {
            group.forEach((nodeId, index) => order.set(nodeId, index));
          }
          for (const [band, group] of [...bandGroups.entries()].sort((a, b) =>
            sweep % 2 === 0 ? a[0] - b[0] : b[0] - a[0]
          )) {
            const barycenter = new Map<string, number>();
            for (const nodeId of group) {
              const neighbors = internalEdges.flatMap((edge) => {
                if (edge.sourceNodeId === nodeId && semanticBand(nodeById.get(edge.targetNodeId)!).index !== band) {
                  return [edge.targetNodeId];
                }
                if (edge.targetNodeId === nodeId && semanticBand(nodeById.get(edge.sourceNodeId)!).index !== band) {
                  return [edge.sourceNodeId];
                }
                return [];
              });
              if (neighbors.length > 0) {
                barycenter.set(
                  nodeId,
                  neighbors.reduce((sum, neighbor) => sum + (order.get(neighbor) ?? 0), 0) /
                    neighbors.length,
                );
              }
            }
            group.sort((left, right) => {
              const leftNode = nodeById.get(left)!;
              const rightNode = nodeById.get(right)!;
              return structuredProgressScore(rightNode) - structuredProgressScore(leftNode) ||
                (barycenter.get(left) ?? Infinity) - (barycenter.get(right) ?? Infinity) ||
                baseCompare(left, right);
            });
          }
        }
        const minimumBand = Math.min(...bandGroups.keys());
        for (const [band, group] of bandGroups) {
          const groupSpan = Math.max(0, group.length - 1) * SEMANTIC_ROW_SPACING;
          const startY = centerY - groupSpan / 2;
          group.forEach((nodeId, rowIndex) => {
            positions.set(nodeId, {
              x: 130 + (startColumn + band - minimumBand) * SEMANTIC_COLUMN_SPACING,
              y: startY + rowIndex * SEMANTIC_ROW_SPACING,
            });
          });
        }
      }
      cursorY += requiredHeight + 64;
    });
  }
  const largeNodeIds = [...largeComponents].flatMap((componentId) =>
    componentNodes[componentId]
  );
  const largePositions = largeNodeIds.flatMap((nodeId) => {
    const position = positions.get(nodeId);
    return position ? [position] : [];
  });
  const semanticBands = new Set(largeNodeIds.map((nodeId) =>
    semanticBand(nodeById.get(nodeId)!).name
  ));
  return {
    components: positionedComponents,
    positionByNodeId: positions,
    width: computedWidth,
    height: computedHeight,
    evidence: {
      largeSccThreshold: LARGE_SCC_THRESHOLD,
      largeSccCount: largeComponents.size,
      largeSccNodeCount: largeNodeIds.length,
      semanticBandCount: semanticBands.size,
      horizontalSpan: largePositions.length > 0
        ? Math.max(...largePositions.map((position) => position.x)) -
          Math.min(...largePositions.map((position) => position.x))
        : 0,
      verticalSpan: largePositions.length > 0
        ? Math.max(...largePositions.map((position) => position.y)) -
          Math.min(...largePositions.map((position) => position.y))
        : 0,
      minimumNodeCenterDistance: minimumNodeDistance(positions),
    },
  };
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

function scopeTargetCount(node: PolicyFlowSummary['nodes'][number]): number {
  if (node.requiredTargetModIds?.length) return node.requiredTargetModIds.length;
  const legacy = /\b\d+\/(\d+) targets\b/.exec(node.stateSummary);
  return legacy ? Number(legacy[1]) : Math.max(1, node.matchedTargetModIds.length);
}

function structuredProgressScore(node: PolicyFlowSummary['nodes'][number]): number {
  const required = node.matchedRequiredTargetModIds?.length ?? node.matchedTargetModIds.length;
  const alternative = node.acceptableAlternativeSatisfied ? 1 : 0;
  return required * 2 + alternative;
}

function scopeProgressLabel(node: PolicyFlowSummary['nodes'][number]): string {
  const targetCount = scopeTargetCount(node);
  const requiredIds = node.requiredTargetModIds ?? [];
  const matchedRequiredIds = node.matchedRequiredTargetModIds ?? node.matchedTargetModIds;
  const matched = matchedRequiredIds.length;
  const acceptableBranches = node.acceptableTargetBranches ?? [];
  const acceptableMatchedIds = node.matchedAcceptableTargetModIds ?? [];
  const acceptableSatisfied = node.acceptableAlternativeSatisfied ?? false;
  const hasStructuredAlternatives = acceptableBranches.length > 0;
  const alternative = acceptableBranches.length > 0
    ? ` · Alternative ${acceptableSatisfied ? '1/1' : '0/1'}${acceptableMatchedIds.length > 0
        ? ` - ${acceptableMatchedIds.join(', ')}`
        : ''}`
    : '';
  if (node.terminal && !hasStructuredAlternatives) return 'Final target complete';
  if (node.terminal) {
    return `Final target complete · Required ${matched}/${requiredIds.length || targetCount}${alternative}`;
  }
  const rarity = node.rarity
    ? `${node.rarity[0].toUpperCase()}${node.rarity.slice(1)}`
    : 'State';
  const fractured = node.fracturedTargetModIds.length > 0
    ? ` · ${node.fracturedTargetModIds.length} fractured`
    : '';
  if (node.scope === 'ACQUISITION') {
    const progress = matched >= targetCount && node.fracturedTargetModIds.length > 0
      ? `Fracture prep complete - ${matched}/${targetCount} prep target`
      : `Prep target ${matched}/${targetCount}`;
    return `${progress} - ${rarity}${fractured}`;
  }
  if (!hasStructuredAlternatives) return `Final targets ${matched}/${targetCount} - ${rarity}${fractured}`;
  return `Required ${matched}/${requiredIds.length || targetCount}${alternative} - ${rarity}${fractured}`;
}

/** Deterministic, cycle-aware layout of the exact selected-policy flow summary. */
export function buildVisualizationGraph(
  flow: PolicyFlowSummary,
  options: GraphBuildOptions = {},
): VisualizationGraph {
  const layoutStarted = now();
  const seed = options.seed ?? `${flow.sourceBundleId}:${flow.sourcePolicyFingerprint ?? 'policy'}`;
  const acquisitionContext = options.acquisitionContext ?? { kind: 'OTHER' };
  const layout = componentLayout(flow, options.width ?? 1000, options.height ?? 760);
  const descriptorById = new Map((options.modifierDescriptors ?? []).map((descriptor) => [descriptor.modId, descriptor]));
  const maximumVisits = Math.max(1e-12, ...flow.nodes.map((node) => node.expectedVisits));
  const visitScale = Math.log1p(maximumVisits);
  const orderedIds = deterministicPolicyOrder(flow);
  const stepById = new Map(orderedIds.map((nodeId, index) => [nodeId, index + 1]));
  const nodes: VisualizationNode[] = flow.nodes.map((node) => {
    const position = layout.positionByNodeId.get(node.id) ?? { x: 100, y: layout.height / 2 };
    const normalizedVisits = visitScale > 0 ? Math.log1p(node.expectedVisits) / visitScale : 0;
    const requiredTargetModIds = node.requiredTargetModIds ?? [];
    const matchedRequiredTargetModIds = node.matchedRequiredTargetModIds ?? node.matchedTargetModIds;
    const acceptableTargetBranches = node.acceptableTargetBranches ?? [];
    const matchedAcceptableTargetModIds = node.matchedAcceptableTargetModIds ?? [];
    const technicalModifiers = [...new Set([
      ...node.matchedTargetModIds,
      ...matchedRequiredTargetModIds,
      ...matchedAcceptableTargetModIds,
      ...node.fracturedTargetModIds,
    ])]
      .flatMap((modId) => descriptorById.get(modId) ?? []);
    const progressLabel = scopeProgressLabel(node);
    const scopeLabel = node.scope === 'ACQUISITION'
      ? acquisitionContext.kind === 'SELF_FRACTURE'
        ? 'Self-fracture preparation'
        : 'Acquisition preparation'
      : 'Final crafting';
    return {
      id: node.id,
      label: node.label,
      sublabel: `${progressLabel}${node.recoveryLike ? ' - recovery' : ''}`,
      fullLabel: node.terminal
        ? 'Goal: final-craft target satisfied'
        : `${scopeLabel}: ${node.label} - ${progressLabel}`,
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
      semanticBand: semanticBand(node).name,
      recoveryLane: node.recoveryLike,
      scope: node.scope,
      scopeLabel,
      progressLabel,
      details: {
        title: node.terminal ? 'Final target complete' : progressLabel,
        phase: scopeLabel,
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
        requiredTargetModIds: [...requiredTargetModIds],
        matchedRequiredTargetModIds: [...matchedRequiredTargetModIds],
        acceptableTargetBranches: acceptableTargetBranches.map((branch) => [...branch]),
        matchedAcceptableTargetModIds: [...matchedAcceptableTargetModIds],
        acceptableAlternativeSatisfied: node.acceptableAlternativeSatisfied ?? false,
        satisfiedAcceptableBranchIndices: [...(node.satisfiedAcceptableBranchIndices ?? [])],
        fracturedTargetModIds: [...node.fracturedTargetModIds],
        representativeState: node.representativeState,
        representativeStateKey: node.representativeStateKey,
        routeStatus: node.terminal
          ? 'Selected policy final-craft success'
          : node.recoveryLike
            ? 'Selected recovery policy state'
            : 'Exact selected-policy macro state',
        technicalStateSummary: node.stateSummary,
        technicalModifiers,
      },
    };
  });
  const maximumFlow = Math.max(1e-12, ...flow.edges.map((edge) => edge.expectedFlow));
  const flowScale = Math.log1p(maximumFlow);
  const outgoingIndex = new Map<string, number>();
  const recoveryEdgeIds = new Set(flow.recoveryEdges);
  let recoveryCorridorIndex = 0;
  const edges: VisualizationEdge[] = flow.edges.map((edge) => {
    const source = nodes.find((node) => node.id === edge.sourceNodeId);
    const target = nodes.find((node) => node.id === edge.targetNodeId);
    const sameNode = edge.sourceNodeId === edge.targetNodeId;
    const branchIndex = outgoingIndex.get(edge.sourceNodeId) ?? 0;
    outgoingIndex.set(edge.sourceNodeId, branchIndex + 1);
    const flowImportance = flowScale > 0 ? Math.log1p(edge.expectedFlow) / flowScale : 0;
    const backwards = Boolean(source && target && target.x <= source.x);
    const recovery = recoveryEdgeIds.has(edge.id) ||
      edge.outcomeKind === 'RECOVERY' || edge.outcomeKind === 'REACQUIRE';
    const isScopeHandoff = edge.evidenceKind === 'CERTIFIED_SCOPE_HANDOFF';
    const routing: VisualizationEdge['routing'] = sameNode
      ? 'SELF_LOOP'
      : isScopeHandoff
        ? 'SCOPE_HANDOFF'
        : recovery
        ? 'RECOVERY_CORRIDOR'
        : backwards
          ? 'BACK_EDGE'
          : 'PROGRESS';
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
    const recoveryLane = recovery ? recoveryCorridorIndex++ % 5 : 0;
    const recoveryCorridorY = layout.height - 68 - recoveryLane * 30;
    const controlX = sameNode
      ? sourceX + (branchIndex % 2 === 0 ? 86 : -86)
      : recovery && !isScopeHandoff
        ? midX
        : midX + (-dy / (distance || 1)) * distance * curvature;
    const controlY = sameNode
      ? sourceY - 104
      : recovery && !isScopeHandoff
        ? recoveryCorridorY * 2 - midY
        : midY + (dx / (distance || 1)) * distance * curvature;
    const sourceFlowNode = flow.nodes.find((node) => node.id === edge.sourceNodeId);
    const targetFlowNode = flow.nodes.find((node) => node.id === edge.targetNodeId);
    const ordinaryLabel = branchLabel(edge, sourceFlowNode, targetFlowNode);
    return {
      id: edge.id,
      source: edge.sourceNodeId,
      target: edge.targetNodeId,
      actionLabel: isScopeHandoff
        ? `${edge.actionName} - certified acquisition -> final crafting - ${(edge.conditionalProbability * 100).toFixed(1)}%`
        : ordinaryLabel,
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
      routing,
      isScopeHandoff,
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
  const acquisitionNodes = nodes.filter((node) => node.scope === 'ACQUISITION');
  const downstreamNodes = nodes.filter((node) => node.scope === 'DOWNSTREAM');
  const meanX = (values: VisualizationNode[]) => values.length > 0
    ? values.reduce((sum, node) => sum + node.x, 0) / values.length
    : undefined;
  const acquisitionCenterX = meanX(acquisitionNodes);
  const downstreamCenterX = meanX(downstreamNodes);
  const minimumNodeY = nodes.length > 0 ? Math.min(...nodes.map((node) => node.y - node.radius)) : 0;
  const headerY = minimumNodeY - 62;
  const acquisitionRight = acquisitionNodes.length > 0
    ? Math.max(...acquisitionNodes.map((node) => node.x + node.radius))
    : undefined;
  const downstreamLeft = downstreamNodes.length > 0
    ? Math.min(...downstreamNodes.map((node) => node.x - node.radius))
    : undefined;
  const boundaryX = acquisitionRight !== undefined && downstreamLeft !== undefined
    ? (acquisitionRight + downstreamLeft) / 2
    : acquisitionCenterX !== undefined && downstreamCenterX !== undefined
      ? (acquisitionCenterX + downstreamCenterX) / 2
      : undefined;
  const scopeEvidence: VisualizationScopeEvidence = {
    acquisitionNodeIds: acquisitionNodes.map((node) => node.id),
    downstreamNodeIds: downstreamNodes.map((node) => node.id),
    handoffEdgeIds: edges.filter((edge) => edge.isScopeHandoff).map((edge) => edge.id),
    acquisitionHeader: acquisitionContext.kind === 'SELF_FRACTURE'
      ? 'SELF-FRACTURE PREPARATION'
      : 'ACQUISITION PREPARATION',
    downstreamHeader: 'FINAL CRAFTING',
    acquisitionCenterX,
    downstreamCenterX,
    headerY,
    boundaryX,
  };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    minX = Math.min(minX, node.x - node.radius - 12);
    minY = Math.min(minY, node.y - node.radius - 12);
    maxX = Math.max(maxX, node.x + node.radius + 12);
    maxY = Math.max(maxY, node.y + node.radius + 12);
  }
  for (const edge of edges) {
    const source = nodes.find((node) => node.id === edge.source);
    const target = nodes.find((node) => node.id === edge.target);
    if (!source || !target) continue;
    const middleX = source.x * 0.25 + edge.controlX * 0.5 + target.x * 0.25;
    const middleY = source.y * 0.25 + edge.controlY * 0.5 + target.y * 0.25;
    minX = Math.min(minX, middleX - 40);
    minY = Math.min(minY, middleY - 40);
    maxX = Math.max(maxX, middleX + 40);
    maxY = Math.max(maxY, middleY + 40);
  }
  if (acquisitionNodes.length > 0 || downstreamNodes.length > 0) {
    minY = Math.min(minY, headerY - 18);
  }
  const particleBudget = Math.min(120, Math.max(edges.length, 24 + edges.length * 2));
  return {
    nodes,
    edges,
    events,
    seed,
    layoutVersion: 'SELECTED_POLICY_SEMANTIC_SCC_LAYOUT_V2',
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
    layoutEvidence: {
      mode: 'SCC_HYBRID_SEMANTIC_V2',
      ...layout.evidence,
      recoveryCorridorEdgeCount: edges.filter((edge) =>
        edge.routing === 'RECOVERY_CORRIDOR'
      ).length,
      defaultChronologicalOrdinals: false,
      labelAwareFit: true,
      fitMarginsPx: { left: 176, right: 176, top: 84, bottom: 82 },
    },
    scopeEvidence,
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
