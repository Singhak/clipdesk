import { NoiseSuppressionMode, VoiceProcessor } from './voiceProcessor';

export interface MixedAudio {
  stream: MediaStream | null;
  warning?: string;
  close: () => void;
}

export interface AudioMixOptions {
  micTrack?: MediaStreamTrack | null;
  systemTrack?: MediaStreamTrack | null;
  noiseCancellation?: NoiseSuppressionMode;
  onAudioLevel?: (levelDb: number, gateOpen: boolean) => void;
}

const noop = () => {};

/**
 * Combines microphone and system audio into a unified recording stream.
 *
 * Applies active VoiceProcessor DSP (High-Pass traffic/AC rumble filter, dynamic noise gate,
 * fan whine suppression, and broadcast vocal leveling) to the microphone track while keeping
 * system audio (music/game/app sounds) full and unaltered.
 */
export async function mixAudioTracks(input: MediaStreamTrack[] | AudioMixOptions): Promise<MixedAudio> {
  let micTrack: MediaStreamTrack | null = null;
  let systemTrack: MediaStreamTrack | null = null;
  let noiseMode: NoiseSuppressionMode = 'studio';
  let onAudioLevel: ((levelDb: number, gateOpen: boolean) => void) | undefined;

  if (Array.isArray(input)) {
    const live = input.filter((t) => t.kind === 'audio' && t.readyState === 'live');
    if (live.length === 0) return { stream: null, close: noop };
    micTrack = live[0];
    if (live.length > 1) systemTrack = live[1];
  } else {
    if (input.micTrack && input.micTrack.readyState === 'live') micTrack = input.micTrack;
    if (input.systemTrack && input.systemTrack.readyState === 'live') systemTrack = input.systemTrack;
    noiseMode = input.noiseCancellation ?? 'studio';
    onAudioLevel = input.onAudioLevel;
  }

  if (!micTrack && !systemTrack) return { stream: null, close: noop };

  // If only system audio and no mic, pass directly
  if (!micTrack && systemTrack) {
    return { stream: new MediaStream([systemTrack]), close: noop };
  }

  // If noise cancellation is explicitly off and only 1 track, passthrough is fine
  if (noiseMode === 'off' && micTrack && !systemTrack) {
    return { stream: new MediaStream([micTrack]), close: noop };
  }

  const fallback = (): MixedAudio => ({
    stream: new MediaStream(micTrack ? [micTrack] : [systemTrack!]),
    warning: systemTrack
      ? 'Microphone and system audio could not be mixed in this browser, so only the microphone is recorded.'
      : undefined,
    close: noop
  });

  let ctx: AudioContext;
  try {
    ctx = new AudioContext();
  } catch {
    return fallback();
  }

  await Promise.race([ctx.resume().catch(noop), new Promise((r) => setTimeout(r, 1000))]);
  if (ctx.state !== 'running') {
    void ctx.close().catch(noop);
    return fallback();
  }

  const dest = ctx.createMediaStreamDestination();
  let voiceProc: VoiceProcessor | null = null;

  if (micTrack) {
    if (noiseMode !== 'off') {
      voiceProc = new VoiceProcessor(ctx, micTrack, {
        mode: noiseMode,
        onLevelChange: onAudioLevel
      });
      voiceProc.outputNode.connect(dest);
    } else {
      ctx.createMediaStreamSource(new MediaStream([micTrack])).connect(dest);
    }
  }

  if (systemTrack) {
    // Desktop system audio connects directly to dest without vocal filtering or gating
    ctx.createMediaStreamSource(new MediaStream([systemTrack])).connect(dest);
  }

  return {
    stream: dest.stream,
    close: () => {
      voiceProc?.close();
      if (ctx.state !== 'closed') void ctx.close().catch(noop);
    }
  };
}
