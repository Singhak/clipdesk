/**
 * VoiceProcessor: Real-Time Audio DSP Pipeline for Vocal Clarity & Noise Cancellation.
 *
 * Designed to eliminate surrounding noises:
 * - Low-frequency rumble (heavy street traffic, air conditioner wind, desk bumps, 50/60Hz mains hum)
 * - Stationary broadband hum (computer fans, room fans, AC whir, ambient air hiss)
 * - Room reverberation & background pauses (dynamic noise gate silences ambient noise when speaker stops talking)
 * - Level inconsistencies (dynamic vocal compressor normalizes volume for crisp broadcast speech)
 */

export type NoiseSuppressionMode = 'off' | 'studio' | 'fan_killer' | 'mild';

export interface NoiseFilterProfile {
  name: string;
  tagline: string;
  description: string;
  highpassCutoff: number; // Hz (kills low frequency traffic rumble, AC wind noise, 50/60Hz hum)
  notchFreq?: number; // Hz (attenuates fan whine/drone resonance)
  notchQ?: number;
  notchGain?: number;
  highshelfFreq?: number; // Hz (cuts air hiss/fan bearing noise)
  highshelfGain?: number;
  presenceFreq?: number; // Hz (boosts speech clarity and intelligibility)
  presenceGain?: number;
  gateThresholdDb: number; // dB (dynamic noise gate threshold to silence room noise when not speaking)
  gateFloorGain: number; // attenuation when gated (0.01 = -40dB, 0.04 = -28dB)
  gateHoldMs: number; // milliseconds to hold gate open after speech pauses (preserves syllable endings)
  gateAttackTime: number; // seconds to open
  gateReleaseTime: number; // seconds to close
  compressorThreshold: number; // dB (levels voice volume)
  compressorRatio: number;
}

export const NOISE_PROFILES: Record<Exclude<NoiseSuppressionMode, 'off'>, NoiseFilterProfile> = {
  studio: {
    name: 'Studio Clear',
    tagline: 'Recommended for crisp, clear voice recordings',
    description: '85Hz rumble/traffic cut + intelligent dynamic noise gate for silent pauses + broadcast vocal compression.',
    highpassCutoff: 85,
    notchFreq: 280,
    notchQ: 1.5,
    notchGain: -2.0,
    presenceFreq: 3200,
    presenceGain: 2.5,
    highshelfFreq: 12000,
    highshelfGain: -3.0,
    gateThresholdDb: -42,
    gateFloorGain: 0.04,
    gateHoldMs: 260,
    gateAttackTime: 0.005,
    gateReleaseTime: 0.16,
    compressorThreshold: -22,
    compressorRatio: 3.5
  },
  fan_killer: {
    name: 'Fan & Traffic Killer',
    tagline: 'Aggressive isolation for loud rooms and street noise',
    description: '125Hz steep rumble filter + high-intensity noise gate + fan drone notch filter. Completely kills desk fan whir.',
    highpassCutoff: 125,
    notchFreq: 220,
    notchQ: 1.8,
    notchGain: -3.5,
    presenceFreq: 3500,
    presenceGain: 3.0,
    highshelfFreq: 9500,
    highshelfGain: -5.0,
    gateThresholdDb: -36,
    gateFloorGain: 0.01,
    gateHoldMs: 200,
    gateAttackTime: 0.004,
    gateReleaseTime: 0.12,
    compressorThreshold: -20,
    compressorRatio: 4.0
  },
  mild: {
    name: 'Mild Ambient',
    tagline: 'Light filtering for quiet rooms',
    description: 'Gentle 70Hz low-cut + transparent noise gate preserving room acoustic warmth.',
    highpassCutoff: 70,
    presenceFreq: 3000,
    presenceGain: 1.5,
    gateThresholdDb: -48,
    gateFloorGain: 0.15,
    gateHoldMs: 300,
    gateAttackTime: 0.006,
    gateReleaseTime: 0.2,
    compressorThreshold: -24,
    compressorRatio: 2.5
  }
};

export interface VoiceProcessorOptions {
  mode?: NoiseSuppressionMode;
  onLevelChange?: (levelDb: number, gateOpen: boolean) => void;
}

/**
 * Creates a background timer powered by a Web Worker.
 * Immune to browser tab throttling when user is recording other windows/apps.
 */
function createBackgroundTimer(intervalMs: number, onTick: () => void): () => void {
  try {
    const url = URL.createObjectURL(
      new Blob(
        [
          `var ready=true;onmessage=function(){ready=true};setInterval(function(){if(ready){ready=false;postMessage(0)}},${Math.round(intervalMs)})`
        ],
        { type: 'text/javascript' }
      )
    );
    const worker = new Worker(url);
    worker.onmessage = () => {
      try {
        onTick();
      } finally {
        worker.postMessage(0);
      }
    };
    return () => {
      worker.terminate();
      URL.revokeObjectURL(url);
    };
  } catch {
    const id = window.setInterval(onTick, intervalMs);
    return () => window.clearInterval(id);
  }
}

export class VoiceProcessor {
  private ctx: AudioContext;
  private mode: NoiseSuppressionMode;
  private onLevelChange?: (levelDb: number, gateOpen: boolean) => void;

  // Strongly retained to prevent Chromium GC (crbug.com/123281, crbug.com/933677)
  private inputStream: MediaStream;
  private inputTrack: MediaStreamTrack;

  private sourceNode: MediaStreamAudioSourceNode;
  private highpassNode: BiquadFilterNode;
  private notchNode: BiquadFilterNode;
  private presenceNode: BiquadFilterNode;
  private highshelfNode: BiquadFilterNode;
  private gateGainNode: GainNode;
  private compressorNode: DynamicsCompressorNode;
  private analyserNode: AnalyserNode;

  public readonly outputNode: AudioNode;

  private isRunning = true;
  private stopTimer: (() => void) | null = null;
  private gateHoldUntil = 0;
  private isGateOpen = false;
  private smoothedDb = -100;

  private onTrackEnded = () => {
    this.close();
  };

  constructor(ctx: AudioContext, track: MediaStreamTrack, options?: VoiceProcessorOptions) {
    this.ctx = ctx;
    this.inputTrack = track;
    this.mode = options?.mode ?? 'studio';
    this.onLevelChange = options?.onLevelChange;

    // Retain MediaStream strongly as an instance property to prevent Chromium GC audio cutoff
    this.inputStream = new MediaStream([track]);
    this.sourceNode = ctx.createMediaStreamSource(this.inputStream);

    // Track lifecycle listeners
    this.inputTrack.addEventListener('ended', this.onTrackEnded);

    // 1. Highpass filter: Rumble & hum reduction
    this.highpassNode = ctx.createBiquadFilter();
    this.highpassNode.type = 'highpass';

    // 2. Peaking notch filter: Dampens fan whir and drone resonance
    this.notchNode = ctx.createBiquadFilter();
    this.notchNode.type = 'peaking';

    // 3. Peaking presence filter: Boosts vocal clarity and speech intelligibility
    this.presenceNode = ctx.createBiquadFilter();
    this.presenceNode.type = 'peaking';

    // 4. Highshelf filter: Cuts high-frequency fan bearing whine and hiss
    this.highshelfNode = ctx.createBiquadFilter();
    this.highshelfNode.type = 'highshelf';

    // 5. Dynamic Noise Gate GainNode
    this.gateGainNode = ctx.createGain();

    // 6. Broadcast Dynamics Compressor: Smooths vocal peaks and brings quiet speech forward
    this.compressorNode = ctx.createDynamicsCompressor();

    // 7. Sidechain analyser: 2048 FFT to prevent pitch flutter and capture lowest vocal fundamental waves
    this.analyserNode = ctx.createAnalyser();
    this.analyserNode.fftSize = 2048;

    // Connect permanent audio graph:
    // source -> highpass -> notch -> presence -> highshelf -> gateGain -> compressor (outputNode)
    this.sourceNode.connect(this.highpassNode);
    this.highpassNode.connect(this.notchNode);
    this.notchNode.connect(this.presenceNode);
    this.presenceNode.connect(this.highshelfNode);
    this.highshelfNode.connect(this.gateGainNode);
    this.gateGainNode.connect(this.compressorNode);

    // Sidechain analyser tapped AFTER notch & highshelf filters (pre-gate)
    // Ensures fan drone and bearing whine are attenuated before reaching speech detection
    this.highshelfNode.connect(this.analyserNode);

    this.outputNode = this.compressorNode;

    // Apply initial profile parameters
    this.applyProfile(this.mode);

    // Start background-safe analysis ticker (~25ms interval / 40Hz)
    this.startGateLoop();
  }

  /**
   * Dynamically applies DSP profile parameters in place without rebuilding the audio graph.
   */
  private applyProfile(mode: NoiseSuppressionMode): void {
    if (!this.isRunning || this.ctx.state === 'closed') return;
    const now = this.ctx.currentTime;

    if (mode === 'off') {
      // Neutral bypass parameters
      this.highpassNode.frequency.setValueAtTime(10, now);
      this.highpassNode.Q.setValueAtTime(0.707, now);
      this.notchNode.gain.setValueAtTime(0, now);
      this.presenceNode.gain.setValueAtTime(0, now);
      this.highshelfNode.gain.setValueAtTime(0, now);

      this.gateGainNode.gain.cancelScheduledValues(now);
      this.gateGainNode.gain.setValueAtTime(1.0, now);
      this.isGateOpen = true;

      this.compressorNode.threshold.setValueAtTime(0, now);
      this.compressorNode.ratio.setValueAtTime(1, now);
      return;
    }

    const profile = NOISE_PROFILES[mode];

    this.highpassNode.frequency.setValueAtTime(profile.highpassCutoff, now);
    this.highpassNode.Q.setValueAtTime(0.707, now);

    if (profile.notchFreq && profile.notchGain) {
      this.notchNode.frequency.setValueAtTime(profile.notchFreq, now);
      this.notchNode.Q.setValueAtTime(profile.notchQ ?? 1.5, now);
      this.notchNode.gain.setValueAtTime(profile.notchGain, now);
    } else {
      this.notchNode.gain.setValueAtTime(0, now);
    }

    if (profile.presenceFreq && profile.presenceGain) {
      this.presenceNode.frequency.setValueAtTime(profile.presenceFreq, now);
      this.presenceNode.Q.setValueAtTime(1.2, now);
      this.presenceNode.gain.setValueAtTime(profile.presenceGain, now);
    } else {
      this.presenceNode.gain.setValueAtTime(0, now);
    }

    if (profile.highshelfFreq && profile.highshelfGain) {
      this.highshelfNode.frequency.setValueAtTime(profile.highshelfFreq, now);
      this.highshelfNode.gain.setValueAtTime(profile.highshelfGain, now);
    } else {
      this.highshelfNode.gain.setValueAtTime(0, now);
    }

    this.compressorNode.threshold.setValueAtTime(profile.compressorThreshold, now);
    this.compressorNode.knee.setValueAtTime(10, now);
    this.compressorNode.ratio.setValueAtTime(profile.compressorRatio, now);
    // Dynamics vocal compressor attack decoupled from gate attack
    this.compressorNode.attack.setValueAtTime(0.015, now);
    this.compressorNode.release.setValueAtTime(0.2, now);

    // Initialize gate floor
    this.gateGainNode.gain.cancelScheduledValues(now);
    this.gateGainNode.gain.setValueAtTime(profile.gateFloorGain, now);
    this.isGateOpen = false;
  }

  private startGateLoop(): void {
    const analyser = this.analyserNode;
    const gateGain = this.gateGainNode;
    if (!analyser || !gateGain) return;

    const buffer = new Float32Array(analyser.fftSize);

    const checkAudioLevel = () => {
      if (!this.isRunning || this.ctx.state === 'closed') return;

      analyser.getFloatTimeDomainData(buffer);

      let sum = 0;
      for (let i = 0; i < buffer.length; i++) {
        const val = buffer[i];
        sum += val * val;
      }
      const rms = Math.sqrt(sum / buffer.length);
      const instantDb = 20 * Math.log10(Math.max(rms, 1e-5));

      // Software EMA smoothing to eliminate pitch flutter and stabilize VU readings
      const alpha = instantDb > this.smoothedDb ? 0.45 : 0.18;
      this.smoothedDb = this.smoothedDb === -100 ? instantDb : this.smoothedDb + alpha * (instantDb - this.smoothedDb);
      const db = this.smoothedDb;

      // Audio context timebase synchronization
      const now = this.ctx.currentTime;
      const profile = this.mode !== 'off' ? NOISE_PROFILES[this.mode] : null;

      if (profile) {
        if (db >= profile.gateThresholdDb) {
          // Speech detected: hold gate open
          this.gateHoldUntil = now + profile.gateHoldMs / 1000;
          if (!this.isGateOpen) {
            this.isGateOpen = true;
            // Only fire automation on state transition to prevent timeline congestion
            gateGain.gain.cancelScheduledValues(this.ctx.currentTime);
            gateGain.gain.setTargetAtTime(1.0, this.ctx.currentTime, profile.gateAttackTime);
          }
        } else {
          // Below threshold: release once hold duration expires
          if (now >= this.gateHoldUntil && this.isGateOpen) {
            this.isGateOpen = false;
            gateGain.gain.cancelScheduledValues(this.ctx.currentTime);
            gateGain.gain.setTargetAtTime(profile.gateFloorGain, this.ctx.currentTime, profile.gateReleaseTime);
          }
        }
      } else {
        // Mode 'off': gate remains wide open at unity gain
        if (!this.isGateOpen) {
          this.isGateOpen = true;
          gateGain.gain.cancelScheduledValues(this.ctx.currentTime);
          gateGain.gain.setTargetAtTime(1.0, this.ctx.currentTime, 0.01);
        }
      }

      // Metering callback is always invoked, including in mode 'off'
      this.onLevelChange?.(db, this.isGateOpen);
    };

    // Use Web Worker ticker to ensure loop continues in background/minimized tabs
    this.stopTimer = createBackgroundTimer(25, checkAudioLevel);
  }

  /**
   * Live preset switching without disconnecting the audio pipeline
   */
  public setMode(mode: NoiseSuppressionMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.applyProfile(mode);
  }

  public getMode(): NoiseSuppressionMode {
    return this.mode;
  }

  public setOnLevelChange(cb?: (levelDb: number, gateOpen: boolean) => void): void {
    this.onLevelChange = cb;
  }

  public close(): void {
    this.isRunning = false;
    if (this.stopTimer) {
      this.stopTimer();
      this.stopTimer = null;
    }
    if (this.inputTrack) {
      this.inputTrack.removeEventListener('ended', this.onTrackEnded);
    }
    try {
      this.sourceNode?.disconnect();
      this.highpassNode?.disconnect();
      this.notchNode?.disconnect();
      this.presenceNode?.disconnect();
      this.highshelfNode?.disconnect();
      this.gateGainNode?.disconnect();
      this.compressorNode?.disconnect();
      this.analyserNode?.disconnect();
    } catch {
      // Ignore disconnect errors during teardown
    }
    // Nullify all node and callback references to release memory
    this.sourceNode = null!;
    this.highpassNode = null!;
    this.notchNode = null!;
    this.presenceNode = null!;
    this.highshelfNode = null!;
    this.gateGainNode = null!;
    this.compressorNode = null!;
    this.analyserNode = null!;
    this.onLevelChange = undefined;
  }
}
