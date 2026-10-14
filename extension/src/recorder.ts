import './ext.css';
import { TEMPLATES } from '../../src/core/templateManager';
import { ReelCompositor } from '../../src/core/reelCompositor';
import { FrameSource, TrackFrameSource } from '../../src/core/frameSource';
import { DEFAULT_FOCUS } from '../../src/core/focusRegion';
import { mixAudioTracks, MixedAudio } from '../../src/core/audioMixer';
import { ExportEngine } from '../../src/core/exportEngine';
import { LicenseService } from '../../src/licensing/licenseService';
import { getTierConfig } from '../../src/licensing/tierFeatures';
import { LayoutMode, SubscriptionTier, WebcamConfig, getLogicalSize, getOutputSize } from '../../src/core/types';
import {
  IDLE_STATE,
  Message,
  PointerSample,
  RecordingConfig,
  StreamIdResponse,
  elapsedMs,
  getState,
  saveRecording,
  send,
  setState
} from './shared';

const FPS = 30;
const COUNTDOWN_MS = 3000;

const statusEl = document.getElementById('status')!;
statusEl.setAttribute('role', 'status');
const detailEl = document.getElementById('detail')!;
const canvas = document.getElementById('preview') as HTMLCanvasElement;

const show = (status: string, detail = '') => {
  statusEl.textContent = status;
  detailEl.textContent = detail;
};

let screenStream: MediaStream | null = null;
let cameraStream: MediaStream | null = null;
let micStream: MediaStream | null = null;
let screenSource: FrameSource | null = null;
let cameraSource: FrameSource | null = null;
let mixed: MixedAudio | null = null;
let compositor: ReelCompositor | null = null;
let recorder: ReturnType<typeof ExportEngine.startRecordingCanvas> | null = null;
let stopRender: (() => void) | null = null;
let tabAudioPlayer: HTMLAudioElement | null = null;
let config: RecordingConfig;
let targetTabId: number | undefined;
let surface: 'browser' | 'monitor' | 'window' = 'browser';
let finishing = false;
let tier: SubscriptionTier = getTierConfig(false);
const warnings: string[] = [];

const webcamConfig: WebcamConfig = {
  enabled: false,
  size: 'medium',
  position: { x: 0.82, y: 0.85 },
  presetPosition: 'bottom_right',
  mirror: true
};

function releaseAll(): void {
  stopRender?.();
  stopRender = null;
  screenSource?.stop();
  cameraSource?.stop();
  mixed?.close();
  [screenStream, cameraStream, micStream].forEach((s) => s?.getTracks().forEach((t) => t.stop()));
  tabAudioPlayer?.pause();
}

async function closeSelf(): Promise<void> {
  const me = await chrome.tabs.getCurrent();
  if (me?.id !== undefined) await chrome.tabs.remove(me.id).catch(() => window.close());
  else window.close();
}

async function fail(message: string): Promise<void> {
  releaseAll();
  await setState({ ...IDLE_STATE, error: message });
  show("Couldn't start recording", `${message} You can close this tab and try again from the ClipDesk button.`);
  // The recorder tab is pinned in the background; bring it forward so the failure is seen right away
  const me = await chrome.tabs.getCurrent();
  if (me?.id !== undefined) await chrome.tabs.update(me.id, { active: true }).catch(() => {});
}

async function startCamera(): Promise<boolean> {
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
    });
    cameraSource = new TrackFrameSource(cameraStream.getVideoTracks()[0]);
    return true;
  } catch {
    warnings.push('Camera is blocked or unavailable, so the camera bubble is off. Open the ClipDesk popup and use "Allow camera & mic", or enable it in the Chrome site settings.');
    return false;
  }
}

async function capture(res: Extract<StreamIdResponse, { ok: true }>): Promise<void> {
  const mandatory = (source: 'tab' | 'desktop') => ({
    chromeMediaSource: source,
    chromeMediaSourceId: res.streamId
  });
  const kind = res.source === 'tab' ? 'tab' : 'desktop';
  // Chrome's legacy constraint syntax is the only way to open an extension capture stream id
  const constraints = {
    audio: res.canRequestAudio ? { mandatory: mandatory(kind) } : false,
    video: { mandatory: { ...mandatory(kind), maxWidth: 3840, maxHeight: 2160, maxFrameRate: FPS } }
  } as unknown as MediaStreamConstraints;
  screenStream = await navigator.mediaDevices.getUserMedia(constraints);

  const settings = screenStream.getVideoTracks()[0].getSettings() as MediaTrackSettings & { displaySurface?: string };
  surface = res.source === 'tab' ? 'browser' : ((settings.displaySurface as typeof surface) ?? 'monitor');

  // Capturing a tab mutes it for the user; play its sound back so they can still hear the page
  if (res.source === 'tab' && screenStream.getAudioTracks().length > 0) {
    tabAudioPlayer = new Audio();
    tabAudioPlayer.srcObject = new MediaStream(screenStream.getAudioTracks());
    void tabAudioPlayer.play().catch(() => {});
  }
}

function startRendering(): void {
  const layoutMode = config.layout as LayoutMode;
  const logical = getLogicalSize(layoutMode);
  const output = getOutputSize(layoutMode);
  canvas.width = output.width;
  canvas.height = output.height;
  canvas.classList.toggle('wide', layoutMode === 'widescreen');
  const ctx = canvas.getContext('2d', { alpha: false })!;
  const scale = output.width / logical.width;

  // This tab is in the background for the whole take, so frames are driven by a worker timer and
  // read straight off the tracks; requestAnimationFrame and <video> both stall in hidden tabs.
  stopRender = ExportEngine.startTicker(1000 / FPS, () => {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    compositor?.render(ctx, logical.width, logical.height, screenSource, cameraSource);
  });
}

function onPointer(p: PointerSample, click: boolean, senderTabId?: number): void {
  if (!compositor || !screenSource) return;
  // Tab capture: only the captured tab's pointer means anything
  if (config.source === 'tab' && senderTabId !== targetTabId) return;
  const [nx, ny] = surface === 'browser' ? [p.vx, p.vy] : surface === 'window' ? [p.wx, p.wy] : [p.sx, p.sy];
  if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return;
  const { width, height } = compositor.getSourceSize();
  if (click) compositor.click(nx * width, ny * height);
  else compositor.setCursor(nx * width, ny * height);
}

async function togglePause(force?: 'pause' | 'resume'): Promise<void> {
  const s = await getState();
  if (!recorder || (s.status !== 'recording' && s.status !== 'paused')) return;
  const pause = force ? force === 'pause' : s.status === 'recording';
  if (pause && s.status === 'recording') {
    recorder.pause();
    await setState({ status: 'paused', accumulatedMs: elapsedMs(s), runningSince: null });
  } else if (!pause && s.status === 'paused') {
    recorder.resume();
    await setState({ status: 'recording', runningSince: Date.now() });
  }
}

async function toggleCamera(): Promise<void> {
  if (!webcamConfig.enabled && !cameraSource && !(await startCamera())) return;
  webcamConfig.enabled = !webcamConfig.enabled;
  compositor?.setOptions({ webcamConfig: { ...webcamConfig } });
  await setState({ camera: webcamConfig.enabled });
}

async function finish(save: boolean): Promise<void> {
  if (finishing) return;
  finishing = true;
  const s = await getState();
  const timerMs = elapsedMs(s);
  if (!recorder || !save) {
    releaseAll();
    await setState({ ...IDLE_STATE });
    await closeSelf();
    return;
  }
  await setState({ status: 'saving', accumulatedMs: timerMs, runningSince: null });
  show('Saving…');
  const blob = await recorder.stop();
  releaseAll();
  if (blob.size === 0) {
    await setState({ ...IDLE_STATE, error: 'The recording is empty, so there is nothing to save.' });
    show('Nothing was recorded', 'The recording is empty. Close this tab and try again.');
    return;
  }
  const id = `rec_${Date.now()}`;
  await saveRecording({ id, blob, createdAt: Date.now(), timerMs, layout: config.layout, warnings });
  await chrome.tabs.create({ url: chrome.runtime.getURL(`result.html#${id}`), active: true });
  await setState({ ...IDLE_STATE });
  await closeSelf();
}

chrome.runtime.onMessage.addListener((msg: Message, sender) => {
  if (msg.type === 'control') {
    if (msg.action === 'togglePause') void togglePause();
    else if (msg.action === 'pause' || msg.action === 'resume') void togglePause(msg.action);
    else if (msg.action === 'stop') void finish(true);
    else if (msg.action === 'cancel') void finish(false);
    else if (msg.action === 'toggleCamera') void toggleCamera();
  } else if (msg.type === 'pointer') {
    onPointer(msg.p, msg.click, sender.tab?.id);
  }
  return false;
});

// Closing this tab mid-take loses the recording; ask first
window.addEventListener('beforeunload', (e) => {
  if (recorder && !finishing) e.preventDefault();
});

async function main(): Promise<void> {
  const me = await chrome.tabs.getCurrent();
  await setState({ recorderTabId: me?.id });

  show('Choose what to share…');
  const res = await send<StreamIdResponse>({ type: 'getStreamId' });
  if (!res || !res.ok) {
    if (res && res.error === 'cancelled') {
      await setState({ ...IDLE_STATE });
      await closeSelf();
      return;
    }
    await fail(res?.error ?? 'The extension did not respond. Reload it and try again.');
    return;
  }
  config = res.config;
  targetTabId = res.targetTabId;

  try {
    await capture(res);
  } catch (e) {
    await fail(`The screen could not be captured (${e instanceof Error ? e.message : String(e)}).`);
    return;
  }

  if (config.mic) {
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      warnings.push('Microphone is blocked or unavailable, so there is no voice-over. Open the ClipDesk popup and use "Allow camera & mic", or enable it in the Chrome site settings.');
    }
  }
  webcamConfig.background = config.cameraBackground ?? 'none';
  if (config.camera) webcamConfig.enabled = await startCamera();

  // Mic first: if the two can't be mixed, keep the voice-over
  mixed = await mixAudioTracks([...(micStream?.getAudioTracks() ?? []), ...(screenStream?.getAudioTracks() ?? [])]);
  if (mixed.warning) warnings.push(mixed.warning);

  screenSource = new TrackFrameSource(screenStream!.getVideoTracks()[0]);
  const template = TEMPLATES[config.templateId] ?? TEMPLATES.browser;
  const isPro = LicenseService.getLicense().tier === 'pro';
  tier = getTierConfig(isPro);
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
      smoothCameraDamping: true
    },
    watermark: !isPro,
    webcamConfig: { ...webcamConfig }
  });
  startRendering();

  // The browser's own "Stop sharing" button ends the track: save what we have
  screenStream!.getVideoTracks()[0].addEventListener('ended', () => void finish(true));

  // Back to the page the user is recording; this tab stays pinned in the background
  await chrome.tabs.update(res.originTabId, { active: true }).catch(() => {});

  await setState({ status: 'countdown', countdownEndsAt: Date.now() + COUNTDOWN_MS, camera: webcamConfig.enabled });
  show('Starting in 3…', 'Keep this tab open. Use the floating bar, the toolbar button, or Alt+Shift+P / Alt+Shift+S.');
  await new Promise((r) => setTimeout(r, COUNTDOWN_MS));
  if (finishing) return;

  try {
    recorder = ExportEngine.startRecordingCanvas(canvas, mixed.stream, {
      format: 'mp4',
      resolution: config.layout === 'widescreen' ? '1920x1080' : '1080x1920',
      fps: FPS,
      layout: config.layout as LayoutMode,
      includeWatermark: !isPro,
      templateId: config.templateId
    });
  } catch (e) {
    await fail(`Recording could not start (${e instanceof Error ? e.message : String(e)}).`);
    return;
  }
  await setState({ status: 'recording', accumulatedMs: 0, runningSince: Date.now() });
  show('Recording', warnings.join(' ') || 'Keep this tab open. Use the floating bar, the toolbar button, or Alt+Shift+P / Alt+Shift+S.');

  // Free tier length cap: the take is saved, not lost, when it is reached
  if (Number.isFinite(tier.maxDurationSeconds)) {
    const capMs = tier.maxDurationSeconds * 1000;
    const capTimer = window.setInterval(async () => {
      if (finishing) return window.clearInterval(capTimer);
      if (elapsedMs(await getState()) >= capMs) {
        window.clearInterval(capTimer);
        warnings.push(`The Free plan stops recordings at ${tier.maxDurationSeconds} seconds. Upgrade to Pro for unlimited length.`);
        void finish(true);
      }
    }, 250);
  }
}

void main();
