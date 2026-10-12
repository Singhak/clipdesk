/** A hand-picked 9:16 crop of the screen, stored as a normalized center plus a zoom (1 = full height). */
export interface FocusRegion {
  cx: number;
  cy: number;
  zoom: number;
}

export const DEFAULT_FOCUS: FocusRegion = { cx: 0.5, cy: 0.5, zoom: 1 };
export const MIN_FOCUS_ZOOM = 1;
export const MAX_FOCUS_ZOOM = 3;

/** Normalized (0..1) size of the 9:16 crop within a source of the given pixel size. */
export const focusSize = (zoom: number, srcW: number, srcH: number) => {
  const h = 1 / zoom;
  return { w: (h * srcH * 9) / 16 / srcW, h };
};

/** Keeps the crop inside the source and the zoom inside its range. */
export const clampFocus = (f: FocusRegion, srcW: number, srcH: number): FocusRegion => {
  const zoom = Math.min(MAX_FOCUS_ZOOM, Math.max(MIN_FOCUS_ZOOM, f.zoom));
  const { w, h } = focusSize(zoom, srcW, srcH);
  return {
    zoom,
    cx: Math.min(1 - w / 2, Math.max(w / 2, f.cx)),
    cy: Math.min(1 - h / 2, Math.max(h / 2, f.cy))
  };
};

/** The crop in source pixels, ready for drawImage. */
export const focusToCrop = (f: FocusRegion, srcW: number, srcH: number) => {
  const c = clampFocus(f, srcW, srcH);
  const { w, h } = focusSize(c.zoom, srcW, srcH);
  return {
    cropX: (c.cx - w / 2) * srcW,
    cropY: (c.cy - h / 2) * srcH,
    cropWidth: w * srcW,
    cropHeight: h * srcH
  };
};
