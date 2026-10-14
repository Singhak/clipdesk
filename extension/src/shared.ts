import type { CameraBackgroundId } from '../../src/core/cameraBackground';
import type { TemplateId } from '../../src/core/types';
import type { FocusRegion } from '../../src/core/focusRegion';

export type CaptureSource = 'tab' | 'screen';
export type ExtLayout = 'dynamic_crop' | 'blur_backdrop' | 'gradient_mesh' | 'widescreen';

export interface RecordingConfig {
  source: CaptureSource;
  layout: ExtLayout;
  templateId: TemplateId;
  camera: boolean;
  mic: boolean;
  /** Show the in-page floating bar (it is part of the page, so it can appear in the video) */
  showControls: boolean;
  /** 16:9 only: zoom in on clicks (reels always do) */
  wideZoom?: boolean;
  /** 16:9 only: cursor highlight and click ripples */
  wideMouseFx?: boolean;
  /** Blur or replace what is behind the person in the camera bubble */
  cameraBackground?: CameraBackgroundId;
  /** Vertical layouts: the view follows the mouse (default on) */
  followMouse?: boolean;
  /** Vertical layouts: zoom in where you click (default on) */
  zoomOnClick?: boolean;
  /** Vertical layouts: cursor highlight and click ripples */
  mouseFx?: boolean;
  /** 9:16 reel of one fixed part of the screen: no mouse following, no zoom unless turned on */
  fixedArea?: boolean;
  /** The fixed 9:16 area (normalized centre + zoom), used with `fixedArea` */
  focus?: FocusRegion;
  /** Fixed area: outline the area on screen while recording, as a reminder (never in the video) */
  guideFrame?: boolean;
}

/** Vertical reel that follows the mouse: everything on */
export const FOLLOW_DEFAULTS = { followMouse: true, zoomOnClick: true, mouseFx: true };
/** Vertical reel of a fixed area: no mouse following, no click zoom, no cursor effects */
export const FIXED_AREA_DEFAULTS = { followMouse: false, zoomOnClick: false, mouseFx: false, guideFrame: true };

export const DEFAULT_CONFIG: RecordingConfig = {
  source: 'tab',
  layout: 'dynamic_crop',
  templateId: 'browser',
  camera: true,
  mic: true,
  showControls: true,
  wideZoom: false,
  wideMouseFx: true,
  ...FOLLOW_DEFAULTS
};

export type RecStatus = 'idle' | 'starting' | 'countdown' | 'recording' | 'paused' | 'saving';

export interface RecState {
  status: RecStatus;
  /** Recorded time banked before the current running stretch */
  accumulatedMs: number;
  /** Epoch ms when the current running stretch began, null while not running */
  runningSince: number | null;
  /** Epoch ms when the 3-2-1 countdown ends */
  countdownEndsAt?: number;
  camera: boolean;
  recorderTabId?: number;
  /** Tab being recorded (tab source) */
  targetTabId?: number;
  showControls: boolean;
  /** Fixed area on a tab capture: the page outlines it while recording (set by the recorder) */
  guide?: FocusRegion;
  error?: string;
}

export const IDLE_STATE: RecState = {
  status: 'idle',
  accumulatedMs: 0,
  runningSince: null,
  camera: false,
  showControls: true
};

/**
 * Optional site access. Without it the controls and pointer tracking run only in the tab the
 * recording was started from (activeTab); with it they follow the user onto every page.
 */
export const ALL_PAGES: chrome.permissions.Permissions = { origins: ['http://*/*', 'https://*/*'] };

export const STATE_KEY = 'recState';
export const CONFIG_KEY = 'recConfig';
/** Set by the service worker for the recorder tab to pick up */
export const PENDING_KEY = 'pendingRecording';

export interface PendingRecording {
  config: RecordingConfig;
  originTabId: number;
}

export type ControlAction = 'togglePause' | 'pause' | 'resume' | 'stop' | 'cancel' | 'toggleCamera';

/** Pointer position, normalized three ways; the recorder picks the one matching what is captured */
export interface PointerSample {
  /** Within the tab viewport (tab capture) */
  vx: number;
  vy: number;
  /** Within the monitor (screen capture) */
  sx: number;
  sy: number;
  /** Within the browser window (window capture) */
  wx: number;
  wy: number;
}

export type Message =
  | { type: 'start'; config: RecordingConfig; tabId: number }
  | { type: 'getStreamId' }
  | { type: 'control'; action: ControlAction }
  | { type: 'pointer'; click: boolean; p: PointerSample };

export type StreamIdResponse =
  | {
      ok: true;
      streamId: string;
      source: CaptureSource;
      canRequestAudio: boolean;
      /** The tab the user started from; focus returns there once capture begins */
      originTabId: number;
      targetTabId?: number;
      config: RecordingConfig;
    }
  | { ok: false; error: string };

export const elapsedMs = (s: RecState, now = Date.now()): number =>
  s.accumulatedMs + (s.runningSince ? now - s.runningSince : 0);

export const formatTime = (ms: number): string => {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};

export const isActive = (s: RecState): boolean => s.status !== 'idle';

export async function getState(): Promise<RecState> {
  const got = await chrome.storage.local.get(STATE_KEY);
  return { ...IDLE_STATE, ...(got[STATE_KEY] as Partial<RecState> | undefined) };
}

export async function setState(patch: Partial<RecState>): Promise<RecState> {
  const next = { ...(await getState()), ...patch };
  await chrome.storage.local.set({ [STATE_KEY]: next });
  return next;
}

/** Sends a runtime message, ignoring "no listener" errors (e.g. no recorder is open) */
export async function send<T = unknown>(msg: Message): Promise<T | undefined> {
  try {
    return (await chrome.runtime.sendMessage(msg)) as T;
  } catch {
    return undefined;
  }
}

// Recordings are handed from the recorder tab to the result tab through IndexedDB (same extension origin)
const DB_NAME = 'clipdesk';
const STORE = 'recordings';

export interface StoredRecording {
  id: string;
  blob: Blob;
  createdAt: number;
  /** What the recording timer showed, to compare with the file's real length */
  timerMs: number;
  layout: ExtLayout;
  warnings: string[];
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        t.oncomplete = () => {
          db.close();
          resolve(req.result);
        };
        t.onerror = () => {
          db.close();
          reject(t.error);
        };
      })
  );
}

export async function saveRecording(rec: StoredRecording): Promise<void> {
  await tx('readwrite', (s) => s.put(rec));
  // Keep only the five newest takes so storage doesn't grow without bound
  const all = await tx<StoredRecording[]>('readonly', (s) => s.getAll());
  const stale = all.sort((a, b) => b.createdAt - a.createdAt).slice(5);
  for (const r of stale) await tx('readwrite', (s) => s.delete(r.id));
}

export const loadRecording = (id: string): Promise<StoredRecording | undefined> =>
  tx<StoredRecording | undefined>('readonly', (s) => s.get(id));

export const deleteRecording = (id: string): Promise<undefined> => tx<undefined>('readwrite', (s) => s.delete(id));
