import type {
  VisualizationEdge,
  VisualizationGraph,
  VisualizationNode,
} from '../../crafting-engine/src/domain/VisualizationGraph.ts';

export const MANUAL_CONSTELLATION_LAYOUT_SCHEMA = 'MANUAL_CONSTELLATION_LAYOUT_V1' as const;
export const MANUAL_CONSTELLATION_LAYOUT_STORAGE_PREFIX =
  'cluster-jewel-research:manual-constellation-layout:';

export interface ConstellationNodePosition {
  x: number;
  y: number;
}

export type ConstellationLayoutOverrides = Record<string, ConstellationNodePosition>;

export interface ConstellationLayoutIdentity {
  schemaVersion: typeof MANUAL_CONSTELLATION_LAYOUT_SCHEMA;
  layoutVersion: string;
  sourcePolicyFingerprint: string;
  topologyFingerprint: string;
  nodeIds: string[];
  serialized: string;
  storageKey: string;
  persistenceEligible: boolean;
}

export interface ConstellationGraphBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface ConstellationStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface PersistedConstellationLayout {
  schemaVersion: typeof MANUAL_CONSTELLATION_LAYOUT_SCHEMA;
  identity: {
    layoutVersion: string;
    sourcePolicyFingerprint: string;
    topologyFingerprint: string;
    nodeIds: string[];
  };
  positions: ConstellationLayoutOverrides;
}

function hashText(value: string): string {
  // Two independent 32-bit FNV lanes keep storage keys compact. The complete
  // identity remains inside the record and is compared exactly on load, so a
  // key collision can never apply one policy's coordinates to another.
  let left = 0x811c9dc5;
  let right = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    left ^= code;
    left = Math.imul(left, 0x01000193);
    right ^= code + index;
    right = Math.imul(right, 0x85ebca6b);
  }
  return `${(left >>> 0).toString(16).padStart(8, '0')}${
    (right >>> 0).toString(16).padStart(8, '0')
  }`;
}

function identityPayload(identity: Pick<
  ConstellationLayoutIdentity,
  'layoutVersion' | 'sourcePolicyFingerprint' | 'topologyFingerprint' | 'nodeIds'
>): PersistedConstellationLayout['identity'] {
  return {
    layoutVersion: identity.layoutVersion,
    sourcePolicyFingerprint: identity.sourcePolicyFingerprint,
    topologyFingerprint: identity.topologyFingerprint,
    nodeIds: [...identity.nodeIds],
  };
}

function serializedIdentity(
  identity: PersistedConstellationLayout['identity'],
): string {
  return JSON.stringify({
    schemaVersion: MANUAL_CONSTELLATION_LAYOUT_SCHEMA,
    ...identity,
  });
}

export function createConstellationLayoutIdentity(
  graph: VisualizationGraph,
): ConstellationLayoutIdentity {
  const sourcePolicyFingerprint = graph.sourcePolicyFingerprint?.trim() ?? '';
  const payload: PersistedConstellationLayout['identity'] = {
    layoutVersion: graph.layoutVersion,
    sourcePolicyFingerprint,
    topologyFingerprint: graph.topology.fingerprint,
    nodeIds: graph.nodes.map((node) => node.id).sort((left, right) => left.localeCompare(right)),
  };
  const serialized = serializedIdentity(payload);
  return {
    schemaVersion: MANUAL_CONSTELLATION_LAYOUT_SCHEMA,
    ...payload,
    serialized,
    storageKey: `${MANUAL_CONSTELLATION_LAYOUT_STORAGE_PREFIX}${hashText(serialized)}`,
    // A missing policy fingerprint is deliberately not weakened to topology,
    // labels, node count, or array order. Such a graph remains fully usable but
    // its visual coordinates are not persisted.
    persistenceEligible: sourcePolicyFingerprint.length > 0,
  };
}

function finitePosition(value: unknown): value is ConstellationNodePosition {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<ConstellationNodePosition>;
  return typeof candidate.x === 'number' && Number.isFinite(candidate.x) &&
    typeof candidate.y === 'number' && Number.isFinite(candidate.y);
}

export function sanitizeConstellationLayoutOverrides(
  overrides: unknown,
  identity: ConstellationLayoutIdentity,
): ConstellationLayoutOverrides {
  if (overrides === null || typeof overrides !== 'object' || Array.isArray(overrides)) return {};
  const knownNodeIds = new Set(identity.nodeIds);
  const sanitized: ConstellationLayoutOverrides = {};
  for (const [nodeId, position] of Object.entries(overrides)) {
    if (!knownNodeIds.has(nodeId) || !finitePosition(position)) continue;
    sanitized[nodeId] = { x: position.x, y: position.y };
  }
  return sanitized;
}

export function serializeConstellationLayout(
  identity: ConstellationLayoutIdentity,
  overrides: ConstellationLayoutOverrides,
): string | undefined {
  if (!identity.persistenceEligible) return undefined;
  const positions = sanitizeConstellationLayoutOverrides(overrides, identity);
  const orderedPositions = Object.fromEntries(
    Object.entries(positions).sort(([left], [right]) => left.localeCompare(right)),
  );
  const record: PersistedConstellationLayout = {
    schemaVersion: MANUAL_CONSTELLATION_LAYOUT_SCHEMA,
    identity: identityPayload(identity),
    positions: orderedPositions,
  };
  return JSON.stringify(record);
}

export function parseConstellationLayout(
  serialized: string | null | undefined,
  identity: ConstellationLayoutIdentity,
): ConstellationLayoutOverrides {
  if (!serialized || !identity.persistenceEligible) return {};
  try {
    const parsed = JSON.parse(serialized) as Partial<PersistedConstellationLayout>;
    if (parsed.schemaVersion !== MANUAL_CONSTELLATION_LAYOUT_SCHEMA) return {};
    if (parsed.identity === null || typeof parsed.identity !== 'object') return {};
    const candidateIdentity = parsed.identity as PersistedConstellationLayout['identity'];
    if (!Array.isArray(candidateIdentity.nodeIds) ||
      candidateIdentity.nodeIds.some((nodeId) => typeof nodeId !== 'string')) return {};
    const normalizedCandidate = {
      ...candidateIdentity,
      nodeIds: [...candidateIdentity.nodeIds].sort((left, right) => left.localeCompare(right)),
    };
    if (serializedIdentity(normalizedCandidate) !== identity.serialized) return {};
    return sanitizeConstellationLayoutOverrides(parsed.positions, identity);
  } catch {
    return {};
  }
}

export function loadConstellationLayout(
  storage: ConstellationStorage | undefined,
  identity: ConstellationLayoutIdentity,
): ConstellationLayoutOverrides {
  if (!storage || !identity.persistenceEligible) return {};
  try {
    return parseConstellationLayout(storage.getItem(identity.storageKey), identity);
  } catch {
    return {};
  }
}

export function persistConstellationLayout(
  storage: ConstellationStorage | undefined,
  identity: ConstellationLayoutIdentity,
  overrides: ConstellationLayoutOverrides,
): boolean {
  if (!storage || !identity.persistenceEligible) return false;
  try {
    const sanitized = sanitizeConstellationLayoutOverrides(overrides, identity);
    if (Object.keys(sanitized).length === 0) {
      storage.removeItem(identity.storageKey);
      return true;
    }
    const serialized = serializeConstellationLayout(identity, sanitized);
    if (!serialized) return false;
    storage.setItem(identity.storageKey, serialized);
    return true;
  } catch {
    return false;
  }
}

export function removePersistedConstellationLayout(
  storage: ConstellationStorage | undefined,
  identity: ConstellationLayoutIdentity,
): boolean {
  if (!storage || !identity.persistenceEligible) return false;
  try {
    storage.removeItem(identity.storageKey);
    return true;
  } catch {
    return false;
  }
}

function effectiveControlPoint(
  edge: VisualizationEdge,
  canonicalSource: VisualizationNode,
  canonicalTarget: VisualizationNode,
  source: VisualizationNode,
  target: VisualizationNode,
): { controlX: number; controlY: number } {
  if (edge.routing === 'SELF_LOOP' || edge.source === edge.target) {
    return {
      controlX: edge.controlX + source.x - canonicalSource.x,
      controlY: edge.controlY + source.y - canonicalSource.y,
    };
  }

  const midpointX = (source.x + target.x) / 2;
  const midpointY = (source.y + target.y) / 2;
  if (edge.routing === 'RECOVERY_CORRIDOR') {
    const canonicalMidpointX = (canonicalSource.x + canonicalTarget.x) / 2;
    const canonicalMidpointY = (canonicalSource.y + canonicalTarget.y) / 2;
    return {
      controlX: midpointX + edge.controlX - canonicalMidpointX,
      controlY: midpointY + edge.controlY - canonicalMidpointY,
    };
  }

  // Progress, back-edge, and certified-handoff curves use the same canonical
  // curvature category against their effective endpoints. Identity, flow, and
  // classification stay on the untouched canonical edge.
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const distance = Math.hypot(dx, dy);
  return {
    controlX: midpointX + (-dy / (distance || 1)) * distance * edge.curvature,
    controlY: midpointY + (dx / (distance || 1)) * distance * edge.curvature,
  };
}

function effectiveScopeEvidence(
  graph: VisualizationGraph,
  nodes: VisualizationNode[],
): VisualizationGraph['scopeEvidence'] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const acquisitionNodes = graph.scopeEvidence.acquisitionNodeIds
    .map((nodeId) => nodeById.get(nodeId))
    .filter((node): node is VisualizationNode => node !== undefined);
  const downstreamNodes = graph.scopeEvidence.downstreamNodeIds
    .map((nodeId) => nodeById.get(nodeId))
    .filter((node): node is VisualizationNode => node !== undefined);
  const meanX = (values: VisualizationNode[]): number | undefined => values.length > 0
    ? values.reduce((sum, node) => sum + node.x, 0) / values.length
    : undefined;
  const acquisitionCenterX = meanX(acquisitionNodes);
  const downstreamCenterX = meanX(downstreamNodes);
  const minimumNodeY = nodes.length > 0
    ? Math.min(...nodes.map((node) => node.y - node.radius))
    : graph.scopeEvidence.headerY + 62;
  const acquisitionRight = acquisitionNodes.length > 0
    ? Math.max(...acquisitionNodes.map((node) => node.x + node.radius))
    : undefined;
  const downstreamLeft = downstreamNodes.length > 0
    ? Math.min(...downstreamNodes.map((node) => node.x - node.radius))
    : undefined;
  // Once scopes overlap horizontally, a divider would imply a false semantic
  // reclassification. Node colors/labels and the certified handoff remain the
  // truthful cues, so omit only the divider in that presentation state.
  const boundaryX = acquisitionRight !== undefined && downstreamLeft !== undefined &&
    acquisitionRight < downstreamLeft
    ? (acquisitionRight + downstreamLeft) / 2
    : undefined;
  return {
    ...graph.scopeEvidence,
    acquisitionCenterX,
    downstreamCenterX,
    headerY: minimumNodeY - 62,
    boundaryX,
  };
}

function effectiveBounds(
  graph: VisualizationGraph,
  nodes: VisualizationNode[],
  edges: VisualizationEdge[],
  scopeEvidence: VisualizationGraph['scopeEvidence'],
): VisualizationGraph['bounds'] {
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
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  for (const edge of edges) {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!source || !target) continue;
    // A quadratic Bezier remains inside the convex hull of its endpoints and
    // control point. Including all three is conservative and keeps rerouted
    // recovery/handoff corridors inside Fit All.
    minX = Math.min(minX, source.x - 40, target.x - 40, edge.controlX - 40);
    minY = Math.min(minY, source.y - 40, target.y - 40, edge.controlY - 40);
    maxX = Math.max(maxX, source.x + 40, target.x + 40, edge.controlX + 40);
    maxY = Math.max(maxY, source.y + 40, target.y + 40, edge.controlY + 40);
  }
  if (scopeEvidence.acquisitionNodeIds.length > 0 || scopeEvidence.downstreamNodeIds.length > 0) {
    minY = Math.min(minY, scopeEvidence.headerY - 18);
  }
  const fallback = graph.bounds;
  const safeMinX = Number.isFinite(minX) ? minX : fallback.minX;
  const safeMinY = Number.isFinite(minY) ? minY : fallback.minY;
  const safeMaxX = Number.isFinite(maxX) ? maxX : fallback.maxX;
  const safeMaxY = Number.isFinite(maxY) ? maxY : fallback.maxY;
  return {
    minX: safeMinX,
    minY: safeMinY,
    maxX: safeMaxX,
    maxY: safeMaxY,
    width: Math.max(1, safeMaxX - safeMinX),
    height: Math.max(1, safeMaxY - safeMinY),
  };
}

export function createEffectiveConstellationGraph(
  graph: VisualizationGraph,
  overrides: ConstellationLayoutOverrides,
): VisualizationGraph {
  const identity = createConstellationLayoutIdentity(graph);
  const sanitized = sanitizeConstellationLayoutOverrides(overrides, identity);
  if (Object.keys(sanitized).length === 0) return graph;

  const nodes = graph.nodes.map((node) => {
    const position = sanitized[node.id];
    return position ? { ...node, x: position.x, y: position.y } : node;
  });
  const canonicalNodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edges = graph.edges.map((edge) => {
    if (!sanitized[edge.source] && !sanitized[edge.target]) return edge;
    const canonicalSource = canonicalNodeById.get(edge.source);
    const canonicalTarget = canonicalNodeById.get(edge.target);
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!canonicalSource || !canonicalTarget || !source || !target) return edge;
    return {
      ...edge,
      ...effectiveControlPoint(edge, canonicalSource, canonicalTarget, source, target),
    };
  });
  const scopeEvidence = effectiveScopeEvidence(graph, nodes);
  return {
    ...graph,
    nodes,
    edges,
    scopeEvidence,
    bounds: effectiveBounds(graph, nodes, edges, scopeEvidence),
  };
}

export function constellationGraphBounds(
  graph: VisualizationGraph,
  mode: 'SELECTED_ROUTE' | 'ALL',
): ConstellationGraphBounds {
  const requested = mode === 'SELECTED_ROUTE'
    ? graph.nodes.filter((node) => node.isSelectedRoute)
    : graph.nodes;
  const nodes = requested.length > 0 ? requested : graph.nodes;
  if (nodes.length === 0) return { minX: 0, maxX: 1000, minY: 0, maxY: 600 };
  if (nodes.length === graph.nodes.length) {
    return {
      minX: graph.bounds.minX,
      maxX: graph.bounds.maxX,
      minY: graph.bounds.minY,
      maxY: graph.bounds.maxY,
    };
  }
  return {
    minX: Math.min(...nodes.map((node) => node.x - node.radius - 74)),
    maxX: Math.max(...nodes.map((node) => node.x + node.radius + 74)),
    minY: Math.min(...nodes.map((node) => node.y - node.radius - 70)),
    maxY: Math.max(...nodes.map((node) => node.y + node.radius + 70)),
  };
}
