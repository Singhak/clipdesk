import { describe, expect, it } from 'vitest';
import { LayoutAgent, type RenderContext } from '../layoutAgent';
import type { WebcamConfig } from '../types';

/** A 2D context that records where text is drawn and ignores everything else */
function fakeContext(texts: { text: string; x: number }[]): CanvasRenderingContext2D {
  const gradient = { addColorStop() {} };
  const handler: ProxyHandler<object> = {
    get(target, prop) {
      if (prop in target) return (target as Record<string | symbol, unknown>)[prop];
      if (prop === 'measureText') return (text: string) => ({ width: text.length * 10 });
      if (prop === 'fillText') return (text: string, x: number) => texts.push({ text, x });
      if (typeof prop === 'string' && prop.startsWith('create')) return () => gradient;
      return () => undefined;
    },
    set(target, prop, value) {
      (target as Record<string | symbol, unknown>)[prop] = value;
      return true;
    }
  };
  return new Proxy({}, handler) as CanvasRenderingContext2D;
}

function watermarkX(webcamConfig: WebcamConfig): number {
  const texts: { text: string; x: number }[] = [];
  const ctx: RenderContext = {
    mode: 'widescreen',
    ctx: fakeContext(texts),
    canvasWidth: 1920,
    canvasHeight: 1080,
    source: {} as CanvasImageSource,
    sourceWidth: 1920,
    sourceHeight: 1080,
    camera: { cropX: 0, cropY: 0, cropWidth: 1920, cropHeight: 1080, zoom: 1, targetX: 960, targetY: 540 },
    halos: [],
    mousePos: { x: 0, y: 0 },
    showCursor: false,
    watermark: true,
    webcamSource: {} as CanvasImageSource,
    webcamWidth: 640,
    webcamHeight: 480,
    webcamConfig
  };
  LayoutAgent.renderFrame('widescreen', ctx);
  const mark = texts.find((t) => t.text === 'Made with ClipDesk');
  if (!mark) throw new Error('watermark not drawn');
  return mark.x;
}

const bubble = (x: number, y: number): WebcamConfig => ({
  enabled: true,
  size: 'medium',
  position: { x, y },
  presetPosition: 'custom'
});

describe('watermark placement', () => {
  it('stays bottom-right when the camera bubble is elsewhere', () => {
    expect(watermarkX(bubble(0.15, 0.2))).toBeGreaterThan(1920 / 2);
  });

  it('moves bottom-left when the camera bubble covers the bottom-right corner', () => {
    expect(watermarkX(bubble(0.95, 0.95))).toBeLessThan(1920 / 2);
  });
});
