import React from 'react';
import { WebcamConfig, CAMERA_PRESETS } from '../core/types';
import { CAMERA_BACKGROUNDS, type CameraBackgroundId } from '../core/cameraBackground';

interface Props {
  config: WebcamConfig;
  onUpdate: (updater: (prev: WebcamConfig) => WebcamConfig) => void;
  idPrefix: string;
}

/** A 3x3 grid to put the camera bubble in any of nine spots. Dragging on the preview still works too. */
export const CameraPositionGrid: React.FC<Props> = ({ config, onUpdate, idPrefix }) => (
  <div className="flex flex-col items-end gap-1">
  <div role="group" aria-label="Camera position" className="grid grid-cols-3 gap-1 w-[7.5rem] bg-black/40 p-1 rounded-lg border border-white/5">
    {CAMERA_PRESETS.map((preset) => {
      const active = config.presetPosition === preset.id;
      return (
        <button
          type="button"
          key={preset.id}
          id={`${idPrefix}-pos-${preset.id}`}
          aria-pressed={active}
          aria-label={preset.label}
          title={preset.label}
          onClick={() => onUpdate((prev) => ({ ...prev, position: preset.pos, presetPosition: preset.id }))}
          className={`h-8 rounded text-sm font-bold transition-all cursor-pointer ${
            active ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          {preset.arrow}
        </button>
      );
    })}
  </div>
  <span
    id={`${idPrefix}-pos-custom`}
    className={`text-[11px] font-semibold ${config.presetPosition === 'custom' ? 'text-indigo-300' : 'text-slate-500'}`}
  >
    {config.presetPosition === 'custom' ? '✋ Custom position (dragged)' : 'Or drag the bubble anywhere'}
  </span>
  </div>
);

/** Shape (circle / square), free-size slider and background for the camera bubble. */
export const BubbleStyleControls: React.FC<Props> = ({ config, onUpdate, idPrefix }) => {
  const shape = config.shape ?? 'circle';
  const scale = config.scale ?? 1;
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-slate-400 text-xs">Shape:</span>
        <div className="flex items-center gap-1 bg-black/40 p-1 rounded-lg border border-white/5">
          {(['circle', 'square'] as const).map((s) => (
            <button
              type="button"
              key={s}
              id={`${idPrefix}-shape-${s}`}
              aria-pressed={shape === s}
              onClick={() => onUpdate((prev) => ({ ...prev, shape: s }))}
              className={`px-2.5 py-0.5 rounded text-xs font-bold capitalize transition-all cursor-pointer ${
                shape === s ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      <label className="flex items-center justify-between gap-3">
        <span className="text-slate-400 text-xs shrink-0">Fine size:</span>
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
        <span className="text-xs font-mono text-slate-300 w-9 text-right">{Math.round(scale * 100)}%</span>
      </label>
      <label className="flex items-center justify-between gap-3">
        <span className="text-slate-400 text-xs shrink-0">Background:</span>
        <select
          id={`${idPrefix}-background`}
          value={config.background ?? 'none'}
          onChange={(e) => onUpdate((prev) => ({ ...prev, background: e.target.value as CameraBackgroundId }))}
          className="flex-1 bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-xs text-slate-200 cursor-pointer"
          title="Blurs or replaces what is behind you. Runs on this device."
        >
          {(Object.keys(CAMERA_BACKGROUNDS) as CameraBackgroundId[]).map((id) => (
            <option key={id} value={id} className="bg-slate-900">
              {CAMERA_BACKGROUNDS[id].label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
};
