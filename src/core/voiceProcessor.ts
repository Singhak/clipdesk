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

export class VoiceProcessor {
  private ctx: AudioContext;
  private mode: NoiseSuppressionMode;
  private onLevelChange?: (levelDb: number, gateOpen: boolean) => void;

  private sourceNode: MediaStreamAudioSourceNode;
  private inputTrack: MediaStreamTrack;
  private highpassNode: BiquadFilterNode | null = null;
  private notchNode: BiquadFilterNode | null = null;
  private presenceNode: BiquadFilterNode | null = null;
  private highshelfNode: BiquadFilterNode | null = null;
  private gateGainNode: GainNode | null = null;
  private compressorNode: DynamicsCompressorNode | null = null;
  private analyserNode: AnalyserNode | null = null;

  public readonly outputNode: AudioNode;

  private isRunning = true;
  private animFrameId: number | null = null;
  private gateHoldUntil = 0;
  private isGateOpen = false;

  constructor(ctx: AudioContext, track: MediaStreamTrack, options?: VoiceProcessorOptions) {
    this.ctx = ctx;
    this.inputTrack = track;
    this.mode = options?.mode ?? 'studio';
    this.onLevelChange = options?.onLevelChange;

    this.sourceNode = ctx.createMediaStreamSource(new MediaStream([track]));

    if (this.mode === 'off') {
      this.outputNode = this.sourceNode;
      return;
    }

    const profile = NOISE_PROFILES[this.mode];

    // 1. Highpass filter: Eliminates traffic rumble, AC wind / sub-bass rumble, 50/60Hz mains hum
    this.highpassNode = ctx.createBiquadFilter();
    this.highpassNode.type = 'highpass';
    this.highpassNode.frequency.setValueAtTime(profile.highpassCutoff, ctx.currentTime);
    this.highpassNode.Q.setValueAtTime(0.707, ctx.currentTime);

    let lastNode: AudioNode = this.sourceNode;
    lastNode.connect(this.highpassNode);
    lastNode = this.highpassNode;

    // 2. Notch/peaking filter to dampen fan whir / drone resonance
    if (profile.notchFreq && profile.notchGain) {
      this.notchNode = ctx.createBiquadFilter();
      this.notchNode.type = 'peaking';
      this.notchNode.frequency.setValueAtTime(profile.notchFreq, ctx.currentTime);
      this.notchNode.Q.setValueAtTime(profile.notchQ ?? 1.5, ctx.currentTime);
      this.notchNode.gain.setValueAtTime(profile.notchGain, ctx.currentTime);
      lastNode.connect(this.notchNode);
      lastNode = this.notchNode;
    }

    // 3. Peaking presence filter: Boosts speech intelligibility & vocal clarity
    if (profile.presenceFreq && profile.presenceGain) {
      this.presenceNode = ctx.createBiquadFilter();
      this.presenceNode.type = 'peaking';
      this.presenceNode.frequency.setValueAtTime(profile.presenceFreq, ctx.currentTime);
      this.presenceNode.Q.setValueAtTime(1.2, ctx.currentTime);
      this.presenceNode.gain.setValueAtTime(profile.presenceGain, ctx.currentTime);
      lastNode.connect(this.presenceNode);
      lastNode = this.presenceNode;
    }

    // 4. Highshelf filter: Cuts high-frequency fan bearing whine and air conditioning hiss
    if (profile.highshelfFreq && profile.highshelfGain) {
      this.highshelfNode = ctx.createBiquadFilter();
      this.highshelfNode.type = 'highshelf';
      this.highshelfNode.frequency.setValueAtTime(profile.highshelfFreq, ctx.currentTime);
      this.highshelfNode.gain.setValueAtTime(profile.highshelfGain, ctx.currentTime);
      lastNode.connect(this.highshelfNode);
      lastNode = this.highshelfNode;
    }

    // 5. Dynamic Noise Gate GainNode
    this.gateGainNode = ctx.createGain();
    this.gateGainNode.gain.setValueAtTime(profile.gateFloorGain, ctx.currentTime);
    lastNode.connect(this.gateGainNode);
    lastNode = this.gateGainNode;

    // 6. Broadcast Dynamics Compressor: Smooths vocal peaks and brings quiet words forward
    this.compressorNode = ctx.createDynamicsCompressor();
    this.compressorNode.threshold.setValueAtTime(profile.compressorThreshold, ctx.currentTime);
    this.compressorNode.knee.setValueAtTime(10, ctx.currentTime);
    this.compressorNode.ratio.setValueAtTime(profile.compressorRatio, ctx.currentTime);
    this.compressorNode.attack.setValueAtTime(profile.gateAttackTime, ctx.currentTime);
    this.compressorNode.release.setValueAtTime(0.22, ctx.currentTime);
    lastNode.connect(this.compressorNode);
    lastNode = this.compressorNode;

    // Sidechain analyser to track vocal RMS and trigger the noise gate
    this.analyserNode = ctx.createAnalyser();
    this.analyserNode.fftSize = 512;
    this.analyserNode.smoothingTimeConstant = 0.2;
    // Monitor pre-gate signal from highpass to detect speech accurately
    this.highpassNode.connect(this.analyserNode);

    this.outputNode = lastNode;

    this.startGateLoop(profile);
  }

  private startGateLoop(profile: NoiseFilterProfile): void {
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
      const db = 20 * Math.log10(Math.max(rms, 1e-5));
      const now = performance.now();

      // Dynamic Gate state evaluation
      if (db >= profile.gateThresholdDb) {
        this.isGateOpen = true;
        this.gateHoldUntil = now + profile.gateHoldMs;
        // Smooth exponential attack to 1.0 (open)
        gateGain.gain.setTargetAtTime(1.0, this.ctx.currentTime, profile.gateAttackTime);
      } else {
        if (now >= this.gateHoldUntil) {
          this.isGateOpen = false;
          // Smooth exponential release to floor gain (silence background fan/traffic)
          gateGain.gain.setTargetAtTime(profile.gateFloorGain, this.ctx.currentTime, profile.gateReleaseTime);
        }
      }

      this.onLevelChange?.(db, this.isGateOpen);

      this.animFrameId = requestAnimationFrame(checkAudioLevel);
    };

    this.animFrameId = requestAnimationFrame(checkAudioLevel);
  }

  public getMode(): NoiseSuppressionMode {
    return this.mode;
  }

  public close(): void {
    this.isRunning = false;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    try {
      this.sourceNode.disconnect();
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
  }
}
