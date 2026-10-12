import React from 'react';
import { WebcamConfig } from '../core/types';

interface Props {
  config: WebcamConfig;
  onUpdate: (updater: (prev: WebcamConfig) => WebcamConfig) => void;
  idPrefix: string;
}

/** Shape (circle / square) and free-size slider for the camera bubble. */
export const BubbleStyleControls: React.FC<Props> = ({ config, onUpdate, idPrefix }) => {
  const shape = config.shape ?? 'circle';
  const scale = config.scale ?? 1;
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-slate-400 text-[11px]">Shape:</span>
        <div className="flex items-center gap-1 bg-black/40 p-1 rounded-lg border border-white/5">
          {(['circle', 'square'] as const).map((s) => (
            <button
              type="button"
              key={s}
              id={`${idPrefix}-shape-${s}`}
              aria-pressed={shape === s}
              onClick={() => onUpdate((prev) => ({ ...prev, shape: s }))}
              className={`px-2.5 py-0.5 rounded text-[11px] font-bold capitalize transition-all cursor-pointer ${
                shape === s ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      <label className="flex items-center justify-between gap-3">
        <span className="text-slate-400 text-[11px] shrink-0">Fine size:</span>
        <input
          type="range"
          id={`${idPrefix}-scale`}
          min={0.6}
          max={1.6}
          step={0.05}
          value={scale}
          onChange={(e) => onUpdate((prev) => ({ ...prev, scale: Number(e.target.value) }))}
          className="flex-1 accent-indigo-500 cursor-pointer"
          aria-label="Camera bubble size"
        />
        <span className="text-[11px] font-mono text-slate-300 w-9 text-right">{Math.round(scale * 100)}%</span>
      </label>
    </div>
  );
};
