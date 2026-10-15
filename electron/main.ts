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
  Notification,
  protocol,
  screen,
  session,
  shell,
  systemPreferences,
  Tray
} from 'electron';
import { spawn, execFile, ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs/promises';
import {
  ControlAction,
  DEFAULT_DESKTOP_CONFIG,
  DesktopConfig,
  IDLE_STATE,
  PermissionKind,
  PermissionState,
  PermissionStatus,
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
import { CAMERA_PRESETS } from '../src/core/types';
import { DEFAULT_FOCUS, clampFocus, focusSize } from '../src/core/focusRegion';
import { initDiagnostics, log, openDiagnosticsFolder } from './diagnostics';
import { checkNow, initUpdater, installNow, updateStatus } from './updater';
import { LICENSE_API_BASE } from '../src/licensing/publicKey';

const LICENSE_ENDPOINTS = ['activate.php', 'deactivate.php', 'trial.php'];

// Hashed machine ID sent with trial requests so clearing app data does not give a second trial.
let hwidPromise: Promise<string> | undefined;
function machineHash(): Promise<string> {
  hwidPromise ??= new Promise<string>((resolve) => {
    const done = (raw: string) => resolve(createHash('sha256').update(`clipdesk:${raw}`).digest('hex'));
    if (process.platform === 'win32') {
      execFile('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], { windowsHide: true }, (err, out) => {
        const guid = /MachineGuid\s+REG_SZ\s+(\S+)/.exec(out)?.[1];
        done(!err && guid ? guid : `${os.hostname()}|${os.userInfo().username}`);
      });
    } else {
      done(`${os.hostname()}|${os.userInfo().username}`);
    }
  });
  return hwidPromise;
}

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
let guide: BrowserWindow | null = null;
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
    if (launcher.isMinimized()) launcher.restore();
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

/** Big while a fixed area is being picked, the small round countdown otherwise */
function sizeCountdown(): void {
  if (!countdown || countdown.isDestroyed()) return;
  const area = targetDisplay().workArea;
  const picking = state.status === 'ready' && !!state.areaPick;
  const width = picking ? Math.min(760, area.width - 80) : 300;
  const height = picking ? Math.min(640, area.height - 80) : 300;
  countdown.setBounds({
    x: Math.round(area.x + (area.width - width) / 2),
    y: Math.round(area.y + (area.height - height) / 2),
    width,
    height
  });
}

/**
 * Dashed outline around the fixed area while recording, as a reminder of where to stay. It sits just
 * outside the area, ignores the mouse and is hidden from the capture like the other overlays.
 */
function showGuide(): void {
  closeWindow(guide);
  if (!config.fixedArea || !(config.guideFrame ?? true) || capture?.kind !== 'screen') return;
  const d = targetDisplay().bounds;
  const f = clampFocus(config.focus ?? DEFAULT_FOCUS, d.width, d.height);
  const { w, h } = focusSize(f.zoom, d.width, d.height);
  const pad = 4;
  guide = overlayWindow({
    x: Math.round(d.x + (f.cx - w / 2) * d.width) - pad,
    y: Math.round(d.y + (f.cy - h / 2) * d.height) - pad,
    width: Math.round(w * d.width) + pad * 2,
    height: Math.round(h * d.height) + pad * 2,
    focusable: false,
    title: 'ClipDesk guide'
  });
  guide.setIgnoreMouseEvents(true);
  const html =
    '<body style="margin:0;background:transparent;overflow:hidden"><div style="position:fixed;inset:0;border:3px dashed #818cf8;border-radius:4px;box-sizing:border-box"></div></body>';
  void guide.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  guide.on('closed', () => (guide = null));
}

function showCameraBubble(): void {
  if (cameraBubble && !cameraBubble.isDestroyed()) {
    if (!cameraBubble.isVisible()) cameraBubble.show();
    return;
  }
  const size = CAMERA_SIZES[currentCameraSizeKey];
  const area = targetDisplay().workArea;
  // Bottom-left by default, with generous padding above taskbar; otherwise the spot picked in the launcher
  const preset = config.cameraPosition ? CAMERA_PRESETS.find((p) => p.id === config.cameraPosition) : undefined;
  const pad = 36;
  const x = preset
    ? Math.round(Math.max(area.x + pad, Math.min(area.x + area.width - size - pad, area.x + preset.pos.x * area.width - size / 2)))
    : Math.round(area.x + pad);
  const y = preset
    ? Math.round(Math.max(area.y + pad, Math.min(area.y + area.height - size - pad, area.y + preset.pos.y * area.height - size / 2)))
    : Math.round(area.y + area.height - size - pad);

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
    sizeCountdown();
    showControls();
    if (state.camera) showCameraBubble();
  } else {
    closeWindow(countdown);
  }
  if (s === 'countdown') showGuide();
  else if (s !== 'recording' && s !== 'paused') closeWindow(guide);
  if (isCapturing(s)) {
    startTracking();
    registerShortcuts();
    if (state.camera) showCameraBubble();
  }
  // Esc cancels the 3-2-1 even though the overlay never takes focus; only held for those few seconds
  if (s === 'countdown') {
    if (!globalShortcut.isRegistered('Escape')) globalShortcut.register('Escape', () => sendControl('cancel'));
  } else if (globalShortcut.isRegistered('Escape')) {
    globalShortcut.unregister('Escape');
  }
  if (s === 'idle') {
    stopTracking();
    globalShortcut.unregisterAll();
    closeWindow(controls);
    closeWindow(countdown);
    closeWindow(cameraBubble);
    closeWindow(guide);
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

async function listSources(thumbnailSize = { width: 320, height: 180 }): Promise<Electron.DesktopCapturerSource[]> {
  return desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize,
    fetchWindowIcons: true
  });
}

/** JPEG data URL: far smaller than PNG for screenshots, so large previews stay quick over IPC */
const jpegUrl = (img: Electron.NativeImage, quality: number): string =>
  `data:image/jpeg;base64,${img.toJPEG(quality).toString('base64')}`;

function ownWindowSourceIds(): Set<string> {
  return new Set(BrowserWindow.getAllWindows().map((w) => w.getMediaSourceId()));
}

async function startRecording(next: DesktopConfig): Promise<void> {
  if (isActive(state)) return;
  config = { ...next };
  const source = (await listSources()).find((s) => s.id === config.sourceId);
  if (!source) {
    setState({ error: 'That screen or window is no longer available (it may have been closed). Pick another one and try again.' });
    return;
  }

  if (process.platform === 'darwin') {
    if (config.camera) await systemPreferences.askForMediaAccess('camera');
    if (config.mic) await systemPreferences.askForMediaAccess('microphone');
    if (systemPreferences.getMediaAccessStatus('screen') === 'denied') {
      setState({ error: 'ClipDesk cannot see your screen yet. Turn on ClipDesk in System Settings → Privacy & Security → Screen Recording, then reopen the app.' });
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
    cursorTracking: kind === 'screen' || windowHandle(source.id) !== null,
    clickTracking: (kind === 'screen' || windowHandle(source.id) !== null) && loadHook() !== null
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
    if (isActive(state) && state.status !== 'saving') setState({ ...IDLE_STATE, error: 'Recording stopped unexpectedly. Anything already captured may be in your Videos > ClipDesk folder.' });
  });
  recorder.webContents.on('render-process-gone', (_e, details) => {
    setState({ ...IDLE_STATE, error: `Recording stopped because the recorder crashed (${details.reason}). Anything already captured may be in your Videos > ClipDesk folder.` });
  });
  void recorder.loadFile(pageUrl('recorder.html'));
  launcher?.hide();
}

// Recordings are streamed to the result window over clipdesk-media://rec/<id> (with Range support for
// seeking) instead of being read into memory and sent over IPC, which breaks down on multi-GB takes.
const MEDIA_SCHEME = 'clipdesk-media';
protocol.registerSchemesAsPrivileged([{ scheme: MEDIA_SCHEME, privileges: { standard: true, stream: true, supportFetchAPI: true, secure: true } }]);

function installMediaProtocol(): void {
  protocol.handle(MEDIA_SCHEME, (request) => {
    // Only known recording ids resolve, and only to the take's own file
    const id = decodeURIComponent(new URL(request.url).pathname.replace(/^\//, ''));
    const meta = recordings.get(id);
    if (!meta) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(meta.sourcePath ?? meta.path).toString(), { headers: request.headers });
  });
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

/** Windows only: the native window handle behind a window capture source ("window:<hwnd>:0") */
function windowHandle(sourceId: string): string | null {
  if (process.platform !== 'win32') return null;
  return /^window:(\d+):/.exec(sourceId)?.[1] ?? null;
}

let windowProbe: ChildProcess | null = null;
let windowPointer: { x: number; y: number } | null = null;
let windowPointerAt = 0;
let lastWindowPoint: { x: number; y: number } | null = null;
let probeLogged = false;

/**
 * Electron can't see where another app's window is, so a small PowerShell loop reads the window
 * rectangle and the cursor in physical pixels and reports the cursor as 0..1 inside the window.
 */
function startWindowProbe(hwnd: string): void {
  stopWindowProbe();
  const script = `
Add-Type -Namespace W -Name U -MemberDefinition '
[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
[DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
[DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
[DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int attr, out RECT r, int size);
[StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
[StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }'
[void][W.U]::SetProcessDPIAware()
$h = [IntPtr]::new([long]${hwnd})
$inv = [Globalization.CultureInfo]::InvariantCulture
while ($true) {
  $r = New-Object 'W.U+RECT'; $p = New-Object 'W.U+POINT'
  $out = '-'
  # Visible frame (what the capture shows), without the invisible resize borders GetWindowRect adds
  $ok = [W.U]::DwmGetWindowAttribute($h, 9, [ref]$r, 16) -eq 0
  if (-not $ok) { $ok = [W.U]::GetWindowRect($h, [ref]$r) }
  if ($ok -and [W.U]::GetCursorPos([ref]$p)) {
    $w = $r.R - $r.L; $ht = $r.B - $r.T
    if ($w -gt 0 -and $ht -gt 0) {
      $nx = ($p.X - $r.L) / $w; $ny = ($p.Y - $r.T) / $ht
      if ($nx -ge 0 -and $nx -le 1 -and $ny -ge 0 -and $ny -le 1) { $out = $nx.ToString('F4', $inv) + ' ' + $ny.ToString('F4', $inv) }
    }
  }
  [Console]::Out.WriteLine($out); [Console]::Out.Flush()
  Start-Sleep -Milliseconds 15
}`;
  try {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }
    );
    let buffered = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      buffered += chunk.toString();
      const lines = buffered.split(/\r?\n/);
      buffered = lines.pop() ?? '';
      const last = lines[lines.length - 1];
      if (last === undefined) return;
      const [x, y] = last.trim().split(' ').map(Number);
      windowPointer = last.trim() === '-' || !Number.isFinite(x) || !Number.isFinite(y) ? null : { x, y };
      if (windowPointer) {
        windowPointerAt = Date.now();
        lastWindowPoint = windowPointer;
      }
      if (!probeLogged) {
        probeLogged = true;
        log('info', 'main', `Window cursor tracking is reporting (first sample: ${last.trim()})`);
      }
    });
    child.on('error', (e) => report('warn', 'Window cursor tracking could not start.', e));
    windowProbe = child;
  } catch (e) {
    report('warn', 'Window cursor tracking could not start.', e);
  }
}

function stopWindowProbe(): void {
  windowProbe?.kill();
  windowProbe = null;
  windowPointer = null;
  probeLogged = false;
}

function normalizedPointer(): { x: number; y: number } | null {
  if (!capture) return null;
  // A click on the very edge of the window can read as "just outside"; keep using the last position briefly
  if (capture.kind === 'window') return windowPointer ?? (Date.now() - windowPointerAt < 400 ? lastWindowPoint : null);
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
      else if (capture?.kind === 'window') log('info', 'main', 'Click ignored: the cursor was not over the captured window');
    });
  } catch (e) {
    report('warn', 'Global mouse hook unavailable; click zoom is off.', e);
    hookModule = null;
  }
  return hookModule;
}

function startTracking(): void {
  if (!capture) return;
  if (capture.kind === 'window') {
    const hwnd = windowHandle(capture.sourceId);
    if (!hwnd) return;
    if (!windowProbe) startWindowProbe(hwnd);
  }
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
  stopWindowProbe();
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
  const failed: string[] = [];
  const bind = (accelerator: string, action: ControlAction) => {
    if (globalShortcut.isRegistered(accelerator)) return;
    let ok = false;
    try {
      ok = globalShortcut.register(accelerator, () => sendControl(action));
    } catch (e) {
      report('warn', `Could not register ${accelerator}.`, e);
    }
    if (!ok) failed.push(accelerator);
  };
  bind('Alt+Shift+P', 'togglePause');
  bind('Alt+Shift+S', 'stop');
  if (failed.length === 0) return;
  const message = `The shortcut ${failed.join(' and ')} is already used by another app, so it won't work. Use the floating bar or the tray icon to pause and stop.`;
  log('warn', 'main', message);
  setState({ notice: message });
  if (Notification.isSupported()) new Notification({ title: 'ClipDesk shortcut unavailable', body: message }).show();
}

/** Asks before throwing a take away; the parent window (if any) holds the dialog */
async function confirmDiscard(): Promise<boolean> {
  const options: Electron.MessageBoxOptions = {
    type: 'warning',
    buttons: ['Discard recording', 'Keep recording'],
    defaultId: 1,
    cancelId: 1,
    message: 'Discard this recording?',
    detail: 'The video recorded so far will be deleted. This cannot be undone.'
  };
  const parent = BrowserWindow.getFocusedWindow();
  const { response } = parent ? await dialog.showMessageBox(parent, options) : await dialog.showMessageBox(options);
  return response === 0;
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
            { label: 'Discard recording…', click: () => void confirmDiscard().then((yes) => yes && sendControl('cancel')) },
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
  // A click opens the app (its recording view while a take is running); pause and stop live in the menu
  tray.on('click', () => showLauncher());
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

  // Real progress for the "Converting… 42%" label: FFmpeg reports output seconds, the take length is known
  const totalSec = Math.max(1, req.timerMs / 1000);
  let lastPct = -1;
  const onSeconds = (sec: number) => {
    const pct = Math.min(99, Math.max(0, Math.round((sec / totalSec) * 100)));
    if (pct !== lastPct && state.status === 'saving') {
      lastPct = pct;
      setState({ progress: pct });
    }
  };
  setState({ progress: 0 });

  if (extension !== 'mp4') {
    const mp4File = path.join(await recordingsDir(), `${baseName}.mp4`);
    try {
      await FFmpegManager.convertToMp4(rawFile, mp4File, { noiseCancellation, bitrate, onSeconds });
      // Clean up the temporary raw file on successful conversion
      await fs.unlink(rawFile).catch(() => {});
      finalFile = mp4File;
      const stat = await fs.stat(mp4File);
      finalSize = stat.size;
    } catch (e) {
      report('warn', 'Native FFmpeg conversion failed, keeping raw recording:', e);
      await fs.rm(mp4File, { force: true }).catch(() => undefined);
      req.warnings.push(
        `Couldn't convert the video to MP4, so it was saved as a WebM file instead: ${rawFile}. Most players and editors open WebM; if you need MP4, use Show in folder and convert it with any video converter.`
      );
    }
  } else {
    // If MediaRecorder recorded direct MP4, post-process with FFmpeg for studio noise cancellation & faststart
    const optimizedFile = path.join(await recordingsDir(), `${baseName}.optimized.mp4`);
    try {
      await FFmpegManager.convertToMp4(rawFile, optimizedFile, { noiseCancellation, bitrate, onSeconds });
      await fs.unlink(rawFile).catch(() => {});
      await fs.rename(optimizedFile, rawFile);
      const stat = await fs.stat(rawFile);
      finalSize = stat.size;
    } catch (e) {
      report('warn', 'Post-processing optimization skipped:', e);
      await fs.rm(optimizedFile, { force: true }).catch(() => undefined);
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
    const body: Record<string, unknown> = { ...(req.body ?? {}) };
    if (req.endpoint === 'trial.php') body.hwid = await machineHash();
    const res = await net.fetch(`${LICENSE_API_BASE}/${req.endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
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

  ipcMain.on('folder:open', () => void recordingsDir().then((d) => shell.openPath(d)));
  ipcMain.handle('permissions:status', (): PermissionStatus => {
    const read = (kind: PermissionKind): PermissionState => {
      if (process.platform !== 'darwin' && process.platform !== 'win32') return 'unknown';
      try {
        return systemPreferences.getMediaAccessStatus(kind) as PermissionState;
      } catch {
        return 'unknown';
      }
    };
    // Screen status is only reported on macOS; elsewhere capture needs no permission
    return {
      platform: process.platform,
      camera: read('camera'),
      microphone: read('microphone'),
      screen: process.platform === 'darwin' ? read('screen') : 'granted'
    };
  });
  ipcMain.on('permissions:open-settings', (_e, kind: PermissionKind) => {
    const mac = { camera: 'Privacy_Camera', microphone: 'Privacy_Microphone', screen: 'Privacy_ScreenCapture' } as const;
    const win = { camera: 'ms-settings:privacy-webcam', microphone: 'ms-settings:privacy-microphone', screen: '' } as const;
    if (!(kind in mac)) return;
    if (process.platform === 'darwin') void shell.openExternal(`x-apple.systempreferences:com.apple.preference.security?${mac[kind]}`);
    else if (process.platform === 'win32' && win[kind]) void shell.openExternal(win[kind]);
  });

  ipcMain.handle('config:get', () => config);
  // The source list uses tiny thumbnails; the fixed-area picker needs a sharp picture of the one chosen source
  ipcMain.handle('sources:preview', async (_e, id: string): Promise<string | null> => {
    if (typeof id !== 'string') return null;
    // Only the chosen kind is captured at full size; shooting every window that large would be slow
    const found = (
      await desktopCapturer.getSources({
        types: [id.startsWith('screen:') ? 'screen' : 'window'],
        thumbnailSize: { width: 2560, height: 1440 }
      })
    ).find((s) => s.id === id);
    return found && !found.thumbnail.isEmpty() ? jpegUrl(found.thumbnail, 92) : null;
  });
  ipcMain.handle('sources:get', async (): Promise<SourceInfo[]> => {
    const own = ownWindowSourceIds();
    return (await listSources({ width: 640, height: 360 }))
      .filter((s) => !own.has(s.id))
      .map((s) => ({
        id: s.id,
        name: s.name,
        kind: s.id.startsWith('screen:') ? 'screen' : 'window',
        thumbnail: jpegUrl(s.thumbnail, 82),
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

  // Live view of the screen from the recorder to the "choose the area" panel, and the picked area back
  ipcMain.on('recorder:picker-frame', (_e, dataUrl: string) => {
    if (countdown && !countdown.isDestroyed()) countdown.webContents.send('picker:frame', dataUrl);
  });
  ipcMain.on('picker:focus', (_e, f: { cx: number; cy: number; zoom: number }) => {
    const ok = [f?.cx, f?.cy, f?.zoom].every((n) => typeof n === 'number' && Number.isFinite(n));
    if (!ok) return;
    config = { ...config, focus: { cx: f.cx, cy: f.cy, zoom: f.zoom } };
    if (recorder && !recorder.isDestroyed()) recorder.webContents.send('recorder:focus', config.focus);
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

  // One of the nine preset spots: (nx, ny) is where the bubble's center goes, as a share of the usable screen
  ipcMain.on('camera:set-position', (_e, pos: { x: number; y: number }) => {
    if (!cameraBubble || cameraBubble.isDestroyed()) return;
    if (!Number.isFinite(pos?.x) || !Number.isFinite(pos?.y)) return;
    const area = targetDisplay().workArea;
    const b = cameraBubble.getBounds();
    const nx = Math.round(area.x + Math.max(0, Math.min(1, pos.x)) * area.width - b.width / 2);
    const ny = Math.round(area.y + Math.max(0, Math.min(1, pos.y)) * area.height - b.height / 2);
    const x = Math.max(area.x, Math.min(area.x + area.width - b.width, nx));
    const y = Math.max(area.y, Math.min(area.y + area.height - b.height, ny));
    cameraBubble.setBounds({ x, y, width: b.width, height: b.height });

    if (recorder && !recorder.isDestroyed()) {
      const display = targetDisplay().bounds;
      const normX = Math.max(0.05, Math.min(0.95, (x + b.width / 2 - display.x) / display.width));
      const normY = Math.max(0.05, Math.min(0.95, (y + b.height / 2 - display.y) / display.height));
      recorder.webContents.send('recorder:webcam-pos', { x: normX, y: normY });
    }
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
      setState({
        ...IDLE_STATE,
        error: `Couldn't save your recording (${e instanceof Error ? e.message : String(e)}). Any footage that was captured may still be in your Videos > ClipDesk folder.`
      });
      throw e;
    }
  });

  ipcMain.handle('result:get', async (_e, id: string) => {
    const meta = recordings.get(id);
    if (!meta) return null;
    try {
      // The editor always works on the untouched take; meta.kept says what the saved edit keeps
      await fs.access(meta.sourcePath ?? meta.path);
      return { meta, mediaUrl: `${MEDIA_SCHEME}://rec/${encodeURIComponent(id)}` };
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
    installMediaProtocol();
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
        const sure = dialog.showMessageBoxSync({
          type: 'warning',
          buttons: ['Discard and quit', 'Keep recording'],
          defaultId: 1,
          cancelId: 1,
          message: 'Discard this recording and quit?',
          detail: 'The video recorded so far will be deleted. This cannot be undone.'
        });
        if (sure === 0) {
          setState({ ...IDLE_STATE });
          void abortTake().finally(() => app.exit(0));
        }
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
