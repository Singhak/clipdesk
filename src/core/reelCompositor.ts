import { CameraAgent } from './cameraAgent';
import { ZoomEngine } from './zoomEngine';
import { FocusRegion, focusToCrop } from './focusRegion';
import { LayoutAgent } from './layoutAgent';
import { FrameSource } from './frameSource';
import { CameraState, LayoutMode, SmartFeatures, TemplateConfig, WebcamConfig } from './types';

export interface CompositorOptions {
  template: TemplateConfig;
  layoutMode: LayoutMode;
  smartFeatures: SmartFeatures;
  watermark: boolean;
  webcamConfig?: WebcamConfig;
  cameraOnly?: boolean;
  /** A hand-picked 9:16 crop (dynamic crop only). Replaces cursor following; clicks still zoom in. */
  focus?: FocusRegion | null;
  brandTitle?: string;
  creatorHandle?: string;
}

export interface FrameStats {
  zoom: number;
  cropX: number;
  cropY: number;
}

/**
 * Draws one reel frame: virtual camera (cursor follow, click zoom), layout, cursor highlight,
 * camera bubble and watermark. Shared by the web studio and the Chrome extension recorder.
 */
export class ReelCompositor {
  private opts: CompositorOptions;
  private camera!: CameraAgent;
  private zoom!: ZoomEngine;
  private cursor = { x: 960, y: 540 };
  private lastClick: { x: number; y: number } | null = null;
  private sourceSize = { width: 1920, height: 1080 };

  constructor(opts: CompositorOptions) {
    this.opts = opts;
    this.buildEngines();
  }

  private buildEngines(): void {
    const { template, smartFeatures } = this.opts;
    this.camera = new CameraAgent({
      sourceWidth: this.sourceSize.width,
      sourceHeight: this.sourceSize.height,
      smoothingFactor: smartFeatures.smoothCameraDamping ? template.smoothingFactor : 0.4,
      safeZoneRatio: template.safeZoneRatio
    });
    this.zoom = new ZoomEngine(template.defaultZoom, template.clickZoomMultiplier);
    if (smartFeatures.zoomIntensity) {
      this.zoom.setIntensity(smartFeatures.zoomIntensity);
    }
  }

  public setOptions(patch: Partial<CompositorOptions>): void {
    const prev = this.opts;
    this.opts = { ...prev, ...patch };
    if (
      this.opts.template !== prev.template ||
      this.opts.smartFeatures.smoothCameraDamping !== prev.smartFeatures.smoothCameraDamping
    ) {
      this.buildEngines();
    } else if (patch.smartFeatures?.zoomIntensity) {
      this.zoom.setIntensity(patch.smartFeatures.zoomIntensity);
    }
  }

  public getOptions(): CompositorOptions {
    return this.opts;
  }

  /** Cursor position in source pixels */
  public setCursor(x: number, y: number): void {
    this.cursor = { x, y };
  }

  /** A click in source pixels: moves the cursor there, centers camera, and triggers snappy zoom */
  public click(x: number, y: number): void {
    this.cursor = { x, y };
    if (!this.opts.smartFeatures.zoomOnClick) return;
    this.lastClick = { x, y };
    this.camera.focusPoint(x, y);
    this.zoom.registerClick(x, y);
  }

  public getSourceSize(): { width: number; height: number } {
    return this.sourceSize;
  }

  /** Draws into a context whose coordinate space is width x height. Returns null when there is no screen frame yet. */
  public render(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    screen: FrameSource | null,
    webcam: FrameSource | null,
    now: number = performance.now()
  ): FrameStats | null {
    const { template, layoutMode, smartFeatures, focus, webcamConfig, cameraOnly } = this.opts;

    if (screen && screen.width > 0) {
      this.sourceSize = { width: screen.width, height: screen.height };
      this.camera.setDimensions(screen.width, screen.height);
    }
    const sw = this.sourceSize.width;
    const sh = this.sourceSize.height;

    const zoomData = this.zoom.update(now);
    const activeZoom = smartFeatures.zoomOnClick ? zoomData.zoom : template.defaultZoom;

    const cursorX = smartFeatures.followMouse ? this.cursor.x : sw / 2;
    const cursorY = smartFeatures.followMouse ? this.cursor.y : sh / 2;
    let camera: CameraState = this.camera.update(cursorX, cursorY, activeZoom, now);

    if (focus && layoutMode === 'dynamic_crop') {
      camera = { ...camera, ...this.focusCrop(focus, activeZoom, sw, sh) };
    }

    const image = screen?.image ?? null;
    if (!image) {
      ctx.fillStyle = '#0a0d16';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#64748b';
      ctx.font = '14px Outfit, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Waiting for screen feed...', width / 2, height / 2);
      return null;
    }

    const webcamImage = webcam?.image ?? null;
    LayoutAgent.renderFrame(layoutMode, {
      mode: layoutMode,
      ctx,
      canvasWidth: width,
      canvasHeight: height,
      source: image,
      sourceWidth: sw,
      sourceHeight: sh,
      camera,
      halos: zoomData.halos,
      mousePos: this.cursor,
      showCursor: smartFeatures.cursorHighlight,
      watermark: this.opts.watermark,
      brandTitle: this.opts.brandTitle,
      creatorHandle: this.opts.creatorHandle,
      webcamSource: webcamImage,
      webcamWidth: webcam?.width,
      webcamHeight: webcam?.height,
      webcamConfig,
      cameraOnly
    });

    return { zoom: camera.zoom, cropX: camera.cropX, cropY: camera.cropY };
  }

  /**
   * The fixed focus crop, briefly zoomed in toward a click that landed inside it.
   * The click pulse is the zoom engine's output relative to its resting zoom.
   */
  private focusCrop(focus: FocusRegion, activeZoom: number, sw: number, sh: number) {
    const { template } = this.opts;
    const pulse = Math.max(1, activeZoom / template.defaultZoom);
    const peak = Math.max(1.0001, template.clickZoomMultiplier / template.defaultZoom);
    const k = Math.min(1, (pulse - 1) / (peak - 1));

    let { cx, cy } = focus;
    const base = focusToCrop(focus, sw, sh);
    const click = this.lastClick;
    if (
      k > 0 &&
      click &&
      click.x >= base.cropX &&
      click.x <= base.cropX + base.cropWidth &&
      click.y >= base.cropY &&
      click.y <= base.cropY + base.cropHeight
    ) {
      cx += (click.x / sw - cx) * k;
      cy += (click.y / sh - cy) * k;
    }
    const zoom = focus.zoom * pulse;
    return { ...focusToCrop({ cx, cy, zoom }, sw, sh), zoom };
  }
}
