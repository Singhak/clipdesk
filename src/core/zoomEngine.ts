import { ZoomIntensity } from './types';

export interface HaloEffect {
  id: string;
  x: number;
  y: number;
  startTime: number;
  durationMs: number;
  maxRadius: number;
  color: string;
}

export class ZoomEngine {
  private baseZoom: number = 1.35;
  private peakZoom: number = 1.95;
  private currentZoom: number = 1.35;
  private zoomTriggerTime: number = 0;
  private activeHalos: HaloEffect[] = [];

  // Screen Studio timing constants:
  // Attack (snappy punch-in): ~240ms
  // Hold (clear readability on mobile): ~750ms
  // Release (smooth cinematic glide): ~450ms
  private attackMs = 240;
  private holdMs = 750;
  private decayMs = 450;

  constructor(baseZoom = 1.35, peakZoom = 1.95) {
    this.baseZoom = baseZoom;
    this.peakZoom = peakZoom;
    this.currentZoom = baseZoom;
  }

  public setConfig(baseZoom: number, peakZoom: number): void {
    this.baseZoom = baseZoom;
    this.peakZoom = peakZoom;
  }

  public setIntensity(intensity: ZoomIntensity): void {
    const mult = intensity === 'subtle' ? 1.55 : intensity === 'ultra' ? 2.35 : 1.95;
    this.peakZoom = Math.max(this.baseZoom + 0.25, mult);
  }

  public registerClick(x: number, y: number, color = 'rgba(99, 102, 241, 0.85)'): void {
    const now = performance.now();
    // Retarget & extend: reset trigger time so consecutive clicks stay zoomed in seamlessly
    this.zoomTriggerTime = now;

    // Add high-production ripple halo
    this.activeHalos.push({
      id: Math.random().toString(36).substring(2, 9),
      x,
      y,
      startTime: now,
      durationMs: 700,
      maxRadius: 52,
      color
    });
  }

  public update(now: number = performance.now()): { zoom: number; halos: HaloEffect[] } {
    let targetZoom = this.baseZoom;

    if (this.zoomTriggerTime > 0) {
      const elapsed = now - this.zoomTriggerTime;
      const totalDuration = this.attackMs + this.holdMs + this.decayMs;

      if (elapsed < totalDuration) {
        if (elapsed <= this.attackMs) {
          // Snappy Ease-Out Quartic curve: rapid, punchy initial acceleration that settles smoothly
          const t = elapsed / this.attackMs;
          const progress = 1 - Math.pow(1 - t, 4);
          targetZoom = this.baseZoom + (this.peakZoom - this.baseZoom) * progress;
        } else if (elapsed <= this.attackMs + this.holdMs) {
          // Stable hold at peak zoom for crystal-clear readability
          targetZoom = this.peakZoom;
        } else {
          // Cinematic Ease-In-Out Sine decay back to base zoom
          const t = (elapsed - this.attackMs - this.holdMs) / this.decayMs;
          const progress = 0.5 * (1 - Math.cos(Math.PI * t));
          targetZoom = this.peakZoom - (this.peakZoom - this.baseZoom) * progress;
        }
      } else {
        this.zoomTriggerTime = 0;
        targetZoom = this.baseZoom;
      }
    }

    // Direct, responsive follow without sluggish exponential lag (0.35 lerp gives tactile micro-smoothness)
    this.currentZoom += (targetZoom - this.currentZoom) * 0.35;

    // Prune expired halos
    this.activeHalos = this.activeHalos.filter((h) => now - h.startTime < h.durationMs);

    return {
      zoom: this.currentZoom,
      halos: this.activeHalos
    };
  }

  public getActiveHalos(): HaloEffect[] {
    return this.activeHalos;
  }
}

