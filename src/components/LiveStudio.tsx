import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Pause,
  Play,
  Square,
  Sparkles,
  Maximize2,
  MousePointer,
  Info,
  Shield,
  Eye,
  EyeOff,
  Camera,
  CameraOff
} from 'lucide-react';
import { VerticalCanvas } from './VerticalCanvas';
import { FloatingRecordingBar } from './FloatingRecordingBar';
import { CountdownOverlay } from './CountdownOverlay';
import { FramingOverlay } from './FramingOverlay';
import { FocusPicker } from './FocusPicker';
import { DEFAULT_FOCUS, FocusRegion } from '../core/focusRegion';
import { BubbleStyleControls } from './BubbleStyleControls';
import { AudioMeter } from './AudioMeter';
import { TemplateConfig, LayoutMode, SmartFeatures, LicenseInfo, ExportSettings, WebcamConfig } from '../core/types';
import { ExportEngine } from '../core/exportEngine';

interface LiveStudioProps {
  stream: MediaStream | null;
  audioStream: MediaStream | null;
  webcamStream?: MediaStream | null;
  webcamConfig: WebcamConfig;
  onUpdateWebcamConfig: (updater: (prev: WebcamConfig) => WebcamConfig) => void;
  onToggleWebcam: () => void;
  cameraOnly?: boolean;
  isSimulated: boolean;
  template: TemplateConfig;
  smartFeatures: SmartFeatures;
  layoutMode: LayoutMode;
  license: LicenseInfo;
  onLayoutChange: (mode: LayoutMode) => void;
  onFinishRecording: (recordedBlob: Blob, durationSec: number) => void;
  onCancel: () => void;
}

/** A <video> bound to a MediaStream (works in other windows too, e.g. the pop-out). */
const StreamVideo: React.FC<{ stream: MediaStream | null; className?: string; style?: React.CSSProperties; mirror?: boolean }> = ({
  stream,
  className,
  style,
  mirror
}) => {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.srcObject = stream;
      if (stream) ref.current.play().catch(() => {});
    }
  }, [stream]);
  return (
    <video
      ref={ref}
      autoPlay
      muted
      playsInline
      className={className}
      style={{ ...style, transform: mirror ? 'scaleX(-1)' : undefined }}
    />
  );
};

// Not display:none, so browsers keep decoding frames for the canvas
const HIDDEN_VIDEO_STYLE: React.CSSProperties = {
  position: 'fixed',
  width: 2,
  height: 2,
  opacity: 0,
  pointerEvents: 'none',
  left: 0,
  top: 0
};

export const LiveStudio: React.FC<LiveStudioProps> = ({
  stream,
  audioStream,
  webcamStream,
  webcamConfig,
  onUpdateWebcamConfig,
  onToggleWebcam,
  cameraOnly = false,
  isSimulated,
  template,
  smartFeatures,
  layoutMode,
  license,
  onLayoutChange,
  onFinishRecording,
  onCancel
}) => {
  // Callback refs stored in state so the canvas always receives the mounted elements
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const [webcamVideoEl, setWebcamVideoEl] = useState<HTMLVideoElement | null>(null);
  const isWide = layoutMode === 'widescreen';
  const [penActive, setPenActive] = useState(false);
  const [clearSignal, setClearSignal] = useState(0);
  const [popoutWin, setPopoutWin] = useState<Window | null>(null);
  const [popoutNote, setPopoutNote] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const recorderRef = useRef<ReturnType<typeof ExportEngine.startRecordingCanvas> | null>(null);
  const isStoppingRef = useRef(false);
  const elapsedRef = useRef(0);
  const [recordError, setRecordError] = useState<string | null>(null);

  // Countdown state: 3-2-1 countdown before recording starts
  // Vertical reels with a focus crop start on a "frame your shot" screen, everything else counts down straight away
  const [isFraming, setIsFraming] = useState(() => !isWide && !cameraOnly && layoutMode === 'dynamic_crop');
  const [isCountingDown, setIsCountingDown] = useState(() => isWide || cameraOnly || layoutMode !== 'dynamic_crop');
  const [focus, setFocus] = useState<FocusRegion>(DEFAULT_FOCUS);
  const usesFocus = !isWide && !cameraOnly && layoutMode === 'dynamic_crop';
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [simulatedMouse, setSimulatedMouse] = useState<{ x: number; y: number; click?: boolean } | null>(null);
  const [isMirrorShieldActive, setIsMirrorShieldActive] = useState(true);

  const timerRef = useRef<number | null>(null);

  // Hook stream into video element
  useEffect(() => {
    if (videoEl && stream) {
      videoEl.srcObject = stream;
      videoEl.play().catch((e) => console.warn('Video play error:', e));
    }
  }, [stream, videoEl]);

  // Hook webcam stream into webcam video element
  useEffect(() => {
    if (webcamVideoEl && webcamStream) {
      webcamVideoEl.srcObject = webcamStream;
      webcamVideoEl.play().catch((e) => console.warn('Webcam video play error:', e));
    }
  }, [webcamStream, webcamVideoEl]);

  // Pop-out controls: an always-on-top mini window (Document Picture-in-Picture, Chrome/Edge 116+).
  // The in-page bar lives in this tab, which is hidden while the user records another window.
  const openPopout = async () => {
    const dpip = (window as unknown as {
      documentPictureInPicture?: { requestWindow: (o: { width: number; height: number }) => Promise<Window> };
    }).documentPictureInPicture;
    if (!dpip) {
      setPopoutNote("Pop-out controls need Chrome or Edge 116+. Use the browser's own Stop sharing button to finish; the recording is then exported automatically.");
      return;
    }
    try {
      const win = await dpip.requestWindow({ width: 360, height: 170 });
      Array.from(document.styleSheets).forEach((sheet) => {
        try {
          const css = Array.from(sheet.cssRules).map((r) => r.cssText).join('\n');
          const style = win.document.createElement('style');
          style.textContent = css;
          win.document.head.appendChild(style);
        } catch {
          if (sheet.href) {
            const link = win.document.createElement('link');
            link.rel = 'stylesheet';
            link.href = sheet.href;
            win.document.head.appendChild(link);
          }
        }
      });
      win.document.body.style.margin = '0';
      win.document.body.style.background = '#070a14';
      win.addEventListener('pagehide', () => setPopoutWin(null));
      setPopoutWin(win);
      setPopoutNote(null);
    } catch (e) {
      console.warn('Pop-out window failed:', e);
      setPopoutNote('Could not open the pop-out window. Try the button again.');
    }
  };

  useEffect(() => () => popoutWin?.close(), [popoutWin]);

  // Show recording state in the tab title so it is visible in the tab strip too
  useEffect(() => {
    const original = document.title;
    if (isRecording) document.title = `${isPaused ? '⏸' : '●'} ${formatTimer(elapsedSeconds)} – ClipDesk`;
    return () => {
      document.title = original;
    };
  }, [isRecording, isPaused, elapsedSeconds]);

  // Handle canvas ready: save reference
  const handleCanvasReady = (canvas: HTMLCanvasElement) => {
    canvasRef.current = canvas;
  };

  // Called when 3-2-1 countdown completes!
  const handleCountdownComplete = () => {
    setIsCountingDown(false);
    setIsRecording(true);

    // Initialize recording engine on the canvas
    if (canvasRef.current) {
      try {
        const exportSettings: ExportSettings = {
          format: 'mp4',
          resolution: isWide ? '1920x1080' : '1080x1920',
          fps: isWide ? 30 : 60,
          layout: layoutMode,
          includeWatermark: license.tier === 'free',
          templateId: template.id
        };

        const recorder = ExportEngine.startRecordingCanvas(canvasRef.current, audioStream, exportSettings);
        recorderRef.current = recorder;
      } catch (e) {
        console.warn('MediaRecorder error:', e);
        setRecordError('Recording could not start in this browser, so nothing is being saved. Go back and try again, or use a current Chrome, Edge or Safari.');
      }
    } else {
      setRecordError('The preview canvas is not ready, so nothing is being saved. Go back and try again.');
    }
  };

  // Recording timer: wall-clock based, because background tabs throttle setInterval
  const accumulatedMsRef = useRef(0);
  const lastTickRef = useRef<number | null>(null);
  const syncElapsed = () => {
    const now = Date.now();
    if (lastTickRef.current !== null) accumulatedMsRef.current += now - lastTickRef.current;
    lastTickRef.current = now;
    const secs = Math.floor(accumulatedMsRef.current / 1000);
    elapsedRef.current = secs;
    setElapsedSeconds(secs);
  };

  useEffect(() => {
    if (isRecording && !isPaused && !isCountingDown) {
      lastTickRef.current = Date.now();
      timerRef.current = window.setInterval(syncElapsed, 250);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (lastTickRef.current !== null) syncElapsed(); // bank the time up to pause/stop
      lastTickRef.current = null;
    };
  }, [isRecording, isPaused, isCountingDown]);

  const togglePause = () => {
    if (isCountingDown) return;
    const next = !isPaused;
    // Pause the actual recorder too, otherwise the file keeps growing while the timer is stopped
    if (next) recorderRef.current?.pause();
    else recorderRef.current?.resume();
    setIsPaused(next);
  };

  const stopAndExport = async () => {
    if (isStoppingRef.current) return;
    isStoppingRef.current = true;
    if (lastTickRef.current !== null) syncElapsed(); // final duration before state updates
    setIsRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);

    const blob = recorderRef.current ? await recorderRef.current.stop() : null;
    if (!blob || blob.size === 0) {
      isStoppingRef.current = false;
      setRecordError('The recording is empty, so there is nothing to export. Go back and record again.');
      return;
    }
    onFinishRecording(blob, elapsedRef.current);
  };

  // Keyboard shortcuts (work while this tab or the pop-out window has focus)
  const togglePauseRef = useRef(togglePause);
  togglePauseRef.current = togglePause;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || !e.shiftKey) return;
      const k = e.key.toLowerCase();
      if (k === 'p') togglePauseRef.current();
      else if (k === 's') void stopAndExportRef.current();
      else if (k === 'd') setPenActive((p) => !p);
      else return;
      e.preventDefault();
    };
    const targets: Window[] = [window];
    if (popoutWin) targets.push(popoutWin);
    targets.forEach((w) => w.addEventListener('keydown', onKey));
    return () => targets.forEach((w) => w.removeEventListener('keydown', onKey));
  }, [popoutWin]);

  // If the user clicks the browser's "Stop sharing" button, finish and export what we have
  const stopAndExportRef = useRef(stopAndExport);
  stopAndExportRef.current = stopAndExport;
  useEffect(() => {
    const tracks = stream?.getVideoTracks() ?? [];
    const onEnded = () => {
      if (recorderRef.current) void stopAndExportRef.current();
    };
    tracks.forEach((t) => t.addEventListener('ended', onEnded));
    return () => tracks.forEach((t) => t.removeEventListener('ended', onEnded));
  }, [stream]);

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Pass mouse events from desktop feed to the virtual camera
  const handleDesktopMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    setSimulatedMouse({
      x: nx * 1920,
      y: ny * 1080
    });
  };

  const handleDesktopClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    setSimulatedMouse({
      x: nx * 1920,
      y: ny * 1080,
      click: true
    });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 animate-fadeIn relative min-h-[85vh]">
      {isFraming && (
        <FramingOverlay
          stream={stream}
          focus={focus}
          onFocusChange={setFocus}
          usesFocus={usesFocus}
          isWide={isWide}
          onSelectFormat={(f) => onLayoutChange(f === 'widescreen' ? 'widescreen' : 'dynamic_crop')}
          onSelectFocusCrop={(on) => onLayoutChange(on ? 'dynamic_crop' : 'blur_backdrop')}
          onStart={() => {
            setIsFraming(false);
            setIsCountingDown(true);
          }}
          onCancel={onCancel}
        />
      )}

      {/* 3-2-1 Countdown Overlay */}
      {isCountingDown && (
        <CountdownOverlay
          onComplete={handleCountdownComplete}
          onCancel={onCancel}
          startNumber={3}
          isWide={isWide}
          onSelectFormat={(f) => {
            if (f === 'widescreen') {
              onLayoutChange('widescreen');
            } else {
              // Back to framing so the reel isn't cropped blindly
              onLayoutChange('dynamic_crop');
              setIsCountingDown(false);
              setIsFraming(true);
            }
          }}
        />
      )}

      {recordError && (
        <div
          role="alert"
          className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-sm text-rose-200 flex items-center justify-between gap-3"
        >
          <span>{recordError}</span>
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-xs font-bold cursor-pointer shrink-0"
          >
            Back to setup
          </button>
        </div>
      )}

      {/* Top Banner Status */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 p-4 glass-panel border-white/10">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className={`recording-dot ${isPaused ? 'bg-amber-400' : ''}`} />
            <span className="font-mono text-sm font-bold text-white tracking-wider">
              {isCountingDown ? 'PREPARING...' : isPaused ? 'PAUSED' : 'LIVE RECORDING'}
            </span>
          </div>

          <div className="font-mono text-xl font-black text-rose-400 bg-rose-500/10 px-3 py-1 rounded-lg border border-rose-500/20">
            {formatTimer(elapsedSeconds)}
          </div>

          {/* Live Microphone Meter */}
          {audioStream && (
            <div className="hidden sm:flex items-center">
              <AudioMeter stream={audioStream} compact={true} />
            </div>
          )}

          {isSimulated && (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-300">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Simulated Screen Test Feed (No permissions required)</span>
            </div>
          )}
        </div>

        {/* Quick layout mode switcher */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 hidden lg:inline">Layout:</span>
          {(isWide ? [] : (['blur_backdrop', 'dynamic_crop', 'gradient_mesh', 'brand_canvas'] as LayoutMode[])).map((mode) => (
            <button
              key={mode}
              onClick={() => onLayoutChange(mode)}
              className={`px-2.5 py-1 text-xs rounded-lg border capitalize transition-all cursor-pointer ${
                layoutMode === mode
                  ? 'bg-indigo-600 border-indigo-500 text-white font-semibold'
                  : 'bg-white/5 border-white/5 text-slate-400 hover:text-white'
              }`}
            >
              {mode.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Focus Framing Presets (Dynamic Crop Mode) */}
      {usesFocus && (
        <div className="mb-4 p-2.5 rounded-xl bg-black/40 border border-white/5 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1.5 text-slate-300 font-semibold">
            <Maximize2 className="w-3.5 h-3.5 text-indigo-400" />
            <span>Camera Focus Presets (Web Studio):</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[
              { id: 'editor', label: '💻 Code Editor (Top-Left)', presetFocus: { cx: 0.28, cy: 0.35, zoom: 1.35 } },
              { id: 'center', label: '🎯 Center Stage', presetFocus: { cx: 0.5, cy: 0.5, zoom: 1.0 } },
              { id: 'terminal', label: '⚡ Terminal (Bottom)', presetFocus: { cx: 0.5, cy: 0.78, zoom: 1.4 } },
              { id: 'browser', label: '🌐 Browser (Right)', presetFocus: { cx: 0.72, cy: 0.5, zoom: 1.35 } }
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setFocus(p.presetFocus)}
                className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/5 transition-all text-[11px] cursor-pointer"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Split View: Desktop Recording (Left) vs Live Vertical 9:16 Preview (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Desktop Recording (7 Cols) */}
        <div className={isWide ? 'hidden' : 'lg:col-span-7 space-y-4'}>
          <div className="studio-card p-5">
            <div className="flex items-center justify-between mb-3.5">
              <div className="flex items-center gap-2">
                <Maximize2 className="w-4 h-4 text-indigo-400" />
                <h2 className="text-sm font-bold text-white">Full Screen Desktop Feed</h2>
              </div>
              <span className="text-[10px] text-slate-400 bg-white/5 px-2 py-0.5 rounded border border-white/5 hidden sm:inline">
                Hover or click preview to steer camera. For OS-wide mouse tracking across native apps, use Desktop App.
              </span>
              <div className="flex items-center gap-2">
                {/* Mirror Shield Toggle Button */}
                <button
                  id="btn-toggle-mirror-shield"
                  onClick={() => setIsMirrorShieldActive((prev) => !prev)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                    isMirrorShieldActive
                      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                      : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                  }`}
                  title="Toggle Infinity Mirror Shield (mutes local preview to avoid recursive tunnel loop)"
                >
                  <Shield className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Mirror Shield: {isMirrorShieldActive ? 'ON' : 'OFF'}</span>
                </button>

                <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                  <span className="bg-black/50 px-2.5 py-1 rounded-md border border-white/5">1920 × 1080</span>
                  <span className="text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">60 FPS</span>
                </div>
              </div>
            </div>

            {/* Video container with cursor interaction layer */}
            <div
              id="desktop-feed-interactive-area"
              onMouseMove={handleDesktopMouseMove}
              onClick={handleDesktopClick}
              className="relative aspect-video w-full rounded-2xl overflow-hidden bg-black/80 border border-white/10 group cursor-crosshair shadow-2xl flex items-center justify-center"
            >
              {!isMirrorShieldActive && (
                <StreamVideo stream={stream} className="w-full h-full object-contain pointer-events-none" />
              )}

              {/* Mirror Shield Active Dashboard */}
              {isMirrorShieldActive && (
                <div className="w-full h-full p-6 flex flex-col items-center justify-center text-center bg-gradient-to-b from-[#0a0d16] via-[#0d101c] to-[#080a12] select-none">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400 mb-3 shadow-lg shadow-emerald-500/15">
                    <Shield className="w-7 h-7" />
                  </div>
                  <h3 className="text-sm font-bold text-white mb-1">
                    Infinity Mirror Shield Active
                  </h3>
                  <p className="text-xs text-slate-400 max-w-md leading-relaxed mb-4">
                    Desktop preview is locally muted to eliminate recursive window tunneling. The 9:16 vertical canvas on the right is actively recording your screen at 60 FPS!
                  </p>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setIsMirrorShieldActive(false)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-300 transition-all cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Show Raw Feed</span>
                    </button>
                    <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-lg border border-emerald-500/20">
                      ⚡ 1080x1920 Compositor Streaming
                    </span>
                  </div>
                </div>
              )}

              {/* Interaction Hint Overlay */}
              <div className="absolute top-3 right-3 bg-black/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/15 text-[10px] text-slate-200 flex items-center gap-1.5 opacity-85 group-hover:opacity-100 transition-opacity shadow-lg">
                <MousePointer className="w-3.5 h-3.5 text-indigo-400" />
                <span>Move mouse & click here to test camera tracking & zoom</span>
              </div>
            </div>

            {/* Tips banner */}
            <div className="mt-4 flex items-start gap-2.5 p-3 rounded-xl bg-white/[0.03] border border-white/5 text-xs text-slate-300">
              <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
              <span>
                Move your cursor around the monitor feed. The 9:16 virtual camera dynamically follows with silky smooth damping, keeping your action centered!
              </span>
            </div>
          </div>

          {usesFocus && (
            <div className="studio-card p-5">
              <h2 className="text-sm font-bold text-white mb-1">Focus area</h2>
              <p className="text-xs text-slate-400 mb-3">Drag the frame to change what the reel shows, even while recording.</p>
              <FocusPicker stream={stream} focus={focus} onChange={setFocus} />
            </div>
          )}

          {/* Active Preset Telemetry */}
          <div className="studio-card p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-black/40 p-3 rounded-xl border border-white/5">
              <div className="text-slate-400 text-[10px]">Active Template</div>
              <div className="font-bold text-white mt-1">{template.name}</div>
            </div>
            <div className="bg-black/40 p-3 rounded-xl border border-white/5">
              <div className="text-slate-400 text-[10px]">Camera Damping</div>
              <div className="font-bold text-indigo-400 mt-1 font-mono">{template.smoothingFactor} (Lerp)</div>
            </div>
            <div className="bg-black/40 p-3 rounded-xl border border-white/5">
              <div className="text-slate-400 text-[10px]">Click Zoom Trigger</div>
              <div className="font-bold text-amber-400 mt-1 font-mono">{template.clickZoomMultiplier}x</div>
            </div>
            <div className="bg-black/40 p-3 rounded-xl border border-white/5">
              <div className="text-slate-400 text-[10px]">License Plan</div>
              <div className={`font-bold mt-1 ${license.tier === 'pro' ? 'text-amber-400' : 'text-slate-300'}`}>
                {license.tier === 'pro' ? 'Pro (No Watermark)' : 'Free Creator'}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Live Vertical 9:16 Preview (5 Cols) */}
        <div className={isWide ? 'lg:col-span-12 flex flex-col items-center' : 'lg:col-span-5 flex flex-col items-center'}>
          <div className="text-center mb-3">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-300 bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20 mb-1">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Your Differentiator</span>
            </div>
            <h2 className="text-base font-extrabold text-white">Live Vertical Preview</h2>
            <p className="text-xs text-slate-400">Instantly see what the final reel looks like before exporting</p>
          </div>

          {/* Hidden video element for webcam video decoding */}
          <video ref={setVideoEl} autoPlay muted playsInline style={HIDDEN_VIDEO_STYLE} />
          <video ref={setWebcamVideoEl} autoPlay muted playsInline style={HIDDEN_VIDEO_STYLE} />

          <VerticalCanvas
            videoElement={videoEl}
            screenStream={stream}
            webcamStream={webcamStream}
            template={template}
            layoutMode={layoutMode}
            smartFeatures={smartFeatures}
            hasWatermark={license.tier === 'free'}
            externalCursor={simulatedMouse}
            onCanvasReady={handleCanvasReady}
            webcamVideoElement={webcamVideoEl}
            penActive={penActive}
            clearStrokesSignal={clearSignal}
            webcamConfig={webcamConfig}
            cameraOnly={cameraOnly}
            focus={usesFocus ? focus : null}
            onUpdateWebcamConfig={onUpdateWebcamConfig}
          />

          {/* Pen / annotation tools */}
          <div className="w-full max-w-sm mt-3 flex items-center justify-between gap-2 p-3 rounded-2xl bg-black/60 border border-white/10">
            <button
              id="btn-toggle-pen"
              onClick={() => setPenActive((p) => !p)}
              aria-pressed={penActive}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer ${
                penActive ? 'bg-rose-600 border-rose-400 text-white' : 'bg-white/5 border-white/10 text-slate-300 hover:text-white'
              }`}
              title="Draw on the preview. Strokes fade after 4 seconds and are part of the recording. Alt+Shift+D"
            >
              ✏️ Pen {penActive ? 'ON' : 'OFF'}
            </button>
            <button
              onClick={() => setClearSignal((n) => n + 1)}
              className="px-3 py-1.5 rounded-lg text-xs border bg-white/5 border-white/10 text-slate-300 hover:text-white cursor-pointer"
            >
              Clear drawing
            </button>
            <span className="text-[10px] text-slate-500 hidden sm:block">Alt+Shift: P pause · S stop · D pen</span>
          </div>

          {!cameraOnly && (
            <>
          {/* Interactive Circle Camera Adjustment Bar */}
          <div className="w-full max-w-sm mt-3 p-3.5 rounded-2xl bg-black/60 backdrop-blur-xl border border-white/10 shadow-xl space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-indigo-400" />
                <span className="text-xs font-bold text-white">Camera bubble (PiP)</span>
              </div>
              <button
                id="btn-studio-toggle-webcam"
                onClick={onToggleWebcam}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                  webcamConfig.enabled
                    ? 'bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-600/30'
                    : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                }`}
                title="Toggle the camera bubble"
              >
                {webcamConfig.enabled ? <Camera className="w-3.5 h-3.5" /> : <CameraOff className="w-3.5 h-3.5" />}
                <span>{webcamConfig.enabled ? 'ON' : 'OFF'}</span>
              </button>
            </div>

            {webcamConfig.enabled && (
              <div className="space-y-2 pt-2 border-t border-white/10 animate-fadeIn text-xs">
                {/* Size Selector */}
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-[11px]">Bubble Size:</span>
                  <div className="flex items-center gap-1 bg-black/40 p-1 rounded-lg border border-white/5">
                    {(['small', 'medium', 'large'] as const).map((sz) => (
                      <button
                        key={sz}
                        id={`btn-cam-size-${sz}`}
                        onClick={() => onUpdateWebcamConfig((prev) => ({ ...prev, size: sz }))}
                        className={`px-2.5 py-0.5 rounded text-[11px] font-bold capitalize transition-all cursor-pointer ${
                          webcamConfig.size === sz
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {sz}
                      </button>
                    ))}
                  </div>
                </div>

                <BubbleStyleControls config={webcamConfig} onUpdate={onUpdateWebcamConfig} idPrefix="studio-cam" />

                {/* Corner Position Presets */}
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-[11px]">Corner Position:</span>
                  <div className="flex items-center gap-1">
                    {[
                      { id: 'bottom_right' as const, label: '↘ B-Right', pos: { x: 0.82, y: 0.85 } },
                      { id: 'bottom_left' as const, label: '↙ B-Left', pos: { x: 0.18, y: 0.85 } },
                      { id: 'top_right' as const, label: '↗ T-Right', pos: { x: 0.82, y: 0.15 } },
                      { id: 'top_left' as const, label: '↖ T-Left', pos: { x: 0.18, y: 0.15 } }
                    ].map((preset) => (
                      <button
                        key={preset.id}
                        id={`btn-cam-preset-${preset.id}`}
                        onClick={() =>
                          onUpdateWebcamConfig((prev) => ({
                            ...prev,
                            position: preset.pos,
                            presetPosition: preset.id
                          }))
                        }
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-all cursor-pointer ${
                          webcamConfig.presetPosition === preset.id
                            ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300'
                            : 'bg-white/5 border-white/5 text-slate-400 hover:text-white'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Mirror selfie & drag hint */}
                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      id="toggle-cam-mirror"
                      checked={webcamConfig.mirror !== false}
                      onChange={(e) =>
                        onUpdateWebcamConfig((prev) => ({ ...prev, mirror: e.target.checked }))
                      }
                      className="w-3.5 h-3.5 accent-indigo-500 rounded cursor-pointer"
                    />
                    <span>Mirror Selfie</span>
                  </label>
                  <span className="text-indigo-300 font-semibold">✨ Drag the bubble on the preview anytime</span>
                </div>
              </div>
            )}
          </div>
            </>
          )}

          {/* Stationary In-Studio Controls */}
          <div className="mt-4 flex items-center justify-center gap-3 w-full max-w-xs">
            <button
              id="btn-studio-pause-static"
              onClick={togglePause}
              disabled={isCountingDown}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl btn-secondary text-xs font-bold cursor-pointer disabled:opacity-50"
            >
              {isPaused ? <Play className="w-4 h-4 fill-white" /> : <Pause className="w-4 h-4" />}
              <span>{isPaused ? 'Resume' : 'Pause'}</span>
            </button>

            <button
              id="btn-studio-stop-static"
              onClick={stopAndExport}
              disabled={isCountingDown}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-white font-bold text-xs shadow-lg shadow-rose-600/30 transition-all cursor-pointer disabled:opacity-50"
            >
              <Square className="w-4 h-4 fill-white" />
              <span>Stop & Export</span>
            </button>
          </div>

          <p className="text-[11px] text-slate-400 mt-2 text-center">
            💡 <strong>Floating Toolbar Active:</strong> Hovers at bottom of screen. Drag anywhere or click <EyeOff className="w-3 h-3 inline mx-0.5 text-slate-300" /> to hide.
          </p>
        </div>
      </div>

      {/* Prominent prompt: controls must be reachable while another window is being recorded */}
      {!popoutWin && (
        <div className="fixed top-16 right-4 z-[9999] max-w-sm p-3 rounded-xl bg-[#0d1226] border border-indigo-500/50 shadow-2xl text-sm text-indigo-100 flex flex-col gap-3">
          <span className="flex-1">
            Recording another window? This tab will be hidden, so open the pop-out controls to pause or stop from anywhere.
            {popoutNote && <span className="block text-amber-300 mt-1">{popoutNote}</span>}
          </span>
          <button
            id="btn-popout-controls"
            onClick={openPopout}
            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer shrink-0"
          >
            Pop out controls
          </button>
        </div>
      )}
      {popoutWin &&
        createPortal(
          <div className="p-3 text-white flex flex-col gap-2 select-none">
            <div className="flex items-center gap-2">
              {webcamConfig.enabled && webcamStream && (
                <StreamVideo
                  stream={webcamStream}
                  mirror={webcamConfig.mirror !== false}
                  className="w-12 h-12 rounded-full object-cover border-2 border-indigo-500"
                />
              )}
              <span className={`recording-dot ${isPaused ? 'bg-amber-400' : ''}`} />
              <span className="font-mono text-lg font-black">{formatTimer(elapsedSeconds)}</span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-300">
                {isCountingDown ? 'Starting…' : isPaused ? 'Paused' : 'Recording'}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={togglePause}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold cursor-pointer"
              >
                {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                <span>{isPaused ? 'Resume' : 'Pause'}</span>
              </button>
              <button
                onClick={onToggleWebcam}
                className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold cursor-pointer"
                title="Toggle camera"
              >
                {webcamConfig.enabled ? <Camera className="w-4 h-4" /> : <CameraOff className="w-4 h-4" />}
              </button>
              <button
                onClick={() => {
                  popoutWin.close();
                  void stopAndExport();
                }}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-extrabold cursor-pointer"
              >
                <Square className="w-4 h-4 fill-white" />
                <span>Stop</span>
              </button>
            </div>
          </div>,
          popoutWin.document.body
        )}

      {/* Floating Stop & Pause Menu (Draggable, Collapsible, and Excluded from 9:16 Video Capture) */}
      {!isCountingDown && !isFraming && (
        <FloatingRecordingBar
          isPaused={isPaused}
          elapsedSeconds={elapsedSeconds}
          onTogglePause={togglePause}
          onStopAndExport={stopAndExport}
          onDiscard={onCancel}
          isSimulated={isSimulated}
          webcamConfig={webcamConfig}
          onToggleWebcam={onToggleWebcam}
          onUpdateWebcamConfig={onUpdateWebcamConfig}
        />
      )}
    </div>
  );
};
