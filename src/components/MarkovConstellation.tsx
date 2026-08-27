import React, {
  useCallback,
  useEffect,
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
}

interface ViewportTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
  centerGraphX: number;
  centerGraphY: number;
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
  moved: boolean;
  targetNodeId?: string;
  targetEdgeId?: string;
}

const ZOOM_MIN = 0.35;
const ZOOM_MAX = 5;
const DRAG_THRESHOLD = 6;
const LABEL_MARGIN = 5;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function graphBounds(graph: VisualizationGraph, mode: 'SELECTED_ROUTE' | 'ALL') {
  const requested = mode === 'SELECTED_ROUTE'
    ? graph.nodes.filter((node) => node.isSelectedRoute)
    : graph.nodes;
  const nodes = requested.length > 0 ? requested : graph.nodes;
  if (nodes.length === 0) {
    return { minX: 0, maxX: 1000, minY: 0, maxY: 600 };
  }
  return {
    minX: Math.min(...nodes.map((node) => node.x - node.radius - 74)),
    maxX: Math.max(...nodes.map((node) => node.x + node.radius + 74)),
    minY: Math.min(...nodes.map((node) => node.y - node.radius - 70)),
    maxY: Math.max(...nodes.map((node) => node.y + node.radius + 70)),
  };
}

function calculateTransform(
  graph: VisualizationGraph,
  camera: ConstellationCamera,
  displayWidth: number,
  displayHeight: number,
): ViewportTransform {
  const baseMode = camera.fitMode === 'MANUAL' ? camera.baseFitMode : camera.fitMode;
  const bounds = graphBounds(graph, baseMode);
  const graphWidth = Math.max(1, bounds.maxX - bounds.minX);
  const graphHeight = Math.max(1, bounds.maxY - bounds.minY);
  const padding = displayWidth < 500 ? 22 : 38;
  const baseScale = clamp(
    Math.min(
      Math.max(1, displayWidth - padding * 2) / graphWidth,
      Math.max(1, displayHeight - padding * 2) / graphHeight,
    ),
    0.12,
    2.5,
  );
  const scale = baseScale * camera.zoom;
  const centerGraphX = (bounds.minX + bounds.maxX) / 2;
  const centerGraphY = (bounds.minY + bounds.maxY) / 2;
  return {
    scale,
    baseScale,
    centerGraphX,
    centerGraphY,
    offsetX: displayWidth / 2 + camera.panX - centerGraphX * scale,
    offsetY: displayHeight / 2 + camera.panY - centerGraphY * scale,
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
  const lowDetail = camera.zoom < 0.62;
  const highDetail = camera.zoom >= 1.55;
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
    const labelWidth = collapsed ? 34 : node.isSelectedRoute ? 116 : 136;
    const labelHeight = collapsed ? 32 : 48;
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

export const MarkovConstellation: React.FC<MarkovConstellationProps> = ({
  graph,
  selectedRouteName,
  width = 900,
  height = 520,
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
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wispsRef = useRef<VisualizationWisp[]>([]);

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
  const [viewportSize, setViewportSize] = useState({ width, height });
  const [camera, setCamera] = useState<ConstellationCamera>({
    panX: 0,
    panY: 0,
    zoom: 1,
    fitMode: 'SELECTED_ROUTE',
    baseFitMode: 'SELECTED_ROUTE',
  });

  const graphIdentity = useMemo(() =>
    `${graph.seed}|${graph.layoutVersion}|${graph.topology.fingerprint}|${graph.nodes.map((node) => node.id).join('|')}`,
  [graph]);
  const selectedNode = graph.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const selectedEdge = graph.edges.find((edge) => edge.id === selectedEdgeId) ?? null;
  const activeReplayNodeId = mode === 'REPLAY' && graph.selectedRouteNodeIds.length > 0
    ? graph.selectedRouteNodeIds[replayStepIndex % graph.selectedRouteNodeIds.length]
    : null;
  const transform = useMemo(
    () => calculateTransform(graph, camera, viewportSize.width, viewportSize.height),
    [camera, graph, viewportSize],
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
        const color = edge.outcomeKind === 'SUCCESS'
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
      for (const edge of graph.edges) {
        const source = graph.nodes.find((node) => node.id === edge.source);
        const target = graph.nodes.find((node) => node.id === edge.target);
        if (!source || !target) continue;
        context.beginPath();
        context.moveTo(source.x, source.y);
        context.quadraticCurveTo(edge.controlX, edge.controlY, target.x, target.y);
        const replayEdge = activeReplayNodeId !== null && edge.source === activeReplayNodeId;
        const edgeColor = edge.outcomeKind === 'SUCCESS'
          ? '52, 211, 153'
          : edge.outcomeKind === 'REACQUIRE'
            ? '192, 132, 252'
            : edge.outcomeKind === 'RECOVERY'
              ? '251, 146, 60'
              : edge.outcomeKind === 'REPEAT'
                ? '250, 204, 21'
                : '56, 189, 248';
        context.strokeStyle = `rgba(${edgeColor}, ${Math.min(0.72, edge.opacity * 0.7)})`;
        context.lineWidth = edge.width + (replayEdge ? 3 : 1.5);
        context.stroke();
        context.strokeStyle = replayEdge ? '#ffffff' : `rgba(${edgeColor}, ${edge.opacity})`;
        context.lineWidth = edge.width * (replayEdge ? 0.68 : 0.5);
        context.stroke();
      }

      if (!reducedMotion) {
        for (const wisp of wispsRef.current) {
          const edge = graph.edges.find((candidate) => candidate.id === wisp.edgeId);
          if (!edge) continue;
          const position = edgePoint(graph, edge, wisp.progress);
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

      for (const node of graph.nodes) {
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
          glow.addColorStop(0, isActive ? 'rgba(255, 255, 255, 0.95)' : 'rgba(56, 189, 248, 0.72)');
          glow.addColorStop(0.65, 'rgba(56, 189, 248, 0.18)');
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
            ? '#0284c7'
            : node.isDominated
              ? '#334155'
              : '#d97706';
        context.beginPath();
        context.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = isSelected || isHovered || isActive
          ? '#ffffff'
          : node.isSelectedRoute ? '#7dd3fc' : '#94a3b8';
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
    graph,
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
    return [...graph.nodes].reverse().find((node) =>
      Math.hypot(node.x - point.x, node.y - point.y) <= node.radius + 10 / transform.scale
    );
  }, [graph.nodes, graphCoordinates, transform.scale]);

  const pauseScreensaverMotion = useCallback(() => {
    if (mode === 'SCREENSAVER') setIsPlaying(false);
  }, [mode]);

  const zoomAtPoint = useCallback((pointX: number, pointY: number, factor: number) => {
    setCamera((current) => {
      const oldTransform = calculateTransform(graph, current, viewportSize.width, viewportSize.height);
      const nextZoom = clamp(current.zoom * factor, ZOOM_MIN, ZOOM_MAX);
      if (nextZoom === current.zoom) return current;
      const graphX = (pointX - oldTransform.offsetX) / oldTransform.scale;
      const graphY = (pointY - oldTransform.offsetY) / oldTransform.scale;
      const nextScale = oldTransform.baseScale * nextZoom;
      return {
        panX: pointX - viewportSize.width / 2 - (graphX - oldTransform.centerGraphX) * nextScale,
        panY: pointY - viewportSize.height / 2 - (graphY - oldTransform.centerGraphY) * nextScale,
        zoom: nextZoom,
        fitMode: 'MANUAL',
        baseFitMode: current.fitMode === 'MANUAL' ? current.baseFitMode : current.fitMode,
      };
    });
    pauseScreensaverMotion();
  }, [graph, pauseScreensaverMotion, viewportSize]);

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
    if (node) onNodeClick?.(node);
  }, [onNodeClick]);

  const selectEdge = useCallback((edge: VisualizationEdge | undefined) => {
    setSelectedEdgeId(edge?.id ?? null);
    setSelectedNodeId(null);
    if (edge) onEdgeClick?.(edge);
  }, [onEdgeClick]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    showControls();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerGestureRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPanX: camera.panX,
      startPanY: camera.panY,
      moved: false,
      targetNodeId: (event.target as HTMLElement).closest<HTMLElement>('[data-node-id]')?.dataset.nodeId,
      targetEdgeId: (event.target as HTMLElement).closest<HTMLElement>('[data-edge-id]')?.dataset.edgeId,
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
      setIsPanning(true);
      pauseScreensaverMotion();
    }
    if (!gesture.moved) return;
    setHoveredNodeId(null);
    setCamera((current) => ({
      panX: gesture.startPanX + deltaX,
      panY: gesture.startPanY + deltaY,
      zoom: current.zoom,
      fitMode: 'MANUAL',
      baseFitMode: current.fitMode === 'MANUAL' ? current.baseFitMode : current.fitMode,
    }));
  };

  const finishPointerGesture = (event: React.PointerEvent<HTMLDivElement>, allowClick: boolean) => {
    const gesture = pointerGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (allowClick && !gesture.moved) {
      const targetedEdge = gesture.targetEdgeId
        ? graph.edges.find((edge) => edge.id === gesture.targetEdgeId)
        : undefined;
      const targetedNode = gesture.targetNodeId
        ? graph.nodes.find((node) => node.id === gesture.targetNodeId)
        : hitNode(event.clientX, event.clientY);
      if (targetedEdge) selectEdge(targetedEdge);
      else selectNode(targetedNode);
    }
    pointerGestureRef.current = null;
    setIsPanning(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const focusRoute = useCallback(() => {
    setCamera({ panX: 0, panY: 0, zoom: 1, fitMode: 'SELECTED_ROUTE', baseFitMode: 'SELECTED_ROUTE' });
  }, []);
  const fitAll = useCallback(() => {
    setCamera({ panX: 0, panY: 0, zoom: 1, fitMode: 'ALL', baseFitMode: 'ALL' });
  }, []);
  const resetView = useCallback(() => {
    setCamera((current) => {
      const fitMode = current.fitMode === 'MANUAL' ? current.baseFitMode : current.fitMode;
      return { panX: 0, panY: 0, zoom: 1, fitMode, baseFitMode: fitMode };
    });
  }, []);

  const panBy = useCallback((deltaX: number, deltaY: number) => {
    setCamera((current) => ({
      ...current,
      panX: current.panX + deltaX,
      panY: current.panY + deltaY,
      fitMode: 'MANUAL',
      baseFitMode: current.fitMode === 'MANUAL' ? current.baseFitMode : current.fitMode,
    }));
    pauseScreensaverMotion();
  }, [pauseScreensaverMotion]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    showControls();
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
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
        // Preserve the browser's native Escape behavior so fullscreen can exit.
        handled = false;
        break;
      default: handled = false;
    }
    if (handled) event.preventDefault();
  };

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
    graph,
    transform,
    viewportSize.width,
    viewportSize.height,
    camera,
    selectedNodeId,
    hoveredNodeId,
    activeReplayNodeId,
  ), [activeReplayNodeId, camera, graph, hoveredNodeId, selectedNodeId, transform, viewportSize]);

  const visibleEdgeLabels = useMemo(() => {
    const candidates = graph.edges
      .filter((edge) => advancedLabels || (
        edge.source === activeReplayNodeId || edge.id === selectedEdgeId
      ))
      .sort((left, right) => {
        const leftSelected = left.id === selectedEdgeId;
        const rightSelected = right.id === selectedEdgeId;
        return Number(rightSelected) - Number(leftSelected) ||
          right.expectedVisits - left.expectedVisits || left.id.localeCompare(right.id);
      });
    const occupied: Array<Pick<LabelLayout, 'left' | 'top' | 'width' | 'height'>> = [
      ...labelLayouts,
    ];
    const placed: EdgeLabelLayout[] = [];
    for (const edge of candidates) {
      const point = edgePoint(graph, edge, 0.5);
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
      );
      if (!available) continue;
      occupied.push(available);
      placed.push({ edge, ...available });
    }
    return placed;
  }, [advancedLabels, activeReplayNodeId, graph, labelLayouts, selectedEdgeId, transform, viewportSize]);

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
      className={`markov-constellation-container mode-${mode.toLowerCase()} ${isFullscreen ? 'fullscreen' : ''} ${isPanning ? 'is-panning' : ''} ${controlsVisible ? 'controls-visible' : 'controls-hidden'} ${className}`}
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
            <button className={`mode-btn ${mode === 'REPLAY' ? 'active' : ''}`} onClick={() => setMode('REPLAY')}>▶ Replay</button>
            <button className={`mode-btn ${mode === 'EXPLORER' ? 'active' : ''}`} onClick={() => setMode('EXPLORER')}>Explore</button>
            <button
              className={`mode-btn ${mode === 'SCREENSAVER' ? 'active' : ''}`}
              onClick={() => {
                setMode('SCREENSAVER');
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
        aria-label="Interactive Markov Constellation camera"
        aria-describedby="constellation-camera-instructions"
        onKeyDown={handleKeyDown}
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
          {graph.edges.map((edge) => {
            const point = edgePoint(graph, edge, 0.5);
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
                data-conditional-probability={edge.probability.toPrecision(12)}
                data-expected-flow={edge.expectedVisits.toPrecision(12)}
                onClick={(event) => {
                  if (event.detail === 0) selectEdge(edge);
                }}
                aria-label={`Select branch ${edge.actionLabel}`}
              />
            );
          })}
          {graph.nodes.map((node) => {
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
                onFocus={() => setHoveredNodeId(node.id)}
                onBlur={() => setHoveredNodeId(null)}
                onClick={(event) => {
                  if (event.detail === 0) selectNode(node);
                }}
                aria-label={`Select ${node.stepNumber ? `step ${node.stepNumber}, ` : ''}${node.fullLabel}`}
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
              data-label-priority={labelPriority(layout.node, selectedNodeId, hoveredNodeId, activeReplayNodeId)}
              onFocus={() => setHoveredNodeId(layout.node.id)}
              onBlur={() => setHoveredNodeId(null)}
              onClick={(event) => {
                if (event.detail === 0) selectNode(layout.node);
              }}
              aria-label={`${layout.node.stepNumber ? `Step ${layout.node.stepNumber}: ` : ''}${layout.node.fullLabel}. ${layout.node.details.routeStatus}`}
            >
              {layout.collapsed
                ? <span>{layout.node.stepNumber ?? (layout.node.kind === 'TERMINAL_SUCCESS' ? '✓' : '•')}</span>
                : <>
                    {layout.node.stepNumber && <span className="node-label-step">{layout.node.stepNumber}</span>}
                    <span className="node-label-title">{layout.node.label}</span>
                  </>}
            </button>
          ))}
          {visibleEdgeLabels.map(({ edge, left, top, width: labelWidth, height: labelHeight }) => (
            <button
              type="button"
              className={`constellation-edge-label ${edge.isRecovery ? 'recovery-edge' : ''} ${edge.id === selectedEdgeId ? 'selected' : ''}`}
              key={edge.id}
              style={{ left, top, width: labelWidth, height: labelHeight }}
              data-edge-id={edge.id}
              data-conditional-probability={edge.probability.toPrecision(12)}
              data-expected-flow={edge.expectedVisits.toPrecision(12)}
              data-outcome-kind={edge.outcomeKind}
              onClick={(event) => {
                if (event.detail === 0) selectEdge(edge);
              }}
              aria-label={`Select branch ${edge.actionLabel}`}
            >{edge.actionLabel}</button>
          ))}
        </div>

        {selectedNode && (
          <aside className="node-detail-overlay" aria-label="Selected constellation node details" data-selected-node-id={selectedNode.id}>
            <div className="node-detail-heading">
              <span>{selectedNode.stepNumber ? `Step ${selectedNode.stepNumber}` : selectedNode.kind.replace(/_/g, ' ')}</span>
              <h4>{selectedNode.fullLabel}</h4>
            </div>
            {selectedNode.details.targetTexts.length > 0 && (
              <ul className="node-target-list">{selectedNode.details.targetTexts.map((target) => <li key={target}>{target}</li>)}</ul>
            )}
            <dl className="node-stats">
              {selectedNode.details.phase && <><dt>Policy scope</dt><dd>{selectedNode.details.phase}</dd></>}
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
              {selectedNode.details.representativeState && <code>representative: {selectedNode.details.representativeState}</code>}
              {selectedNode.details.representativeStateKey && <code>state key: {selectedNode.details.representativeStateKey}</code>}
            </details>
            <button className="close-detail-btn" onClick={() => setSelectedNodeId(null)} aria-label="Close selected node details">×</button>
          </aside>
        )}

        {selectedEdge && (
          <aside className="node-detail-overlay edge-detail-overlay" aria-label="Selected constellation edge details" data-selected-edge-id={selectedEdge.id}>
            <div className="node-detail-heading">
              <span>{selectedEdge.outcomeKind.replace(/_/g, ' ')}</span>
              <h4>{selectedEdgeSource?.label ?? selectedEdge.actionLabel} → {selectedEdgeTarget?.label ?? 'Next state'}</h4>
            </div>
            <dl className="node-stats">
              <dt>Selected action</dt><dd>{selectedEdgeSource?.details.actions[0] ?? selectedEdge.actionLabel}</dd>
              <dt>Occupancy-weighted policy-flow probability</dt><dd>{(selectedEdge.probability * 100).toFixed(3)}%</dd>
              <dt>Expected traversals per craft</dt><dd>{selectedEdge.expectedVisits.toFixed(5)}</dd>
              <dt>Outcome group</dt><dd>{selectedEdge.outcomeKind.toLowerCase()}</dd>
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
            const compactLabel = node.details.phase === 'ACQUIRE'
              && graph.acquisitionContext.kind === 'SELF_FRACTURE'
              ? 'Fracture'
              : node.label;
            const railLabel = node.stepNumber
              ? `${node.stepNumber} ${compactLabel}`
              : index === 0
                ? 'Start'
                : compactLabel;
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
                onBlur={() => setHoveredNodeId(null)}
                onClick={() => selectNode(node)}
              >{railLabel}</button>
            );
          })}
        </div>
      )}

      <p id="constellation-camera-instructions" className="sr-only">
        Drag with a mouse, pen, or one finger to pan. Use the wheel or plus and minus keys to zoom.
        Arrow keys pan, zero resets, F focuses the selected route, A fits every node, and Escape closes node details.
      </p>
      <div className="sr-only" aria-live="polite">
        Camera {camera.fitMode.toLowerCase().replace('_', ' ')}, zoom {camera.zoom.toFixed(2)}.
        {selectedNode ? ` Selected ${selectedNode.fullLabel}.` : ''}
        {selectedEdge ? ` Selected branch ${selectedEdge.actionLabel}.` : ''}
      </div>
    </div>
  );
};
