import type { ImageSegmenter, MPMask } from '@mediapipe/tasks-vision';
import type { FrameSource } from './frameSource';

// Replaces or blurs the background behind the person in the camera bubble. MediaPipe's selfie
// segmenter finds the person on this device; the model and runtime ship with the app, so nothing
// is downloaded and camera frames never leave the device.

export type CameraBackgroundId = 'none' | 'blur' | 'studio' | 'indigo' | 'sunset' | 'white';

export const CAMERA_BACKGROUNDS: Record<CameraBackgroundId, { label: string; fill?: [string, string] }> = {
  none: { label: 'Off' },
  blur: { label: 'Blur' },
  studio: { label: 'Studio dark', fill: ['#1e293b', '#020617'] },
  indigo: { label: 'Indigo', fill: ['#6366f1', '#312e81'] },
  sunset: { label: 'Sunset', fill: ['#f97316', '#be185d'] },
  white: { label: 'Clean white', fill: ['#ffffff', '#e2e8f0'] }
};

/** Longest side the camera is composited at; the bubble is never drawn larger */
const MAX_SIDE = 480;
/** Longest side the segmenter sees. The mask is softened and scaled up, so this costs little detail
 * and keeps the per-frame cost low on weak GPUs */
const SEGMENT_SIDE = 256;
/** The bubble is recomposited at most this often; in between the last composite is reused */
const COMPOSITE_INTERVAL_MS = 1000 / 30;
/** Segmentation is the expensive step (about 10 ms on a weak GPU), so it runs at half that rate and
 * the frames in between reuse the latest mask */
const SEGMENT_INTERVAL_MS = 1000 / 15;

let segmenterPromise: Promise<ImageSegmenter> | null = null;
/** MediaPipe needs increasing timestamps per segmenter, and the segmenter is shared */
let lastTimestamp = 0;

/** Loads the segmenter once per page (GPU when available, CPU otherwise) */
function loadSegmenter(): Promise<ImageSegmenter> {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      const [{ ImageSegmenter }, loader, binary, model] = await Promise.all([
        import('@mediapipe/tasks-vision'),
        import('@mediapipe/tasks-vision/vision_wasm_internal.js?url'),
        import('@mediapipe/tasks-vision/vision_wasm_internal.wasm?url'),
        import('../assets/models/selfie_segmenter.tflite?url')
      ]);
      const own = (u: string) => new URL(u, location.href).href;
      const fileset = { wasmLoaderPath: own(loader.default), wasmBinaryPath: own(binary.default) };
      const create = (delegate: 'GPU' | 'CPU') =>
        ImageSegmenter.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: own(model.default), delegate },
          runningMode: 'VIDEO',
          outputConfidenceMasks: true,
          outputCategoryMask: false
        });
      try {
        return await create('GPU');
      } catch (err) {
        console.warn('Camera background: GPU segmentation unavailable, using the CPU', err);
        return create('CPU');
      }
    })().catch((err) => {
      segmenterPromise = null;
      throw err;
    });
  }
  return segmenterPromise;
}

const canvas = () => document.createElement('canvas');

/**
 * Wraps the camera feed: process() returns a frame source with the background replaced, or the
 * camera itself while the model loads or if segmentation isn't available on this device.
 */
export class CameraBackgroundProcessor implements FrameSource {
  private background: CameraBackgroundId = 'none';
  private segmenter: ImageSegmenter | null = null;
  private failed = false;
  private ready = false;
  private hasMask = false;
  private lastComposite = 0;
  private lastSegment = 0;

  private readonly frame = canvas();
  private readonly small = canvas();
  private readonly person = canvas();
  private readonly mask = canvas();
  private readonly out = canvas();
  private maskPixels: ImageData | null = null;

  constructor() {
    loadSegmenter().then(
      (s) => {
        this.segmenter = s;
      },
      (err) => {
        console.warn('Camera background is unavailable on this device:', err);
        this.failed = true;
      }
    );
  }

  setBackground(id: CameraBackgroundId): void {
    if (id === this.background) return;
    this.background = id;
    // A new choice shows from the next composite, not a stale one
    this.lastComposite = 0;
  }

  process(camera: FrameSource, now: number): FrameSource {
    if (this.background === 'none' || this.failed || !this.segmenter || !camera.image || camera.width <= 0) {
      return camera;
    }
    if (!this.ready || now - this.lastComposite >= COMPOSITE_INTERVAL_MS) {
      this.lastComposite = now;
      try {
        this.composite(camera, now);
      } catch (err) {
        console.warn('Camera background failed; showing the plain camera:', err);
        this.failed = true;
        return camera;
      }
    }
    return this.ready ? this : camera;
  }

  get image(): CanvasImageSource | null {
    return this.ready ? this.out : null;
  }

  get width(): number {
    return this.out.width;
  }

  get height(): number {
    return this.out.height;
  }

  stop(): void {
    this.ready = false;
  }

  private composite(camera: FrameSource, now: number): void {
    const scale = Math.min(1, MAX_SIDE / Math.max(camera.width, camera.height));
    const w = Math.max(1, Math.round(camera.width * scale));
    const h = Math.max(1, Math.round(camera.height * scale));
    for (const c of [this.frame, this.person, this.out]) {
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
    }

    const frameCtx = this.frame.getContext('2d')!;
    frameCtx.drawImage(camera.image!, 0, 0, w, h);

    const segScale = Math.min(1, SEGMENT_SIDE / Math.max(w, h));
    const sw = Math.max(1, Math.round(w * segScale));
    const sh = Math.max(1, Math.round(h * segScale));
    if (this.small.width !== sw || this.small.height !== sh) {
      this.small.width = sw;
      this.small.height = sh;
    }
    if (!this.hasMask || now - this.lastSegment >= SEGMENT_INTERVAL_MS) {
      this.lastSegment = now;
      this.small.getContext('2d')!.drawImage(this.frame, 0, 0, sw, sh);
      lastTimestamp = Math.max(lastTimestamp + 1, Math.round(now));
      this.segmenter!.segmentForVideo(this.small, lastTimestamp, (result) => {
        const masks = result.confidenceMasks;
        // The selfie model's last (or only) confidence mask is the person
        const personMask = masks?.[masks.length - 1];
        if (personMask) {
          this.drawMask(personMask);
          this.hasMask = true;
        }
      });
    }
    if (!this.hasMask) return;

    // The person, cut out with a slightly softened mask edge
    const personCtx = this.person.getContext('2d')!;
    personCtx.globalCompositeOperation = 'source-over';
    personCtx.clearRect(0, 0, w, h);
    personCtx.drawImage(this.frame, 0, 0);
    personCtx.globalCompositeOperation = 'destination-in';
    personCtx.filter = 'blur(1.5px)';
    personCtx.drawImage(this.mask, 0, 0, w, h);
    personCtx.filter = 'none';
    personCtx.globalCompositeOperation = 'source-over';

    const outCtx = this.out.getContext('2d')!;
    const fill = CAMERA_BACKGROUNDS[this.background].fill;
    if (fill) {
      const grad = outCtx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, fill[0]);
      grad.addColorStop(1, fill[1]);
      outCtx.fillStyle = grad;
      outCtx.fillRect(0, 0, w, h);
    } else {
      // Blur: drawn a little oversized so the blurred edges don't fade to transparent
      const pad = Math.round(w * 0.05);
      outCtx.filter = `blur(${Math.max(6, Math.round(w / 40))}px)`;
      outCtx.drawImage(this.frame, -pad, -pad, w + pad * 2, h + pad * 2);
      outCtx.filter = 'none';
    }
    outCtx.drawImage(this.person, 0, 0);
    this.ready = true;
  }

  /** Writes the person confidence into the alpha channel of the mask canvas */
  private drawMask(mask: MPMask): void {
    const { width, height } = mask;
    if (this.mask.width !== width || this.mask.height !== height || !this.maskPixels) {
      this.mask.width = width;
      this.mask.height = height;
      this.maskPixels = new ImageData(width, height);
    }
    const conf = mask.getAsFloat32Array();
    const px = this.maskPixels.data;
    for (let i = 0; i < conf.length; i++) {
      px[i * 4 + 3] = conf[i] * 255;
    }
    this.mask.getContext('2d')!.putImageData(this.maskPixels, 0, 0);
  }
}
