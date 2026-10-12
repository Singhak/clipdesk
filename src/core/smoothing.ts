/** The frame interval the smoothing factors were tuned at */
const REFERENCE_FRAME_MS = 1000 / 60;

/**
 * Converts a per-frame lerp factor tuned at 60 FPS into the factor for a frame that took dtMs, so
 * easing covers the same distance per second at any frame rate. A null dt (first frame) uses the
 * factor as-is; long gaps (a stalled tab) are capped so the camera doesn't jump.
 */
export function frameLerp(factorAt60: number, dtMs: number | null): number {
  if (dtMs === null || !Number.isFinite(dtMs)) return factorAt60;
  const dt = Math.max(0, Math.min(100, dtMs));
  return 1 - Math.pow(1 - factorAt60, dt / REFERENCE_FRAME_MS);
}
