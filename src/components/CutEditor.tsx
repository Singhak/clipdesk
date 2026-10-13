import React, { useEffect, useRef, useState } from 'react';
import { Scissors } from 'lucide-react';
import { CutTimeline } from './cutTimeline';
import type { TimeRange } from '../core/cutList';

interface CutEditorProps {
  /** The preview video the timeline drives; cut parts are skipped while it plays */
  video: HTMLVideoElement | null;
  /** Length of the recording in seconds */
  duration: number;
  onChange: (kept: TimeRange[], cuts: TimeRange[]) => void;
}

/** React host for the shared cut timeline */
export const CutEditor: React.FC<CutEditorProps> = ({ video, duration, onChange }) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<CutTimeline | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!video || !hostRef.current) return;
    const timeline = new CutTimeline(hostRef.current, video, {
      playButton: true,
      onChange: (cuts, kept) => onChangeRef.current(kept, cuts),
      notify: setNotice
    });
    timelineRef.current = timeline;
    return () => {
      timeline.destroy();
      timelineRef.current = null;
    };
  }, [video]);

  useEffect(() => {
    timelineRef.current?.setDuration(duration);
  }, [duration, video]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  return (
    <div className="glass-card p-4 space-y-3 border border-indigo-500/20">
      <div className="flex items-center gap-2">
        <Scissors className="w-4 h-4 text-indigo-400" />
        <span className="text-xs font-bold text-white">Cut &amp; Trim</span>
        <span className="text-xs text-slate-400">
          Drag over any part, then Delete. Ctrl+Z undoes.
        </span>
      </div>
      <div ref={hostRef} />
      {notice && <p className="text-xs text-amber-300">{notice}</p>}
    </div>
  );
};
