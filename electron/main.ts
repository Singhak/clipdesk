import {
  app,
  BrowserWindow,
  desktopCapturer,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
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
  SaveRequest,
  SavedRecording,
  SourceInfo,
  elapsedMs,
  formatTime,
  isActive
} from './shared';
import { FFmpegManager } from './ffmpegManager';

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
  if (state.camera !== prevCamera && (state.status === 'recording' || state.status === 'paused' || state.status === 'countdown')) {
    if (state.camera) showCameraBubble();
    else hideCameraBubble();
  }
  broadcast();
}

function onStatusChange(prev: RecState['status']): void {
  const s = state.status;
  if (s === 'countdown') {
    showCountdown();
    showControls();
    if (state.camera) showCameraBubble();
  } else {
    closeWindow(countdown);
  }
  if (s === 'recording' || s === 'paused' || s === 'countdown') {
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
    console.warn('Global mouse hook unavailable; click zoom is off.', e);
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
      console.warn('Could not start the global mouse hook.', e);
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
      { label: 'Quit', click: () => app.quit() }
    ])
  );
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

async function saveRecording(req: SaveRequest): Promise<SavedRecording> {
  const createdAt = Date.now();
  // Local time, e.g. "2026-10-11 17-12-25" (colons aren't allowed in Windows file names)
  const d = new Date(createdAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  const baseName = `ClipDesk ${stamp}`;
  const rawFile = path.join(await recordingsDir(), `${baseName}.${req.extension}`);
  const bytes = Buffer.from(req.bytes);
  await fs.writeFile(rawFile, bytes);

  let finalFile = rawFile;
  let finalSize = bytes.length;
  const noiseCancellation = req.noiseCancellation ?? config.noiseCancellation ?? 'studio';

  if (req.extension !== 'mp4') {
    const mp4File = path.join(await recordingsDir(), `${baseName}.mp4`);
    try {
      await FFmpegManager.convertToMp4(rawFile, mp4File, { noiseCancellation });
      // Clean up the temporary raw file on successful conversion
      await fs.unlink(rawFile).catch(() => {});
      finalFile = mp4File;
      const stat = await fs.stat(mp4File);
      finalSize = stat.size;
    } catch (e) {
      console.warn('Native FFmpeg conversion failed, keeping raw recording:', e);
      req.warnings.push('MP4 conversion encountered an issue; raw recording kept.');
    }
  } else {
    // If MediaRecorder recorded direct MP4, post-process with FFmpeg for studio noise cancellation & faststart
    const optimizedFile = path.join(await recordingsDir(), `${baseName}.optimized.mp4`);
    try {
      await FFmpegManager.convertToMp4(rawFile, optimizedFile, { noiseCancellation });
      await fs.unlink(rawFile).catch(() => {});
      await fs.rename(optimizedFile, rawFile);
      const stat = await fs.stat(rawFile);
      finalSize = stat.size;
    } catch (e) {
      console.warn('Post-processing optimization skipped:', e);
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

function registerIpc(): void {
  ipcMain.handle('state:get', () => state);
  ipcMain.on('state:reset-error', () => setState({ error: undefined }));
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
  ipcMain.on('recorder:fail', (_e, message: string) => setState({ ...IDLE_STATE, error: message }));
  ipcMain.on('recorder:discard', () => setState({ ...IDLE_STATE }));
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
      return { meta, bytes: await fs.readFile(meta.path) };
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
    // Recycle Bin / Trash rather than a permanent delete
    await shell.trashItem(meta.path);
    recordings.delete(id);
    return true;
  });
  ipcMain.handle('result:trim', async (_e, { id, startSec, endSec }: { id: string; startSec: number; endSec: number }) => {
    const meta = recordings.get(id);
    if (!meta) return null;
    try {
      const ext = path.extname(meta.path);
      const dir = path.dirname(meta.path);
      const base = path.basename(meta.path, ext);
      const trimmedPath = path.join(dir, `${base}_trimmed_${Date.now()}${ext}`);

      await FFmpegManager.trimVideo(meta.path, trimmedPath, startSec, endSec);

      const stats = await fs.stat(trimmedPath);
      const updatedMeta: SavedRecording = {
        ...meta,
        path: trimmedPath,
        size: stats.size,
        timerMs: Math.round((endSec - startSec) * 1000)
      };
      recordings.set(id, updatedMeta);

      return {
        meta: updatedMeta,
        bytes: await fs.readFile(trimmedPath)
      };
    } catch (err) {
      console.error('Failed to trim video with native FFmpeg:', err);
      return null;
    }
  });
  ipcMain.on('result:again', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.close();
    showLauncher();
  });
}

// ---------- lifecycle ----------

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => (isActive(state) ? undefined : showLauncher()));

  void app.whenReady().then(() => {
    if (process.platform === 'win32') app.setAppUserModelId('ai.ruh.clipdesk');
    installCaptureHandlers();
    registerIpc();
    createTray();
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
