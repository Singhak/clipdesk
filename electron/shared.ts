import type { CameraBackgroundId } from '../src/core/cameraBackground';
import type { TemplateId, NoiseSuppressionMode } from '../src/core/types';
import type { TimeRange } from '../src/core/cutList';
import type { FocusRegion } from '../src/core/focusRegion';

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

export const DEFAULT_DESKTOP_CONFIG: DesktopConfig = {
  sourceId: '',
  layout: 'dynamic_crop',
  templateId: 'browser',
  camera: true,
  mic: true,
  systemAudio: false,
  zoomIntensity: 'deep',
  noiseCancellation: 'studio',
  wideZoom: false,
  wideMouseFx: true,
  ...FOLLOW_DEFAULTS
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
  /** 'ready' wait: the fixed area is picked on a live view before Start */
  areaPick?: boolean;
  /** False when cursor follow can't work for the chosen source (window capture) */
  cursorTracking: boolean;
  /** False when the global mouse hook isn't available, so clicks don't zoom */
  clickTracking: boolean;
  error?: string;
  /** Non-fatal heads-up shown while setting up or recording (failed shortcut, camera unavailable) */
  notice?: string;
  /** 0..100 while a take is being converted to MP4 after Stop */
  progress?: number;
}

export type PermissionKind = 'camera' | 'microphone' | 'screen';
export type PermissionState = 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown';
export interface PermissionStatus {
  platform: string;
  camera: PermissionState;
  microphone: PermissionState;
  screen: PermissionState;
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
