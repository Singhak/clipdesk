import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Scissors, RotateCcw, Play, Pause, Clock, Sparkles } from 'lucide-react';

interface VideoTrimmerProps {
  videoUrl: string | null;
  totalDuration: number;
  onTrimChange: (trim: { startSec: number; endSec: number }) => void;
  onApplyTrim?: (trimmedBlobPromise: () => Promise<Blob>) => void;
  originalBlob?: Blob;
}

export const VideoTrimmer: React.FC<VideoTrimmerProps> = ({
  videoUrl,
  totalDuration,
  onTrimChange,
  originalBlob
}) => {
  const [startSec, setStartSec] = useState(0);
  const [endSec, setEndSec] = useState(Math.max(1, totalDuration));
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isProcessingTrim, setIsProcessingTrim] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const isDraggingStart = useRef(false);
  const isDraggingEnd = useRef(false);

  // Sync endSec when totalDuration loads
  useEffect(() => {
    if (totalDuration > 0) {
      setEndSec((prev) => (prev === 0 || prev > totalDuration ? totalDuration : prev));
    }
  }, [totalDuration]);

  // Keep parent in sync
  useEffect(() => {
    onTrimChange({ startSec, endSec });
  }, [startSec, endSec, onTrimChange]);

  const duration = Math.max(0.1, totalDuration || 1);
  const trimmedDuration = Math.max(0, endSec - startSec);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 10);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms}`;
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const cur = videoRef.current.currentTime;
      setCurrentTime(cur);
      // Loop within the trimmed region
      if (cur >= endSec) {
        videoRef.current.currentTime = startSec;
      }
    }
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      if (videoRef.current.currentTime >= endSec || videoRef.current.currentTime < startSec) {
        videoRef.current.currentTime = startSec;
      }
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const seekTo = (sec: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, Math.min(duration, sec));
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleQuickTrimStart = (seconds: number) => {
    const nextStart = Math.min(endSec - 0.5, Math.max(0, startSec + seconds));
    setStartSec(nextStart);
    seekTo(nextStart);
  };

  const handleQuickTrimEnd = (seconds: number) => {
    const nextEnd = Math.max(startSec + 0.5, Math.min(duration, endSec - seconds));
    setEndSec(nextEnd);
    seekTo(nextEnd);
  };

  const handleResetTrim = () => {
    setStartSec(0);
    setEndSec(duration);
    seekTo(0);
  };

  // Drag interaction handlers
  const handlePointerDown = (type: 'start' | 'end') => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    if (type === 'start') isDraggingStart.current = true;
    else isDraggingEnd.current = true;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!trackRef.current || (!isDraggingStart.current && !isDraggingEnd.current)) return;
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetSec = ratio * duration;

    if (isDraggingStart.current) {
      const clamped = Math.min(endSec - 0.5, Math.max(0, targetSec));
      setStartSec(clamped);
      seekTo(clamped);
    } else if (isDraggingEnd.current) {
      const clamped = Math.max(startSec + 0.5, Math.min(duration, targetSec));
      setEndSec(clamped);
      seekTo(clamped);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    isDraggingStart.current = false;
    isDraggingEnd.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
  };

  const startPercent = (startSec / duration) * 100;
  const endPercent = (endSec / duration) * 100;
  const currentPercent = (currentTime / duration) * 100;

  return (
    <div className="glass-card p-4 space-y-3.5 border border-indigo-500/20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Scissors className="w-4 h-4 text-indigo-400" />
          <span className="text-xs font-bold text-white">Precision Trim Handles</span>
          <span className="text-[10px] text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20">
            Cut Awkward Start/End Delay
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400">Trimmed Reel:</span>
          <span className="font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
            {formatTime(trimmedDuration)}
          </span>
          <span className="text-slate-500 text-[10px]">({formatTime(duration)} orig)</span>
        </div>
      </div>

      {/* Hidden/Referenced Video element for synced playback */}
      {videoUrl && (
        <video
          ref={videoRef}
          src={videoUrl}
          onTimeUpdate={handleTimeUpdate}
          onEnded={() => setIsPlaying(false)}
          className="hidden"
        />
      )}

      {/* Interactive Timeline Track */}
      <div
        ref={trackRef}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="relative h-12 bg-black/50 rounded-xl overflow-hidden select-none border border-white/10 p-1 flex items-center cursor-pointer"
      >
        {/* Dimmed unselected regions */}
        <div
          className="absolute left-0 top-0 bottom-0 bg-black/70 z-10 border-r border-amber-500/40"
          style={{ width: `${startPercent}%` }}
        />
        <div
          className="absolute right-0 top-0 bottom-0 bg-black/70 z-10 border-l border-amber-500/40"
          style={{ width: `${100 - endPercent}%` }}
        />

        {/* Selected Active Footage Bar */}
        <div
          className="absolute top-1 bottom-1 bg-gradient-to-r from-indigo-600/30 via-indigo-500/40 to-indigo-600/30 border-y border-indigo-400/50 rounded-md z-0"
          style={{ left: `${startPercent}%`, width: `${endPercent - startPercent}%` }}
        />

        {/* Scrubber Playhead */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-rose-400 z-30 shadow-md pointer-events-none transition-all duration-75"
          style={{ left: `${Math.max(0, Math.min(100, currentPercent))}%` }}
        >
          <div className="w-2 h-2 rounded-full bg-rose-500 -ml-[3px] -mt-0.5 shadow-sm" />
        </div>

        {/* Left Drag Handle */}
        <div
          onPointerDown={handlePointerDown('start')}
          className="absolute top-0 bottom-0 w-4 bg-amber-400 hover:bg-amber-300 rounded-l-md cursor-ew-resize z-20 flex items-center justify-center shadow-lg transition-transform hover:scale-105"
          style={{ left: `calc(${startPercent}% - 8px)` }}
          title={`Trim Start: ${formatTime(startSec)}`}
        >
          <div className="w-0.5 h-4 bg-black/80 rounded-full" />
        </div>

        {/* Right Drag Handle */}
        <div
          onPointerDown={handlePointerDown('end')}
          className="absolute top-0 bottom-0 w-4 bg-amber-400 hover:bg-amber-300 rounded-r-md cursor-ew-resize z-20 flex items-center justify-center shadow-lg transition-transform hover:scale-105"
          style={{ left: `calc(${endPercent}% - 8px)` }}
          title={`Trim End: ${formatTime(endSec)}`}
        >
          <div className="w-0.5 h-4 bg-black/80 rounded-full" />
        </div>
      </div>

      {/* Scrub Times and Quick Presets */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={togglePlay}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white font-medium cursor-pointer"
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5 text-amber-400" /> : <Play className="w-3.5 h-3.5 text-emerald-400" />}
            <span>{isPlaying ? 'Pause' : 'Preview'}</span>
          </button>
          <span className="font-mono text-[11px] text-slate-400 ml-1">
            [{formatTime(startSec)} ➔ {formatTime(endSec)}]
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => handleQuickTrimStart(2)}
            className="px-2 py-1 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/20 text-[11px] font-semibold cursor-pointer"
            title="Remove awkward first 2 seconds"
          >
            ✂️ Cut First 2s
          </button>
          <button
            type="button"
            onClick={() => handleQuickTrimEnd(3)}
            className="px-2 py-1 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/20 text-[11px] font-semibold cursor-pointer"
            title="Remove awkward last 3 seconds when stopping"
          >
            ✂️ Cut Last 3s
          </button>
          {(startSec > 0 || endSec < duration) && (
            <button
              type="button"
              onClick={handleResetTrim}
              className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
              title="Reset to full clip"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
