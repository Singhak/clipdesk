import React, { useState, useRef, useEffect } from 'react';
import {
  Pause,
  Play,
  Square,
  EyeOff,
  Eye,
  GripVertical,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Mic,
  Volume2,
  Camera,
  CameraOff
} from 'lucide-react';
import { WebcamConfig } from '../core/types';

interface FloatingRecordingBarProps {
  isPaused: boolean;
  elapsedSeconds: number;
  onTogglePause: () => void;
  onStopAndExport: () => void;
  onDiscard?: () => void;
  isSimulated?: boolean;
  webcamConfig?: WebcamConfig;
  onToggleWebcam?: () => void;
  onUpdateWebcamConfig?: (updater: (prev: WebcamConfig) => WebcamConfig) => void;
}

export const FloatingRecordingBar: React.FC<FloatingRecordingBarProps> = ({
  isPaused,
  elapsedSeconds,
  onTogglePause,
  onStopAndExport,
  onDiscard,
  isSimulated = false,
  webcamConfig,
  onToggleWebcam,
  onUpdateWebcamConfig
}) => {
  // State: 'expanded' | 'compact' | 'hidden_pill'
  const [viewState, setViewState] = useState<'expanded' | 'compact' | 'hidden_pill'>('expanded');
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ startX: number; startY: number; initialX: number; initialY: number } | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Dragging logic
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!barRef.current) return;
    const rect = barRef.current.getBoundingClientRect();
    setIsDragging(true);
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialX: rect.left,
      initialY: rect.top
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !dragStartRef.current) return;
      const dx = e.clientX - dragStartRef.current.startX;
      const dy = e.clientY - dragStartRef.current.startY;

      const newX = Math.max(16, Math.min(window.innerWidth - 320, dragStartRef.current.initialX + dx));
      const newY = Math.max(16, Math.min(window.innerHeight - 80, dragStartRef.current.initialY + dy));

      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      dragStartRef.current = null;
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const stylePosition: React.CSSProperties = position
    ? {
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: 'none'
      }
    : {
        position: 'fixed',
        bottom: '36px',
        left: '50%',
        transform: 'translateX(-50%)'
      };

  // State 1: Ultra-compact ghost pill
  if (viewState === 'hidden_pill') {
    return (
      <div
        id="floating-rec-ghost-pill"
        style={stylePosition}
        onClick={() => setViewState('expanded')}
        className="z-[99999] flex items-center gap-2.5 px-4 py-2 rounded-full bg-[#0a0d16]/95 backdrop-blur-2xl border-2 border-indigo-500 shadow-[0_0_30px_rgba(99,102,241,0.5)] cursor-pointer hover:scale-105 transition-all text-xs group"
        title="Click to restore floating recording controls (Excluded from video recording)"
      >
        <span className={`w-3 h-3 rounded-full ${isPaused ? 'bg-amber-400' : 'bg-rose-500 animate-ping'}`} />
        <span className="font-mono font-black text-white text-xs">{formatTimer(elapsedSeconds)}</span>
        <div className="h-3 w-px bg-white/20" />
        <div className="flex items-center gap-1 text-xs font-bold text-indigo-300 group-hover:text-white">
          <Eye className="w-3.5 h-3.5" />
          <span>Show Menu</span>
        </div>
      </div>
    );
  }

  // State 2: Compact Mini Bar
  if (viewState === 'compact') {
    return (
      <div
        ref={barRef}
        id="floating-rec-compact-bar"
        style={stylePosition}
        className="z-[99999] flex items-center gap-3 px-4 py-2 rounded-2xl bg-[#080b14]/95 backdrop-blur-2xl border-2 border-indigo-500 shadow-[0_0_40px_rgba(99,102,241,0.5)] animate-fadeIn"
      >
        {/* Drag handle */}
        <div
          onMouseDown={handleMouseDown}
          className="cursor-grab active:cursor-grabbing text-indigo-400 hover:text-white p-0.5"
          title="Drag to reposition anywhere"
        >
          <GripVertical className="w-4 h-4" />
        </div>

        {/* Recording dot & timer */}
        <div className="flex items-center gap-2">
          <span className={`recording-dot ${isPaused ? 'bg-amber-400' : ''}`} />
          <span className="font-mono font-black text-white text-xs">{formatTimer(elapsedSeconds)}</span>
        </div>

        <div className="h-4 w-px bg-white/20" />

        {/* Pause Button */}
        <button
          id="btn-floating-pause-compact"
          onClick={onTogglePause}
          className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
          title={isPaused ? 'Resume Recording' : 'Pause Recording'}
          aria-label={isPaused ? 'Resume recording' : 'Pause recording'}
        >
          {isPaused ? <Play className="w-3.5 h-3.5 fill-white" /> : <Pause className="w-3.5 h-3.5" />}
        </button>

        {/* Camera Toggle Button */}
        {onToggleWebcam && (
          <button
            id="btn-floating-camera-compact"
            onClick={onToggleWebcam}
            className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
              webcamConfig?.enabled
                ? 'bg-indigo-600/30 border-indigo-500/50 text-indigo-300 shadow-sm'
                : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
            }`}
            title={webcamConfig?.enabled ? 'Disable Circle Camera' : 'Enable Circle Camera'}
            aria-label={webcamConfig?.enabled ? 'Turn camera off' : 'Turn camera on'}
          >
            {webcamConfig?.enabled ? <Camera className="w-3.5 h-3.5 text-indigo-400" /> : <CameraOff className="w-3.5 h-3.5" />}
          </button>
        )}

        {/* Stop Button */}
        <button
          id="btn-floating-stop-compact"
          onClick={onStopAndExport}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-rose-600 to-rose-500 text-white text-xs font-extrabold shadow-md shadow-rose-600/40 hover:brightness-110 transition-all cursor-pointer"
          title="Stop Recording and Export 1080x1920 Reel"
        >
          <Square className="w-3 h-3 fill-white" />
          <span>Stop</span>
        </button>

        {/* Expand / Maximize toggle */}
        <button
          onClick={() => setViewState('expanded')}
          className="p-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
          title="Expand menu"
          aria-label="Expand menu"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // State 3: Full Floating Recording Bar
  return (
    <div
      ref={barRef}
      id="floating-rec-control-bar"
      style={stylePosition}
      className="z-[99999] select-none flex items-center gap-3.5 px-5 py-3 rounded-2xl bg-[#070a14]/95 backdrop-blur-2xl border-2 border-indigo-500 shadow-[0_0_50px_rgba(99,102,241,0.5)] animate-fadeIn"
    >
      {/* Drag handle */}
      <div
        onMouseDown={handleMouseDown}
        className="cursor-grab active:cursor-grabbing text-indigo-400 hover:text-white p-1 -ml-1 transition-colors"
        title="Click and drag to reposition floating menu anywhere on screen"
      >
        <GripVertical className="w-4 h-4" />
      </div>

      {/* Recording Status & Timer */}
      <div className="flex items-center gap-2.5 pr-1">
        <span className={`recording-dot ${isPaused ? 'bg-amber-400' : ''}`} />
        <div className="flex flex-col">
          <span className="font-mono text-sm font-black text-white tracking-wide">
            {formatTimer(elapsedSeconds)}
          </span>
          <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-300">
            {isPaused ? 'PAUSED' : 'LIVE RECORDING'}
          </span>
        </div>
      </div>

      <div className="h-6 w-px bg-white/15" />

      {/* Pause / Resume Button */}
      <button
        id="btn-floating-pause"
        onClick={onTogglePause}
        className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
          isPaused
            ? 'bg-amber-500/25 border-amber-500/50 text-amber-300 hover:bg-amber-500/35 shadow-md shadow-amber-500/20'
            : 'bg-white/10 border-white/15 text-slate-100 hover:bg-white/20 hover:text-white'
        }`}
      >
        {isPaused ? <Play className="w-4 h-4 fill-current" /> : <Pause className="w-4 h-4" />}
        <span>{isPaused ? 'Resume' : 'Pause'}</span>
      </button>

      {/* Camera Live Adjustment Pill */}
      {onToggleWebcam && (
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-black/40 border border-white/10">
          <button
            id="btn-floating-camera-toggle"
            onClick={onToggleWebcam}
            aria-pressed={Boolean(webcamConfig?.enabled)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              webcamConfig?.enabled
                ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
            title="Toggle circular face camera on/off during recording"
          >
            {webcamConfig?.enabled ? <Camera className="w-3.5 h-3.5 text-indigo-400" /> : <CameraOff className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">Camera: {webcamConfig?.enabled ? 'ON' : 'OFF'}</span>
          </button>

          {/* Quick Size adjustments when camera is active */}
          {webcamConfig?.enabled && onUpdateWebcamConfig && (
            <div className="flex items-center gap-1 pl-1 border-l border-white/10">
              {(['small', 'medium', 'large'] as const).map((sz) => (
                <button
                  key={sz}
                  onClick={() => onUpdateWebcamConfig((prev) => ({ ...prev, size: sz }))}
                  className={`px-1.5 py-0.5 rounded text-xs font-bold uppercase transition-all cursor-pointer ${
                    webcamConfig.size === sz
                      ? 'bg-indigo-500 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title={`Camera Size: ${sz}`}
                >
                  {sz[0]}
                </button>
              ))}

              {/* Corner quick presets */}
              <div className="flex items-center gap-0.5 pl-1 border-l border-white/10">
                <button
                  onClick={() =>
                    onUpdateWebcamConfig((prev) => ({
                      ...prev,
                      position: { x: 0.82, y: 0.85 },
                      presetPosition: 'bottom_right'
                    }))
                  }
                  className="px-1 text-xs text-slate-400 hover:text-indigo-300 cursor-pointer"
                  title="Move Camera to Bottom-Right"
                >
                  ↘
                </button>
                <button
                  onClick={() =>
                    onUpdateWebcamConfig((prev) => ({
                      ...prev,
                      position: { x: 0.18, y: 0.85 },
                      presetPosition: 'bottom_left'
                    }))
                  }
                  className="px-1 text-xs text-slate-400 hover:text-indigo-300 cursor-pointer"
                  title="Move Camera to Bottom-Left"
                >
                  ↙
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stop & Export Button */}
      <button
        id="btn-floating-stop"
        onClick={onStopAndExport}
        className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-rose-600 via-rose-500 to-rose-600 hover:brightness-110 text-white font-extrabold text-xs shadow-xl shadow-rose-600/40 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
      >
        <Square className="w-4 h-4 fill-white" />
        <span>Stop & Export</span>
      </button>

      {/* Audio badge */}
      <div className="hidden sm:flex items-center gap-1.5 text-slate-300 text-xs px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/10">
        <Mic className="w-3.5 h-3.5 text-indigo-400" />
        <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
      </div>

      <div className="h-6 w-px bg-white/15" />

      {/* Excluded from capture badge */}
      <div
        className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-300 font-semibold"
        title="This menu is not drawn into the reel. If you share your whole screen, this browser window can still appear in the capture, so share a single window or tab instead."
      >
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
        <span>Excluded from Reel</span>
      </div>

      {/* Minimize / Hide buttons */}
      <div className="flex items-center gap-1">
        <button
          id="btn-floating-compact"
          onClick={() => setViewState('compact')}
          className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          title="Minimize to compact bar"
          aria-label="Minimize to compact bar"
        >
          <ChevronDown className="w-4 h-4" />
        </button>

        <button
          id="btn-floating-hide"
          onClick={() => setViewState('hidden_pill')}
          className="p-1.5 text-slate-400 hover:text-rose-300 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          title="Hide to tiny ghost pill"
          aria-label="Hide to tiny ghost pill"
        >
          <EyeOff className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
