import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  VisualizationEdge,
  VisualizationGraph,
  VisualizationNode,
  VisualizationWisp,
} from '../../crafting-engine/src/domain/VisualizationGraph.ts';
import {
  constellationGraphBounds,
  createConstellationLayoutIdentity,
  createEffectiveConstellationGraph,
  loadConstellationLayout,
  MANUAL_CONSTELLATION_LAYOUT_SCHEMA,
  persistConstellationLayout,
  removePersistedConstellationLayout,
  type ConstellationGraphBounds,
  type ConstellationLayoutOverrides,
  type ConstellationNodePosition,
} from './constellationLayout.ts';

export interface MarkovConstellationProps {
  graph: VisualizationGraph;
  selectedRouteName?: string;
  width?: number;
  height?: number;
  isLive?: boolean;
  deterministicMode?: boolean;
  onNodeClick?: (node: VisualizationNode) => void;
  onEdgeClick?: (edge: VisualizationEdge) => void;
  className?: string;
}

export type ConstellationFitMode = 'SELECTED_ROUTE' | 'ALL' | 'MANUAL';

export interface ConstellationCamera {
  panX: number;
  panY: number;
  zoom: number;
  fitMode: ConstellationFitMode;
  /** Retains the base fit while manual pan/zoom is active. */
  baseFitMode: Exclude<ConstellationFitMode, 'MANUAL'>;
  /** Freezes the last requested camera frame while node geometry is edited. */
  fitBounds?: ConstellationGraphBounds;
}

interface ViewportTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
  centerGraphX: number;
  centerGraphY: number;
  centerViewportX: number;
  centerViewportY: number;
  baseScale: number;
}

interface LabelLayout {
  node: VisualizationNode;
  left: number;
  top: number;
  width: number;
  height: number;
  collapsed: boolean;
}

interface EdgeLabelLayout {
  edge: VisualizationEdge;
  left: number;
  top: number;
  width: number;
  height: number;
}

interface PointerGesture {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startPanX: number;
  startPanY: number;
  startScale: number;
  moved: boolean;
  kind: 'PAN' | 'NODE';
  targetNodeId?: string;
  targetEdgeId?: string;
  startNodePosition?: ConstellationNodePosition;
  startNodeOverride?: ConstellationNodePosition;
  latestNodePosition?: ConstellationNodePosition;
}

interface KeyboardLayoutGesture {
  nodeId: string;
  startNodeOverride?: ConstellationNodePosition;
}

const ZOOM_MIN = 0.35;
const ZOOM_MAX = 5;
const DRAG_THRESHOLD = 6;
const LABEL_MARGIN = 5;
const KEYBOARD_NUDGE = 12;
const KEYBOARD_NUDGE_LARGE = 48;
const EMPTY_LAYOUT_OVERRIDES: ConstellationLayoutOverrides = {};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function calculateTransform(
  graph: VisualizationGraph,
  camera: ConstellationCamera,
  displayWidth: number,
  displayHeight: number,
): ViewportTransform {
  const baseMode = camera.fitMode === 'MANUAL' ? camera.baseFitMode : camera.fitMode;
  const bounds = camera.fitBounds ?? constellationGraphBounds(graph, baseMode);
  const graphWidth = Math.max(1, bounds.maxX - bounds.minX);
  const graphHeight = Math.max(1, bounds.maxY - bounds.minY);
  const marginFactor = displayWidth < 600 ? 0.34 : displayWidth < 900 ? 0.65 : 1;
  const configuredMargins = graph.layoutEvidence.fitMarginsPx;
  const leftMargin = Math.min(configuredMargins.left * marginFactor, displayWidth * 0.22);
  const rightMargin = Math.min(configuredMargins.right * marginFactor, displayWidth * 0.22);
  const topMargin = Math.min(configuredMargins.top * marginFactor, displayHeight * 0.18);
  const bottomMargin = Math.min(configuredMargins.bottom * marginFactor, displayHeight * 0.18);
  const availableWidth = Math.max(1, displayWidth - leftMargin - rightMargin);
  const availableHeight = Math.max(1, displayHeight - topMargin - bottomMargin);
  const baseScale = clamp(
    Math.min(
      availableWidth / graphWidth,
      availableHeight / graphHeight,
    ),
    0.08,
    2.5,
  );
  const scale = baseScale * camera.zoom;
  const centerGraphX = (bounds.minX + bounds.maxX) / 2;
  const centerGraphY = (bounds.minY + bounds.maxY) / 2;
  const centerViewportX = leftMargin + availableWidth / 2;
  const centerViewportY = topMargin + availableHeight / 2;
  return {
    scale,
    baseScale,
    centerGraphX,
    centerGraphY,
    centerViewportX,
    centerViewportY,
    offsetX: centerViewportX + camera.panX - centerGraphX * scale,
    offsetY: centerViewportY + camera.panY - centerGraphY * scale,
  };
}

function edgePoint(
  graph: VisualizationGraph,
  edge: VisualizationEdge,
  t: number,
): { x: number; y: number } {
  const source = graph.nodes.find((node) => node.id === edge.source);
  const target = graph.nodes.find((node) => node.id === edge.target);
  if (!source || !target) return { x: 0, y: 0 };
  const u = 1 - t;
  return {
    x: u * u * source.x + 2 * u * t * edge.controlX + t * t * target.x,
    y: u * u * source.y + 2 * u * t * edge.controlY + t * t * target.y,
  };
}

function rectanglesIntersect(
  left: Pick<LabelLayout, 'left' | 'top' | 'width' | 'height'>,
  right: Pick<LabelLayout, 'left' | 'top' | 'width' | 'height'>,
): boolean {
  return left.left < right.left + right.width + LABEL_MARGIN &&
    left.left + left.width + LABEL_MARGIN > right.left &&
    left.top < right.top + right.height + LABEL_MARGIN &&
    left.top + left.height + LABEL_MARGIN > right.top;
}

function labelPriority(
  node: VisualizationNode,
  selectedNodeId: string | null,
  hoveredNodeId: string | null,
  activeNodeId: string | null,
): number {
  if (node.id === selectedNodeId) return 0;
  if (node.id === activeNodeId) return 1;
  if (node.id === hoveredNodeId) return 2;
  if (node.kind === 'CLEAN_BASE' || node.kind === 'FRACTURE_FAMILY' || node.kind === 'TERMINAL_SUCCESS') return 3;
  if (node.isSelectedRoute) return 4;
  if (node.isUnresolved) return 5;
  return 6;
}

function buildLabelLayouts(
  graph: VisualizationGraph,
  transform: ViewportTransform,
  displayWidth: number,
  displayHeight: number,
  camera: ConstellationCamera,
  selectedNodeId: string | null,
  hoveredNodeId: string | null,
  activeNodeId: string | null,
): LabelLayout[] {
  if (displayWidth <= 0 || displayHeight <= 0) return [];
  const lowDetail = transform.scale < 0.32;
  const highDetail = transform.scale >= 1.25;
  const baseMode = camera.fitMode === 'MANUAL' ? camera.baseFitMode : camera.fitMode;
  const candidates = graph.nodes
    .filter((node) => {
      if (node.id === selectedNodeId || node.id === hoveredNodeId || node.id === activeNodeId) return true;
      if (node.isSelectedRoute) return true;
      if (lowDetail) return node.kind === 'CLEAN_BASE' || node.kind === 'FRACTURE_FAMILY' || node.kind === 'TERMINAL_SUCCESS';
      return baseMode === 'ALL' || highDetail ? !node.isDominated || highDetail : false;
    })
    .sort((left, right) =>
      labelPriority(left, selectedNodeId, hoveredNodeId, activeNodeId) -
        labelPriority(right, selectedNodeId, hoveredNodeId, activeNodeId) ||
      left.x - right.x || left.id.localeCompare(right.id)
    );

  const placed: LabelLayout[] = [];
  for (const node of candidates) {
    const focused = node.id === selectedNodeId || node.id === hoveredNodeId || node.id === activeNodeId;
    const collapsed = lowDetail && !focused && node.kind !== 'TERMINAL_SUCCESS';
    const labelWidth = collapsed ? 34 : node.isSelectedRoute ? 150 : 164;
    const labelHeight = collapsed ? 32 : 62;
    const anchorX = node.x * transform.scale + transform.offsetX;
    const anchorY = node.y * transform.scale + transform.offsetY;
    const radius = Math.max(10, node.radius * transform.scale);
    const gap = 9;
    const rawPositions = [
      { left: anchorX - labelWidth / 2, top: anchorY - radius - gap - labelHeight },
      { left: anchorX - labelWidth / 2, top: anchorY + radius + gap },
      { left: anchorX - radius - gap - labelWidth, top: anchorY - labelHeight - 3 },
      { left: anchorX + radius + gap, top: anchorY - labelHeight - 3 },
      { left: anchorX - radius - gap - labelWidth, top: anchorY + 3 },
      { left: anchorX + radius + gap, top: anchorY + 3 },
      { left: anchorX - labelWidth / 2, top: anchorY - radius - gap * 3 - labelHeight },
      { left: anchorX - labelWidth / 2, top: anchorY + radius + gap * 3 },
    ];
    const positions = rawPositions.map((position) => ({
      left: clamp(position.left, 7, Math.max(7, displayWidth - labelWidth - 7)),
      top: clamp(position.top, 7, Math.max(7, displayHeight - labelHeight - 7)),
      width: labelWidth,
      height: labelHeight,
    }));
    const available = positions.find((position) =>
      !placed.some((existing) => rectanglesIntersect(position, existing))
    );
    if (available) {
      placed.push({ node, ...available, collapsed });
      continue;
    }

    // Important nodes fall back to a number-only chip; lower-priority alternatives disappear.
    if (node.isSelectedRoute || focused) {
      const fallbackWidth = 32;
      const fallbackHeight = 30;
      const fallbackPositions = [
        { left: anchorX - fallbackWidth / 2, top: anchorY - radius - 39 },
        { left: anchorX - fallbackWidth / 2, top: anchorY + radius + 9 },
        { left: anchorX + radius + 7, top: anchorY - fallbackHeight / 2 },
      ].map((position) => ({
        left: clamp(position.left, 7, Math.max(7, displayWidth - fallbackWidth - 7)),
        top: clamp(position.top, 7, Math.max(7, displayHeight - fallbackHeight - 7)),
        width: fallbackWidth,
        height: fallbackHeight,
      }));
      const fallback = fallbackPositions.find((position) =>
        !placed.some((existing) => rectanglesIntersect(position, existing))
      );
      if (fallback) placed.push({ node, ...fallback, collapsed: true });
    }
  }
  return placed;
}

function browserLayoutStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export const MarkovConstellation: React.FC<MarkovConstellationProps> = ({
  graph,
  selectedRouteName,
  width = 900,
  height = 760,
  isLive: _isLive = false,
  deterministicMode = false,
  onNodeClick,
  onEdgeClick,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const routeRailRef = useRef<HTMLDivElement | null>(null);
  const routeButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const pointerGestureRef = useRef<PointerGesture | null>(null);
  const keyboardLayoutGestureRef = useRef<KeyboardLayoutGesture | null>(null);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wispsRef = useRef<VisualizationWisp[]>([]);
  const layoutIdentity = useMemo(() => createConstellationLayoutIdentity(graph), [graph]);
  const layoutOverridesRef = useRef<ConstellationLayoutOverrides>({});

  const [isPlaying, setIsPlaying] = useState(!deterministicMode);
  const [speedMultiplier, setSpeedMultiplier] = useState(1);
  const [mode, setMode] = useState<'REPLAY' | 'EXPLORER' | 'SCREENSAVER'>('REPLAY');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [replayStepIndex, setReplayStepIndex] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [advancedLabels, setAdvancedLabels] = useState(false);
  const [particleCount, setParticleCount] = useState(0);
  const [isLayoutEditing, setIsLayoutEditing] = useState(false);
  const [isNodeDragging, setIsNodeDragging] = useState(false);
  const [layoutState, setLayoutState] = useState(() => {
    const overrides = loadConstellationLayout(browserLayoutStorage(), layoutIdentity);
    layoutOverridesRef.current = overrides;
    return { identity: layoutIdentity.serialized, overrides };
  });
  const [viewportSize, setViewportSize] = useState({ width, height });
  const [camera, setCamera] = useState<ConstellationCamera>({
    panX: 0,
    panY: 0,
    zoom: 1,
    fitMode: 'SELECTED_ROUTE',
    baseFitMode: 'SELECTED_ROUTE',
  });

  const layoutOverrides = layoutState.identity === layoutIdentity.serialized
    ? layoutState.overrides
    : EMPTY_LAYOUT_OVERRIDES;
  layoutOverridesRef.current = layoutOverrides;
  const effectiveGraph = useMemo(
    () => createEffectiveConstellationGraph(graph, layoutOverrides),
    [graph, layoutOverrides],
  );
  const graphIdentity = useMemo(() =>
    `${graph.seed}|${layoutIdentity.serialized}`,
  [graph.seed, layoutIdentity.serialized]);
  const selectedNode = graph.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const selectedEdge = graph.edges.find((edge) => edge.id === selectedEdgeId) ?? null;
  const activeReplayNodeId = mode === 'REPLAY' && graph.selectedRouteNodeIds.length > 0
    ? graph.selectedRouteNodeIds[replayStepIndex % graph.selectedRouteNodeIds.length]
    : null;
  const transform = useMemo(
    () => calculateTransform(effectiveGraph, camera, viewportSize.width, viewportSize.height),
    [camera, effectiveGraph, viewportSize],
  );

  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    if (mode === 'SCREENSAVER') {
      controlsTimerRef.current = setTimeout(() => setControlsVisible(false), 2400);
    }
  }, [mode]);

  useEffect(() => () => {
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
  }, []);

  useEffect(() => {
    if (mode === 'SCREENSAVER') showControls();
    else {
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
      setControlsVisible(true);
    }
  }, [mode, showControls]);

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(query.matches);
    const listener = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const update = () => setViewportSize({
      width: Math.max(1, viewport.clientWidth || width),
      height: Math.max(1, viewport.clientHeight || height),
    });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [height, isFullscreen, width]);

  useLayoutEffect(() => {
    pointerGestureRef.current = null;
    keyboardLayoutGestureRef.current = null;
    setIsNodeDragging(false);
    setIsPanning(false);
    setIsLayoutEditing(false);
    const overrides = loadConstellationLayout(browserLayoutStorage(), layoutIdentity);
    layoutOverridesRef.current = overrides;
    setLayoutState({ identity: layoutIdentity.serialized, overrides });
  }, [layoutIdentity]);

  useEffect(() => {
    setCamera({
      panX: 0,
      panY: 0,
      zoom: 1,
      fitMode: 'SELECTED_ROUTE',
      baseFitMode: 'SELECTED_ROUTE',
    });
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setHoveredNodeId(null);
    setReplayStepIndex(0);
  }, [graphIdentity]);

  useEffect(() => {
    if (mode !== 'REPLAY' || !isPlaying || reducedMotion) return;
    const interval = setInterval(() => {
      setReplayStepIndex((current) =>
        (current + 1) % Math.max(1, graph.selectedRouteNodeIds.length)
      );
    }, 1800 / speedMultiplier);
    return () => clearInterval(interval);
  }, [graph.selectedRouteNodeIds.length, isPlaying, mode, reducedMotion, speedMultiplier]);

  useEffect(() => {
    const rail = routeRailRef.current;
    const activeButton = activeReplayNodeId
      ? routeButtonRefs.current.get(activeReplayNodeId)
      : undefined;
    if (!rail || !activeButton) return;
    const maximumLeft = Math.max(0, rail.scrollWidth - rail.clientWidth);
    const centeredLeft = activeButton.offsetLeft + activeButton.offsetWidth / 2 - rail.clientWidth / 2;
    rail.scrollTo({
      left: clamp(centeredLeft, 0, maximumLeft),
      behavior: reducedMotion ? 'auto' : 'smooth',
    });
  }, [activeReplayNodeId, reducedMotion]);

  useEffect(() => {
    const wisps: VisualizationWisp[] = [];
    const weights = graph.edges.map((edge) => Math.sqrt(Math.max(0, edge.expectedVisits)));
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    let remainingBudget = graph.performance.particleBudget;
    graph.edges.forEach((edge, edgeIndex) => {
      const proportional = totalWeight > 0
        ? Math.round(weights[edgeIndex] / totalWeight * graph.performance.particleBudget)
        : 0;
      const count = Math.min(remainingBudget, Math.max(1, proportional));
      remainingBudget -= count;
      for (let index = 0; index < count; index += 1) {
        const color = edge.isScopeHandoff
          ? '#2dd4bf'
          : edge.outcomeKind === 'SUCCESS'
          ? '#34d399'
          : edge.outcomeKind === 'REACQUIRE'
            ? '#c084fc'
            : edge.outcomeKind === 'RECOVERY'
              ? '#fb923c'
              : edge.outcomeKind === 'REPEAT'
                ? '#facc15'
                : '#38bdf8';
        wisps.push({
          id: `wisp_${edge.id}_${index}`,
          edgeId: edge.id,
          sourceNodeId: edge.source,
          targetNodeId: edge.target,
          progress: (index / count + edgeIndex * 0.19) % 1,
          speed: 0.00028 + edge.flowImportance * 0.00034,
          size: 2.2 + edge.flowImportance * 1.8,
          opacity: Math.min(1, 0.45 + edge.probability * 0.5),
          color,
        });
      }
    });
    wispsRef.current = wisps;
    setParticleCount(wisps.length);
  }, [graph]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    let animationFrame = 0;
    let lastTime = performance.now();

    const render = (now: number) => {
      const deltaMs = deterministicMode ? 16.667 : Math.min(64, now - lastTime);
      lastTime = now;
      if (isPlaying && !reducedMotion) {
        for (const wisp of wispsRef.current) {
          wisp.progress = (wisp.progress + wisp.speed * deltaMs * speedMultiplier) % 1;
        }
      }

      const displayWidth = canvas.clientWidth || width;
      const displayHeight = canvas.clientHeight || height;
      const dpr = window.devicePixelRatio || 1;
      const targetWidth = Math.round(displayWidth * dpr);
      const targetHeight = Math.round(displayHeight * dpr);
      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
      }

      context.save();
      context.scale(dpr, dpr);
      context.clearRect(0, 0, displayWidth, displayHeight);
      const background = context.createRadialGradient(
        displayWidth / 2,
        displayHeight / 2,
        20,
        displayWidth / 2,
        displayHeight / 2,
        displayWidth * 0.75,
      );
      background.addColorStop(0, '#0c1528');
      background.addColorStop(0.52, '#070b14');
      background.addColorStop(1, '#030508');
      context.fillStyle = background;
      context.fillRect(0, 0, displayWidth, displayHeight);
      context.fillStyle = 'rgba(255, 255, 255, 0.2)';
      for (let index = 0; index < 34; index += 1) {
        context.fillRect((index * 137.5) % displayWidth, (index * 219.3) % displayHeight, 1.4, 1.4);
      }

      context.save();
      context.translate(transform.offsetX, transform.offsetY);
      context.scale(transform.scale, transform.scale);
      if (effectiveGraph.scopeEvidence.boundaryX !== undefined && effectiveGraph.scopeEvidence.handoffEdgeIds.length > 0) {
        context.save();
        context.beginPath();
        context.setLineDash([9, 12]);
        context.moveTo(effectiveGraph.scopeEvidence.boundaryX, effectiveGraph.scopeEvidence.headerY + 24);
        context.lineTo(effectiveGraph.scopeEvidence.boundaryX, effectiveGraph.bounds.maxY);
        context.strokeStyle = 'rgba(45, 212, 191, 0.24)';
        context.lineWidth = 1.4 / transform.scale;
        context.stroke();
        context.restore();
      }
      for (const edge of effectiveGraph.edges) {
        const source = effectiveGraph.nodes.find((node) => node.id === edge.source);
        const target = effectiveGraph.nodes.find((node) => node.id === edge.target);
        if (!source || !target) continue;
        context.beginPath();
        context.moveTo(source.x, source.y);
        context.quadraticCurveTo(edge.controlX, edge.controlY, target.x, target.y);
        const replayEdge = activeReplayNodeId !== null && edge.source === activeReplayNodeId;
        const edgeColor = edge.isScopeHandoff
          ? '45, 212, 191'
          : edge.outcomeKind === 'SUCCESS'
          ? '52, 211, 153'
          : edge.outcomeKind === 'REACQUIRE'
            ? '192, 132, 252'
            : edge.outcomeKind === 'RECOVERY'
              ? '251, 146, 60'
              : edge.outcomeKind === 'REPEAT'
                ? '250, 204, 21'
                : '56, 189, 248';
        context.strokeStyle = `rgba(${edgeColor}, ${Math.min(0.72, edge.opacity * 0.7)})`;
        context.lineWidth = edge.width + (replayEdge ? 3 : edge.isScopeHandoff ? 2.5 : 1.5);
        context.stroke();
        context.strokeStyle = replayEdge ? '#ffffff' : `rgba(${edgeColor}, ${edge.opacity})`;
        context.lineWidth = edge.width * (replayEdge ? 0.68 : 0.5);
        context.stroke();
      }

      if (!reducedMotion) {
        for (const wisp of wispsRef.current) {
          const edge = effectiveGraph.edges.find((candidate) => candidate.id === wisp.edgeId);
          if (!edge) continue;
          const position = edgePoint(effectiveGraph, edge, wisp.progress);
          const glow = context.createRadialGradient(position.x, position.y, 0, position.x, position.y, wisp.size * 3);
          glow.addColorStop(0, wisp.color);
          glow.addColorStop(0.5, `${wisp.color}66`);
          glow.addColorStop(1, 'transparent');
          context.globalAlpha = wisp.opacity;
          context.fillStyle = glow;
          context.beginPath();
          context.arc(position.x, position.y, wisp.size * 3, 0, Math.PI * 2);
          context.fill();
          context.globalAlpha = 1;
        }
      }

      for (const node of effectiveGraph.nodes) {
        const isHovered = hoveredNodeId === node.id;
        const isSelected = selectedNodeId === node.id;
        const isActive = activeReplayNodeId === node.id;
        const glowRadius = node.radius * (1.8 + node.glowIntensity * 1.2) *
          (isActive ? 1.25 : isHovered ? 1.12 : 1);
        const glow = context.createRadialGradient(node.x, node.y, node.radius * 0.5, node.x, node.y, glowRadius);
        if (node.kind === 'TERMINAL_SUCCESS') {
          glow.addColorStop(0, 'rgba(52, 211, 153, 0.85)');
          glow.addColorStop(0.65, 'rgba(52, 211, 153, 0.2)');
        } else if (node.isSelectedRoute) {
          const acquisitionNode = node.scope === 'ACQUISITION';
          glow.addColorStop(0, isActive
            ? 'rgba(255, 255, 255, 0.95)'
            : acquisitionNode ? 'rgba(192, 132, 252, 0.76)' : 'rgba(56, 189, 248, 0.72)');
          glow.addColorStop(0.65, acquisitionNode
            ? 'rgba(192, 132, 252, 0.2)'
            : 'rgba(56, 189, 248, 0.18)');
        } else if (node.isDominated) {
          glow.addColorStop(0, 'rgba(100, 116, 139, 0.32)');
          glow.addColorStop(0.65, 'rgba(100, 116, 139, 0.08)');
        } else {
          glow.addColorStop(0, 'rgba(251, 191, 36, 0.62)');
          glow.addColorStop(0.65, 'rgba(251, 191, 36, 0.14)');
        }
        glow.addColorStop(1, 'transparent');
        context.fillStyle = glow;
        context.beginPath();
        context.arc(node.x, node.y, glowRadius, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = node.kind === 'TERMINAL_SUCCESS'
          ? '#059669'
          : node.isSelectedRoute
            ? node.scope === 'ACQUISITION' ? '#7e22ce' : '#0284c7'
            : node.isDominated
              ? '#334155'
              : '#d97706';
        context.beginPath();
        context.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = isSelected || isHovered || isActive
          ? '#ffffff'
          : node.isSelectedRoute
            ? node.scope === 'ACQUISITION' ? '#d8b4fe' : '#7dd3fc'
            : '#94a3b8';
        context.lineWidth = isSelected || isActive ? 3.5 : isHovered ? 2.5 : 1.5;
        context.stroke();
      }
      context.restore();
      context.restore();

      if (isPlaying && !reducedMotion && !deterministicMode) {
        animationFrame = requestAnimationFrame(render);
      }
    };

    if (deterministicMode || !isPlaying || reducedMotion) render(performance.now());
    else animationFrame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationFrame);
  }, [
    activeReplayNodeId,
    deterministicMode,
    effectiveGraph,
    height,
    hoveredNodeId,
    isPlaying,
    reducedMotion,
    selectedNodeId,
    speedMultiplier,
    transform,
    width,
  ]);

  const graphCoordinates = useCallback((clientX: number, clientY: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return null;
    const rect = viewport.getBoundingClientRect();
    return {
      x: (clientX - rect.left - transform.offsetX) / transform.scale,
      y: (clientY - rect.top - transform.offsetY) / transform.scale,
    };
  }, [transform]);

  const hitNode = useCallback((clientX: number, clientY: number) => {
    const point = graphCoordinates(clientX, clientY);
    if (!point) return undefined;
    return [...effectiveGraph.nodes].reverse().find((node) =>
      Math.hypot(node.x - point.x, node.y - point.y) <= node.radius + 10 / transform.scale
    );
  }, [effectiveGraph.nodes, graphCoordinates, transform.scale]);

  const pauseScreensaverMotion = useCallback(() => {
    if (mode === 'SCREENSAVER') setIsPlaying(false);
  }, [mode]);

  const zoomAtPoint = useCallback((pointX: number, pointY: number, factor: number) => {
    setCamera((current) => {
      const oldTransform = calculateTransform(effectiveGraph, current, viewportSize.width, viewportSize.height);
      const nextZoom = clamp(current.zoom * factor, ZOOM_MIN, ZOOM_MAX);
      if (nextZoom === current.zoom) return current;
      const graphX = (pointX - oldTransform.offsetX) / oldTransform.scale;
      const graphY = (pointY - oldTransform.offsetY) / oldTransform.scale;
      const nextScale = oldTransform.baseScale * nextZoom;
      return {
        panX: pointX - oldTransform.centerViewportX - (graphX - oldTransform.centerGraphX) * nextScale,
        panY: pointY - oldTransform.centerViewportY - (graphY - oldTransform.centerGraphY) * nextScale,
        zoom: nextZoom,
        fitMode: 'MANUAL',
        baseFitMode: current.fitMode === 'MANUAL' ? current.baseFitMode : current.fitMode,
        fitBounds: current.fitBounds ?? constellationGraphBounds(
          effectiveGraph,
          current.fitMode === 'MANUAL' ? current.baseFitMode : current.fitMode,
        ),
      };
    });
    pauseScreensaverMotion();
  }, [effectiveGraph, pauseScreensaverMotion, viewportSize]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      showControls();
      const rect = viewport.getBoundingClientRect();
      zoomAtPoint(event.clientX - rect.left, event.clientY - rect.top, Math.exp(-event.deltaY * 0.0015));
    };
    viewport.addEventListener('wheel', handleWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', handleWheel);
  }, [showControls, zoomAtPoint]);

  const selectNode = useCallback((node: VisualizationNode | undefined) => {
    setSelectedNodeId(node?.id ?? null);
    setSelectedEdgeId(null);
    const canonicalNode = node ? graph.nodes.find((candidate) => candidate.id === node.id) : undefined;
    if (canonicalNode) onNodeClick?.(canonicalNode);
  }, [graph.nodes, onNodeClick]);

  const selectEdge = useCallback((edge: VisualizationEdge | undefined) => {
    setSelectedEdgeId(edge?.id ?? null);
    setSelectedNodeId(null);
    const canonicalEdge = edge ? graph.edges.find((candidate) => candidate.id === edge.id) : undefined;
    if (canonicalEdge) onEdgeClick?.(canonicalEdge);
  }, [graph.edges, onEdgeClick]);

  const replaceLayoutOverrides = useCallback((overrides: ConstellationLayoutOverrides) => {
    layoutOverridesRef.current = overrides;
    setLayoutState({ identity: layoutIdentity.serialized, overrides });
  }, [layoutIdentity.serialized]);

  const persistLayoutOverrides = useCallback((overrides = layoutOverridesRef.current) => {
    persistConstellationLayout(browserLayoutStorage(), layoutIdentity, overrides);
  }, [layoutIdentity]);

  const restoreNodeOverride = useCallback((
    nodeId: string,
    position: ConstellationNodePosition | undefined,
  ) => {
    const next = { ...layoutOverridesRef.current };
    if (position) next[nodeId] = { ...position };
    else delete next[nodeId];
    replaceLayoutOverrides(next);
    persistLayoutOverrides(next);
  }, [persistLayoutOverrides, replaceLayoutOverrides]);

  const freezeCurrentCameraFrame = useCallback(() => {
    setCamera((current) => {
      if (current.fitBounds) return current;
      const baseMode = current.fitMode === 'MANUAL' ? current.baseFitMode : current.fitMode;
      return { ...current, fitBounds: constellationGraphBounds(effectiveGraph, baseMode) };
    });
  }, [effectiveGraph]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    showControls();
    const targetElement = event.target as HTMLElement;
    // Graph-owned overlays live inside the viewport for positioning, but their
    // controls and selectable text are not graph canvas. Do not begin a pan,
    // deselect, or node-layout gesture from any marked interactive UI surface.
    if (targetElement.closest('[data-constellation-interaction-exclusion]')) return;
    const targetNodeId = targetElement.closest<HTMLElement>('[data-node-id]')?.dataset.nodeId;
    const targetNode = targetNodeId
      ? effectiveGraph.nodes.find((node) => node.id === targetNodeId)
      : undefined;
    const nodeControl = targetElement.closest<HTMLButtonElement>('button[data-node-id]');
    if (nodeControl) nodeControl.focus({ preventScroll: true });
    else event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    const moveNode = isLayoutEditing && mode !== 'SCREENSAVER' && targetNode !== undefined;
    if (moveNode) freezeCurrentCameraFrame();
    pointerGestureRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPanX: camera.panX,
      startPanY: camera.panY,
      startScale: transform.scale,
      moved: false,
      kind: moveNode ? 'NODE' : 'PAN',
      targetNodeId,
      targetEdgeId: targetElement.closest<HTMLElement>('[data-edge-id]')?.dataset.edgeId,
      startNodePosition: moveNode ? { x: targetNode.x, y: targetNode.y } : undefined,
      startNodeOverride: moveNode && targetNodeId && layoutOverridesRef.current[targetNodeId]
        ? { ...layoutOverridesRef.current[targetNodeId] }
        : undefined,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    showControls();
    const gesture = pointerGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) {
      setHoveredNodeId(hitNode(event.clientX, event.clientY)?.id ?? null);
      return;
    }
    const deltaX = event.clientX - gesture.startClientX;
    const deltaY = event.clientY - gesture.startClientY;
    if (!gesture.moved && Math.hypot(deltaX, deltaY) >= DRAG_THRESHOLD) {
      gesture.moved = true;
      if (gesture.kind === 'NODE') setIsNodeDragging(true);
      else setIsPanning(true);
      pauseScreensaverMotion();
    }
    if (!gesture.moved) return;
    setHoveredNodeId(null);
    if (gesture.kind === 'NODE' && gesture.targetNodeId && gesture.startNodePosition) {
      const position = {
        x: gesture.startNodePosition.x + deltaX / gesture.startScale,
        y: gesture.startNodePosition.y + deltaY / gesture.startScale,
      };
      gesture.latestNodePosition = position;
      replaceLayoutOverrides({
        ...layoutOverridesRef.current,
        [gesture.targetNodeId]: position,
      });
      return;
    }
    setCamera((current) => ({
      panX: gesture.startPanX + deltaX,
      panY: gesture.startPanY + deltaY,
      zoom: current.zoom,
      fitMode: 'MANUAL',
      baseFitMode: current.fitMode === 'MANUAL' ? current.baseFitMode : current.fitMode,
      fitBounds: current.fitBounds ?? constellationGraphBounds(
        effectiveGraph,
        current.fitMode === 'MANUAL' ? current.baseFitMode : current.fitMode,
      ),
    }));
  };

  const finishPointerGesture = (event: React.PointerEvent<HTMLDivElement>, allowClick: boolean) => {
    const gesture = pointerGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (gesture.kind === 'NODE' && gesture.moved && gesture.targetNodeId) {
      if (allowClick) persistLayoutOverrides();
      else restoreNodeOverride(gesture.targetNodeId, gesture.startNodeOverride);
    } else if (allowClick && !gesture.moved) {
      const targetedEdge = gesture.targetEdgeId
        ? effectiveGraph.edges.find((edge) => edge.id === gesture.targetEdgeId)
        : undefined;
      const targetedNode = gesture.targetNodeId
        ? effectiveGraph.nodes.find((node) => node.id === gesture.targetNodeId)
        : hitNode(event.clientX, event.clientY);
      if (targetedEdge) selectEdge(targetedEdge);
      else selectNode(targetedNode);
    }
    pointerGestureRef.current = null;
    setIsPanning(false);
    setIsNodeDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const cancelActiveNodeDrag = useCallback(() => {
    const gesture = pointerGestureRef.current;
    if (!gesture || gesture.kind !== 'NODE') return false;
    if (gesture.moved && gesture.targetNodeId) {
      restoreNodeOverride(gesture.targetNodeId, gesture.startNodeOverride);
    }
    pointerGestureRef.current = null;
    setIsNodeDragging(false);
    setIsPanning(false);
    const viewport = viewportRef.current;
    if (viewport?.hasPointerCapture(gesture.pointerId)) {
      viewport.releasePointerCapture(gesture.pointerId);
    }
    return true;
  }, [restoreNodeOverride]);

  const focusRoute = useCallback(() => {
    setCamera({
      panX: 0,
      panY: 0,
      zoom: 1,
      fitMode: 'SELECTED_ROUTE',
      baseFitMode: 'SELECTED_ROUTE',
      fitBounds: constellationGraphBounds(effectiveGraph, 'SELECTED_ROUTE'),
    });
  }, [effectiveGraph]);
  const fitAll = useCallback(() => {
    setCamera({
      panX: 0,
      panY: 0,
      zoom: 1,
      fitMode: 'ALL',
      baseFitMode: 'ALL',
      fitBounds: constellationGraphBounds(effectiveGraph, 'ALL'),
    });
  }, [effectiveGraph]);
  const resetView = useCallback(() => {
    setCamera((current) => {
      const fitMode = current.fitMode === 'MANUAL' ? current.baseFitMode : current.fitMode;
      return {
        panX: 0,
        panY: 0,
        zoom: 1,
        fitMode,
        baseFitMode: fitMode,
        fitBounds: constellationGraphBounds(effectiveGraph, fitMode),
      };
    });
  }, [effectiveGraph]);

  const resetLayout = useCallback(() => {
    cancelActiveNodeDrag();
    keyboardLayoutGestureRef.current = null;
    removePersistedConstellationLayout(browserLayoutStorage(), layoutIdentity);
    replaceLayoutOverrides({});
    setCamera({
      panX: 0,
      panY: 0,
      zoom: 1,
      fitMode: 'ALL',
      baseFitMode: 'ALL',
      fitBounds: constellationGraphBounds(graph, 'ALL'),
    });
  }, [cancelActiveNodeDrag, graph, layoutIdentity, replaceLayoutOverrides]);

  const panBy = useCallback((deltaX: number, deltaY: number) => {
    setCamera((current) => ({
      ...current,
      panX: current.panX + deltaX,
      panY: current.panY + deltaY,
      fitMode: 'MANUAL',
      baseFitMode: current.fitMode === 'MANUAL' ? current.baseFitMode : current.fitMode,
      fitBounds: current.fitBounds ?? constellationGraphBounds(
        effectiveGraph,
        current.fitMode === 'MANUAL' ? current.baseFitMode : current.fitMode,
      ),
    }));
    pauseScreensaverMotion();
  }, [effectiveGraph, pauseScreensaverMotion]);

  const finishKeyboardLayoutGesture = useCallback((commit: boolean) => {
    const gesture = keyboardLayoutGestureRef.current;
    if (!gesture) return false;
    keyboardLayoutGestureRef.current = null;
    if (commit) persistLayoutOverrides();
    else restoreNodeOverride(gesture.nodeId, gesture.startNodeOverride);
    return true;
  }, [persistLayoutOverrides, restoreNodeOverride]);

  const keyboardNodeId = (target: EventTarget | null): string | undefined =>
    (target as HTMLElement | null)?.closest<HTMLElement>('[data-node-id]')?.dataset.nodeId ??
    selectedNodeId ?? undefined;

  const nudgeNode = useCallback((nodeId: string, deltaX: number, deltaY: number) => {
    const node = effectiveGraph.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) return false;
    const currentGesture = keyboardLayoutGestureRef.current;
    if (!currentGesture || currentGesture.nodeId !== nodeId) {
      if (currentGesture) persistLayoutOverrides();
      keyboardLayoutGestureRef.current = {
        nodeId,
        startNodeOverride: layoutOverridesRef.current[nodeId]
          ? { ...layoutOverridesRef.current[nodeId] }
          : undefined,
      };
    }
    freezeCurrentCameraFrame();
    replaceLayoutOverrides({
      ...layoutOverridesRef.current,
      [nodeId]: { x: node.x + deltaX, y: node.y + deltaY },
    });
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
    pauseScreensaverMotion();
    return true;
  }, [effectiveGraph.nodes, freezeCurrentCameraFrame, pauseScreensaverMotion, persistLayoutOverrides, replaceLayoutOverrides]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    showControls();
    const layoutStep = event.shiftKey ? KEYBOARD_NUDGE_LARGE : KEYBOARD_NUDGE;
    const focusedNodeId = keyboardNodeId(event.target);
    if (isLayoutEditing && mode !== 'SCREENSAVER' && focusedNodeId &&
      ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      const delta = event.key === 'ArrowLeft' ? [-layoutStep, 0]
        : event.key === 'ArrowRight' ? [layoutStep, 0]
          : event.key === 'ArrowUp' ? [0, -layoutStep]
            : [0, layoutStep];
      if (nudgeNode(focusedNodeId, delta[0], delta[1])) event.preventDefault();
      return;
    }
    const step = event.shiftKey ? 72 : 36;
    let handled = true;
    switch (event.key) {
      case 'ArrowLeft': panBy(-step, 0); break;
      case 'ArrowRight': panBy(step, 0); break;
      case 'ArrowUp': panBy(0, -step); break;
      case 'ArrowDown': panBy(0, step); break;
      case '+':
      case '=': zoomAtPoint(viewportSize.width / 2, viewportSize.height / 2, 1.2); break;
      case '-': zoomAtPoint(viewportSize.width / 2, viewportSize.height / 2, 1 / 1.2); break;
      case '0': resetView(); break;
      case 'f':
      case 'F': focusRoute(); break;
      case 'a':
      case 'A': fitAll(); break;
      case 'Escape':
        cancelActiveNodeDrag();
        finishKeyboardLayoutGesture(false);
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
        // Preserve the browser's native Escape behavior so fullscreen can exit.
        handled = false;
        break;
      default: handled = false;
    }
    if (handled) event.preventDefault();
  };

  const handleKeyUp = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      finishKeyboardLayoutGesture(true);
    }
  };

  const toggleLayoutEditing = useCallback(() => {
    if (isLayoutEditing) {
      cancelActiveNodeDrag();
      finishKeyboardLayoutGesture(true);
      setIsLayoutEditing(false);
      return;
    }
    if (mode === 'SCREENSAVER') setMode('EXPLORER');
    setIsLayoutEditing(true);
  }, [cancelActiveNodeDrag, finishKeyboardLayoutGesture, isLayoutEditing, mode]);

  const changeMode = useCallback((nextMode: 'REPLAY' | 'EXPLORER' | 'SCREENSAVER') => {
    if (nextMode === 'SCREENSAVER') {
      cancelActiveNodeDrag();
      finishKeyboardLayoutGesture(true);
      setIsLayoutEditing(false);
    }
    setMode(nextMode);
  }, [cancelActiveNodeDrag, finishKeyboardLayoutGesture]);

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    try {
      if (!document.fullscreenElement) await containerRef.current.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      // Browser denial leaves the component in its normal, usable layout.
    }
  };

  const labelLayouts = useMemo(() => buildLabelLayouts(
    effectiveGraph,
    transform,
    viewportSize.width,
    viewportSize.height,
    camera,
    selectedNodeId,
    hoveredNodeId,
    activeReplayNodeId,
  ), [activeReplayNodeId, camera, effectiveGraph, hoveredNodeId, selectedNodeId, transform, viewportSize]);

  const visibleEdgeLabels = useMemo(() => {
    const candidates = effectiveGraph.edges
      .filter((edge) => advancedLabels || (
        edge.isScopeHandoff || edge.source === activeReplayNodeId || edge.id === selectedEdgeId
      ))
      .sort((left, right) => {
        const leftSelected = left.id === selectedEdgeId;
        const rightSelected = right.id === selectedEdgeId;
        return Number(rightSelected) - Number(leftSelected) ||
          Number(right.isScopeHandoff) - Number(left.isScopeHandoff) ||
          right.expectedVisits - left.expectedVisits || left.id.localeCompare(right.id);
      });
    const occupied: Array<Pick<LabelLayout, 'left' | 'top' | 'width' | 'height'>> = [
      ...labelLayouts,
    ];
    const placed: EdgeLabelLayout[] = [];
    for (const edge of candidates) {
      const point = edgePoint(effectiveGraph, edge, 0.5);
      const anchorX = point.x * transform.scale + transform.offsetX;
      const anchorY = point.y * transform.scale + transform.offsetY;
      const labelWidth = clamp(edge.actionLabel.length * 6.7 + 16, 76, 160);
      const charactersPerLine = Math.max(10, Math.floor((labelWidth - 16) / 6.7));
      const lineCount = Math.min(2, Math.ceil(edge.actionLabel.length / charactersPerLine));
      const labelHeight = 10 + lineCount * 16;
      const offsets = [
        { x: 0, y: 0 },
        { x: 0, y: -42 },
        { x: 0, y: 42 },
        { x: -92, y: -34 },
        { x: 92, y: -34 },
        { x: -92, y: 34 },
        { x: 92, y: 34 },
        { x: 0, y: -78 },
        { x: 0, y: 78 },
      ];
      const positions = offsets.map((offset) => ({
        left: clamp(anchorX + offset.x - labelWidth / 2, 7, Math.max(7, viewportSize.width - labelWidth - 7)),
        top: clamp(anchorY + offset.y - labelHeight / 2, 7, Math.max(7, viewportSize.height - labelHeight - 7)),
        width: labelWidth,
        height: labelHeight,
      }));
      const available = positions.find((position) =>
        !occupied.some((existing) => rectanglesIntersect(position, existing))
      ) ?? (edge.isScopeHandoff ? positions[0] : undefined);
      if (!available) continue;
      occupied.push(available);
      placed.push({ edge, ...available });
    }
    return placed;
  }, [advancedLabels, activeReplayNodeId, effectiveGraph, labelLayouts, selectedEdgeId, transform, viewportSize]);

  const incomingEdges = selectedNode ? graph.edges.filter((edge) => edge.target === selectedNode.id) : [];
  const outgoingEdges = selectedNode ? graph.edges.filter((edge) => edge.source === selectedNode.id) : [];
  const selectedEdgeSource = selectedEdge
    ? graph.nodes.find((node) => node.id === selectedEdge.source)
    : undefined;
  const selectedEdgeTarget = selectedEdge
    ? graph.nodes.find((node) => node.id === selectedEdge.target)
    : undefined;

  return (
    <div
      ref={containerRef}
      className={`markov-constellation-container mode-${mode.toLowerCase()} ${isFullscreen ? 'fullscreen' : ''} ${isPanning ? 'is-panning' : ''} ${isLayoutEditing ? 'layout-editing' : 'layout-locked'} ${isNodeDragging ? 'is-node-dragging' : ''} ${controlsVisible ? 'controls-visible' : 'controls-hidden'} ${className}`}
      data-testid="markov-constellation-container"
      data-selected-route={selectedRouteName}
      data-camera-fit-mode={camera.fitMode}
      data-camera-base-fit-mode={camera.baseFitMode}
      data-camera-pan-x={camera.panX.toFixed(3)}
      data-camera-pan-y={camera.panY.toFixed(3)}
      data-camera-zoom={camera.zoom.toFixed(5)}
      data-camera-min-zoom={ZOOM_MIN}
      data-camera-max-zoom={ZOOM_MAX}
      data-graph-identity={graphIdentity}
      data-manual-layout-schema={MANUAL_CONSTELLATION_LAYOUT_SCHEMA}
      data-manual-layout-identity={layoutIdentity.serialized}
      data-manual-layout-storage-key={layoutIdentity.storageKey}
      data-manual-layout-persistence-eligible={layoutIdentity.persistenceEligible}
      data-manual-layout-mode={isLayoutEditing ? 'ARRANGE' : 'LOCKED'}
      data-manual-layout-override-count={Object.keys(layoutOverrides).length}
      data-manual-layout-node-dragging={isNodeDragging}
      data-policy-flow-version={graph.policyFlowVersion}
      data-policy-flow-status={graph.policyFlowStatus}
      data-source-bundle-id={graph.sourceBundleId}
      data-source-policy-fingerprint={graph.sourcePolicyFingerprint}
      data-topology-fingerprint={graph.topology.fingerprint}
      data-node-count={graph.topology.nodeCount}
      data-edge-count={graph.topology.edgeCount}
      data-scc-count={graph.topology.stronglyConnectedComponentCount}
      data-branch-node-count={graph.topology.branchNodeCount}
      data-recovery-edge-count={graph.topology.recoveryEdgeCount}
      data-particle-count={particleCount}
      data-layout-ms={graph.performance.layoutMs.toFixed(3)}
      data-layout-mode={graph.layoutEvidence.mode}
      data-large-scc-count={graph.layoutEvidence.largeSccCount}
      data-large-scc-node-count={graph.layoutEvidence.largeSccNodeCount}
      data-semantic-band-count={graph.layoutEvidence.semanticBandCount}
      data-layout-horizontal-span={graph.layoutEvidence.horizontalSpan.toFixed(3)}
      data-layout-vertical-span={graph.layoutEvidence.verticalSpan.toFixed(3)}
      data-minimum-node-distance={graph.layoutEvidence.minimumNodeCenterDistance.toFixed(3)}
      data-recovery-corridor-edge-count={graph.layoutEvidence.recoveryCorridorEdgeCount}
      data-default-chronological-ordinals={graph.layoutEvidence.defaultChronologicalOrdinals}
      data-label-aware-fit={graph.layoutEvidence.labelAwareFit}
      data-fit-margins={`${graph.layoutEvidence.fitMarginsPx.left},${graph.layoutEvidence.fitMarginsPx.right},${graph.layoutEvidence.fitMarginsPx.top},${graph.layoutEvidence.fitMarginsPx.bottom}`}
      data-acquisition-scope-node-count={graph.scopeEvidence.acquisitionNodeIds.length}
      data-downstream-scope-node-count={graph.scopeEvidence.downstreamNodeIds.length}
      data-certified-handoff-edge-count={graph.scopeEvidence.handoffEdgeIds.length}
      data-selected-route-node-ids={graph.selectedRouteNodeIds.join(',')}
      data-selected-route-edge-ids={graph.selectedRouteEdgeIds.join(',')}
      data-terminal-node-count={graph.nodes.filter((node) =>
        node.kind === 'TERMINAL_SUCCESS' || node.kind === 'UNRESOLVED_FRONTIER'
      ).length}
      data-acquisition-kind={graph.acquisitionContext.kind}
      data-acquisition-candidate-id={graph.acquisitionContext.candidateId}
      data-acquisition-method-id={graph.acquisitionContext.methodId}
      data-acquisition-target-mod-id={graph.acquisitionContext.targetModId}
    >
      <div className={`constellation-toolbar ${controlsVisible ? '' : 'is-hidden'}`} aria-hidden={!controlsVisible}>
        <div className="toolbar-left">
          <span className="constellation-title">✨ Markov Constellation</span>
          <div className="mode-toggle-group" aria-label="Constellation mode">
            <button className={`mode-btn ${mode === 'REPLAY' ? 'active' : ''}`} onClick={() => changeMode('REPLAY')}>▶ Replay</button>
            <button className={`mode-btn ${mode === 'EXPLORER' ? 'active' : ''}`} onClick={() => changeMode('EXPLORER')}>Explore</button>
            <button
              className={`mode-btn ${mode === 'SCREENSAVER' ? 'active' : ''}`}
              onClick={() => {
                changeMode('SCREENSAVER');
                void toggleFullscreen();
              }}
            >Screensaver</button>
          </div>
        </div>
        <div className="toolbar-controls">
          <button className="ctrl-btn" onClick={() => setIsPlaying((current) => !current)} aria-label={isPlaying ? 'Pause Animation' : 'Resume Animation'}>{isPlaying ? '⏸' : '▶'}</button>
          <button className={`ctrl-btn ${camera.fitMode === 'SELECTED_ROUTE' ? 'active' : ''}`} onClick={focusRoute} aria-label="Route Focus">Route Focus</button>
          <button className={`ctrl-btn ${camera.fitMode === 'ALL' ? 'active' : ''}`} onClick={fitAll} aria-label="Fit All">Fit All</button>
          <button className="ctrl-btn" onClick={resetView} aria-label="Reset View">Reset View</button>
          <button
            className={`ctrl-btn layout-mode-btn ${isLayoutEditing ? 'active' : ''}`}
            onClick={toggleLayoutEditing}
            aria-label={isLayoutEditing ? 'Lock constellation layout' : 'Arrange constellation layout'}
            aria-pressed={isLayoutEditing}
          >{isLayoutEditing ? 'Lock Layout' : 'Arrange'}</button>
          <button
            className="ctrl-btn reset-layout-btn"
            onClick={resetLayout}
            aria-label="Reset Layout"
            disabled={Object.keys(layoutOverrides).length === 0}
          >Reset Layout</button>
          <button className="ctrl-btn" onClick={() => zoomAtPoint(viewportSize.width / 2, viewportSize.height / 2, 1 / 1.2)} aria-label="Zoom constellation out">−</button>
          <span className="constellation-zoom-readout" aria-live="polite">{camera.zoom.toFixed(2)}×</span>
          <button className="ctrl-btn" onClick={() => zoomAtPoint(viewportSize.width / 2, viewportSize.height / 2, 1.2)} aria-label="Zoom constellation in">+</button>
          <button className={`ctrl-btn ${advancedLabels ? 'active' : ''}`} onClick={() => setAdvancedLabels((current) => !current)} aria-pressed={advancedLabels}>Advanced labels</button>
          <div className="speed-selector" aria-label="Replay speed">
            {[0.5, 1, 2, 5].map((speed) => (
              <button key={speed} className={`speed-btn ${speedMultiplier === speed ? 'active' : ''}`} onClick={() => setSpeedMultiplier(speed)}>{speed}x</button>
            ))}
          </div>
          <button className={`ctrl-btn ${reducedMotion ? 'active' : ''}`} onClick={() => setReducedMotion((current) => !current)} aria-label="Toggle Reduced Motion">{reducedMotion ? 'Static' : 'Fluid'}</button>
          <button className="ctrl-btn" onClick={() => void toggleFullscreen()} aria-label="Toggle Fullscreen">{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</button>
        </div>
      </div>

      <div
        ref={viewportRef}
        className="constellation-viewport"
        tabIndex={0}
        role="region"
        aria-label={isLayoutEditing
          ? 'Interactive Markov Constellation camera, layout arrangement unlocked'
          : 'Interactive Markov Constellation camera, layout locked'}
        aria-describedby="constellation-camera-instructions"
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => finishPointerGesture(event, true)}
        onPointerCancel={(event) => finishPointerGesture(event, false)}
        onLostPointerCapture={(event) => finishPointerGesture(event, false)}
        onPointerLeave={() => {
          if (!pointerGestureRef.current) setHoveredNodeId(null);
        }}
      >
        <canvas
          ref={canvasRef}
          className="constellation-canvas"
          width={width}
          height={height}
          role="img"
          aria-label="Markov Constellation state transition diagram"
        />

        <div className="constellation-label-layer" aria-label="Constellation policy states and branches">
          {effectiveGraph.scopeEvidence.acquisitionCenterX !== undefined && effectiveGraph.scopeEvidence.acquisitionNodeIds.length > 0 && (
            <div
              className="constellation-scope-header acquisition-scope"
              data-scope="ACQUISITION"
              style={{
                left: effectiveGraph.scopeEvidence.acquisitionCenterX * transform.scale + transform.offsetX,
                top: effectiveGraph.scopeEvidence.headerY * transform.scale + transform.offsetY,
              }}
            >{effectiveGraph.scopeEvidence.acquisitionHeader}</div>
          )}
          {effectiveGraph.scopeEvidence.downstreamCenterX !== undefined && effectiveGraph.scopeEvidence.downstreamNodeIds.length > 0 && (
            <div
              className="constellation-scope-header downstream-scope"
              data-scope="DOWNSTREAM"
              style={{
                left: effectiveGraph.scopeEvidence.downstreamCenterX * transform.scale + transform.offsetX,
                top: effectiveGraph.scopeEvidence.headerY * transform.scale + transform.offsetY,
              }}
            >{effectiveGraph.scopeEvidence.downstreamHeader}</div>
          )}
          {effectiveGraph.edges.map((edge) => {
            const point = edgePoint(effectiveGraph, edge, 0.5);
            const source = effectiveGraph.nodes.find((node) => node.id === edge.source);
            const target = effectiveGraph.nodes.find((node) => node.id === edge.target);
            const diameter = Math.max(28, edge.width * transform.scale * 3 + 16);
            return (
              <button
                type="button"
                tabIndex={-1}
                key={`${edge.id}-anchor`}
                className="constellation-edge-anchor"
                style={{
                  left: point.x * transform.scale + transform.offsetX - diameter / 2,
                  top: point.y * transform.scale + transform.offsetY - diameter / 2,
                  width: diameter,
                  height: diameter,
                }}
                data-edge-id={edge.id}
                data-edge-anchor={edge.id}
                data-edge-source={edge.source}
                data-edge-target={edge.target}
                data-conditional-probability={edge.probability.toPrecision(12)}
                data-expected-flow={edge.expectedVisits.toPrecision(12)}
                data-outcome-kind={edge.outcomeKind}
                data-evidence-kind={edge.evidenceKind}
                data-edge-routing={edge.routing}
                data-scope-handoff={edge.isScopeHandoff}
                data-edge-control-x={edge.controlX.toFixed(3)}
                data-edge-control-y={edge.controlY.toFixed(3)}
                data-edge-source-x={source?.x.toFixed(3)}
                data-edge-source-y={source?.y.toFixed(3)}
                data-edge-target-x={target?.x.toFixed(3)}
                data-edge-target-y={target?.y.toFixed(3)}
                onClick={(event) => {
                  if (event.detail === 0) selectEdge(edge);
                }}
                aria-label={`Select branch ${edge.actionLabel}`}
              />
            );
          })}
          {effectiveGraph.nodes.map((node) => {
            const canonicalNode = graph.nodes.find((candidate) => candidate.id === node.id);
            const diameter = Math.max(32, node.radius * transform.scale * 2 + 12);
            return (
              <button
                type="button"
                key={`${node.id}-anchor`}
                className="constellation-node-anchor"
                style={{
                  left: node.x * transform.scale + transform.offsetX - diameter / 2,
                  top: node.y * transform.scale + transform.offsetY - diameter / 2,
                  width: diameter,
                  height: diameter,
                }}
                data-node-id={node.id}
                data-node-anchor={node.id}
                data-node-x={node.x.toFixed(3)}
                data-node-y={node.y.toFixed(3)}
                data-canonical-node-x={canonicalNode?.x.toFixed(3)}
                data-canonical-node-y={canonicalNode?.y.toFixed(3)}
                data-manual-position={Boolean(layoutOverrides[node.id])}
                data-semantic-band={node.semanticBand}
                data-recovery-lane={node.recoveryLane}
                data-policy-scope={node.scope}
                data-progress-label={node.progressLabel}
                onFocus={() => setHoveredNodeId(node.id)}
                onBlur={() => {
                  finishKeyboardLayoutGesture(true);
                  setHoveredNodeId(null);
                }}
                onClick={(event) => {
                  if (event.detail === 0) selectNode(node);
                }}
                aria-label={isLayoutEditing
                  ? `Reposition ${node.fullLabel}. Arrow keys nudge; Shift plus Arrow moves farther.`
                  : `Select ${node.fullLabel}`}
                aria-pressed={selectedNodeId === node.id}
              />
            );
          })}
          {labelLayouts.map((layout) => (
            <button
              type="button"
              key={layout.node.id}
              className={`constellation-node-label ${layout.collapsed ? 'is-collapsed' : ''} ${layout.node.isSelectedRoute ? 'selected-route' : ''} ${layout.node.id === activeReplayNodeId ? 'replay-active' : ''}`}
              style={{ left: layout.left, top: layout.top, width: layout.width, height: layout.height }}
              data-node-id={layout.node.id}
              data-step-number={layout.node.stepNumber}
              data-policy-scope={layout.node.scope}
              data-progress-label={layout.node.progressLabel}
              data-node-x={layout.node.x.toFixed(3)}
              data-node-y={layout.node.y.toFixed(3)}
              data-manual-position={Boolean(layoutOverrides[layout.node.id])}
              data-label-priority={labelPriority(layout.node, selectedNodeId, hoveredNodeId, activeReplayNodeId)}
              onFocus={() => setHoveredNodeId(layout.node.id)}
              onBlur={() => {
                finishKeyboardLayoutGesture(true);
                setHoveredNodeId(null);
              }}
              onClick={(event) => {
                if (event.detail === 0) selectNode(layout.node);
              }}
              aria-label={`${isLayoutEditing ? 'Repositionable node. ' : ''}${advancedLabels && layout.node.stepNumber ? `Traversal index ${layout.node.stepNumber}: ` : ''}${layout.node.fullLabel}. ${layout.node.details.routeStatus}${isLayoutEditing ? ' Arrow keys nudge; Shift plus Arrow moves farther.' : ''}`}
            >
              {layout.collapsed
                ? <span>{layout.node.kind === 'TERMINAL_SUCCESS' ? '✓' : '•'}</span>
                : <>
                    {advancedLabels && layout.node.stepNumber && <span className="node-label-step">#{layout.node.stepNumber}</span>}
                    <span className="node-label-copy">
                      <span className="node-label-title">{layout.node.label}</span>
                      {layout.node.sublabel && <span className="node-label-sublabel">{layout.node.sublabel}</span>}
                    </span>
                  </>}
            </button>
          ))}
          {visibleEdgeLabels.map(({ edge, left, top, width: labelWidth, height: labelHeight }) => (
            <button
              type="button"
              className={`constellation-edge-label ${edge.isRecovery ? 'recovery-edge' : ''} ${edge.isScopeHandoff ? 'scope-handoff-edge' : ''} ${edge.id === selectedEdgeId ? 'selected' : ''}`}
              key={edge.id}
              style={{ left, top, width: labelWidth, height: labelHeight }}
              data-edge-id={edge.id}
              data-conditional-probability={edge.probability.toPrecision(12)}
              data-expected-flow={edge.expectedVisits.toPrecision(12)}
              data-outcome-kind={edge.outcomeKind}
              data-edge-routing={edge.routing}
              data-scope-handoff={edge.isScopeHandoff}
              data-edge-control-x={edge.controlX.toFixed(3)}
              data-edge-control-y={edge.controlY.toFixed(3)}
              onClick={(event) => {
                if (event.detail === 0) selectEdge(edge);
              }}
              aria-label={`Select branch ${edge.actionLabel}`}
            >{edge.actionLabel}</button>
          ))}
        </div>

        {selectedNode && (
          <aside
            className="node-detail-overlay"
            aria-label="Selected constellation node details"
            data-selected-node-id={selectedNode.id}
            data-constellation-interaction-exclusion="detail-overlay"
          >
            <div className="node-detail-heading">
              <span>{advancedLabels && selectedNode.stepNumber
                ? `Traversal index ${selectedNode.stepNumber}`
                : selectedNode.kind.replace(/_/g, ' ')}</span>
              <h4>{selectedNode.fullLabel}</h4>
            </div>
            {selectedNode.details.targetTexts.length > 0 && (
              <ul className="node-target-list">{selectedNode.details.targetTexts.map((target) => <li key={target}>{target}</li>)}</ul>
            )}
            <dl className="node-stats">
              {selectedNode.details.phase && <><dt>Policy scope</dt><dd>{selectedNode.details.phase}</dd></>}
              <dt>Scope progress</dt><dd>{selectedNode.progressLabel}</dd>
              {selectedNode.details.rarity && <><dt>Rarity</dt><dd>{selectedNode.details.rarity}</dd></>}
              <dt>Selected action</dt><dd>{selectedNode.details.actions[0] ?? 'Terminal success'}</dd>
              <dt>Expected visits per craft</dt><dd>{selectedNode.details.expectedVisits.toFixed(4)}</dd>
              <dt>Occupancy share</dt><dd>{(selectedNode.details.occupancyShare * 100).toFixed(2)}%</dd>
              <dt>Exact states represented</dt><dd>{selectedNode.details.exactStateCount}</dd>
              <dt>Route status</dt><dd>{selectedNode.details.routeStatus}</dd>
              <dt>Incoming</dt>
              <dd>{incomingEdges.length > 0
                ? <ul className="node-transition-list">{incomingEdges.map((edge) => <li key={edge.id}>{edge.actionLabel}</li>)}</ul>
                : 'Start node'}</dd>
              <dt>Outgoing</dt>
              <dd>{outgoingEdges.length > 0
                ? <ul className="node-transition-list">{outgoingEdges.map((edge) => <li key={edge.id}>{edge.actionLabel}</li>)}</ul>
                : 'Terminal node'}</dd>
            </dl>
            {selectedNode.details.instruction && <p>{selectedNode.details.instruction}</p>}
            {selectedNode.details.actions.length > 0 && (
              <div className="node-actions"><strong>Actions</strong><ul>{selectedNode.details.actions.map((action) => <li key={action}>{action}</li>)}</ul></div>
            )}
            {selectedNode.details.technicalModifiers.length > 0 && (
              <details className="node-technical-details">
                <summary>Technical modifier details</summary>
                {selectedNode.details.technicalModifiers.map((descriptor) => <code key={descriptor.modId}>{descriptor.technicalText}</code>)}
              </details>
            )}
            <details className="node-technical-details">
              <summary>Technical policy evidence</summary>
              <code>matched target IDs: {selectedNode.details.matchedTargetModIds.join(', ') || 'none'}</code>
              <code>fractured target IDs: {selectedNode.details.fracturedTargetModIds.join(', ') || 'none'}</code>
              <code>technical state: {selectedNode.details.technicalStateSummary}</code>
              {selectedNode.details.representativeState && <code>representative: {selectedNode.details.representativeState}</code>}
              {selectedNode.details.representativeStateKey && <code>state key: {selectedNode.details.representativeStateKey}</code>}
            </details>
            <button className="close-detail-btn" onClick={() => setSelectedNodeId(null)} aria-label="Close selected node details">×</button>
          </aside>
        )}

        {selectedEdge && (
          <aside
            className="node-detail-overlay edge-detail-overlay"
            aria-label="Selected constellation edge details"
            data-selected-edge-id={selectedEdge.id}
            data-constellation-interaction-exclusion="detail-overlay"
          >
            <div className="node-detail-heading">
              <span>{selectedEdge.isScopeHandoff
                ? 'CERTIFIED ACQUISITION HANDOFF'
                : selectedEdge.outcomeKind.replace(/_/g, ' ')}</span>
              <h4>{selectedEdgeSource?.label ?? selectedEdge.actionLabel} → {selectedEdgeTarget?.label ?? 'Next state'}</h4>
            </div>
            <dl className="node-stats">
              <dt>Selected action</dt><dd>{selectedEdgeSource?.details.actions[0] ?? selectedEdge.actionLabel}</dd>
              <dt>Occupancy-weighted policy-flow probability</dt><dd>{(selectedEdge.probability * 100).toFixed(3)}%</dd>
              <dt>Expected traversals per craft</dt><dd>{selectedEdge.expectedVisits.toFixed(5)}</dd>
              <dt>Outcome group</dt><dd>{selectedEdge.outcomeKind.toLowerCase()}</dd>
              {selectedEdge.isScopeHandoff && <><dt>Scope transition</dt><dd>Certified acquisition evidence to final-craft policy</dd></>}
              <dt>Source state</dt><dd>{selectedEdgeSource?.details.title ?? selectedEdge.source}</dd>
              <dt>Destination state</dt><dd>{selectedEdgeTarget?.details.title ?? selectedEdge.target}</dd>
              <dt>Next selected action</dt><dd>{selectedEdge.nextSelectedActionName ?? (selectedEdgeTarget?.kind === 'TERMINAL_SUCCESS' ? 'Goal' : 'None')}</dd>
            </dl>
            {selectedEdge.representativeOutcome && <p>{selectedEdge.representativeOutcome}</p>}
            <details className="node-technical-details">
              <summary>Technical transition evidence</summary>
              <code>edge: {selectedEdge.id}</code>
              <code>exact transitions: {selectedEdge.exactTransitionCount}</code>
              <code>evidence: {selectedEdge.evidenceKind}</code>
              {selectedEdge.nextSelectedActionId && <code>next action ID: {selectedEdge.nextSelectedActionId}</code>}
              {selectedEdge.representativeState && <code>representative destination: {selectedEdge.representativeState}</code>}
            </details>
            <button className="close-detail-btn" onClick={() => setSelectedEdgeId(null)} aria-label="Close selected edge details">×</button>
          </aside>
        )}
      </div>

      {mode !== 'SCREENSAVER' && (
        <div
          ref={routeRailRef}
          className="constellation-node-access-list constellation-route-rail"
          aria-label="Selected policy states"
          data-testid="constellation-route-rail"
        >
          {graph.selectedRouteNodeIds.map((nodeId, index) => {
            const node = graph.nodes.find((candidate) => candidate.id === nodeId);
            if (!node) return null;
            const compactLabel = node.scope === 'ACQUISITION'
              && graph.acquisitionContext.kind === 'SELF_FRACTURE'
              ? 'Fracture'
              : node.label;
            const railLabel = advancedLabels && node.stepNumber
              ? `#${node.stepNumber} ${compactLabel}`
              : index === 0
                ? `Start · ${compactLabel}`
                : `${compactLabel}${node.sublabel ? ` · ${node.sublabel}` : ''}`;
            return (
              <button
                type="button"
                key={node.id}
                ref={(element) => {
                  if (element) routeButtonRefs.current.set(node.id, element);
                  else routeButtonRefs.current.delete(node.id);
                }}
                className={`${node.id === activeReplayNodeId ? 'active' : ''} ${node.isSelectedRoute ? 'selected-route-node' : ''}`}
                data-node-id={node.id}
                onFocus={() => setHoveredNodeId(node.id)}
                onBlur={() => {
                  finishKeyboardLayoutGesture(true);
                  setHoveredNodeId(null);
                }}
                onClick={() => selectNode(node)}
              >{railLabel}</button>
            );
          })}
        </div>
      )}

      <p id="constellation-camera-instructions" className="sr-only">
        Drag with a mouse, pen, or one finger to pan. Use the wheel or plus and minus keys to zoom.
        Arrow keys pan, zero resets, F focuses the selected route, A fits every node, and Escape closes node details.
        Choose Arrange to unlock node placement. While unlocked, drag a node or focus it and use Arrow keys to
        reposition it; Shift plus Arrow moves farther. Empty-space dragging continues to pan. Escape cancels an
        active node move. Reset View changes only the camera; Reset Layout restores automatic node positions.
      </p>
      <div className="sr-only" aria-live="polite">
        Camera {camera.fitMode.toLowerCase().replace('_', ' ')}, zoom {camera.zoom.toFixed(2)}.
        Layout {isLayoutEditing ? 'arrangement unlocked' : 'locked'}, {Object.keys(layoutOverrides).length} manual positions.
        {selectedNode ? ` Selected ${selectedNode.fullLabel}.` : ''}
        {selectedEdge ? ` Selected branch ${selectedEdge.actionLabel}.` : ''}
      </div>
    </div>
  );
};
