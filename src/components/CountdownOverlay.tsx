import React, { useEffect, useState, useRef } from 'react';
import { Video, X } from 'lucide-react';

interface CountdownOverlayProps {
  onComplete: () => void;
  onCancel: () => void;
  startNumber?: number;
  /** Lets the user flip between 16:9 and 9:16 until recording begins */
  isWide?: boolean;
  onSelectFormat?: (format: 'widescreen' | 'vertical') => void;
}

export const CountdownOverlay: React.FC<CountdownOverlayProps> = ({
  onComplete,
  onCancel,
  startNumber = 3,
  isWide,
  onSelectFormat
}) => {
  const [count, setCount] = useState<number | string>(startNumber);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Play subtle countdown beep using Web Audio API
  const playBeep = (freq = 800, duration = 0.1) => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioCtx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);

      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {
      // Audio autoplay restriction fallback
    }
  };

  useEffect(() => {
    playBeep(880, 0.12); // initial beep for 3

    let current = startNumber;
    const interval = window.setInterval(() => {
      current -= 1;
      if (current > 0) {
        setCount(current);
        playBeep(880, 0.12);
      } else if (current === 0) {
        setCount('START!');
        playBeep(1760, 0.25); // Higher pitch for GO!
      } else {
        clearInterval(interval);
        onComplete();
      }
    }, 1000);

    return () => {
      clearInterval(interval);
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close();
      }
    };
  }, [onComplete, startNumber]);

  return (
    <div className="fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-black/85 backdrop-blur-xl select-none animate-fadeIn">
      {/* Background radial glow */}
      <div className="absolute w-[500px] h-[500px] bg-gradient-to-tr from-indigo-600/30 via-purple-600/20 to-pink-600/20 rounded-full blur-3xl pointer-events-none" />

      {/* Cancel button */}
      <button
        onClick={onCancel}
        className="absolute top-6 right-6 flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-slate-300 hover:text-white transition-all cursor-pointer"
      >
        <X className="w-4 h-4" />
        <span>Cancel (Esc)</span>
      </button>

      {/* Main Countdown Display */}
      <div className="relative flex flex-col items-center text-center">
        {/* Animated Circular Ring */}
        <div className="relative w-44 h-44 sm:w-56 sm:h-56 rounded-full flex items-center justify-center border-4 border-indigo-500/30 shadow-[0_0_60px_rgba(99,102,241,0.4)]">
          <div className="absolute inset-0 rounded-full border-4 border-t-indigo-500 border-r-purple-500 border-b-transparent border-l-transparent animate-spin" />

          {/* Number */}
          <span
            key={String(count)}
            className="text-7xl sm:text-8xl font-black bg-gradient-to-b from-white via-slate-100 to-indigo-300 bg-clip-text text-transparent drop-shadow-2xl animate-scaleBounce"
          >
            {count}
          </span>
        </div>

        {onSelectFormat && (
          <div className="mt-8 flex items-center gap-1 p-1 rounded-xl bg-white/10 border border-white/10">
            {([
              { id: 'widescreen' as const, label: '16:9 Widescreen' },
              { id: 'vertical' as const, label: '9:16 Vertical' }
            ]).map((f) => (
              <button
                key={f.id}
                id={`countdown-format-${f.id}`}
                onClick={() => onSelectFormat(f.id)}
                aria-pressed={(f.id === 'widescreen') === isWide}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  (f.id === 'widescreen') === isWide ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:text-white'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}

        {/* Helper tip */}
        <div className="mt-8 text-center">
          <div className="flex items-center justify-center gap-2 text-sm sm:text-base font-bold text-white mb-1">
            <Video className="w-4 h-4 text-rose-500 animate-pulse" />
            <span>Switch to your target window now...</span>
          </div>
          <p className="text-xs text-slate-400">
            ClipDesk will begin 60 FPS recording with cursor tracking in a moment.
          </p>
        </div>
      </div>
    </div>
  );
};
