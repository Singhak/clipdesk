import {
  app,
  BrowserWindow,
  desktopCapturer,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  net,
  screen,
  session,
  shell,
  systemPreferences,
  Tray
} from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import {
  ControlAction,
  DEFAULT_DESKTOP_CONFIG,
  DesktopConfig,
  IDLE_STATE,
  PointerSample,
  RecState,
  RecordingExtension,
  SaveRequest,
  SavedRecording,
  SourceInfo,
  elapsedMs,
  formatTime,
  isActive
} from './shared';
import { FFmpegManager } from './ffmpegManager';
import { parseRanges, type TimeRange } from '../src/core/cutList';
import { initDiagnostics, log, openDiagnosticsFolder } from './diagnostics';
import { checkNow, initUpdater, installNow, updateStatus } from './updater';
import { LICENSE_API_BASE } from '../src/licensing/publicKey';

const LICENSE_ENDPOINTS = ['activate.php', 'deactivate.php', 'trial.php'];

/** Console output is lost in the installed app, so problems also go to the diagnostics log */
function report(level: 'warn' | 'error', message: string, e: unknown): void {
  console[level](message, e);
  log(level, 'main', `${message} ${e instanceof Error ? e.message : String(e)}`);
}

// Desktop recorder, Loom-style:
// - the launcher window picks a screen or window and the reel format
// - a hidden recorder window captures, composites the 9:16 reel and encodes it (same engine as the web app)
// - the floating control bar and countdown are content-protected, so they never show up in the video
// - the main process tracks the cursor and clicks across the whole desktop and drives cursor follow / click zoom

// The recorder window is never visible; keep Chromium from throttling its timers and frames
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

const RENDERER_DIR = path.join(__dirname, 'renderer');
const PRELOAD = path.join(__dirname, 'preload.cjs');
const ICON = path.join(__dirname, 'renderer', 'icons', process.platform === 'win32' ? 'icon-32.png' : 'icon-16.png');
const POINTER_INTERVAL_MS = 33;
const BAR_SIZE = { width: 440, height: 60 };
const BAR_COLLAPSED = { width: 150, height: 60 };

let launcher: BrowserWindow | null = null;
let recorder: BrowserWindow | null = null;
let controls: BrowserWindow | null = null;
let countdown: BrowserWindow | null = null;
let cameraBubble: BrowserWindow | null = null;
let tray: Tray | null = null;

const CAMERA_SIZES = {
  small: 140,
  medium: 190,
  large: 250
};
let currentCameraSizeKey: 'small' | 'medium' | 'large' = 'medium';

let state: RecState = { ...IDLE_STATE };
let config: DesktopConfig = { ...DEFAULT_DESKTOP_CONFIG };
const recordings = new Map<string, SavedRecording>();

/** The take being recorded, streamed to disk chunk by chunk so a long take never sits in RAM */
interface ActiveTake {
  handle: fs.FileHandle;
  path: string;
  baseName: string;
  extension: RecordingExtension;
  bytes: number;
  /** Writes are chained so chunks land in the order they arrived */
  queue: Promise<void>;
}
let activeTake: ActiveTake | null = null;

// ---------- windows ----------

const pageUrl = (page: string) => path.join(RENDERER_DIR, page);

function baseWebPreferences(extra: Electron.WebPreferences = {}): Electron.WebPreferences {
  return { preload: PRELOAD, contextIsolation: true, nodeIntegration: false, sandbox: true, ...extra };
}

function showLauncher(): void {
  if (launcher && !launcher.isDestroyed()) {
    launcher.show();
    launcher.focus();
    return;
  }
  launcher = new BrowserWindow({
    width: 460,
    height: 760,
    minWidth: 400,
    minHeight: 560,
    title: 'ClipDesk',
    icon: ICON,
    backgroundColor: '#07080c',
    autoHideMenuBar: true,
    webPreferences: baseWebPreferences()
  });
  void launcher.loadFile(pageUrl('launcher.html'));
  launcher.on('closed', () => (launcher = null));
}

/** Display the recording is on: the captured screen, or the one under the cursor for a window */
function targetDisplay(): Electron.Display {
  const displayId = capture?.displayId;
  return (
    screen.getAllDisplays().find((d) => String(d.id) === displayId) ??
    screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  );
}

function overlayWindow(options: Electron.BrowserWindowConstructorOptions): BrowserWindow {
  const win = new BrowserWindow({
    frame: false,
    transparent: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    webPreferences: baseWebPreferences(),
    ...options
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // Hidden from screen capture: Windows 10 2004+ (WDA_EXCLUDEFROMCAPTURE) and macOS
  win.setContentProtection(true);
  win.once('ready-to-show', () => win.showInactive());
  return win;
}

function showControls(): void {
  if (controls && !controls.isDestroyed()) return;
  const area = targetDisplay().workArea;
  controls = overlayWindow({
    ...BAR_SIZE,
    x: Math.round(area.x + (area.width - BAR_SIZE.width) / 2),
    y: Math.round(area.y + area.height - BAR_SIZE.height - 24),
    title: 'ClipDesk controls'
  });
  void controls.loadFile(pageUrl('controls.html'));
  controls.on('closed', () => (controls = null));
}

function showCountdown(): void {
  if (countdown && !countdown.isDestroyed()) return;
  const area = targetDisplay().workArea;
  const size = 300;
  countdown = overlayWindow({
    width: size,
    height: size,
    x: Math.round(area.x + (area.width - size) / 2),
    y: Math.round(area.y + (area.height - size) / 2),
    title: 'ClipDesk countdown'
  });
  void countdown.loadFile(pageUrl('countdown.html'));
  countdown.on('closed', () => (countdown = null));
}

function showCameraBubble(): void {
  if (cameraBubble && !cameraBubble.isDestroyed()) {
    if (!cameraBubble.isVisible()) cameraBubble.show();
    return;
  }
  const size = CAMERA_SIZES[currentCameraSizeKey];
  const area = targetDisplay().workArea;
  // Position in bottom-left by default, with generous padding above taskbar
  const x = Math.round(area.x + 36);
  const y = Math.round(area.y + area.height - size - 36);

  cameraBubble = overlayWindow({
    width: size,
    height: size,
    x,
    y,
    title: 'ClipDesk camera bubble'
  });
  void cameraBubble.loadFile(pageUrl('camera.html'));
  cameraBubble.on('closed', () => (cameraBubble = null));
}

function hideCameraBubble(): void {
  if (cameraBubble && !cameraBubble.isDestroyed() && cameraBubble.isVisible()) {
    cameraBubble.hide();
  }
}

function closeWindow(win: BrowserWindow | null): void {
  if (win && !win.isDestroyed()) win.close();
}

function showResult(id: string): void {
  const rec = recordings.get(id);
  const wide = rec?.layout === 'widescreen';
  const win = new BrowserWindow({
    width: wide ? 1160 : 760,
    height: wide ? 880 : 960,
    minWidth: 680,
    minHeight: 700,
    title: 'ClipDesk recording',
    icon: ICON,
    backgroundColor: '#07080c',
    autoHideMenuBar: true,
    webPreferences: baseWebPreferences()
  });
  void win.loadFile(pageUrl('result.html'), { hash: id });
  // Closing the result brings back the launcher, ready for the next take
  win.on('closed', () => !isActive(state) && BrowserWindow.getAllWindows().every((w) => !w.isVisible()) && showLauncher());
}

// ---------- state ----------

function broadcast(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('state', state);
  }
  refreshTray();
}

function setState(patch: Partial<RecState>): void {
  const prev = state.status;
  const prevCamera = state.camera;
  state = { ...state, ...patch };
  if (state.status !== prev) onStatusChange(prev);
  if (state.camera !== prevCamera && isCapturing(state.status)) {
    if (state.camera) showCameraBubble();
    else hideCameraBubble();
  }
  broadcast();
}

/** Screen capture is live: the bubble, cursor tracking and shortcuts are in play */
function isCapturing(s: RecState['status']): boolean {
  return s === 'ready' || s === 'countdown' || s === 'recording' || s === 'paused';
}

function onStatusChange(prev: RecState['status']): void {
  const s = state.status;
  // The countdown window doubles as the "place your camera, then Start" panel
  if (s === 'ready' || s === 'countdown') {
    showCountdown();
    showControls();
    if (state.camera) showCameraBubble();
  } else {
    closeWindow(countdown);
  }
  if (isCapturing(s)) {
    startTracking();
    registerShortcuts();
    if (state.camera) showCameraBubble();
  }
  if (s === 'idle') {
    stopTracking();
    globalShortcut.unregisterAll();
    closeWindow(controls);
    closeWindow(countdown);
    closeWindow(cameraBubble);
    if (recorder && !recorder.isDestroyed()) recorder.destroy();
    recorder = null;
    capture = null;
    // Back to the launcher unless a result window took over
    if (prev !== 'saving' || state.error) showLauncher();
  }
}

function sendControl(action: ControlAction): void {
  if (!recorder || recorder.isDestroyed()) {
    if (isActive(state)) setState({ ...IDLE_STATE });
    return;
  }
  recorder.webContents.send('recorder:control', action);
}

// ---------- capture ----------

interface CaptureTarget {
  sourceId: string;
  kind: 'screen' | 'window';
  displayId?: string;
}
let capture: CaptureTarget | null = null;

async function listSources(): Promise<Electron.DesktopCapturerSource[]> {
  return desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 320, height: 180 },
    fetchWindowIcons: true
  });
}

function ownWindowSourceIds(): Set<string> {
  return new Set(BrowserWindow.getAllWindows().map((w) => w.getMediaSourceId()));
}

async function startRecording(next: DesktopConfig): Promise<void> {
  if (isActive(state)) return;
  config = { ...next };
  const source = (await listSources()).find((s) => s.id === config.sourceId);
  if (!source) {
    setState({ error: 'That screen or window is no longer available. Pick it again.' });
    return;
  }

  if (process.platform === 'darwin') {
    if (config.camera) await systemPreferences.askForMediaAccess('camera');
    if (config.mic) await systemPreferences.askForMediaAccess('microphone');
    if (systemPreferences.getMediaAccessStatus('screen') === 'denied') {
      setState({ error: 'Allow ClipDesk under System Settings → Privacy & Security → Screen Recording, then reopen it.' });
      return;
    }
  }

  const kind = source.id.startsWith('screen:') ? 'screen' : 'window';
  capture = { sourceId: source.id, kind, displayId: source.display_id || (kind === 'screen' ? String(screen.getPrimaryDisplay().id) : undefined) };
  setState({
    ...IDLE_STATE,
    status: 'starting',
    error: undefined,
    camera: config.camera,
    cursorTracking: kind === 'screen',
    clickTracking: kind === 'screen' && loadHook() !== null
  });

  recorder = new BrowserWindow({
    show: false,
    width: 540,
    height: 960,
    title: 'ClipDesk recorder',
    webPreferences: baseWebPreferences({ backgroundThrottling: false })
  });
  recorder.on('closed', () => {
    recorder = null;
    if (isActive(state) && state.status !== 'saving') setState({ ...IDLE_STATE, error: 'The recorder stopped unexpectedly.' });
  });
  recorder.webContents.on('render-process-gone', (_e, details) => {
    setState({ ...IDLE_STATE, error: `The recorder crashed (${details.reason}).` });
  });
  void recorder.loadFile(pageUrl('recorder.html'));
  launcher?.hide();
}

// The recorder calls getDisplayMedia(); answer it with the source picked in the launcher, without a browser picker
function installCaptureHandlers(): void {
  const ses = session.defaultSession;
  ses.setDisplayMediaRequestHandler(async (_request, callback) => {
    const source = capture && (await listSources()).find((s) => s.id === capture!.sourceId);
    if (!source) {
      callback(null);
      return;
    }
    const wantsLoopback = config.systemAudio && process.platform === 'win32';
    callback(wantsLoopback ? { video: source, audio: 'loopback' } : { video: source });
  });
  // Only our own pages are ever loaded, so camera, mic and screen access can be granted
  ses.setPermissionRequestHandler((_wc, permission, callback) => {
    const p = permission as string;
    callback(p === 'media' || p === 'camera' || p === 'microphone' || p === 'display-capture');
  });
  ses.setPermissionCheckHandler((_wc, permission) => {
    const p = permission as string;
    return p === 'media' || p === 'camera' || p === 'microphone' || p === 'display-capture';
  });
}

// ---------- cursor and click tracking ----------

let pointerTimer: NodeJS.Timeout | null = null;
let lastPointer = '';

function normalizedPointer(): { x: number; y: number } | null {
  if (!capture || capture.kind !== 'screen') return null;
  const point = screen.getCursorScreenPoint();
  const b = targetDisplay().bounds;
  const x = (point.x - b.x) / b.width;
  const y = (point.y - b.y) / b.height;
  return x < 0 || x > 1 || y < 0 || y > 1 ? null : { x, y };
}

function overOwnOverlay(): boolean {
  const p = screen.getCursorScreenPoint();
  return [controls, countdown, cameraBubble].some((w) => {
    if (!w || w.isDestroyed() || !w.isVisible()) return false;
    const b = w.getBounds();
    return p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;
  });
}

function sendPointer(p: PointerSample): void {
  if (recorder && !recorder.isDestroyed()) recorder.webContents.send('recorder:pointer', p);
}

type Hook = typeof import('uiohook-napi');
let hookModule: Hook | null | undefined;
let hookRunning = false;

/** Global mouse hook for click zoom. Optional: without it, cursor follow still works */
function loadHook(): Hook | null {
  if (hookModule !== undefined) return hookModule;
  try {
    // Native module: loaded lazily so a missing or broken build only disables click zoom
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    hookModule = require('uiohook-napi') as Hook;
    hookModule.uIOhook.on('mousedown', (e) => {
      // uiohook: 1 = left button. Position comes from Electron, which reports DIPs like the display bounds
      if (e.button !== 1 || state.status !== 'recording' || overOwnOverlay()) return;
      const p = normalizedPointer();
      if (p) sendPointer({ ...p, click: true });
    });
  } catch (e) {
    report('warn', 'Global mouse hook unavailable; click zoom is off.', e);
    hookModule = null;
  }
  return hookModule;
}

function startTracking(): void {
  if (!capture || capture.kind !== 'screen') return;
  if (!pointerTimer) {
    pointerTimer = setInterval(() => {
      const p = normalizedPointer();
      if (!p) return;
      const key = `${p.x.toFixed(4)},${p.y.toFixed(4)}`;
      if (key === lastPointer) return;
      lastPointer = key;
      sendPointer({ ...p, click: false });
    }, POINTER_INTERVAL_MS);
  }
  if (hookModule && !hookRunning) {
    try {
      hookModule.uIOhook.start();
      hookRunning = true;
    } catch (e) {
      report('warn', 'Could not start the global mouse hook.', e);
    }
  }
}

function stopTracking(): void {
  if (pointerTimer) clearInterval(pointerTimer);
  pointerTimer = null;
  lastPointer = '';
  if (hookModule && hookRunning) {
    hookModule.uIOhook.stop();
    hookRunning = false;
  }
}

// ---------- shortcuts and tray ----------

function registerShortcuts(): void {
  if (globalShortcut.isRegistered('Alt+Shift+P')) return;
  globalShortcut.register('Alt+Shift+P', () => sendControl('togglePause'));
  globalShortcut.register('Alt+Shift+S', () => sendControl('stop'));
}

function refreshTray(): void {
  if (!tray) return;
  const recording = state.status === 'recording' || state.status === 'paused';
  const label =
    state.status === 'idle' ? 'ClipDesk' : `ClipDesk: ${state.status} ${recording ? formatTime(elapsedMs(state)) : ''}`.trim();
  tray.setToolTip(label);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      ...(state.status === 'ready'
        ? [
            { label: 'Start recording', click: () => sendControl('start') },
            { label: 'Cancel', click: () => sendControl('cancel') },
            { type: 'separator' as const }
          ]
        : []),
      ...(recording
        ? [
            { label: state.status === 'paused' ? 'Resume  (Alt+Shift+P)' : 'Pause  (Alt+Shift+P)', click: () => sendControl('togglePause') },
            { label: 'Stop and save  (Alt+Shift+S)', click: () => sendControl('stop') },
            { label: 'Discard recording', click: () => sendControl('cancel') },
            { type: 'separator' as const }
          ]
        : []),
      { label: 'Open ClipDesk', click: () => showLauncher() },
      { label: 'Open recordings folder', click: () => void recordingsDir().then((d) => shell.openPath(d)) },
      { type: 'separator' },
      updateMenuItem(recording),
      { label: 'Open logs and crash reports', click: () => openDiagnosticsFolder() },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() }
    ])
  );
}

function updateMenuItem(recording: boolean): Electron.MenuItemConstructorOptions {
  const u = updateStatus();
  switch (u.kind) {
    case 'checking':
      return { label: 'Checking for updates…', enabled: false };
    case 'downloading':
      return { label: `Downloading update ${u.version} (${u.percent}%)`, enabled: false };
    case 'ready':
      // Installing quits the app, so it waits until the take is saved
      return { label: recording ? `Update ${u.version} installs after this recording` : `Restart to update to ${u.version}`, enabled: !recording, click: () => installNow() };
    default:
      return { label: 'Check for updates', click: () => void checkNow(true) };
  }
}

function createTray(): void {
  const image = nativeImage.createFromPath(ICON);
  tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);
  tray.on('click', () => (isActive(state) ? sendControl('togglePause') : showLauncher()));
  refreshTray();
}

// ---------- saving ----------

async function recordingsDir(): Promise<string> {
  const dir = path.join(app.getPath('videos'), 'ClipDesk');
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

function takeBaseName(createdAt: number): string {
  // Local time, e.g. "2026-10-11 17-12-25" (colons aren't allowed in Windows file names)
  const d = new Date(createdAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  return `ClipDesk ${stamp}`;
}

async function beginTake(extension: unknown): Promise<void> {
  if (extension !== 'mp4' && extension !== 'webm') throw new Error('Unsupported recording format');
  await abortTake();
  const baseName = takeBaseName(Date.now());
  // Written straight to its final name: if the app dies mid-take, the file up to that point survives
  const file = path.join(await recordingsDir(), `${baseName}.${extension}`);
  const handle = await fs.open(file, 'w');
  activeTake = { handle, path: file, baseName, extension, bytes: 0, queue: Promise.resolve() };
}

function writeChunk(bytes: unknown): Promise<void> {
  const take = activeTake;
  if (!take) return Promise.reject(new Error('No recording in progress'));
  if (!(bytes instanceof ArrayBuffer) && !ArrayBuffer.isView(bytes)) return Promise.reject(new Error('Invalid chunk'));
  const buf = bytes instanceof ArrayBuffer ? Buffer.from(bytes) : Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  take.queue = take.queue.then(async () => {
    await take.handle.write(buf);
    take.bytes += buf.length;
  });
  return take.queue;
}

/** Closes the take file once pending writes land and returns it; the caller owns it from here */
async function closeTake(): Promise<ActiveTake | null> {
  const take = activeTake;
  activeTake = null;
  if (take) {
    await take.queue.catch(() => undefined);
    await take.handle.close().catch(() => undefined);
  }
  return take;
}

async function abortTake(): Promise<void> {
  const take = await closeTake();
  if (take) await fs.unlink(take.path).catch(() => undefined);
}

async function saveRecording(req: SaveRequest): Promise<SavedRecording> {
  const take = await closeTake();
  if (!take || take.bytes === 0) {
    if (take) await fs.unlink(take.path).catch(() => undefined);
    throw new Error('the recording is empty');
  }
  const createdAt = Date.now();
  const baseName = take.baseName;
  const rawFile = take.path;
  const extension = take.extension;
  const finalSizeRaw = take.bytes;

  let finalFile = rawFile;
  let finalSize = finalSizeRaw;
  const noiseCancellation = req.noiseCancellation ?? config.noiseCancellation ?? 'studio';
  const bitrate = req.bitrate === '6M' || req.bitrate === '16M' ? req.bitrate : undefined;

  if (extension !== 'mp4') {
    const mp4File = path.join(await recordingsDir(), `${baseName}.mp4`);
    try {
      await FFmpegManager.convertToMp4(rawFile, mp4File, { noiseCancellation, bitrate });
      // Clean up the temporary raw file on successful conversion
      await fs.unlink(rawFile).catch(() => {});
      finalFile = mp4File;
      const stat = await fs.stat(mp4File);
      finalSize = stat.size;
    } catch (e) {
      report('warn', 'Native FFmpeg conversion failed, keeping raw recording:', e);
      req.warnings.push('MP4 conversion encountered an issue; raw recording kept.');
    }
  } else {
    // If MediaRecorder recorded direct MP4, post-process with FFmpeg for studio noise cancellation & faststart
    const optimizedFile = path.join(await recordingsDir(), `${baseName}.optimized.mp4`);
    try {
      await FFmpegManager.convertToMp4(rawFile, optimizedFile, { noiseCancellation, bitrate });
      await fs.unlink(rawFile).catch(() => {});
      await fs.rename(optimizedFile, rawFile);
      const stat = await fs.stat(rawFile);
      finalSize = stat.size;
    } catch (e) {
      report('warn', 'Post-processing optimization skipped:', e);
    }
  }

  const rec: SavedRecording = {
    id: `rec_${createdAt}`,
    path: finalFile,
    createdAt,
    timerMs: req.timerMs,
    layout: req.layout,
    warnings: req.warnings,
    size: finalSize
  };
  recordings.set(rec.id, rec);
  return rec;
}

// ---------- IPC ----------

/** Validates a kept-ranges edit from the result window */
function parseKeep(kept: unknown, duration: unknown): { ranges: TimeRange[]; duration: number } | null {
  const ranges = parseRanges(kept);
  if (!ranges || typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0) return null;
  if (ranges[0].startSec < 0 || ranges[ranges.length - 1].endSec > duration + 0.5) return null;
  return { ranges, duration };
}

function registerIpc(): void {
  ipcMain.handle('state:get', () => state);
  ipcMain.on('state:reset-error', () => setState({ error: undefined }));
  ipcMain.handle('license:request', async (_e, req: { endpoint: string; body: Record<string, unknown> }) => {
    if (!LICENSE_ENDPOINTS.includes(req?.endpoint)) throw new Error('unknown license endpoint');
    const res = await net.fetch(`${LICENSE_API_BASE}/${req.endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body ?? {})
    });
    return { status: res.status, data: await res.json().catch(() => ({})) };
  });
  ipcMain.on('license:open', (_e, url: string) => {
    // Only the checkout page on our own licensing server opens in the browser
    if (typeof url === 'string' && url.startsWith(`${LICENSE_API_BASE}/buy.php`)) void shell.openExternal(url);
  });
  ipcMain.on('control', (_e, action: ControlAction) => {
    if (action === 'toggleCamera') {
      const nextCamera = !state.camera;
      setState({ camera: nextCamera });
      if (recorder && !recorder.isDestroyed()) {
        recorder.webContents.send('recorder:webcam-toggle', nextCamera);
      }
      return;
    }
    sendControl(action);
  });

  ipcMain.handle('config:get', () => config);
  ipcMain.handle('sources:get', async (): Promise<SourceInfo[]> => {
    const own = ownWindowSourceIds();
    return (await listSources())
      .filter((s) => !own.has(s.id))
      .map((s) => ({
        id: s.id,
        name: s.name,
        kind: s.id.startsWith('screen:') ? 'screen' : 'window',
        thumbnail: s.thumbnail.toDataURL(),
        appIcon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : undefined
      }));
  });
  ipcMain.handle('recording:start', (_e, next: DesktopConfig) => startRecording(next));

  ipcMain.on('controls:collapsed', (_e, collapsed: boolean) => {
    if (!controls || controls.isDestroyed()) return;
    const b = controls.getBounds();
    const size = collapsed ? BAR_COLLAPSED : BAR_SIZE;
    // Keep the right edge where it is so the bar doesn't jump away from the pointer
    controls.setBounds({ x: b.x + b.width - size.width, y: b.y, ...size });
  });

  ipcMain.on('controls:size', (_e, size: { width: number; height: number }) => {
    if (!controls || controls.isDestroyed()) return;
    const b = controls.getBounds();
    controls.setBounds({
      x: b.x + b.width - size.width,
      y: b.y + b.height - size.height,
      width: size.width,
      height: size.height
    });
  });

  ipcMain.on('recorder:preview-frame', (_e, dataUrl: string) => {
    if (controls && !controls.isDestroyed()) {
      controls.webContents.send('preview:frame', dataUrl);
    }
  });

  ipcMain.on('camera:move-by', (_e, { x, y }: { x: number; y: number }) => {
    if (!cameraBubble || cameraBubble.isDestroyed()) return;
    const b = cameraBubble.getBounds();
    const nx = Math.round(b.x + x);
    const ny = Math.round(b.y + y);
    cameraBubble.setBounds({ x: nx, y: ny, width: b.width, height: b.height });

    if (recorder && !recorder.isDestroyed()) {
      const display = targetDisplay().bounds;
      const normX = Math.max(0.05, Math.min(0.95, (nx + b.width / 2 - display.x) / display.width));
      const normY = Math.max(0.05, Math.min(0.95, (ny + b.height / 2 - display.y) / display.height));
      recorder.webContents.send('recorder:webcam-pos', { x: normX, y: normY });
    }
  });

  ipcMain.on('camera:sync-position', () => {
    if (!cameraBubble || cameraBubble.isDestroyed() || !recorder || recorder.isDestroyed()) return;
    const b = cameraBubble.getBounds();
    const display = targetDisplay().bounds;
    const normX = Math.max(0.05, Math.min(0.95, (b.x + b.width / 2 - display.x) / display.width));
    const normY = Math.max(0.05, Math.min(0.95, (b.y + b.height / 2 - display.y) / display.height));
    recorder.webContents.send('recorder:webcam-pos', { x: normX, y: normY });
  });

  ipcMain.on('camera:size', (_e, sizeKey: 'small' | 'medium' | 'large') => {
    currentCameraSizeKey = sizeKey;
    const nextSize = CAMERA_SIZES[sizeKey];
    if (cameraBubble && !cameraBubble.isDestroyed()) {
      const b = cameraBubble.getBounds();
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height / 2;
      cameraBubble.setBounds({
        x: Math.round(cx - nextSize / 2),
        y: Math.round(cy - nextSize / 2),
        width: nextSize,
        height: nextSize
      });
    }
    if (recorder && !recorder.isDestroyed()) {
      recorder.webContents.send('recorder:webcam-size', sizeKey);
    }
  });

  ipcMain.on('camera:mirror', (_e, mirror: boolean) => {
    if (recorder && !recorder.isDestroyed()) {
      recorder.webContents.send('recorder:webcam-mirror', mirror);
    }
  });

  ipcMain.handle('recorder:config', () => config);
  ipcMain.on('recorder:state', (_e, patch: Partial<RecState>) => setState(patch));
  ipcMain.on('recorder:fail', (_e, message: string) => {
    void abortTake();
    setState({ ...IDLE_STATE, error: message });
  });
  ipcMain.on('recorder:discard', () => {
    void abortTake();
    setState({ ...IDLE_STATE });
  });
  ipcMain.handle('recorder:begin', (_e, extension: unknown) => beginTake(extension));
  ipcMain.handle('recorder:chunk', (_e, bytes: unknown) => writeChunk(bytes));
  ipcMain.handle('recorder:save', async (_e, req: SaveRequest) => {
    try {
      const rec = await saveRecording(req);
      showResult(rec.id);
      setState({ ...IDLE_STATE });
      return rec;
    } catch (e) {
      setState({ ...IDLE_STATE, error: `The recording could not be saved (${e instanceof Error ? e.message : String(e)}).` });
      throw e;
    }
  });

  ipcMain.handle('result:get', async (_e, id: string) => {
    const meta = recordings.get(id);
    if (!meta) return null;
    try {
      // The editor always works on the untouched take; meta.kept says what the saved edit keeps
      return { meta, bytes: await fs.readFile(meta.sourcePath ?? meta.path) };
    } catch {
      return null;
    }
  });
  ipcMain.on('result:show', (_e, id: string) => {
    const meta = recordings.get(id);
    if (meta) shell.showItemInFolder(meta.path);
  });
  ipcMain.handle('result:save-as', async (e, id: string) => {
    const meta = recordings.get(id);
    if (!meta) return null;
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
    const options = { defaultPath: meta.path, filters: [{ name: 'Video', extensions: [path.extname(meta.path).slice(1)] }] };
    const { canceled, filePath } = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
    if (canceled || !filePath || filePath === meta.path) return canceled ? null : meta.path;
    await fs.copyFile(meta.path, filePath);
    return filePath;
  });
  ipcMain.handle('result:trash', async (_e, id: string) => {
    const meta = recordings.get(id);
    if (!meta) return false;
    // Recycle Bin / Trash rather than a permanent delete; an edited take goes with its source
    await shell.trashItem(meta.path);
    if (meta.sourcePath && meta.sourcePath !== meta.path) await shell.trashItem(meta.sourcePath).catch(() => undefined);
    recordings.delete(id);
    return true;
  });
  ipcMain.handle('result:cut', async (_e, req: { id: string; kept: unknown; duration: unknown }) => {
    const meta = req && typeof req.id === 'string' ? recordings.get(req.id) : undefined;
    const keep = req ? parseKeep(req.kept, req.duration) : null;
    if (!meta || !keep) return null;
    const source = meta.sourcePath ?? meta.path;
    const { ranges: kept, duration } = keep;

    // Nothing cut any more: point back at the original take
    if (kept.length === 1 && kept[0].startSec <= 0.01 && kept[0].endSec >= duration - 0.01) {
      const stats = await fs.stat(source);
      const restored: SavedRecording = { ...meta, path: source, size: stats.size, sourcePath: undefined, kept: undefined };
      recordings.set(meta.id, restored);
      return restored;
    }

    const base = path.basename(source, path.extname(source));
    // Always MP4: the edit is encoded H.264/AAC, which a .webm container can't hold
    const editedPath = path.join(path.dirname(source), `${base} (edited).mp4`);
    const tmpPath = path.join(path.dirname(source), `${base} (edited).part.mp4`);
    try {
      await FFmpegManager.renderEdit(source, tmpPath, { keep });
      await fs.rename(tmpPath, editedPath);
      const stats = await fs.stat(editedPath);
      const updated: SavedRecording = {
        ...meta,
        path: editedPath,
        sourcePath: source,
        kept,
        size: stats.size,
        timerMs: Math.round(kept.reduce((n, r) => n + r.endSec - r.startSec, 0) * 1000)
      };
      recordings.set(meta.id, updated);
      return updated;
    } catch (err) {
      await fs.rm(tmpPath, { force: true }).catch(() => undefined);
      report('error', 'Failed to cut video with native FFmpeg:', err);
      return null;
    }
  });
  ipcMain.handle('result:burn-captions', async (e, req: { id: string; ass: string; kept?: unknown; duration?: unknown }) => {
    const meta = req && typeof req.id === 'string' ? recordings.get(req.id) : undefined;
    if (!meta) throw new Error('Recording not found');
    if (typeof req.ass !== 'string' || req.ass.length === 0 || req.ass.length > 5_000_000) {
      throw new Error('Invalid caption script');
    }
    // Captions are timed against the cut video, so the cuts are applied in the same pass
    const keep = req.kept === undefined ? null : parseKeep(req.kept, req.duration);
    if (req.kept !== undefined && !keep) throw new Error('Invalid cut list');
    const source = meta.sourcePath ?? meta.path;
    const tmpDir = await fs.mkdtemp(path.join(app.getPath('temp'), 'clipdesk-captions-'));
    const assPath = path.join(tmpDir, 'captions.ass');
    const base = path.basename(source, path.extname(source));
    const outPath = path.join(path.dirname(source), `${base} (captions).mp4`);
    try {
      await fs.writeFile(assPath, req.ass, 'utf8');
      await FFmpegManager.renderEdit(source, outPath, {
        keep: keep ?? undefined,
        assPath,
        onSeconds: (sec) => {
          if (!e.sender.isDestroyed()) e.sender.send('result:burn-progress', sec);
        }
      });
      shell.showItemInFolder(outPath);
      return outPath;
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    }
  });
  ipcMain.on('result:again', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.close();
    showLauncher();
  });
}

// ---------- lifecycle ----------

initDiagnostics();

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => (isActive(state) ? undefined : showLauncher()));

  void app.whenReady().then(() => {
    if (process.platform === 'win32') app.setAppUserModelId('ai.ruh.clipdesk');
    installCaptureHandlers();
    registerIpc();
    createTray();
    initUpdater(refreshTray);
    showLauncher();
    // Keep the tray tooltip timer fresh while recording
    setInterval(() => isActive(state) && refreshTray(), 1000);
  });

  // Quitting mid-take would lose the recording; save it first
  app.on('before-quit', (e) => {
    if (state.status === 'recording' || state.status === 'paused') {
      e.preventDefault();
      const choice = dialog.showMessageBoxSync({
        type: 'question',
        buttons: ['Stop and save', 'Discard and quit', 'Keep recording'],
        defaultId: 0,
        cancelId: 2,
        message: 'A recording is in progress.'
      });
      if (choice === 0) sendControl('stop');
      else if (choice === 1) {
        setState({ ...IDLE_STATE });
        app.exit(0);
      }
    }
  });

  app.on('window-all-closed', () => {
    // Recording windows come and go; only quit when idle with nothing open
    if (!isActive(state) && process.platform !== 'darwin') app.quit();
  });

  app.on('activate', () => showLauncher());
  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    stopTracking();
  });
}
