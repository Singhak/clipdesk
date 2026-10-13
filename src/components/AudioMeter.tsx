import React, { useEffect, useState, useRef } from 'react';
import { Mic, MicOff, AlertCircle } from 'lucide-react';

interface AudioMeterProps {
  /** If a stream is passed, will attach a temporary Web Audio analyser to measure level in real time */
  stream?: MediaStream | null;
  /** Or directly pass current dB level and gate status from VoiceProcessor callback */
  levelDb?: number;
  gateOpen?: boolean;
  compact?: boolean;
  showLabels?: boolean;
  className?: string;
}

export const AudioMeter: React.FC<AudioMeterProps> = ({
  stream,
  levelDb: externalDb,
  gateOpen: externalGateOpen = true,
  compact = false,
  showLabels = true,
  className = ''
}) => {
  const [internalDb, setInternalDb] = useState(-60);
  const [peakDb, setPeakDb] = useState(-60);
  const [isSilent, setIsSilent] = useState(false);
  const peakDecayRef = useRef<number>(-60);
  const peakTimeRef = useRef<number>(0);

  // If a live stream is provided (e.g. in setup preview), analyze directly
  useEffect(() => {
    if (!stream || stream.getAudioTracks().length === 0) return;

    let audioCtx: AudioContext | null = null;
    let sourceNode: MediaStreamAudioSourceNode | null = null;
    let analyser: AnalyserNode | null = null;
    let isRunning = true;
    let rafId: number;
    let silenceTimer: NodeJS.Timeout;

    try {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtx = new AudioCtxClass();
      sourceNode = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.4;
      sourceNode.connect(analyser);

      const buffer = new Float32Array(analyser.fftSize);

      const checkLevel = () => {
        if (!isRunning || !analyser) return;
        analyser.getFloatTimeDomainData(buffer);

        let sumSquares = 0;
        for (let i = 0; i < buffer.length; i++) {
          sumSquares += buffer[i] * buffer[i];
        }
        const rms = Math.sqrt(sumSquares / buffer.length);
        const db = rms > 0.00001 ? Math.max(-60, Math.min(0, 20 * Math.log10(rms))) : -60;

        setInternalDb(db);

        // Peak hold
        const now = Date.now();
        if (db > peakDecayRef.current) {
          peakDecayRef.current = db;
          peakTimeRef.current = now;
        } else if (now - peakTimeRef.current > 1200) {
          peakDecayRef.current = Math.max(-60, peakDecayRef.current - 1.5);
        }
        setPeakDb(peakDecayRef.current);

        rafId = requestAnimationFrame(checkLevel);
      };

      rafId = requestAnimationFrame(checkLevel);

      // Check silence every 3s
      silenceTimer = setInterval(() => {
        setIsSilent(peakDecayRef.current < -50);
      }, 2500);
    } catch (e) {
      console.warn('AudioMeter setup failed:', e);
    }

    return () => {
      isRunning = false;
      cancelAnimationFrame(rafId);
      clearInterval(silenceTimer);
      try {
        sourceNode?.disconnect();
        analyser?.disconnect();
        if (audioCtx && audioCtx.state !== 'closed') {
          void audioCtx.close();
        }
      } catch {}
    };
  }, [stream]);

  const currentDb = externalDb !== undefined ? externalDb : internalDb;
  const isGateOpen = externalGateOpen;

  // Normalized value from 0 to 1 (between -60 dB and 0 dB)
  const normalized = Math.max(0, Math.min(1, (currentDb + 60) / 60));
  const peakNormalized = Math.max(0, Math.min(1, (peakDb + 60) / 60));
  const isClipping = currentDb > -1.5;

  if (compact) {
    return (
      <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-black/40 border border-white/10 ${className}`}>
        <Mic className={`w-3 h-3 ${isGateOpen && currentDb > -50 ? 'text-emerald-400' : 'text-slate-500'}`} />
        <div
          role="meter"
          aria-label="Microphone level"
          aria-valuemin={-60}
          aria-valuemax={0}
          aria-valuenow={Math.round(Math.max(-60, currentDb))}
          aria-valuetext={currentDb <= -58 ? 'Silent' : `${Math.round(currentDb)} decibels`}
          className="w-16 h-2 bg-slate-800 rounded-full overflow-hidden relative border border-white/5"
        >
          <div
            className={`h-full transition-all duration-75 rounded-full ${
              isClipping
                ? 'bg-rose-500 shadow-sm shadow-rose-500/50'
                : currentDb > -12
                  ? 'bg-amber-400'
                  : 'bg-emerald-400'
            }`}
            style={{ width: `${normalized * 100}%` }}
          />
          {/* Peak pip */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-white/70"
            style={{ left: `${peakNormalized * 100}%` }}
          />
        </div>
        <span className="text-xs font-mono text-slate-400 w-8 text-right">
          {currentDb <= -58 ? 'SILENT' : `${Math.round(currentDb)}dB`}
        </span>
      </div>
    );
  }

  return (
    <div className={`p-3 rounded-xl bg-black/30 border border-white/5 space-y-2 ${className}`}>
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          {currentDb > -50 ? (
            <Mic className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <MicOff className="w-3.5 h-3.5 text-slate-500" />
          )}
          <span className="font-semibold text-slate-200">Microphone Level</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${
            isGateOpen
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-slate-800 border-white/10 text-slate-400'
          }`}>
            {isGateOpen ? 'MIC ACTIVE' : 'MIC QUIET'}
          </span>
          <span className="font-mono text-xs text-slate-300 w-12 text-right">
            {currentDb <= -58 ? '-inf dB' : `${currentDb.toFixed(1)} dB`}
          </span>
        </div>
      </div>

      {/* Meter Bar */}
      <div
        role="meter"
        aria-label="Microphone input level"
        aria-valuemin={-60}
        aria-valuemax={0}
        aria-valuenow={Math.round(Math.max(-60, currentDb))}
        aria-valuetext={currentDb <= -58 ? 'Silent' : `${Math.round(currentDb)} decibels`}
        className="relative h-3 bg-black/60 rounded-md overflow-hidden p-0.5 border border-white/10 flex items-center"
      >
        {/* Color zone background hints */}
        <div className="absolute inset-0 flex opacity-20 pointer-events-none">
          <div className="w-[70%] bg-emerald-500" />
          <div className="w-[18%] bg-amber-500" />
          <div className="w-[12%] bg-rose-500" />
        </div>

        {/* Dynamic bar */}
        <div
          className={`h-full transition-all duration-75 rounded-sm ${
            isClipping
              ? 'bg-gradient-to-r from-emerald-500 via-amber-400 to-rose-500 shadow-md shadow-rose-500/50'
              : currentDb > -12
                ? 'bg-gradient-to-r from-emerald-500 to-amber-400'
                : 'bg-emerald-400'
          }`}
          style={{ width: `${normalized * 100}%` }}
        />

        {/* Peak indicator */}
        <div
          className="absolute top-0 bottom-0 w-1 bg-white shadow-sm"
          style={{ left: `${Math.min(99, peakNormalized * 100)}%` }}
        />
      </div>

      {showLabels && (
        <div className="flex justify-between text-xs font-mono text-slate-400 px-0.5">
          <span>-60 dB</span>
          <span>-36 dB (Noise cutoff)</span>
          <span>-18 dB (Target)</span>
          <span>-6 dB</span>
          <span className="text-rose-400 font-bold">0 dB</span>
        </div>
      )}

      {isSilent && (
        <div role="status" className="flex items-center gap-1.5 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded-lg">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
          <span>No speech detected. Please speak or check your chosen microphone.</span>
        </div>
      )}
    </div>
  );
};
