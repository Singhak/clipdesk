import React, { useState } from 'react';
import { Subtitles, Sparkles, Plus, Trash2, Edit3, Check } from 'lucide-react';
import {
  CaptionSegment,
  CaptionStyleId,
  CAPTION_STYLES,
  CaptionEngine
} from '../core/captionEngine';

interface CaptionsGeneratorProps {
  enabled: boolean;
  onToggleEnabled: (val: boolean) => void;
  styleId: CaptionStyleId;
  onSelectStyle: (val: CaptionStyleId) => void;
  segments: CaptionSegment[];
  onUpdateSegments: (segments: CaptionSegment[]) => void;
  durationSeconds: number;
}

export const CaptionsGenerator: React.FC<CaptionsGeneratorProps> = ({
  enabled,
  onToggleEnabled,
  styleId,
  onSelectStyle,
  segments,
  onUpdateSegments,
  durationSeconds
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const handleGenerateDefaults = () => {
    const generated = CaptionEngine.generateSmartCaptions(durationSeconds);
    onUpdateSegments(generated);
    onToggleEnabled(true);
  };

  const handleStartEdit = (seg: CaptionSegment) => {
    setEditingId(seg.id);
    setEditText(seg.text);
  };

  const handleSaveEdit = (id: string) => {
    onUpdateSegments(
      segments.map((s) => (s.id === id ? { ...s, text: editText.trim() } : s))
    );
    setEditingId(null);
  };

  const handleDeleteSegment = (id: string) => {
    onUpdateSegments(segments.filter((s) => s.id !== id));
  };

  const handleAddSegment = () => {
    const last = segments[segments.length - 1];
    const start = last ? Math.min(durationSeconds, last.endSec + 0.2) : 0;
    const end = Math.min(durationSeconds, start + 2.5);
    const newSeg: CaptionSegment = {
      id: `seg_${Date.now()}`,
      text: 'New viral subtitle',
      startSec: start,
      endSec: end,
      words: [{ word: 'New', startSec: start, endSec: start + 0.5 }, { word: 'viral', startSec: start + 0.6, endSec: start + 1.2 }, { word: 'subtitle', startSec: start + 1.3, endSec: end }]
    };
    onUpdateSegments([...segments, newSeg]);
  };

  return (
    <div className="glass-card p-4 space-y-4 border border-amber-500/20">
      {/* Header and Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Subtitles className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-bold text-white">Dynamic AI Animated Captions</span>
          <span className="text-[10px] text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20 font-semibold">
            +80% Viewer Retention
          </span>
        </div>

        <button
          type="button"
          onClick={() => onToggleEnabled(!enabled)}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            enabled
              ? 'bg-amber-500 text-black shadow-md shadow-amber-500/25'
              : 'bg-white/5 border border-white/10 text-slate-400 hover:text-white'
          }`}
        >
          <span>{enabled ? 'Captions Active' : 'Add Captions'}</span>
        </button>
      </div>

      <p className="text-[11px] text-slate-400 leading-relaxed">
        Over 75% of users watch Reels & Shorts on mute. Burn dynamic, karaoke-animated subtitles directly onto your video with zero external editing in CapCut or Submagic.
      </p>

      {enabled && (
        <div className="space-y-4 pt-2 border-t border-white/5 animate-fadeIn">
          {/* Style Selector Grid */}
          <div>
            <div className="text-[11px] font-semibold text-slate-300 mb-2">Caption Visual Style</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {Object.values(CAPTION_STYLES).map((s) => {
                const isSelected = styleId === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onSelectStyle(s.id)}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-amber-500/20 border-amber-500 text-white shadow-md'
                        : 'bg-black/40 border-white/5 text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <div className="text-xs font-bold">{s.name}</div>
                    <div className="text-[10px] text-slate-400 mt-1 line-clamp-1">{s.description}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Subtitle Segments List / Editor */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-slate-300">
                Captions Transcript ({segments.length} lines)
              </span>
              <div className="flex gap-2">
                {segments.length === 0 && (
                  <button
                    type="button"
                    onClick={handleGenerateDefaults}
                    className="flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300 cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>Auto-Generate Transcript</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleAddSegment}
                  className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add Line</span>
                </button>
              </div>
            </div>

            <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
              {segments.length === 0 ? (
                <div className="p-4 rounded-xl bg-black/30 border border-dashed border-white/10 text-center text-xs text-slate-500">
                  No captions added yet.{' '}
                  <button
                    onClick={handleGenerateDefaults}
                    className="text-amber-400 underline cursor-pointer"
                  >
                    Auto-generate initial lines
                  </button>
                </div>
              ) : (
                segments.map((seg) => (
                  <div
                    key={seg.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-black/40 border border-white/5 text-xs text-slate-300 hover:border-white/10 transition-colors"
                  >
                    <div className="flex items-center gap-2 flex-1 mr-2">
                      <span className="font-mono text-[10px] text-amber-400 shrink-0">
                        {seg.startSec.toFixed(1)}s:
                      </span>
                      {editingId === seg.id ? (
                        <input
                          type="text"
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit(seg.id)}
                          autoFocus
                          className="flex-1 bg-black/70 border border-amber-500/40 rounded px-2 py-0.5 text-xs text-white focus:outline-none"
                        />
                      ) : (
                        <span className="truncate">{seg.text}</span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {editingId === seg.id ? (
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(seg.id)}
                          className="p-1 text-emerald-400 hover:text-emerald-300 cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleStartEdit(seg)}
                          className="p-1 text-slate-400 hover:text-white cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDeleteSegment(seg.id)}
                        className="p-1 text-slate-500 hover:text-rose-400 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
