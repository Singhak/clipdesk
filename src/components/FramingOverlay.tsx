import React from 'react';
import { Play, X } from 'lucide-react';
import { FocusPicker } from './FocusPicker';
import { FocusRegion } from '../core/focusRegion';

interface FramingOverlayProps {
  stream: MediaStream | null;
  focus: FocusRegion;
  onFocusChange: (f: FocusRegion) => void;
  /** True when the output is a vertical reel that uses the focus crop */
  usesFocus: boolean;
  isWide: boolean;
  onSelectFormat: (format: 'widescreen' | 'vertical') => void;
  onSelectFocusCrop: (on: boolean) => void;
  onStart: () => void;
  onCancel: () => void;
}

/** "Frame your shot": pick exactly which part of the screen the reel records, then start. */
export const FramingOverlay: React.FC<FramingOverlayProps> = ({
  stream,
  focus,
  onFocusChange,
  usesFocus,
  isWide,
  onSelectFormat,
  onSelectFocusCrop,
  onStart,
  onCancel
}) => (
  <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/90 backdrop-blur-xl p-4 overflow-y-auto animate-fadeIn">
    <button
      onClick={onCancel}
      className="absolute top-6 right-6 flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-slate-300 hover:text-white transition-all cursor-pointer"
    >
      <X className="w-4 h-4" aria-hidden="true" />
      <span>Cancel</span>
    </button>

    <div className="w-full max-w-2xl my-auto space-y-4">
      <div className="text-center">
        <h2 className="text-xl font-black text-white">Frame your shot</h2>
        <p className="text-xs text-slate-400 mt-1">
          {usesFocus
            ? 'Drag the 9:16 frame over the part of the screen that matters. Only what is inside it is recorded.'
            : isWide
              ? 'Widescreen records your whole screen.'
              : 'This layout shows your whole screen inside the reel.'}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
        <div className="flex items-center gap-1 p-1 rounded-xl bg-white/10 border border-white/10">
          {([
            { id: 'vertical' as const, label: '9:16 Vertical' },
            { id: 'widescreen' as const, label: '16:9 Widescreen' }
          ]).map((f) => (
            <button
              key={f.id}
              id={`framing-format-${f.id}`}
              onClick={() => onSelectFormat(f.id)}
              aria-pressed={(f.id === 'widescreen') === isWide}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                (f.id === 'widescreen') === isWide ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:text-white'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        {!isWide && (
          <div className="flex items-center gap-1 p-1 rounded-xl bg-white/10 border border-white/10">
            {([
              { on: true, label: 'Focus on an area' },
              { on: false, label: 'Whole screen' }
            ]).map((o) => (
              <button
                key={String(o.on)}
                id={`framing-crop-${o.on ? 'focus' : 'whole'}`}
                onClick={() => onSelectFocusCrop(o.on)}
                aria-pressed={usesFocus === o.on}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  usesFocus === o.on ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:text-white'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {usesFocus && <FocusPicker stream={stream} focus={focus} onChange={onFocusChange} />}

      <p className="text-xs text-slate-500 text-center">
        Tip: share a single window or tab for the clearest framing. You can still move the frame while recording.
      </p>

      <button
        id="btn-framing-start"
        onClick={onStart}
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl btn-primary text-base font-extrabold cursor-pointer"
      >
        <Play className="w-5 h-5" />
        <span>Start recording</span>
      </button>
    </div>
  </div>
);
