import React from 'react';
import { X } from 'lucide-react';

interface ProgressBarProps {
  /** 0..1, or null/undefined for an indeterminate bar */
  value?: number | null;
  label: string;
  /** Extra text under the bar (size hint, step name) */
  detail?: string;
  onCancel?: () => void;
  cancelLabel?: string;
  className?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  label,
  detail,
  onCancel,
  cancelLabel = 'Cancel',
  className = ''
}) => {
  const determinate = typeof value === 'number' && Number.isFinite(value);
  const pct = determinate ? Math.round(Math.min(1, Math.max(0, value as number)) * 100) : undefined;
  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-2 text-xs text-slate-200 mb-1">
        <span>{label}</span>
        <span className="flex items-center gap-2">
          {pct !== undefined && <span className="font-mono">{pct}%</span>}
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="flex items-center gap-1 text-slate-300 hover:text-white underline cursor-pointer"
            >
              <X className="w-3 h-3" aria-hidden="true" />
              {cancelLabel}
            </button>
          )}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="h-2 rounded-full bg-white/10 overflow-hidden"
      >
        <div
          className={`h-full rounded-full bg-indigo-500 transition-[width] duration-200 ${determinate ? '' : 'w-1/3 animate-pulse'}`}
          style={determinate ? { width: `${pct}%` } : undefined}
        />
      </div>
      {detail && <p className="text-xs text-slate-400 mt-1">{detail}</p>}
    </div>
  );
};
