import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import type {
  ControlAction,
  DesktopConfig,
  PointerSample,
  RecState,
  SaveRequest,
  SavedRecording,
  SourceInfo
} from './shared';

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
  getConfig: (): Promise<DesktopConfig> => ipcRenderer.invoke('config:get'),
  start: (config: DesktopConfig): Promise<void> => ipcRenderer.invoke('recording:start', config),
  resetError: () => ipcRenderer.send('state:reset-error'),

  // Floating bar
  setControlsCollapsed: (collapsed: boolean) => ipcRenderer.send('controls:collapsed', collapsed),
  setControlsSize: (size: { width: number; height: number }) => ipcRenderer.send('controls:size', size),
  onPreviewFrame: (callback: (dataUrl: string) => void) => listen('preview:frame', callback),

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
    recordAgain: () => ipcRenderer.send('result:again')
  }
};

export type ReelApi = typeof api;

contextBridge.exposeInMainWorld('reel', api);
