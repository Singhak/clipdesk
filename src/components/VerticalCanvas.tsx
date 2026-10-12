import React, { useEffect, useRef, useState } from 'react';
import { FocusRegion } from '../core/focusRegion';
import { LayoutAgent } from '../core/layoutAgent';
import { createFrameSource } from '../core/frameSource';
import { ReelCompositor } from '../core/reelCompositor';
import { ExportEngine } from '../core/exportEngine';
import {
  LayoutMode,
  SmartFeatures,
  TemplateConfig,
  WebcamConfig,
  getLogicalSize,
  getOutputSize
} from '../core/types';

interface VerticalCanvasProps {
  videoElement: HTMLVideoElement | null;
  /** Read frames from these streams directly when the browser allows it, so recording keeps going in a hidden tab */
  screenStream?: MediaStream | null;
  webcamStream?: MediaStream | null;
  template: TemplateConfig;
  layoutMode: LayoutMode;
  smartFeatures: SmartFeatures;
  hasWatermark: boolean;
  externalCursor?: { x: number; y: number; click?: boolean } | null;
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
  brandTitle?: string;
  creatorHandle?: string;
  webcamVideoElement?: HTMLVideoElement | null;
  webcamConfig?: WebcamConfig;
  cameraOnly?: boolean;
  /** When set (dynamic crop only), the 9:16 crop is this fixed region instead of following the cursor */
  focus?: FocusRegion | null;
  onUpdateWebcamConfig?: (updater: (prev: WebcamConfig) => WebcamConfig) => void;
  /** Pen tool: drag on the preview to draw; strokes fade out and are part of the recording */
  penActive?: boolean;
  /** Increment to erase all strokes */
  clearStrokesSignal?: number;
}

export const VerticalCanvas: React.FC<VerticalCanvasProps> = ({
  videoElement,
  screenStream,
  webcamStream,
  template,
  layoutMode,
  smartFeatures,
  hasWatermark,
  externalCursor,
  onCanvasReady,
  brandTitle,
  creatorHandle,
  webcamVideoElement,
  webcamConfig,
  cameraOnly = false,
  focus = null,
  onUpdateWebcamConfig,
  penActive = false,
  clearStrokesSignal = 0
}) => {
  const logical = getLogicalSize(layoutMode);
  const output = getOutputSize(layoutMode);
  const isWide = layoutMode === 'widescreen';
  const strokesRef = useRef<{ points: { x: number; y: number }[]; endedAt: number | null }[]>([]);
  const penDownRef = useRef(false);

  useEffect(() => {
    strokesRef.current = [];
  }, [clearStrokesSignal]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const compositorRef = useRef<ReelCompositor | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const [fps, setFps] = useState(60);
  const [currentZoomDisplay, setCurrentZoomDisplay] = useState(1.0);
  const [cameraCoords, setCameraCoords] = useState({ x: 0, y: 0 });
  const [isHoveringWebcam, setIsHoveringWebcam] = useState(false);
  const [isDraggingWebcam, setIsDraggingWebcam] = useState(false);

  const isDraggingWebcamRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const hasDraggedRef = useRef(false);

  const compositorOptions = {
    template,
    layoutMode,
    smartFeatures,
    watermark: hasWatermark,
    webcamConfig,
    cameraOnly,
    focus: layoutMode === 'dynamic_crop' ? focus : null,
    brandTitle,
    creatorHandle
  };
  if (!compositorRef.current) compositorRef.current = new ReelCompositor(compositorOptions);
  // Options are read on every frame, so changing them (dragging the focus frame, moving the bubble) never restarts the loop
  compositorRef.current.setOptions(compositorOptions);

  useEffect(() => {
    if (canvasRef.current && onCanvasReady) onCanvasReady(canvasRef.current);
  }, []);

  // Update cursor if external coordinate passed
  useEffect(() => {
    if (!externalCursor || !compositorRef.current) return;
    if (externalCursor.click) compositorRef.current.click(externalCursor.x, externalCursor.y);
    else compositorRef.current.setCursor(externalCursor.x, externalCursor.y);
  }, [externalCursor]);

  // Main Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    // Allow the browser to restore the canvas after a GPU context loss instead of staying blank
    const onContextLost = (e: Event) => e.preventDefault();
    canvas.addEventListener('contextlost', onContextLost);

    const screenSource = createFrameSource(screenStream, videoElement);
    const webcamSource = createFrameSource(webcamStream, webcamVideoElement);

    let frameCount = 0;
    let fpsTimer = performance.now();
    let lastStatsAt = 0;

    const scale = output.width / logical.width;
    const render = (now: number) => {
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      frameCount++;
      if (now - fpsTimer >= 1000) {
        setFps(frameCount);
        frameCount = 0;
        fpsTimer = now;
      }

      // Browsers can pause hidden/background media; keep both fallback feeds playing
      if (videoElement?.paused && videoElement.srcObject) void videoElement.play().catch(() => {});
      if (webcamVideoElement?.paused && webcamVideoElement.srcObject) void webcamVideoElement.play().catch(() => {});

      const stats = compositorRef.current?.render(ctx, logical.width, logical.height, screenSource, webcamSource, now);
      // The readouts are for humans: refresh them a few times a second, not on every frame,
      // so React doesn't re-render the whole preview at the frame rate
      if (stats && now - lastStatsAt >= 250) {
        lastStatsAt = now;
        setCurrentZoomDisplay(Number(stats.zoom.toFixed(2)));
        const x = Math.round(stats.cropX);
        const y = Math.round(stats.cropY);
        setCameraCoords((prev) => (prev.x === x && prev.y === y ? prev : { x, y }));
      }

      // Pen strokes: full opacity while drawing, then fade out over 4 seconds
      const strokes = strokesRef.current;
      if (strokes.length > 0) {
        const t = performance.now();
        strokesRef.current = strokes.filter((st) => st.endedAt === null || t - st.endedAt < 4000);
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#ff3b5c';
        ctx.shadowColor = 'rgba(255, 59, 92, 0.6)';
        ctx.shadowBlur = 6;
        ctx.lineWidth = Math.max(3, Math.round(Math.min(logical.width, logical.height) * 0.012));
        for (const st of strokesRef.current) {
          ctx.globalAlpha = st.endedAt === null ? 1 : Math.max(0, 1 - (t - st.endedAt) / 4000);
          ctx.beginPath();
          st.points.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
          if (st.points.length === 1) ctx.lineTo(st.points[0].x + 0.1, st.points[0].y);
          ctx.stroke();
        }
        ctx.restore();
      }
    };

    const rafLoop = (now: number) => {
      render(now);
      animFrameRef.current = requestAnimationFrame(rafLoop);
    };
    animFrameRef.current = requestAnimationFrame(rafLoop);

    // Browsers pause requestAnimationFrame in a background tab, which is exactly where this tab
    // sits while the user works in the app being recorded. A worker timer keeps drawing there.
    const stopTicker = ExportEngine.startTicker(33, () => {
      if (document.hidden) render(performance.now());
    });

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      canvas.removeEventListener('contextlost', onContextLost);
      stopTicker();
      screenSource?.stop();
      webcamSource?.stop();
    };
  }, [videoElement, webcamVideoElement, screenStream, webcamStream, layoutMode]);

  /** Maps a point on the preview to source pixels */
  const toSource = (coords: { x: number; y: number }) => {
    const src = compositorRef.current?.getSourceSize() ?? { width: 1920, height: 1080 };
    return { x: (coords.x / logical.width) * src.width, y: (coords.y / logical.height) * src.height };
  };

  // Check if coordinates land inside the circular webcam bubble
  const getIsOverWebcam = (canvasX: number, canvasY: number): boolean => {
    if (!webcamConfig?.enabled || cameraOnly || !canvasRef.current) return false;
    const { cx, cy, radius } = LayoutAgent.getWebcamMetrics(
      logical.width,
      logical.height,
      webcamConfig
    );
    const dist = Math.hypot(canvasX - cx, canvasY - cy);
    if (webcamConfig.shape === 'square') {
      return Math.max(Math.abs(canvasX - cx), Math.abs(canvasY - cy)) <= radius + 6;
    }
    return dist <= radius + 6;
  };

  const getCanvasCoords = (clientX: number, clientY: number): { x: number; y: number } | null => {
    if (!canvasRef.current) return null;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * logical.width;
    const y = ((clientY - rect.top) / rect.height) * logical.height;
    return { x, y };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = getCanvasCoords(e.clientX, e.clientY);
    if (!coords || !canvasRef.current) return;

    if (penActive) {
      penDownRef.current = true;
      strokesRef.current.push({ points: [coords], endedAt: null });
      return;
    }

    if (webcamConfig?.enabled && getIsOverWebcam(coords.x, coords.y)) {
      isDraggingWebcamRef.current = true;
      hasDraggedRef.current = false;
      const { cx, cy } = LayoutAgent.getWebcamMetrics(
        logical.width,
        logical.height,
        webcamConfig
      );
      dragOffsetRef.current = { x: coords.x - cx, y: coords.y - cy };
      setIsDraggingWebcam(true);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const coords = getCanvasCoords(e.clientX, e.clientY);
    if (!coords) return;

    if (penDownRef.current) {
      const current = strokesRef.current[strokesRef.current.length - 1];
      if (current && current.endedAt === null) current.points.push(coords);
      return;
    }

    // 1. If actively dragging circular webcam bubble
    if (isDraggingWebcamRef.current && onUpdateWebcamConfig) {
      hasDraggedRef.current = true;
      const newCanvasX = coords.x - dragOffsetRef.current.x;
      const newCanvasY = coords.y - dragOffsetRef.current.y;

      const normX = Math.max(0.12, Math.min(0.88, newCanvasX / logical.width));
      const normY = Math.max(0.08, Math.min(0.92, newCanvasY / logical.height));

      onUpdateWebcamConfig((prev) => ({
        ...prev,
        position: { x: normX, y: normY },
        presetPosition: 'custom'
      }));
      return;
    }

    // 2. Check hover status for styling
    if (webcamConfig?.enabled) {
      const isOver = getIsOverWebcam(coords.x, coords.y);
      setIsHoveringWebcam(isOver);
    } else {
      setIsHoveringWebcam(false);
    }

    // 3. Update simulated camera mouse pos
    const src = toSource(coords);
    compositorRef.current?.setCursor(src.x, src.y);
  };

  const handleMouseUp = () => {
    if (penDownRef.current) {
      penDownRef.current = false;
      const current = strokesRef.current[strokesRef.current.length - 1];
      if (current && current.endedAt === null) current.endedAt = performance.now();
    }
    if (isDraggingWebcamRef.current) {
      isDraggingWebcamRef.current = false;
      setIsDraggingWebcam(false);
    }
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (penActive) return;
    // If was dragging the camera, do not trigger click zoom
    if (hasDraggedRef.current) {
      hasDraggedRef.current = false;
      return;
    }

    const coords = getCanvasCoords(e.clientX, e.clientY);
    if (!coords || !canvasRef.current || !compositorRef.current) return;

    // If clicked on webcam, avoid screen zoom
    if (webcamConfig?.enabled && getIsOverWebcam(coords.x, coords.y)) {
      return;
    }

    const src = toSource(coords);
    compositorRef.current.click(src.x, src.y);
  };

  // Touch Support
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 0) return;
    const touch = e.touches[0];
    const coords = getCanvasCoords(touch.clientX, touch.clientY);
    if (!coords || !canvasRef.current) return;

    if (webcamConfig?.enabled && getIsOverWebcam(coords.x, coords.y)) {
      isDraggingWebcamRef.current = true;
      hasDraggedRef.current = false;
      const { cx, cy } = LayoutAgent.getWebcamMetrics(
        logical.width,
        logical.height,
        webcamConfig
      );
      dragOffsetRef.current = { x: coords.x - cx, y: coords.y - cy };
      setIsDraggingWebcam(true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDraggingWebcamRef.current || e.touches.length === 0 || !canvasRef.current || !onUpdateWebcamConfig) return;
    const touch = e.touches[0];
    const coords = getCanvasCoords(touch.clientX, touch.clientY);
    if (!coords) return;

    hasDraggedRef.current = true;
    const newCanvasX = coords.x - dragOffsetRef.current.x;
    const newCanvasY = coords.y - dragOffsetRef.current.y;

    const normX = Math.max(0.12, Math.min(0.88, newCanvasX / logical.width));
    const normY = Math.max(0.08, Math.min(0.92, newCanvasY / logical.height));

    onUpdateWebcamConfig((prev) => ({
      ...prev,
      position: { x: normX, y: normY },
      presetPosition: 'custom'
    }));
  };

  const handleTouchEnd = () => {
    isDraggingWebcamRef.current = false;
    setIsDraggingWebcam(false);
  };

  const cursorClass = penActive
    ? 'cursor-crosshair'
    : isDraggingWebcam
    ? 'cursor-grabbing'
    : isHoveringWebcam
    ? 'cursor-grab'
    : 'cursor-crosshair';

  const canvasEl = (
    <canvas
      ref={canvasRef}
      width={output.width}
      height={output.height}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="w-full h-full object-cover block"
    />
  );

  const dragHint =
    webcamConfig?.enabled && (isHoveringWebcam || isDraggingWebcam) ? (
      <div className="absolute top-4 right-4 flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-600/90 backdrop-blur-md border border-indigo-400 text-[10px] font-bold text-white tracking-wide shadow-xl animate-fadeIn">
        <span>✨ Drag circle camera anywhere</span>
      </div>
    ) : null;

  if (isWide) {
    return (
      <div className="relative flex flex-col items-center w-full">
        <div
          className={`relative w-full max-w-3xl aspect-video rounded-2xl overflow-hidden border border-white/10 bg-black shadow-2xl ${cursorClass}`}
        >
          {canvasEl}
          <div className="absolute top-3 left-3 flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/80 backdrop-blur-md border border-white/15 text-[10px] font-bold text-white tracking-wide shadow-lg">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
            <span>16:9 WIDESCREEN · {output.width}×{output.height}</span>
          </div>
          {penActive && (
            <div className="absolute top-3 right-3 px-3 py-1 rounded-full bg-rose-600/90 text-[10px] font-bold text-white">
              ✏️ Pen on: drag to draw
            </div>
          )}
          {!penActive && dragHint}
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col items-center">
      {/* 9:16 Smartphone Mockup Frame */}
      <div className={`reel-frame-container group ${cursorClass}`}>
        {/* Dynamic Island / Notch Simulation */}
        <div className="reel-notch flex items-center justify-center">
          <span className="w-2.5 h-2.5 rounded-full bg-slate-900 border border-slate-700 block" />
        </div>

        {canvasEl}

        {/* Live Vertical Badge */}
        <div className="absolute top-4 left-4 flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/80 backdrop-blur-md border border-white/15 text-[10px] font-bold text-white tracking-wide shadow-lg">
          <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
          <span>9:16 REEL VIEW</span>
        </div>

        {penActive ? (
          <div className="absolute top-4 right-4 px-3 py-1 rounded-full bg-rose-600/90 text-[10px] font-bold text-white">
            ✏️ Pen on
          </div>
        ) : (
          dragHint
        )}

        {/* Interactive Telemetry Overlay */}
        <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between px-3.5 py-2 rounded-2xl bg-black/80 backdrop-blur-xl border border-white/15 text-[10px] font-mono text-slate-300 shadow-xl pointer-events-none">
          <div className="flex items-center gap-2">
            <span className="text-emerald-400 font-bold">{fps} FPS</span>
            <span className="text-white/20">•</span>
            <span className="text-indigo-300 font-semibold">Zoom {currentZoomDisplay}x</span>
          </div>
          <div className="text-slate-400 font-mono text-[9px]">
            {webcamConfig?.enabled ? 'Cam: Circle PiP ON' : `Cam X:${cameraCoords.x} Y:${cameraCoords.y}`}
          </div>
        </div>
      </div>
    </div>
  );
};
