import { TEMPLATES } from '../../src/core/templateManager';
import { ReelCompositor } from '../../src/core/reelCompositor';
import { FrameSource, TrackFrameSource } from '../../src/core/frameSource';
import { DEFAULT_FOCUS } from '../../src/core/focusRegion';
import { mixAudioTracks, MixedAudio } from '../../src/core/audioMixer';
import { ExportEngine } from '../../src/core/exportEngine';
import { LicenseService } from '../../src/licensing/licenseService';
import { getExportBitrate, getTierConfig } from '../../src/licensing/tierFeatures';
import { LayoutMode, SubscriptionTier, WebcamConfig, getLogicalSize, getOutputSize } from '../../src/core/types';
import { ControlAction, DesktopConfig, IDLE_STATE, PointerSample, RecState, elapsedMs } from '../shared';

// Runs in a hidden window for the whole take: captures the chosen screen or window, composites the
// reel and encodes it. The main process feeds it controls and the global cursor position.

const FPS = 30;
const COUNTDOWN_MS = 3000;
const CAPTURE_MAX = { width: 2560, height: 1440 };
const reel = window.reel;
const canvas = document.getElementById('preview') as HTMLCanvasElement;

let config: DesktopConfig;
let state: RecState = { ...IDLE_STATE };
let screenStream: MediaStream | null = null;
let cameraStream: MediaStream | null = null;
let micStream: MediaStream | null = null;
let screenSource: FrameSource | null = null;
let cameraSource: FrameSource | null = null;
let mixed: MixedAudio | null = null;
let compositor: ReelCompositor | null = null;
let recorder: ReturnType<typeof ExportEngine.startRecordingCanvas> | null = null;
let stopRender: (() => void) | null = null;
let finishing = false;
/** Ends the 'ready' wait (Start pressed, or the take was cancelled) */
let startNow: (() => void) | null = null;
const warnings: string[] = [];
/** Chunks are written to disk one after another; this is the tail of that chain */
let diskWrites: Promise<void> = Promise.resolve();
let diskError: string | null = null;
let bytesQueued = 0;
let tier: SubscriptionTier = getTierConfig(false);
let bitrate = getExportBitrate(false).ffmpeg;

const webcamConfig: WebcamConfig = {
  enabled: false,
  size: 'medium',
  position: { x: 0.82, y: 0.85 },
  presetPosition: 'bottom_right',
  mirror: true
};

function setState(patch: Partial<RecState>): void {
  state = { ...state, ...patch };
  reel.recorder.setState(patch);
}

function releaseAll(): void {
  stopRender?.();
  stopRender = null;
  screenSource?.stop();
  cameraSource?.stop();
  mixed?.close();
  [screenStream, cameraStream, micStream].forEach((s) => s?.getTracks().forEach((t) => t.stop()));
}

function fail(message: string): void {
  releaseAll();
  reel.recorder.fail(message);
}

async function startCamera(): Promise<boolean> {
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
    });
    cameraSource = new TrackFrameSource(cameraStream.getVideoTracks()[0]);
    return true;
  } catch {
    const text =
      reel.platform === 'darwin'
        ? 'The camera is blocked, so the camera bubble is off. Allow ClipDesk in System Settings → Privacy & Security → Camera.'
        : 'The camera is blocked or unavailable, so the camera bubble is off. Check Settings → Privacy & security → Camera.';
    warnings.push(text);
    // Also tell the user right now, not only on the result page
    setState({ notice: `Recording without the camera. ${text}` });
    return false;
  }
}

function startRendering(): void {
  const layoutMode = config.layout as LayoutMode;
  const logical = getLogicalSize(layoutMode);
  const output = getOutputSize(layoutMode);
  canvas.width = output.width;
  canvas.height = output.height;
  const ctx = canvas.getContext('2d', { alpha: false })!;
  const scale = output.width / logical.width;

  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = 108;
  thumbCanvas.height = 192;
  const tCtx = thumbCanvas.getContext('2d', { alpha: false });
  let lastThumbTime = 0;

  // The window is never shown, so frames come from a worker timer rather than requestAnimationFrame
  stopRender = ExportEngine.startTicker(1000 / FPS, () => {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    compositor?.render(ctx, logical.width, logical.height, screenSource, cameraSource);

    const now = performance.now();
    if (now - lastThumbTime >= 400 && tCtx) {
      lastThumbTime = now;
      tCtx.drawImage(canvas, 0, 0, 108, 192);
      reel.recorder.sendPreviewFrame(thumbCanvas.toDataURL('image/jpeg', 0.5));
    }
  });
}

/** Sends a live picture of the whole screen to the "choose the area" panel until Start is pressed */
function startPickerFrames(): () => void {
  const pic = document.createElement('canvas');
  const pctx = pic.getContext('2d', { alpha: false })!;
  return ExportEngine.startTicker(250, () => {
    const src = screenSource;
    if (!src?.image || src.width === 0) return;
    pic.width = 960;
    pic.height = Math.round((960 * src.height) / src.width);
    pctx.drawImage(src.image, 0, 0, pic.width, pic.height);
    reel.recorder.sendPickerFrame(pic.toDataURL('image/jpeg', 0.75));
  });
}

function onPointer(p: PointerSample): void {
  if (!compositor) return;
  const { width, height } = compositor.getSourceSize();
  if (p.click) compositor.click(p.x * width, p.y * height);
  else compositor.setCursor(p.x * width, p.y * height);
}

function togglePause(force?: 'pause' | 'resume'): void {
  if (!recorder || (state.status !== 'recording' && state.status !== 'paused')) return;
  const pause = force ? force === 'pause' : state.status === 'recording';
  if (pause && state.status === 'recording') {
    recorder.pause();
    setState({ status: 'paused', accumulatedMs: elapsedMs(state), runningSince: null });
  } else if (!pause && state.status === 'paused') {
    recorder.resume();
    setState({ status: 'recording', runningSince: Date.now() });
  }
}

async function toggleCamera(): Promise<void> {
  const next = !webcamConfig.enabled;
  if (next && !cameraSource) {
    await startCamera();
  }
  webcamConfig.enabled = next;
  compositor?.setOptions({ webcamConfig: { ...webcamConfig } });
  setState({ camera: webcamConfig.enabled });
}

async function finish(save: boolean): Promise<void> {
  if (finishing) return;
  finishing = true;
  startNow?.();
  const timerMs = elapsedMs(state);
  if (!recorder || !save) {
    if (recorder) await recorder.stop().catch(() => undefined);
    releaseAll();
    reel.recorder.discard();
    return;
  }
  setState({ status: 'saving', accumulatedMs: timerMs, runningSince: null });
  await recorder.stop();
  releaseAll();
  await diskWrites;
  if (diskError) {
    reel.recorder.fail(`The recording could not be written to disk (${diskError}).`);
    return;
  }
  if (bytesQueued === 0) {
    reel.recorder.fail('The recording is empty, so there is nothing to save.');
    return;
  }
  await reel.recorder.save({
    timerMs,
    layout: config.layout,
    warnings,
    noiseCancellation: config.noiseCancellation,
    bitrate
  });
}

function onControl(action: ControlAction): void {
  if (action === 'togglePause') togglePause();
  else if (action === 'pause' || action === 'resume') togglePause(action);
  else if (action === 'stop') void finish(true);
  else if (action === 'cancel') void finish(false);
  else if (action === 'toggleCamera') void toggleCamera();
  else if (action === 'start') startNow?.();
}

async function main(): Promise<void> {
  reel.recorder.onControl(onControl);
  reel.recorder.onPointer(onPointer);
  reel.recorder.onFocus((focus) => compositor?.setOptions({ focus }));
  reel.recorder.onWebcamPos((pos) => {
    webcamConfig.position = pos;
    compositor?.setOptions({ webcamConfig: { ...webcamConfig } });
  });
  reel.recorder.onWebcamMirror((mirror) => {
    webcamConfig.mirror = mirror;
    compositor?.setOptions({ webcamConfig: { ...webcamConfig } });
  });
  reel.recorder.onWebcamSize((size) => {
    webcamConfig.size = size;
    compositor?.setOptions({ webcamConfig: { ...webcamConfig } });
  });
  reel.recorder.onWebcamToggle(async (enabled) => {
    if (enabled && !cameraSource) {
      await startCamera();
    }
    webcamConfig.enabled = enabled;
    compositor?.setOptions({ webcamConfig: { ...webcamConfig } });
  });
  config = await reel.recorder.getConfig();

  try {
    // The main process answers this with the source picked in the launcher; no browser picker appears
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      // 1440p is plenty for a 1080x1920 (or 1920x1080) reel. Full-resolution 4K/HiDPI frames cost
      // 60-100 ms each to draw on integrated GPUs, which would cut the frame rate to ~10 fps.
      video: { frameRate: FPS, width: { max: CAPTURE_MAX.width }, height: { max: CAPTURE_MAX.height } },
      audio: config.systemAudio
    });
  } catch (e) {
    fail(`The screen could not be captured (${e instanceof Error ? e.message : String(e)}).`);
    return;
  }
  if (config.systemAudio && screenStream.getAudioTracks().length === 0) {
    warnings.push(
      reel.platform === 'win32' ? 'System audio could not be captured.' : 'System audio recording is only available on Windows.'
    );
  }

  if (config.mic) {
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1
        }
      });
    } catch {
      warnings.push('The microphone is blocked or unavailable, so there is no voice-over.');
      setState({ notice: 'Recording without a microphone: it is blocked or unavailable, so there will be no voice-over.' });
    }
  }
  webcamConfig.background = config.cameraBackground ?? 'none';
  if (config.camera) webcamConfig.enabled = await startCamera();

  // Mic first: if the two can't be mixed, keep the voice-over.
  // Active VoiceProcessor DSP cleans fan hum, AC rumble and room noise from microphone.
  mixed = await mixAudioTracks({
    micTrack: micStream?.getAudioTracks()[0] ?? null,
    systemTrack: screenStream.getAudioTracks()[0] ?? null,
    noiseCancellation: config.noiseCancellation ?? 'studio'
  });
  if (mixed.warning) warnings.push(mixed.warning);

  screenSource = new TrackFrameSource(screenStream.getVideoTracks()[0]);
  const template = TEMPLATES[config.templateId] ?? TEMPLATES.browser;
  const isPro = LicenseService.getLicense().tier === 'pro';
  const watermark = !isPro;
  tier = getTierConfig(isPro);
  bitrate = getExportBitrate(isPro).ffmpeg;
  const wide = config.layout === 'widescreen';
  const fixedArea = config.layout === 'dynamic_crop' && !!config.fixedArea;
  compositor = new ReelCompositor({
    template,
    layoutMode: config.layout as LayoutMode,
    focus: fixedArea ? config.focus ?? DEFAULT_FOCUS : null,
    smartFeatures: {
      followMouse: wide || (config.followMouse ?? true),
      zoomOnClick: wide ? !!config.wideZoom : config.zoomOnClick ?? true,
      cursorHighlight: wide ? !!config.wideMouseFx : config.mouseFx ?? true,
      blurSideAreas: true,
      smoothCameraDamping: true,
      zoomIntensity: config.zoomIntensity ?? 'deep'
    },
    watermark,
    webcamConfig: { ...webcamConfig }
  });
  startRendering();

  // A closed window or unplugged monitor ends the capture: save what we have
  screenStream.getVideoTracks()[0].addEventListener('ended', () => void finish(true));

  // With the camera on, wait for Start so the bubble can be moved, resized or flipped before the take
  // A fixed area waits too, so it can be picked on a live view of the screen first
  if (webcamConfig.enabled || fixedArea) {
    setState({ status: 'ready', camera: webcamConfig.enabled, areaPick: fixedArea });
    const stopFrames = fixedArea ? startPickerFrames() : null;
    await new Promise<void>((resolve) => (startNow = resolve));
    startNow = null;
    stopFrames?.();
    if (finishing) return;
  }

  setState({ status: 'countdown', countdownEndsAt: Date.now() + COUNTDOWN_MS, camera: webcamConfig.enabled, areaPick: false });
  await new Promise((r) => setTimeout(r, COUNTDOWN_MS));
  if (finishing) return;

  try {
    // Each chunk goes to disk as it is encoded, so take length isn't limited by RAM
    const onChunk = (chunk: Blob) => {
      bytesQueued += chunk.size;
      diskWrites = diskWrites.then(async () => {
        if (diskError) return;
        try {
          await reel.recorder.writeChunk(await chunk.arrayBuffer());
        } catch (e) {
          diskError = e instanceof Error ? e.message : String(e);
          void finish(true);
        }
      });
    };
    recorder = ExportEngine.startRecordingCanvas(
      canvas,
      mixed.stream,
      {
        format: 'mp4',
        resolution: config.layout === 'widescreen' ? '1920x1080' : '1080x1920',
        fps: FPS,
        layout: config.layout as LayoutMode,
        includeWatermark: watermark,
        templateId: config.templateId
      },
      { onChunk, keepInMemory: false }
    );
    const extension = recorder.mimeType.includes('mp4') ? 'mp4' : 'webm';
    // Queued first, so the file is open before the first chunk arrives
    diskWrites = reel.recorder.beginTake(extension).catch((e) => {
      diskError = e instanceof Error ? e.message : String(e);
    });
  } catch (e) {
    fail(`Recording could not start (${e instanceof Error ? e.message : String(e)}).`);
    return;
  }
  setState({ status: 'recording', accumulatedMs: 0, runningSince: Date.now() });

  // Free tier length cap: the take is saved, not lost, when it is reached
  if (Number.isFinite(tier.maxDurationSeconds)) {
    const capMs = tier.maxDurationSeconds * 1000;
    const capTimer = window.setInterval(() => {
      if (finishing) return window.clearInterval(capTimer);
      if (elapsedMs(state) >= capMs) {
        window.clearInterval(capTimer);
        warnings.push(`The Free plan stops recordings at ${tier.maxDurationSeconds} seconds. Upgrade to Pro for unlimited length.`);
        void finish(true);
      }
    }, 250);
  }
}

void main();
