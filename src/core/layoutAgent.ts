import { LayoutMode, CameraState, WebcamConfig } from './types';
import { HaloEffect } from './zoomEngine';

export interface RenderContext {
  mode: LayoutMode;
  ctx: CanvasRenderingContext2D;
  canvasWidth: number;
  canvasHeight: number;
  source: CanvasImageSource;
  sourceWidth: number;
  sourceHeight: number;
  camera: CameraState;
  halos: HaloEffect[];
  mousePos: { x: number; y: number };
  showCursor: boolean;
  watermark: boolean;
  watermarkText?: string;
  brandTitle?: string;
  creatorHandle?: string;
  webcamSource?: CanvasImageSource | null;
  webcamWidth?: number;
  webcamHeight?: number;
  webcamConfig?: WebcamConfig;
  /** Camera-only recording: the source is the webcam and fills the whole frame */
  cameraOnly?: boolean;
}

export class LayoutAgent {
  public static renderFrame(mode: LayoutMode, ctxObj: RenderContext): void {
    ctxObj.mode = mode;
    const { ctx, canvasWidth, canvasHeight } = ctxObj;

    ctx.save();
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    if (ctxObj.cameraOnly) {
      LayoutAgent.renderCameraOnly(ctxObj);
      if (ctxObj.watermark) LayoutAgent.renderWatermark(ctxObj);
      ctx.restore();
      return;
    }

    switch (mode) {
      case 'widescreen':
        LayoutAgent.renderWidescreen(ctxObj);
        break;
      case 'dynamic_crop':
        LayoutAgent.renderDynamicCrop(ctxObj);
        break;
      case 'blur_backdrop':
        LayoutAgent.renderBlurBackdrop(ctxObj);
        break;
      case 'gradient_mesh':
        LayoutAgent.renderGradientMesh(ctxObj);
        break;
      case 'brand_canvas':
        LayoutAgent.renderBrandCanvas(ctxObj);
        break;
      default:
        LayoutAgent.renderBlurBackdrop(ctxObj);
    }

    // Halos and cursor are mapped through the vertical camera crop, so they don't apply to widescreen
    if (mode !== 'widescreen') {
      LayoutAgent.renderHalos(ctxObj);

      if (ctxObj.showCursor) {
        LayoutAgent.renderCursor(ctxObj);
      }
    }

    // Render Circular Webcam Bubble (PiP) if enabled
    if (ctxObj.webcamConfig?.enabled && ctxObj.webcamSource) {
      LayoutAgent.renderWebcamBubble(ctxObj);
    }

    // Render Watermark if required (Free Tier)
    if (ctxObj.watermark) {
      LayoutAgent.renderWatermark(ctxObj);
    }

    ctx.restore();
  }

  /** Camera-only: cover-fill the frame with the (mirrored) camera feed. */
  private static renderCameraOnly(o: RenderContext): void {
    const { ctx, canvasWidth, canvasHeight, source, sourceWidth, sourceHeight, webcamConfig } = o;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    const scale = Math.max(canvasWidth / sourceWidth, canvasHeight / sourceHeight);
    const w = sourceWidth * scale;
    const h = sourceHeight * scale;
    ctx.save();
    ctx.translate(canvasWidth / 2, canvasHeight / 2);
    if (webcamConfig?.mirror !== false) ctx.scale(-1, 1);
    ctx.drawImage(source, 0, 0, sourceWidth, sourceHeight, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  /** Loom-style: the whole screen, uncropped, letterboxed if the source aspect ratio differs. */
  private static renderWidescreen(o: RenderContext): void {
    const { ctx, canvasWidth, canvasHeight, source, sourceWidth, sourceHeight } = o;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    const scale = Math.min(canvasWidth / sourceWidth, canvasHeight / sourceHeight);
    const w = sourceWidth * scale;
    const h = sourceHeight * scale;
    ctx.drawImage(source, 0, 0, sourceWidth, sourceHeight, (canvasWidth - w) / 2, (canvasHeight - h) / 2, w, h);
  }

  private static renderDynamicCrop(o: RenderContext): void {
    const { ctx, canvasWidth, canvasHeight, source, camera } = o;
    // Draw source crop directly scaled to full 9:16 canvas
    ctx.drawImage(
      source,
      camera.cropX,
      camera.cropY,
      camera.cropWidth,
      camera.cropHeight,
      0,
      0,
      canvasWidth,
      canvasHeight
    );
  }

  private static readonly BACKDROP_SHORT_SIDE = 320;
  private static readonly BACKDROP_REFRESH_MS = 100;
  private static backdropAt = -Infinity;
  private static backdrop: HTMLCanvasElement | OffscreenCanvas | null = null;
  private static layers = new Map<string, HTMLCanvasElement | OffscreenCanvas>();

  private static makeCanvas(width: number, height: number): HTMLCanvasElement | OffscreenCanvas | null {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    return c;
  }

  private static backdropCanvas(width: number, height: number): HTMLCanvasElement | OffscreenCanvas | null {
    LayoutAgent.backdrop ??= LayoutAgent.makeCanvas(width, height);
    const c = LayoutAgent.backdrop;
    if (c && (c.width !== width || c.height !== height)) {
      c.width = width;
      c.height = height;
      LayoutAgent.backdropAt = -Infinity;
    }
    return c;
  }

  /**
   * Paints the parts of a layout that never change (backgrounds, drop shadows) once, at the
   * output resolution, and reuses them every frame. Shadow blurs are among the most expensive
   * canvas operations, and redrawing them 30 times a second costs integrated GPUs whole frames.
   */
  private static drawCachedLayer(
    ctx: CanvasRenderingContext2D,
    key: string,
    width: number,
    height: number,
    paint: (g: CanvasRenderingContext2D) => void
  ): void {
    const t = ctx.getTransform();
    const sx = Math.hypot(t.a, t.b) || 1;
    const sy = Math.hypot(t.c, t.d) || 1;
    const pw = Math.round(width * sx);
    const ph = Math.round(height * sy);
    const fullKey = `${key}:${pw}x${ph}`;
    let layer = LayoutAgent.layers.get(fullKey);
    if (!layer) {
      const made = LayoutAgent.makeCanvas(pw, ph);
      if (!made) {
        paint(ctx);
        return;
      }
      const g = made.getContext('2d') as CanvasRenderingContext2D;
      g.scale(sx, sy);
      paint(g);
      LayoutAgent.layers.set(fullKey, made);
      layer = made;
    }
    ctx.drawImage(layer, 0, 0, width, height);
  }

  private static renderBlurBackdrop(o: RenderContext): void {
    const { ctx, canvasWidth, canvasHeight, source, sourceWidth, sourceHeight } = o;

    // 1. Draw blurred, stretched background
    // Scale up to cover canvas
    const bgScale = Math.max(canvasWidth / sourceWidth, canvasHeight / sourceHeight) * 1.25;
    const bgW = sourceWidth * bgScale;
    const bgH = sourceHeight * bgScale;
    const bgX = (canvasWidth - bgW) / 2;
    const bgY = (canvasHeight - bgH) / 2;

    // Blur a reduced copy and scale it up: looks the same as a 28px blur at full size, but costs a
    // fraction (a full-size blur can take hundreds of ms per frame on integrated GPUs). The copy
    // stays above ~256x256, because Chrome keeps smaller canvases on the CPU and would then read
    // the whole screen frame back from the GPU on every draw.
    const k = Math.max(1, Math.min(canvasWidth, canvasHeight) / LayoutAgent.BACKDROP_SHORT_SIDE);
    const small = LayoutAgent.backdropCanvas(Math.ceil(canvasWidth / k), Math.ceil(canvasHeight / k));
    if (small) {
      // A blurred backdrop barely changes between frames; re-blur it 10 times a second
      const now = performance.now();
      if (now - LayoutAgent.backdropAt >= LayoutAgent.BACKDROP_REFRESH_MS || now < LayoutAgent.backdropAt) {
        LayoutAgent.backdropAt = now;
        const sctx = small.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
        sctx.filter = `blur(${28 / k}px) brightness(0.65)`;
        sctx.drawImage(source, bgX / k, bgY / k, bgW / k, bgH / k);
        sctx.filter = 'none';
      }
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(small, 0, 0, canvasWidth, canvasHeight);
      ctx.restore();
    } else {
      ctx.save();
      ctx.filter = 'blur(28px) brightness(0.65)';
      ctx.drawImage(source, bgX, bgY, bgW, bgH);
      ctx.restore();
    }

    // 2. Crisp foreground video card, centered
    const margin = 16;
    const targetW = canvasWidth - margin * 2;
    const targetH = (targetW * 9) / 16; // 16:9 ratio card
    const targetX = margin;
    const targetY = (canvasHeight - targetH) / 2;
    const radius = 16;

    // Dark overlay gradient and the card's drop shadow never change: cache them
    LayoutAgent.drawCachedLayer(ctx, 'blur-overlay', canvasWidth, canvasHeight, (g) => {
      const grad = g.createLinearGradient(0, 0, 0, canvasHeight);
      grad.addColorStop(0, 'rgba(10, 11, 16, 0.45)');
      grad.addColorStop(0.5, 'rgba(10, 11, 16, 0.2)');
      grad.addColorStop(1, 'rgba(10, 11, 16, 0.6)');
      g.fillStyle = grad;
      g.fillRect(0, 0, canvasWidth, canvasHeight);
      g.shadowColor = 'rgba(0, 0, 0, 0.6)';
      g.shadowBlur = 24;
      g.shadowOffsetY = 8;
      LayoutAgent.drawRoundedRect(g, targetX, targetY, targetW, targetH, radius);
      g.fillStyle = '#000';
      g.fill();
    });

    ctx.save();
    LayoutAgent.drawRoundedRect(ctx, targetX, targetY, targetW, targetH, radius);
    ctx.clip();
    ctx.drawImage(source, 0, 0, sourceWidth, sourceHeight, targetX, targetY, targetW, targetH);
    ctx.restore();

    // Border stroke around card
    ctx.save();
    LayoutAgent.drawRoundedRect(ctx, targetX, targetY, targetW, targetH, radius);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  private static renderGradientMesh(o: RenderContext): void {
    const { ctx, canvasWidth, canvasHeight, source, sourceWidth, sourceHeight } = o;

    // Centered crisp video card
    const margin = 20;
    const targetW = canvasWidth - margin * 2;
    const targetH = (targetW * 9) / 16;
    const targetX = margin;
    const targetY = (canvasHeight - targetH) / 2;
    const radius = 18;

    // Background gradient and the card's glow never change: cache them
    LayoutAgent.drawCachedLayer(ctx, 'gradient-mesh', canvasWidth, canvasHeight, (g) => {
      const grad = g.createLinearGradient(0, 0, canvasWidth, canvasHeight);
      grad.addColorStop(0, '#0f172a');
      grad.addColorStop(0.5, '#1e1b4b');
      grad.addColorStop(1, '#311042');
      g.fillStyle = grad;
      g.fillRect(0, 0, canvasWidth, canvasHeight);
      g.shadowColor = 'rgba(99, 102, 241, 0.35)';
      g.shadowBlur = 28;
      g.shadowOffsetY = 6;
      LayoutAgent.drawRoundedRect(g, targetX, targetY, targetW, targetH, radius);
      g.fillStyle = '#000';
      g.fill();
    });

    ctx.save();
    LayoutAgent.drawRoundedRect(ctx, targetX, targetY, targetW, targetH, radius);
    ctx.clip();
    ctx.drawImage(source, 0, 0, sourceWidth, sourceHeight, targetX, targetY, targetW, targetH);
    ctx.restore();

    // Glowing border
    ctx.save();
    LayoutAgent.drawRoundedRect(ctx, targetX, targetY, targetW, targetH, radius);
    ctx.strokeStyle = 'rgba(168, 85, 247, 0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  private static renderBrandCanvas(o: RenderContext): void {
    const { ctx, canvasWidth, canvasHeight, source, sourceWidth, sourceHeight, brandTitle, creatorHandle } = o;

    // Dark sleek background
    ctx.fillStyle = '#0a0d14';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Header brand banner
    ctx.save();
    ctx.font = 'bold 20px Outfit, sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'center';
    ctx.fillText(brandTitle || 'Quick Dev Tip', canvasWidth / 2, 70);

    ctx.font = '13px Outfit, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(creatorHandle || '@reelscreen_creator', canvasWidth / 2, 95);
    ctx.restore();

    // Centered video
    const margin = 16;
    const targetW = canvasWidth - margin * 2;
    const targetH = (targetW * 9) / 16;
    const targetX = margin;
    const targetY = (canvasHeight - targetH) / 2;

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 20;
    const radius = 14;
    LayoutAgent.drawRoundedRect(ctx, targetX, targetY, targetW, targetH, radius);
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.clip();
    ctx.drawImage(source, 0, 0, sourceWidth, sourceHeight, targetX, targetY, targetW, targetH);
    ctx.restore();

    // Footer tag
    ctx.save();
    ctx.font = '500 12px JetBrains Mono, monospace';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.textAlign = 'center';
    ctx.fillText('⚡ Follow for daily tutorials', canvasWidth / 2, canvasHeight - 60);
    ctx.restore();
  }

  private static renderHalos(o: RenderContext): void {
    const { ctx, canvasWidth, canvasHeight, halos, camera, mode, sourceWidth, sourceHeight } = o;
    const now = performance.now();

    for (const halo of halos) {
      const elapsed = now - halo.startTime;
      if (elapsed > halo.durationMs) continue;

      const progress = elapsed / halo.durationMs;
      const currentRadius = halo.maxRadius * (0.3 + 0.7 * progress);
      const opacity = Math.max(0, 1 - progress);

      // Map source coordinates to vertical canvas
      let screenX = halo.x;
      let screenY = halo.y;

      if (mode === 'dynamic_crop') {
        const scaleX = canvasWidth / camera.cropWidth;
        const scaleY = canvasHeight / camera.cropHeight;
        screenX = (halo.x - camera.cropX) * scaleX;
        screenY = (halo.y - camera.cropY) * scaleY;
      } else {
        const margin = 16;
        const targetW = canvasWidth - margin * 2;
        const targetH = (targetW * 9) / 16;
        const targetX = margin;
        const targetY = (canvasHeight - targetH) / 2;
        screenX = targetX + (halo.x / sourceWidth) * targetW;
        screenY = targetY + (halo.y / sourceHeight) * targetH;
      }

      ctx.save();
      ctx.shadowColor = `rgba(99, 102, 241, ${opacity * 0.7})`;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(screenX, screenY, currentRadius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(129, 140, 248, ${opacity * 0.95})`;
      ctx.lineWidth = Math.max(2, 3.5 * (1 - progress * 0.5));
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(screenX, screenY, Math.max(3, currentRadius * 0.35), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(168, 85, 247, ${opacity * 0.45})`;
      ctx.fill();
      ctx.restore();
    }
  }

  private static renderCursor(o: RenderContext): void {
    const { ctx, canvasWidth, canvasHeight, mousePos, camera, mode, sourceWidth, sourceHeight } = o;
    let cx = mousePos.x;
    let cy = mousePos.y;

    if (mode === 'dynamic_crop') {
      const scaleX = canvasWidth / camera.cropWidth;
      const scaleY = canvasHeight / camera.cropHeight;
      cx = (mousePos.x - camera.cropX) * scaleX;
      cy = (mousePos.y - camera.cropY) * scaleY;
    } else {
      const margin = 16;
      const targetW = canvasWidth - margin * 2;
      const targetH = (targetW * 9) / 16;
      const targetX = margin;
      const targetY = (canvasHeight - targetH) / 2;
      cx = targetX + (mousePos.x / sourceWidth) * targetW;
      cy = targetY + (mousePos.y / sourceHeight) * targetH;
    }

    if (cx < 0 || cx > canvasWidth || cy < 0 || cy > canvasHeight) return;

    // Glowing cursor dot
    ctx.save();
    ctx.shadowColor = 'rgba(99, 102, 241, 0.8)';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#6366f1';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();
  }

  private static renderWatermark(o: RenderContext): void {
    const { ctx, canvasWidth, canvasHeight } = o;
    const text = 'Made with ReelScreen';

    ctx.save();
    const padX = 12;
    const padY = 6;
    const x = canvasWidth - 16;
    const y = canvasHeight - 24;

    ctx.font = '600 11px Outfit, sans-serif';
    const textWidth = ctx.measureText(text).width;

    // Pill background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    LayoutAgent.drawRoundedRect(
      ctx,
      x - textWidth - padX * 2,
      y - 14 - padY,
      textWidth + padX * 2,
      22,
      11
    );
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Text
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'right';
    ctx.fillText(text, x - padX, y);
    ctx.restore();
  }

  public static getWebcamMetrics(
    canvasWidth: number,
    canvasHeight: number,
    webcamConfig: WebcamConfig
  ): { cx: number; cy: number; radius: number } {
    let radiusRatio = 0.14; // medium
    if (webcamConfig.size === 'small') radiusRatio = 0.10;
    else if (webcamConfig.size === 'large') radiusRatio = 0.19;

    // Bubble size is relative to the short edge of a vertical frame, or 67% of the height in widescreen
    const base = canvasWidth > canvasHeight ? canvasHeight * 0.67 : canvasWidth;
    const radius = Math.round(base * radiusRatio * Math.min(1.6, Math.max(0.6, webcamConfig.scale ?? 1)));
    const margin = radius + Math.max(10, Math.round(base * 0.025));

    let cx = webcamConfig.position.x * canvasWidth;
    let cy = webcamConfig.position.y * canvasHeight;

    cx = Math.max(margin, Math.min(canvasWidth - margin, cx));
    cy = Math.max(margin, Math.min(canvasHeight - margin, cy));

    return { cx, cy, radius };
  }

  private static renderWebcamBubble(o: RenderContext): void {
    const { ctx, canvasWidth, canvasHeight, webcamSource, webcamConfig } = o;
    if (!webcamConfig || !webcamConfig.enabled || !webcamSource) return;

    const { cx, cy, radius } = LayoutAgent.getWebcamMetrics(canvasWidth, canvasHeight, webcamConfig);
    const square = webcamConfig.shape === 'square';
    const shapePath = (r: number) => {
      if (square) LayoutAgent.drawRoundedRect(ctx, cx - r, cy - r, r * 2, r * 2, r * 0.22);
      else {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
      }
    };

    ctx.save();

    // 1. Soft Drop Shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
    ctx.shadowBlur = Math.round(radius * 0.4);
    ctx.shadowOffsetY = Math.round(radius * 0.15);
    shapePath(radius);
    ctx.fillStyle = '#070a14';
    ctx.fill();
    ctx.restore();

    // 2. Circular Clipped Webcam Feed
    ctx.save();
    shapePath(radius - 1);
    ctx.clip();

    // Determine native source dimensions
    const srcW = o.webcamWidth || 640;
    const srcH = o.webcamHeight || 480;
    const cropDim = Math.min(srcW, srcH);
    const sx = (srcW - cropDim) / 2;
    const sy = (srcH - cropDim) / 2;

    ctx.save();
    ctx.translate(cx, cy);
    if (webcamConfig.mirror !== false) {
      ctx.scale(-1, 1);
    }
    ctx.drawImage(
      webcamSource,
      sx,
      sy,
      cropDim,
      cropDim,
      -radius,
      -radius,
      radius * 2,
      radius * 2
    );
    ctx.restore();

    // Subtle edge vignette
    const innerVignette = ctx.createRadialGradient(cx, cy, radius * 0.75, cx, cy, radius);
    innerVignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    innerVignette.addColorStop(1, 'rgba(0, 0, 0, 0.4)');
    ctx.fillStyle = innerVignette;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

    ctx.restore(); // End Circular Clip

    // 3. Neon / Studio Glow Ring
    ctx.save();
    shapePath(radius);
    const ringGrad = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
    ringGrad.addColorStop(0, '#6366f1');
    ringGrad.addColorStop(0.5, '#ec4899');
    ringGrad.addColorStop(1, '#06b6d4');
    ctx.strokeStyle = ringGrad;
    ctx.lineWidth = Math.max(3, Math.round(canvasWidth * 0.007));
    ctx.shadowColor = 'rgba(99, 102, 241, 0.45)';
    ctx.shadowBlur = 12;
    ctx.stroke();
    ctx.restore();

    // 4. Studio Live Badge Tag at bottom of circle
    const badgeW = Math.round(radius * 0.9);
    const badgeH = Math.max(16, Math.round(radius * 0.22));
    const badgeX = cx - badgeW / 2;
    const badgeY = cy + radius - badgeH * 0.55;

    ctx.save();
    ctx.fillStyle = 'rgba(7, 10, 20, 0.9)';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 8;
    LayoutAgent.drawRoundedRect(ctx, badgeX, badgeY, badgeW, badgeH, badgeH / 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Green glowing dot
    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.arc(badgeX + badgeH * 0.65, badgeY + badgeH / 2, Math.max(2.5, badgeH * 0.18), 0, Math.PI * 2);
    ctx.fill();

    // Text
    ctx.fillStyle = '#f8fafc';
    ctx.font = `800 ${Math.max(9, Math.round(badgeH * 0.52))}px Outfit, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('LIVE CAM', cx + badgeH * 0.25, badgeY + badgeH / 2);

    ctx.restore();
    ctx.restore();
  }

  private static drawRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}
