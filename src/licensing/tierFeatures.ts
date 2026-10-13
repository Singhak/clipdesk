import { SubscriptionTier } from '../core/types';

export const FREE_TIER: SubscriptionTier = {
  id: 'free',
  name: 'Free Creator',
  hasWatermark: true,
  maxResolution: '1080x1920',
  maxDurationSeconds: 90,
  proTemplatesUnlocked: false,
  highBitrate: false
};

export const PRO_TIER: SubscriptionTier = {
  id: 'pro',
  name: 'Pro Creator',
  hasWatermark: false,
  maxResolution: '1080x1920',
  maxDurationSeconds: Infinity,
  proTemplatesUnlocked: true,
  highBitrate: true
};

export function getTierConfig(isPro: boolean): SubscriptionTier {
  return isPro ? PRO_TIER : FREE_TIER;
}

/** Prices shown in the apps. The charged amount comes from server/config.php `plans`; keep these in sync. */
export const DISPLAY_PRICES = {
  monthly: '₹499',
  lifetime: '₹2,999'
} as const;

/** Video bitrate for a tier, as MediaRecorder bits/s and as an FFmpeg -b:v value */
export function getExportBitrate(isPro: boolean): { bitsPerSecond: number; ffmpeg: string } {
  return getTierConfig(isPro).highBitrate
    ? { bitsPerSecond: 16_000_000, ffmpeg: '16M' }
    : { bitsPerSecond: 6_000_000, ffmpeg: '6M' };
}
