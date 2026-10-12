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
  maxResolution: '4K',
  maxDurationSeconds: Infinity,
  proTemplatesUnlocked: true,
  highBitrate: true
};

export function getTierConfig(isPro: boolean): SubscriptionTier {
  return isPro ? PRO_TIER : FREE_TIER;
}
