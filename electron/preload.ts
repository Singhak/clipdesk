import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import type {
  ControlAction,
  DesktopConfig,
  PermissionKind,
  PermissionStatus,
  PointerSample,
  RecState,
  RecordingExtension,
  SaveRequest,
  SavedRecording,
  SourceInfo
} from './shared';
import type { TimeRange } from '../src/core/cutList';
import type { FocusRegion } from '../src/core/focusRegion';

// The only bridge between the desktop pages and the main process. Pages get no Node access.

function listen<T>(channel: string, callback: (value: T) => void): () => void {
  const handler = (_e: IpcRendererEvent, value: T) => callback(value);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const api = {
  platform: process.platform,

  // Shared by every window
  getState: (): Promise<RecState> => ipcRenderer.invoke('state:get'),
  onState: (callback: (s: RecState) => void) => listen('state', callback),
  control: (action: ControlAction) => ipcRenderer.send('control', action),

  // Launcher
  getSources: (): Promise<SourceInfo[]> => ipcRenderer.invoke('sources:get'),
  getSourcePreview: (id: string): Promise<string | null> => ipcRenderer.invoke('sources:preview', id),
  getConfig: (): Promise<DesktopConfig> => ipcRenderer.invoke('config:get'),
  start: (config: DesktopConfig): Promise<void> => ipcRenderer.invoke('recording:start', config),
  resetError: () => ipcRenderer.send('state:reset-error'),
  openRecordingsFolder: () => ipcRenderer.send('folder:open'),

  // Camera, microphone and screen access
  permissions: {
    status: (): Promise<PermissionStatus> => ipcRenderer.invoke('permissions:status'),
    openSettings: (kind: PermissionKind) => ipcRenderer.send('permissions:open-settings', kind)
  },

  // Licensing: requests go through the main process, as page CSP blocks outside connections
  license: {
    request: (endpoint: string, body: Record<string, unknown>): Promise<{ status: number; data: any }> =>
      ipcRenderer.invoke('license:request', { endpoint, body }),
    openCheckout: (url: string) => ipcRenderer.send('license:open', url)
  },

  // Floating bar
  setControlsCollapsed: (collapsed: boolean) => ipcRenderer.send('controls:collapsed', collapsed),
  setControlsSize: (size: { width: number; height: number }) => ipcRenderer.send('controls:size', size),
  onPreviewFrame: (callback: (dataUrl: string) => void) => listen('preview:frame', callback),

  // "Choose the area" panel shown before a fixed-area take starts
  onPickerFrame: (callback: (dataUrl: string) => void) => listen('picker:frame', callback),
  setFocus: (focus: FocusRegion) => ipcRenderer.send('picker:focus', focus),

  // Floating camera bubble
  camera: {
    moveBy: (delta: { x: number; y: number }) => ipcRenderer.send('camera:move-by', delta),
    syncPosition: () => ipcRenderer.send('camera:sync-position'),
    setSize: (sizeKey: 'small' | 'medium' | 'large') => ipcRenderer.send('camera:size', sizeKey),
    setMirror: (mirror: boolean) => ipcRenderer.send('camera:mirror', mirror),
    close: () => ipcRenderer.send('control', 'toggleCamera')
  },

  // Hidden recorder window
  recorder: {
    getConfig: (): Promise<DesktopConfig> => ipcRenderer.invoke('recorder:config'),
    setState: (patch: Partial<RecState>) => ipcRenderer.send('recorder:state', patch),
    onControl: (callback: (action: ControlAction) => void) => listen('recorder:control', callback),
    onPointer: (callback: (p: PointerSample) => void) => listen('recorder:pointer', callback),
    onWebcamPos: (callback: (pos: { x: number; y: number }) => void) => listen('recorder:webcam-pos', callback),
    onWebcamMirror: (callback: (mirror: boolean) => void) => listen('recorder:webcam-mirror', callback),
    onWebcamSize: (callback: (size: 'small' | 'medium' | 'large') => void) => listen('recorder:webcam-size', callback),
    onWebcamToggle: (callback: (enabled: boolean) => void) => listen('recorder:webcam-toggle', callback),
    sendPreviewFrame: (dataUrl: string) => ipcRenderer.send('recorder:preview-frame', dataUrl),
    sendPickerFrame: (dataUrl: string) => ipcRenderer.send('recorder:picker-frame', dataUrl),
    onFocus: (callback: (focus: FocusRegion) => void) => listen('recorder:focus', callback),
    beginTake: (extension: RecordingExtension): Promise<void> => ipcRenderer.invoke('recorder:begin', extension),
    writeChunk: (bytes: ArrayBuffer): Promise<void> => ipcRenderer.invoke('recorder:chunk', bytes),
    save: (req: SaveRequest): Promise<SavedRecording> => ipcRenderer.invoke('recorder:save', req),
    fail: (message: string) => ipcRenderer.send('recorder:fail', message),
    discard: () => ipcRenderer.send('recorder:discard')
  },

  // Result window
  result: {
    get: (id: string): Promise<{ meta: SavedRecording; bytes: Uint8Array } | null> => ipcRenderer.invoke('result:get', id),
    showInFolder: (id: string) => ipcRenderer.send('result:show', id),
    saveAs: (id: string): Promise<string | null> => ipcRenderer.invoke('result:save-as', id),
    trash: (id: string): Promise<boolean> => ipcRenderer.invoke('result:trash', id),
    /** Saves an edited copy keeping only `kept` of the source (all of it restores the original) */
    cut: (id: string, kept: TimeRange[], duration: number): Promise<SavedRecording | null> =>
      ipcRenderer.invoke('result:cut', { id, kept, duration }),
    /** Burns an ASS caption script into a copy of the video, cut to `kept`; resolves to the new file's path */
    burnCaptions: (id: string, ass: string, kept?: TimeRange[], duration?: number): Promise<string> =>
      ipcRenderer.invoke('result:burn-captions', { id, ass, kept, duration }),
    onBurnProgress: (callback: (seconds: number) => void) => listen('result:burn-progress', callback),
    recordAgain: () => ipcRenderer.send('result:again')
  }
};

export type ReelApi = typeof api;

contextBridge.exposeInMainWorld('reel', api);

// Uncaught page errors go to the main process log (see electron/diagnostics.ts)
const reportError = (message: string, stack?: string) => ipcRenderer.send('diag:renderer-error', { message, stack });
window.addEventListener('error', (e) => reportError(e.message || 'error', e.error instanceof Error ? e.error.stack : undefined));
window.addEventListener('unhandledrejection', (e) =>
  reportError(`unhandled rejection: ${e.reason instanceof Error ? e.reason.message : String(e.reason)}`, e.reason instanceof Error ? e.reason.stack : undefined)
);
