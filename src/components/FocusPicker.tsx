import React, { useEffect, useRef, useState } from 'react';
import {
  FocusRegion,
  MAX_FOCUS_ZOOM,
  MIN_FOCUS_ZOOM,
  clampFocus,
  focusSize
} from '../core/focusRegion';

interface FocusPickerProps {
  stream: MediaStream | null;
  /** Still picture of the screen, used when there is no live stream yet (desktop launcher) */
  image?: string;
  focus: FocusRegion;
  onChange: (f: FocusRegion) => void;
}

/** Live screen feed with a draggable 9:16 frame: whatever is inside the frame is what the reel records. */
export const FocusPicker: React.FC<FocusPickerProps> = ({ stream, image, focus, onChange }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [src, setSrc] = useState({ w: 1920, h: 1080 });
  const dragging = useRef(false);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.srcObject = stream;
    if (stream) v.play().catch(() => {});
  }, [stream]);

  const f = clampFocus(focus, src.w, src.h);
  const { w, h } = focusSize(f.zoom, src.w, src.h);

  const moveTo = (clientX: number, clientY: number) => {
    const r = boxRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return;
    onChange(
      clampFocus(
        { ...f, cx: (clientX - r.left) / r.width, cy: (clientY - r.top) / r.height },
        src.w,
        src.h
      )
    );
  };

  return (
    <div className="space-y-3">
      <div
        ref={boxRef}
        id="focus-picker-area"
        className="relative w-full overflow-hidden rounded-xl bg-black border border-white/10 touch-none cursor-move select-none"
        style={{ aspectRatio: `${src.w} / ${src.h}` }}
        onPointerDown={(e) => {
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          moveTo(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => dragging.current && moveTo(e.clientX, e.clientY)}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
      >
        {image && !stream ? (
          <img
            src={image}
            alt=""
            className="absolute inset-0 w-full h-full pointer-events-none"
            onLoad={(e) => {
              const i = e.currentTarget;
              if (i.naturalWidth > 0) setSrc({ w: i.naturalWidth, h: i.naturalHeight });
            }}
          />
        ) : (
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="absolute inset-0 w-full h-full pointer-events-none"
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              if (v.videoWidth > 0) setSrc({ w: v.videoWidth, h: v.videoHeight });
            }}
          />
        )}
        <div
          className="absolute border-2 border-indigo-400 rounded-sm pointer-events-none"
          style={{
            left: `${(f.cx - w / 2) * 100}%`,
            top: `${(f.cy - h / 2) * 100}%`,
            width: `${w * 100}%`,
            height: `${h * 100}%`,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.62)'
          }}
        >
          <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 -translate-y-full text-xs font-bold text-indigo-300 bg-black/70 px-1.5 rounded whitespace-nowrap">
            9:16 reel
          </span>
        </div>
      </div>
      <label className="flex items-center gap-3 text-xs text-slate-400">
        <span className="shrink-0">Zoom in:</span>
        <input
          type="range"
          id="focus-zoom"
          min={MIN_FOCUS_ZOOM}
          max={MAX_FOCUS_ZOOM}
          step={0.05}
          value={f.zoom}
          onChange={(e) => onChange(clampFocus({ ...f, zoom: Number(e.target.value) }, src.w, src.h))}
          className="flex-1 accent-indigo-500 cursor-pointer"
          aria-label="Zoom of the focus frame"
        />
        <span className="font-mono text-slate-300 w-10 text-right">{f.zoom.toFixed(2)}x</span>
      </label>
    </div>
  );
};
