import { describe, expect, it } from 'vitest';
import { FREE_TIER, PRO_TIER, getExportBitrate, getTierConfig } from '../tierFeatures';

describe('tier features', () => {
  it('limits the free tier and unlocks everything on Pro', () => {
    expect(getTierConfig(false)).toBe(FREE_TIER);
    expect(getTierConfig(true)).toBe(PRO_TIER);
    expect(FREE_TIER).toMatchObject({ hasWatermark: true, maxDurationSeconds: 90, highBitrate: false, proTemplatesUnlocked: false });
    expect(PRO_TIER).toMatchObject({ hasWatermark: false, highBitrate: true, proTemplatesUnlocked: true });
    expect(PRO_TIER.maxDurationSeconds).toBe(Infinity);
  });

  it('gives MediaRecorder and FFmpeg the same bitrate', () => {
    for (const pro of [false, true]) {
      const { bitsPerSecond, ffmpeg } = getExportBitrate(pro);
      expect(parseInt(ffmpeg, 10) * 1_000_000).toBe(bitsPerSecond);
    }
    expect(getExportBitrate(true).bitsPerSecond).toBeGreaterThan(getExportBitrate(false).bitsPerSecond);
  });
});
