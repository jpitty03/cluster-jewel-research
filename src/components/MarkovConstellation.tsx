import React, { useEffect, useRef, useState, useCallback } from 'react';
import type {
  VisualizationGraph,
  VisualizationNode,
  VisualizationEdge,
  VisualizationWisp,
} from '../../crafting-engine/src/domain/VisualizationGraph.ts';

export interface MarkovConstellationProps {
  graph: VisualizationGraph;
  width?: number;
  height?: number;
  isLive?: boolean;
  deterministicMode?: boolean;
  onNodeClick?: (node: VisualizationNode) => void;
  className?: string;
}

export const MarkovConstellation: React.FC<MarkovConstellationProps> = ({
  graph,
  width = 900,
  height = 520,
  isLive: _isLive = false,
  deterministicMode = false,
  onNodeClick,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [isPlaying, setIsPlaying] = useState<boolean>(!deterministicMode);
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1.0);
  const [mode, setMode] = useState<'REPLAY' | 'EXPLORER' | 'SCREENSAVER'>('REPLAY');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [selectedNode, setSelectedNode] = useState<VisualizationNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<VisualizationNode | null>(null);
  const [reducedMotion, setReducedMotion] = useState<boolean>(false);
  const [replayStepIndex, setReplayStepIndex] = useState<number>(0);

  // Sync fullscreen state with browser events
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Auto-detect reduced motion preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mediaQuery.matches);
    const listener = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, []);

  // Replay mode step progression timer
  useEffect(() => {
    if (mode !== 'REPLAY' || !isPlaying || reducedMotion) return;
    const interval = setInterval(() => {
      setReplayStepIndex((prev) => (prev + 1) % Math.max(1, graph.selectedRouteNodeIds.length));
    }, 1800 / speedMultiplier);
    return () => clearInterval(interval);
  }, [mode, isPlaying, speedMultiplier, reducedMotion, graph.selectedRouteNodeIds.length]);

  // Wisps state for particles moving along edges
  const wispsRef = useRef<VisualizationWisp[]>([]);

  useEffect(() => {
    const wisps: VisualizationWisp[] = [];
    graph.edges.forEach((edge, idx) => {
      const count = edge.isSelectedRoute ? 3 : edge.isDominated ? 1 : 2;
      for (let i = 0; i < count; i++) {
        wisps.push({
          id: `wisp_${edge.id}_${i}`,
          edgeId: edge.id,
          sourceNodeId: edge.source,
          targetNodeId: edge.target,
          progress: (i / count + (idx * 0.19)) % 1.0,
          speed: (0.0003 + (edge.expectedVisits * 0.0001)) * (edge.isSelectedRoute ? 1.4 : 0.8),
          size: edge.isSelectedRoute ? 3.5 : 2.2,
          opacity: edge.isSelectedRoute ? 0.95 : 0.45,
          color: edge.isSelectedRoute ? '#38bdf8' : edge.isDominated ? '#94a3b8' : '#f59e0b',
        });
      }
    });
    wispsRef.current = wisps;
  }, [graph]);

  // Calculate viewport transformation to prevent clipping on small viewports
  const getTransform = useCallback((displayWidth: number, displayHeight: number) => {
    const padding = 30;
    const graphWidth = graph.bounds.width || 1000;
    const graphHeight = graph.bounds.height || 600;

    const scaleX = (displayWidth - padding * 2) / graphWidth;
    const scaleY = (displayHeight - padding * 2) / graphHeight;
    const scale = Math.min(1.2, Math.max(0.25, Math.min(scaleX, scaleY)));

    const offsetX = (displayWidth - graphWidth * scale) / 2;
    const offsetY = (displayHeight - graphHeight * scale) / 2;

    return { scale, offsetX, offsetY };
  }, [graph.bounds]);

  // Quadratic curve midpoint calculator
  const getEdgePoint = useCallback((edge: VisualizationEdge, t: number): { x: number; y: number } => {
    const src = graph.nodes.find((n) => n.id === edge.source);
    const tgt = graph.nodes.find((n) => n.id === edge.target);
    if (!src || !tgt) return { x: 0, y: 0 };

    const midX = (src.x + tgt.x) / 2;
    const midY = (src.y + tgt.y) / 2;
    const dx = tgt.x - src.x;
    const dy = tgt.y - src.y;
    const dist = Math.hypot(dx, dy);

    const normX = -dy / (dist || 1);
    const normY = dx / (dist || 1);
    const ctrlX = midX + normX * dist * edge.curvature;
    const ctrlY = midY + normY * dist * edge.curvature;

    const u = 1 - t;
    const x = u * u * src.x + 2 * u * t * ctrlX + t * t * tgt.x;
    const y = u * u * src.y + 2 * u * t * ctrlY + t * t * tgt.y;
    return { x, y };
  }, [graph]);

  // Main Animation & Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let lastTime = performance.now();

    const render = (now: number) => {
      const deltaMs = deterministicMode ? 16.667 : Math.min(64, now - lastTime);
      lastTime = now;

      // Advance particles if active motion
      if (isPlaying && !reducedMotion) {
        wispsRef.current.forEach((wisp) => {
          wisp.progress = (wisp.progress + wisp.speed * deltaMs * speedMultiplier) % 1.0;
        });
      }

      // Display dimensions & devicePixelRatio
      const dpr = window.devicePixelRatio || 1;
      const displayWidth = canvas.clientWidth || width;
      const displayHeight = canvas.clientHeight || height;
      const targetWidth = Math.round(displayWidth * dpr);
      const targetHeight = Math.round(displayHeight * dpr);

      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, displayWidth, displayHeight);

      // 1. Cosmic Background
      const bgGrad = ctx.createRadialGradient(
        displayWidth / 2,
        displayHeight / 2,
        20,
        displayWidth / 2,
        displayHeight / 2,
        displayWidth * 0.7
      );
      bgGrad.addColorStop(0, '#0c1222');
      bgGrad.addColorStop(0.5, '#070b14');
      bgGrad.addColorStop(1, '#030508');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, displayWidth, displayHeight);

      // Ambient Stars
      ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
      for (let i = 0; i < 28; i++) {
        const starX = ((i * 137.5) % displayWidth);
        const starY = ((i * 219.3) % displayHeight);
        ctx.fillRect(starX, starY, 1.5, 1.5);
      }

      // Transform context for scaled graph coordinate space
      const { scale, offsetX, offsetY } = getTransform(displayWidth, displayHeight);
      ctx.save();
      ctx.translate(offsetX, offsetY);
      ctx.scale(scale, scale);

      // Active Replay Node ID
      const activeReplayNodeId = mode === 'REPLAY' && graph.selectedRouteNodeIds.length > 0
        ? graph.selectedRouteNodeIds[replayStepIndex % graph.selectedRouteNodeIds.length]
        : null;

      // 2. Draw Curved Edges
      graph.edges.forEach((edge) => {
        const src = graph.nodes.find((n) => n.id === edge.source);
        const tgt = graph.nodes.find((n) => n.id === edge.target);
        if (!src || !tgt) return;

        const midX = (src.x + tgt.x) / 2;
        const midY = (src.y + tgt.y) / 2;
        const dx = tgt.x - src.x;
        const dy = tgt.y - src.y;
        const dist = Math.hypot(dx, dy);
        const normX = -dy / (dist || 1);
        const normY = dx / (dist || 1);
        const ctrlX = midX + normX * dist * edge.curvature;
        const ctrlY = midY + normY * dist * edge.curvature;

        ctx.beginPath();
        ctx.moveTo(src.x, src.y);
        ctx.quadraticCurveTo(ctrlX, ctrlY, tgt.x, tgt.y);

        const isEdgeInReplay = activeReplayNodeId && edge.source === activeReplayNodeId;

        if (edge.isSelectedRoute) {
          ctx.strokeStyle = isEdgeInReplay ? 'rgba(56, 189, 248, 0.6)' : 'rgba(56, 189, 248, 0.25)';
          ctx.lineWidth = isEdgeInReplay ? 7 : 5;
          ctx.stroke();

          ctx.strokeStyle = isEdgeInReplay ? '#ffffff' : '#38bdf8';
          ctx.lineWidth = isEdgeInReplay ? 3.5 : 2.2;
          ctx.stroke();
        } else if (edge.isDominated) {
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.15)';
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
        } else {
          ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      });

      // 3. Draw Traveling Particle Wisps (Skipped in Reduced Motion)
      if (!reducedMotion) {
        wispsRef.current.forEach((wisp) => {
          const edge = graph.edges.find((e) => e.id === wisp.edgeId);
          if (!edge) return;
          const pos = getEdgePoint(edge, wisp.progress);

          const wispGrad = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, wisp.size * 3);
          wispGrad.addColorStop(0, wisp.color);
          wispGrad.addColorStop(0.5, `${wisp.color}66`);
          wispGrad.addColorStop(1, 'transparent');

          ctx.fillStyle = wispGrad;
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, wisp.size * 3, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, wisp.size * 0.8, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      // 4. Draw Macro-State Nodes
      graph.nodes.forEach((node) => {
        const isHovered = hoveredNode?.id === node.id;
        const isSelected = selectedNode?.id === node.id;
        const isReplayActive = activeReplayNodeId === node.id;

        const glowRadius = node.radius * (isReplayActive ? 3.2 : isHovered ? 2.8 : 2.2);
        const glowGrad = ctx.createRadialGradient(node.x, node.y, node.radius * 0.5, node.x, node.y, glowRadius);

        if (node.kind === 'TERMINAL_SUCCESS') {
          glowGrad.addColorStop(0, 'rgba(52, 211, 153, 0.85)');
          glowGrad.addColorStop(0.6, 'rgba(52, 211, 153, 0.25)');
          glowGrad.addColorStop(1, 'transparent');
        } else if (node.isSelectedRoute) {
          glowGrad.addColorStop(0, isReplayActive ? 'rgba(255, 255, 255, 0.95)' : 'rgba(56, 189, 248, 0.7)');
          glowGrad.addColorStop(0.6, 'rgba(56, 189, 248, 0.2)');
          glowGrad.addColorStop(1, 'transparent');
        } else if (node.isDominated) {
          glowGrad.addColorStop(0, 'rgba(100, 116, 139, 0.3)');
          glowGrad.addColorStop(1, 'transparent');
        } else {
          glowGrad.addColorStop(0, 'rgba(251, 191, 36, 0.6)');
          glowGrad.addColorStop(0.6, 'rgba(251, 191, 36, 0.15)');
          glowGrad.addColorStop(1, 'transparent');
        }

        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(node.x, node.y, glowRadius, 0, Math.PI * 2);
        ctx.fill();

        // Node Body
        ctx.fillStyle = node.kind === 'TERMINAL_SUCCESS'
          ? '#059669'
          : node.isSelectedRoute
            ? '#0284c7'
            : node.isDominated
              ? '#334155'
              : '#d97706';
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fill();

        // Node Ring
        ctx.strokeStyle = isSelected || isHovered || isReplayActive
          ? '#ffffff'
          : node.isSelectedRoute
            ? '#7dd3fc'
            : '#94a3b8';
        ctx.lineWidth = isSelected || isReplayActive ? 3.5 : isHovered ? 2.5 : 1.5;
        ctx.stroke();

        // Labels
        ctx.fillStyle = '#f8fafc';
        ctx.font = '600 12px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(node.label, node.x, node.y + node.radius + 16);

        if (node.sublabel) {
          ctx.fillStyle = '#94a3b8';
          ctx.font = '400 10px Inter, sans-serif';
          ctx.fillText(node.sublabel, node.x, node.y + node.radius + 28);
        }
      });

      ctx.restore(); // Restore scaled transform
      ctx.restore(); // Restore dpr transform

      // Only schedule next frame if motion is enabled and playing
      if (isPlaying && !reducedMotion && !deterministicMode) {
        animationFrameId = requestAnimationFrame(render);
      }
    };

    if (deterministicMode || !isPlaying || reducedMotion) {
      render(performance.now());
    } else {
      animationFrameId = requestAnimationFrame(render);
    }

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [
    graph,
    isPlaying,
    speedMultiplier,
    reducedMotion,
    deterministicMode,
    hoveredNode,
    selectedNode,
    replayStepIndex,
    mode,
    getEdgePoint,
    getTransform,
    width,
    height,
  ]);

  // Pointer Interaction with Viewport Coordinate Inversion
  const getGraphCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const canvasX = e.clientX - rect.left;
    const canvasY = e.clientY - rect.top;

    const { scale, offsetX, offsetY } = getTransform(canvas.clientWidth, canvas.clientHeight);
    const graphX = (canvasX - offsetX) / scale;
    const graphY = (canvasY - offsetY) / scale;
    return { graphX, graphY };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = getGraphCoords(e);
    if (!coords) return;
    const hit = graph.nodes.find((n) => Math.hypot(n.x - coords.graphX, n.y - coords.graphY) <= n.radius + 8);
    setHoveredNode(hit || null);
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = getGraphCoords(e);
    if (!coords) return;
    const hit = graph.nodes.find((n) => Math.hypot(n.x - coords.graphX, n.y - coords.graphY) <= n.radius + 8);
    if (hit) {
      setSelectedNode(hit);
      onNodeClick?.(hit);
    } else {
      setSelectedNode(null);
    }
  };

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {}
  };

  return (
    <div
      ref={containerRef}
      className={`markov-constellation-container ${isFullscreen ? 'fullscreen' : ''} ${className}`}
      data-testid="markov-constellation-container"
    >
      <div className="constellation-toolbar">
        <div className="toolbar-left">
          <span className="constellation-title">✨ Markov Constellation</span>
          <div className="mode-toggle-group">
            <button
              className={`mode-btn ${mode === 'REPLAY' ? 'active' : ''}`}
              onClick={() => setMode('REPLAY')}
              title="Policy Replay Mode"
            >
              ▶ Replay
            </button>
            <button
              className={`mode-btn ${mode === 'EXPLORER' ? 'active' : ''}`}
              onClick={() => setMode('EXPLORER')}
              title="Interactive Graph Exploration Mode"
            >
              🔍 Explore
            </button>
            <button
              className={`mode-btn ${mode === 'SCREENSAVER' ? 'active' : ''}`}
              onClick={() => {
                setMode('SCREENSAVER');
                void toggleFullscreen();
              }}
              title="Screensaver Ambient View"
            >
              🌌 Screensaver
            </button>
          </div>
        </div>

        <div className="toolbar-controls">
          <button
            className="ctrl-btn"
            onClick={() => setIsPlaying(!isPlaying)}
            title={isPlaying ? 'Pause Animation' : 'Resume Animation'}
            aria-label={isPlaying ? 'Pause Animation' : 'Resume Animation'}
          >
            {isPlaying ? '⏸' : '▶'}
          </button>

          <div className="speed-selector">
            {[0.5, 1.0, 2.0, 5.0].map((s) => (
              <button
                key={s}
                className={`speed-btn ${speedMultiplier === s ? 'active' : ''}`}
                onClick={() => setSpeedMultiplier(s)}
              >
                {s}x
              </button>
            ))}
          </div>

          <button
            className={`ctrl-btn ${reducedMotion ? 'active' : ''}`}
            onClick={() => setReducedMotion(!reducedMotion)}
            title="Toggle Reduced Motion Mode"
            aria-label="Toggle Reduced Motion"
          >
            {reducedMotion ? '🌿 Static' : '✨ Fluid'}
          </button>

          <button
            className="ctrl-btn"
            onClick={() => void toggleFullscreen()}
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            aria-label="Toggle Fullscreen"
          >
            {isFullscreen ? '⤢ Exit' : '⤢ Fullscreen'}
          </button>
        </div>
      </div>

      <div className="canvas-wrapper">
        <canvas
          ref={canvasRef}
          className="constellation-canvas"
          width={width}
          height={height}
          onMouseMove={handleMouseMove}
          onClick={handleCanvasClick}
          role="img"
          aria-label="Markov Constellation state transition diagram"
        />

        {selectedNode && (
          <div className="node-detail-overlay">
            <h4>{selectedNode.label}</h4>
            <p className="node-kind-badge">{selectedNode.kind}</p>
            {selectedNode.sublabel && <p className="node-sublabel">{selectedNode.sublabel}</p>}
            <div className="node-stats">
              <span>Occupancy Volume: {(selectedNode.occupancyWeight * 100).toFixed(0)}%</span>
              <span>Status: {selectedNode.isSelectedRoute ? 'Winning Policy Route' : selectedNode.isDominated ? 'Dominated Alternative' : 'Explored Frontier'}</span>
            </div>
            <button className="close-detail-btn" onClick={() => setSelectedNode(null)}>✕</button>
          </div>
        )}
      </div>

      {/* Screen-reader Accessible Text Fallback */}
      <div className="sr-only" aria-live="polite">
        <h3>Markov Policy Transition Flow</h3>
        <ul>
          {graph.nodes.map((node) => (
            <li key={node.id}>
              {node.label} ({node.kind}): {node.isSelectedRoute ? 'Selected winning policy route' : 'Alternative branch'}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
