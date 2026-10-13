import type { CameraBackgroundId } from './cameraBackground';

export type TemplateId = 'coding' | 'product_demo' | 'presentation' | 'browser' | 'custom';

export type RecordingSource = 'screen' | 'window' | 'region';

export type LayoutMode = 'widescreen' | 'dynamic_crop' | 'blur_backdrop' | 'gradient_mesh' | 'brand_canvas';

export type ZoomIntensity = 'subtle' | 'deep' | 'ultra';

export interface SmartFeatures {
  followMouse: boolean;
  zoomOnClick: boolean;
  cursorHighlight: boolean;
  blurSideAreas: boolean;
  smoothCameraDamping: boolean;
  zoomIntensity?: ZoomIntensity;
}

export type NoiseSuppressionMode = 'off' | 'studio' | 'fan_killer' | 'mild';

export interface AudioConfig {
  recordMic: boolean;
  recordSystemAudio: boolean;
  micDeviceId?: string;
  noiseCancellation?: NoiseSuppressionMode;
  onAudioLevel?: (levelDb: number, gateOpen: boolean) => void;
}

export interface TemplateConfig {
  id: TemplateId;
  name: string;
  tagline: string;
  iconName: string;
  defaultLayout: LayoutMode;
  defaultZoom: number; // e.g. 1.35
  clickZoomMultiplier: number; // e.g. 1.45
  smoothingFactor: number; // 0.05 (slow/cinematic) to 0.25 (fast)
  safeZoneRatio: number; // 0.5 (inner 50% box before camera moves)
  showCursorHalo: boolean;
  description: string;
  proOnly?: boolean;
}

export interface MousePoint {
  x: number;
  y: number;
  timestamp: number;
  targetWindow?: string;
}

export interface ClickEvent {
  x: number;
  y: number;
  button: 'left' | 'right';
  timestamp: number;
  durationMs: number;
}

export interface CameraState {
  // Crop origin relative to source video (16:9)
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;
  // Current active zoom level (1.0 to 2.5)
  zoom: number;
  // Target coordinates the camera is easing towards
  targetX: number;
  targetY: number;
}

export interface SubscriptionTier {
  id: 'free' | 'pro';
  name: string;
  hasWatermark: boolean;
  maxResolution: '1080x1920';
  maxDurationSeconds: number; // e.g. 90 or Infinity
  proTemplatesUnlocked: boolean;
  highBitrate: boolean;
}

/** Derived from a verified license token (see src/licensing/licenseService.ts), never trusted from storage */
export interface LicenseInfo {
  tier: 'free' | 'pro';
  plan?: 'monthly' | 'lifetime' | 'trial';
  licenseKey?: string;
  /** ISO date; absent for lifetime licenses */
  expiresAt?: string;
  planName: string;
}

export interface ExportSettings {
  format: 'mp4' | 'webm';
  resolution: '1080x1920' | '1920x1080' | '2160x3840';
  fps: 30 | 60;
  layout: LayoutMode;
  includeWatermark: boolean;
  templateId: TemplateId;
}

export interface WebcamConfig {
  enabled: boolean;
  size: 'small' | 'medium' | 'large'; // radius: 55px, 75px, 100px
  position: { x: number; y: number }; // normalized coords (0..1)
  presetPosition: 'bottom_right' | 'bottom_left' | 'top_right' | 'top_left' | 'custom';
  mirror?: boolean;
  shape?: 'circle' | 'square'; // default circle
  scale?: number; // multiplier on the preset size, 0.6 to 1.6, default 1
  /** What shows behind the person in the bubble (on-device segmentation); default none */
  background?: CameraBackgroundId;
}


/** Output canvas size for a layout. Widescreen (Loom-style) is landscape; everything else is a vertical reel. */
export const getOutputSize = (mode: LayoutMode): { width: number; height: number } =>
  mode === 'widescreen' ? { width: 1920, height: 1080 } : { width: 1080, height: 1920 };

/** Drawing coordinate space. Renders natively at full HiDPI resolution (1080x1920 / 1920x1080) for crystal clear mobile text. */
export const getLogicalSize = (mode: LayoutMode): { width: number; height: number } => {
  const out = getOutputSize(mode);
  return { width: out.width, height: out.height };
};
