import type { TemplateId, NoiseSuppressionMode } from '../src/core/types';
import type { TimeRange } from '../src/core/cutList';

export type { NoiseSuppressionMode };

// Types shared by the main process, the preload bridge and the desktop pages. Keep this file free of
// Electron and DOM imports so every side can load it.

export type DesktopLayout = 'dynamic_crop' | 'blur_backdrop' | 'gradient_mesh' | 'widescreen';

export interface DesktopConfig {
  /** desktopCapturer source id, e.g. "screen:0:0" or "window:1234:0" */
  sourceId: string;
  layout: DesktopLayout;
  templateId: TemplateId;
  camera: boolean;
  mic: boolean;
  /** Record what the computer plays (Windows only) */
  systemAudio: boolean;
  zoomIntensity?: 'subtle' | 'deep' | 'ultra';
  noiseCancellation?: NoiseSuppressionMode;
}

export const DEFAULT_DESKTOP_CONFIG: DesktopConfig = {
  sourceId: '',
  layout: 'dynamic_crop',
  templateId: 'browser',
  camera: true,
  mic: true,
  systemAudio: false,
  zoomIntensity: 'deep',
  noiseCancellation: 'studio'
};

export interface SourceInfo {
  id: string;
  name: string;
  kind: 'screen' | 'window';
  /** PNG data URL */
  thumbnail: string;
  appIcon?: string;
}

// 'ready' holds a camera take before the countdown so the bubble can be placed first
export type RecStatus = 'idle' | 'starting' | 'ready' | 'countdown' | 'recording' | 'paused' | 'saving';

export interface RecState {
  status: RecStatus;
  /** Recorded time banked before the current running stretch */
  accumulatedMs: number;
  /** Epoch ms when the current running stretch began, null while not running */
  runningSince: number | null;
  countdownEndsAt?: number;
  camera: boolean;
  /** False when cursor follow can't work for the chosen source (window capture) */
  cursorTracking: boolean;
  /** False when the global mouse hook isn't available, so clicks don't zoom */
  clickTracking: boolean;
  error?: string;
}

export const IDLE_STATE: RecState = {
  status: 'idle',
  accumulatedMs: 0,
  runningSince: null,
  camera: false,
  cursorTracking: false,
  clickTracking: false
};

export type ControlAction = 'start' | 'togglePause' | 'pause' | 'resume' | 'stop' | 'cancel' | 'toggleCamera';

/** Pointer position normalized to the captured screen (0..1) */
export interface PointerSample {
  x: number;
  y: number;
  click: boolean;
}

/** Container formats MediaRecorder can produce; anything else is refused by the main process */
export type RecordingExtension = 'mp4' | 'webm';

/** Sent when the recorder stops. The video itself was already streamed to disk chunk by chunk. */
export interface SaveRequest {
  timerMs: number;
  layout: DesktopLayout;
  warnings: string[];
  noiseCancellation?: NoiseSuppressionMode;
  /** FFmpeg -b:v for the MP4 pass, from the license tier */
  bitrate?: string;
}

export interface SavedRecording {
  id: string;
  path: string;
  createdAt: number;
  timerMs: number;
  layout: DesktopLayout;
  warnings: string[];
  size: number;
  /** The untouched take when `path` is an edited copy; edits always render from it */
  sourcePath?: string;
  /** The parts of the source the edited copy keeps, in source seconds */
  kept?: TimeRange[];
}

export const isActive = (s: RecState): boolean => s.status !== 'idle';

export const elapsedMs = (s: RecState, now = Date.now()): number =>
  s.accumulatedMs + (s.runningSince ? now - s.runningSince : 0);

export const formatTime = (ms: number): string => {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};
