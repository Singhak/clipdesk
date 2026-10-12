import { CameraState } from './types';

export interface CameraOptions {
  sourceWidth: number;
  sourceHeight: number;
  smoothingFactor?: number; // 0.05 - 0.25
  safeZoneRatio?: number;   // 0.3 - 0.7
}

export class CameraAgent {
  private sourceWidth: number;
  private sourceHeight: number;
  private smoothingFactor: number;
  private safeZoneRatio: number;

  private currentCenterX: number;
  private currentCenterY: number;
  private targetCenterX: number;
  private targetCenterY: number;

  // Active click-focus boost timing
  private clickFocusUntil = 0;

  constructor(options: CameraOptions) {
    this.sourceWidth = options.sourceWidth || 1920;
    this.sourceHeight = options.sourceHeight || 1080;
    this.smoothingFactor = options.smoothingFactor ?? 0.14;
    this.safeZoneRatio = options.safeZoneRatio ?? 0.40;

    // Start centered
    this.currentCenterX = this.sourceWidth / 2;
    this.currentCenterY = this.sourceHeight / 2;
    this.targetCenterX = this.currentCenterX;
    this.targetCenterY = this.currentCenterY;
  }

  public setDimensions(width: number, height: number): void {
    if (width > 0 && height > 0) {
      this.sourceWidth = width;
      this.sourceHeight = height;
    }
  }

  public setSmoothing(factor: number): void {
    this.smoothingFactor = Math.max(0.01, Math.min(0.5, factor));
  }

  /**
   * Screen Studio-style Click Centering:
   * Pulls the camera center directly to the clicked point with a temporary speed boost.
   */
  public focusPoint(clickX: number, clickY: number): void {
    this.targetCenterX = clickX;
    this.targetCenterY = clickY;
    this.clickFocusUntil = performance.now() + 400;
  }

  public update(cursorX: number, cursorY: number, zoomLevel: number, now = performance.now()): CameraState {
    const zoom = Math.max(1.0, zoomLevel);

    // 9:16 aspect ratio: width = height * 9 / 16
    const baseHeight = this.sourceHeight;
    const cropHeight = baseHeight / zoom;
    const cropWidth = (cropHeight * 9) / 16;

    const isClickFocusActive = now < this.clickFocusUntil;

    if (!isClickFocusActive) {
      // Dead-zone calculation (inner bounding box) for mouse movement
      const deadZoneHalfW = (cropWidth * this.safeZoneRatio) / 2;
      const deadZoneHalfH = (cropHeight * this.safeZoneRatio) / 2;

      const deltaX = cursorX - this.targetCenterX;
      const deltaY = cursorY - this.targetCenterY;

      // Only nudge target when cursor leaves the safe deadzone
      if (Math.abs(deltaX) > deadZoneHalfW) {
        const shiftX = deltaX > 0 ? deltaX - deadZoneHalfW : deltaX + deadZoneHalfW;
        this.targetCenterX += shiftX;
      }

      if (Math.abs(deltaY) > deadZoneHalfH) {
        const shiftY = deltaY > 0 ? deltaY - deadZoneHalfH : deltaY + deadZoneHalfH;
        this.targetCenterY += shiftY;
      }
    }

    // Clamp target center to ensure crop never falls outside source bounds
    const minCenterX = cropWidth / 2;
    const maxCenterX = this.sourceWidth - cropWidth / 2;
    const minCenterY = cropHeight / 2;
    const maxCenterY = this.sourceHeight - cropHeight / 2;

    this.targetCenterX = Math.max(minCenterX, Math.min(maxCenterX, this.targetCenterX));
    this.targetCenterY = Math.max(minCenterY, Math.min(maxCenterY, this.targetCenterY));

    // Boost smoothing factor on click focus for immediate cinematic glide
    const effectiveSmoothing = isClickFocusActive ? 0.26 : this.smoothingFactor;

    // Smooth Lerp easing towards target
    this.currentCenterX += (this.targetCenterX - this.currentCenterX) * effectiveSmoothing;
    this.currentCenterY += (this.targetCenterY - this.currentCenterY) * effectiveSmoothing;

    // Derived top-left crop position
    const cropX = Math.max(0, Math.min(this.sourceWidth - cropWidth, this.currentCenterX - cropWidth / 2));
    const cropY = Math.max(0, Math.min(this.sourceHeight - cropHeight, this.currentCenterY - cropHeight / 2));

    return {
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      zoom,
      targetX: this.targetCenterX,
      targetY: this.targetCenterY
    };
  }

  public reset(): void {
    this.currentCenterX = this.sourceWidth / 2;
    this.currentCenterY = this.sourceHeight / 2;
    this.targetCenterX = this.currentCenterX;
    this.targetCenterY = this.currentCenterY;
    this.clickFocusUntil = 0;
  }
}

