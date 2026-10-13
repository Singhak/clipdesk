import { describe, expect, it } from 'vitest';
import { CameraAgent } from '../cameraAgent';
import { ZoomEngine } from '../zoomEngine';
import { frameLerp } from '../smoothing';

describe('frameLerp', () => {
  it('returns the tuned factor at 60 FPS and on the first frame', () => {
    expect(frameLerp(0.2, 1000 / 60)).toBeCloseTo(0.2, 10);
    expect(frameLerp(0.2, null)).toBe(0.2);
  });

  it('covers the same distance per second at any frame rate', () => {
    const remainingAfterOneSecond = (fps: number) => {
      let remaining = 1;
      for (let i = 0; i < fps; i++) remaining *= 1 - frameLerp(0.14, 1000 / fps);
      return remaining;
    };
    expect(remainingAfterOneSecond(30)).toBeCloseTo(remainingAfterOneSecond(60), 10);
    expect(remainingAfterOneSecond(144)).toBeCloseTo(remainingAfterOneSecond(60), 10);
  });

  it('caps long gaps so a stalled tab does not jump', () => {
    expect(frameLerp(0.1, 5000)).toBe(frameLerp(0.1, 100));
    expect(frameLerp(0.1, -10)).toBe(0);
  });
});

describe('CameraAgent', () => {
  const run = (fps: number, seconds: number) => {
    const cam = new CameraAgent({ sourceWidth: 1920, sourceHeight: 1080 });
    let state = cam.update(960, 540, 1, 0);
    for (let t = 1; t <= fps * seconds; t++) state = cam.update(1700, 540, 1, (t * 1000) / fps);
    return state;
  };

  it('produces a 9:16 crop of the source height divided by zoom', () => {
    const cam = new CameraAgent({ sourceWidth: 1920, sourceHeight: 1080 });
    const s = cam.update(960, 540, 2, 0);
    expect(s.cropHeight).toBe(540);
    expect(s.cropWidth).toBeCloseTo((540 * 9) / 16);
  });

  it('never lets the crop leave the source frame', () => {
    const cam = new CameraAgent({ sourceWidth: 1920, sourceHeight: 1080 });
    let s = cam.update(0, 0, 1, 0);
    for (let t = 1; t < 300; t++) s = cam.update(5000, 5000, 1.5, t * 16);
    expect(s.cropX + s.cropWidth).toBeLessThanOrEqual(1920 + 1e-6);
    expect(s.cropY + s.cropHeight).toBeLessThanOrEqual(1080 + 1e-6);
    expect(s.cropX).toBeGreaterThanOrEqual(0);
    expect(s.cropY).toBeGreaterThanOrEqual(0);
  });

  it('shows the whole frame at rest for a widescreen crop and keeps 16:9 when zoomed', () => {
    const cam = new CameraAgent({ sourceWidth: 1920, sourceHeight: 1080 });
    const rest = cam.update(1700, 900, 1, 0, 1920 / 1080);
    expect(rest).toMatchObject({ cropX: 0, cropY: 0, cropWidth: 1920, cropHeight: 1080 });
    const zoomed = cam.update(1700, 900, 1.5, 16, 1920 / 1080);
    expect(zoomed.cropHeight).toBe(720);
    expect(zoomed.cropWidth).toBeCloseTo(1280);
  });

  it('ignores cursor movement inside the dead zone', () => {
    const cam = new CameraAgent({ sourceWidth: 1920, sourceHeight: 1080 });
    const a = cam.update(960, 540, 1, 0);
    const b = cam.update(990, 560, 1, 16);
    expect(b.targetX).toBe(a.targetX);
    expect(b.targetY).toBe(a.targetY);
  });

  it('moves at the same speed at 30 and 144 FPS', () => {
    const at30 = run(30, 0.5);
    const at144 = run(144, 0.5);
    expect(Math.abs(at30.cropX - at144.cropX)).toBeLessThan(1);
  });
});

describe('ZoomEngine', () => {
  it('rests at the base zoom without clicks', () => {
    const z = new ZoomEngine(1.35, 1.95);
    expect(z.update(0).zoom).toBeCloseTo(1.35);
  });

  it('punches in after a click, holds, then returns to base', () => {
    const z = new ZoomEngine(1.35, 1.95);
    const t0 = performance.now();
    z.registerClick(100, 100);
    let zoom = 0;
    for (let t = 0; t <= 600; t += 16) zoom = z.update(t0 + t).zoom;
    expect(zoom).toBeGreaterThan(1.9);
    for (let t = 616; t <= 2500; t += 16) zoom = z.update(t0 + t).zoom;
    expect(zoom).toBeCloseTo(1.35, 2);
  });

  it('creates a click halo that expires', () => {
    const z = new ZoomEngine();
    const t0 = performance.now();
    z.registerClick(10, 20);
    expect(z.update(t0 + 10).halos).toHaveLength(1);
    expect(z.update(t0 + 1000).halos).toHaveLength(0);
  });

  it('adds a ripple without zooming in', () => {
    const z = new ZoomEngine(1.4, 1.95);
    const t0 = performance.now();
    z.addHalo(10, 20);
    const s = z.update(t0 + 300);
    expect(s.halos).toHaveLength(1);
    expect(s.zoom).toBeCloseTo(1.4);
  });
});
