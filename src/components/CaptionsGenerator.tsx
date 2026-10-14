import React, { useState, useEffect, useRef } from 'react';
import {
  Subtitles,
  Sparkles,
  Plus,
  Trash2,
  Edit3,
  Check,
  Mic,
  MicOff,
  Type,
  AlignLeft,
  AlignCenter,
  AlignRight,
  MoveVertical,
  Palette,
  FileText,
  RotateCcw,
  Volume2,
  Sliders,
  ChevronDown,
  ChevronUp,
  Clock,
  Play,
  Zap,
  Key,
  Upload,
  Download,
  ExternalLink
} from 'lucide-react';
import {
  CaptionSegment,
  CaptionStyleId,
  CAPTION_STYLES,
  CaptionEngine,
  CaptionCustomSettings,
  DEFAULT_CAPTION_SETTINGS,
  CAPTION_BG_PRESETS,
  CAPTION_POSITION_PRESETS,
  CAPTION_SIZE_PRESETS,
  CaptionBgPreset,
  CaptionPositionPreset,
  CaptionSizePreset,
  CaptionAlignment,
  generateSegmentsFromText,
  colorWithAlpha,
  type LocalWhisperModel
} from '../core/captionEngine';
import { ConfirmDialog } from './Modal';
import { ProgressBar } from './ProgressBar';
import { friendlyError } from './friendlyError';

interface CaptionsGeneratorProps {
  enabled: boolean;
  onToggleEnabled: (val: boolean) => void;
  styleId: CaptionStyleId;
  onSelectStyle: (val: CaptionStyleId) => void;
  segments: CaptionSegment[];
  onUpdateSegments: (segments: CaptionSegment[]) => void;
  durationSeconds: number;
  customSettings?: CaptionCustomSettings;
  onUpdateSettings?: (settings: CaptionCustomSettings) => void;
  currentTime?: number;
  onSeek?: (sec: number) => void;
  recordedBlob?: Blob | null;
}

const SUPPORTED_LANGUAGES = [
  { code: 'en-US', label: 'English (US)' },
  { code: 'en-GB', label: 'English (UK)' },
  { code: 'es-ES', label: 'Spanish (Español)' },
  { code: 'fr-FR', label: 'French (Français)' },
  { code: 'de-DE', label: 'German (Deutsch)' },
  { code: 'it-IT', label: 'Italian (Italiano)' },
  { code: 'pt-BR', label: 'Portuguese (Brasil)' },
  { code: 'hi-IN', label: 'Hindi (हिन्दी)' },
  { code: 'ja-JP', label: 'Japanese (日本語)' }
];

export const CaptionsGenerator: React.FC<CaptionsGeneratorProps> = ({
  enabled,
  onToggleEnabled,
  styleId,
  onSelectStyle,
  segments,
  onUpdateSegments,
  durationSeconds,
  customSettings,
  onUpdateSettings,
  currentTime = 0,
  onSeek,
  recordedBlob
}) => {
  // Navigation tabs: 'whisper' | 'speech' | 'type' | 'style'
  const [activeTab, setActiveTab] = useState<'whisper' | 'speech' | 'type' | 'style'>('whisper');

  // --- 0. Whisper AI Transcription State ---
  const [whisperApiKey, setWhisperApiKey] = useState(() => localStorage.getItem('clipdesk_whisper_key') || '');
  const [whisperProvider, setWhisperProvider] = useState<'local' | 'groq' | 'openai'>(
    () => (localStorage.getItem('clipdesk_whisper_provider') as 'local' | 'groq' | 'openai') || 'local'
  );
  const [localWhisperModel, setLocalWhisperModel] = useState<LocalWhisperModel>(
    'Xenova/whisper-base'
  );
  const [localWhisperProgress, setLocalWhisperProgress] = useState<{ status: string; progress?: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [undoState, setUndoState] = useState<{ segments: CaptionSegment[]; label: string } | null>(null);
  const undoTimerRef = useRef<number | null>(null);
  const [whisperLang, setWhisperLang] = useState('auto');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [whisperError, setWhisperError] = useState<string | null>(null);
  const [whisperSuccess, setWhisperSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Internal settings state if not provided by parent
  const [localSettings, setLocalSettings] = useState<CaptionCustomSettings>(
    customSettings ?? DEFAULT_CAPTION_SETTINGS
  );
  const settings = customSettings ?? localSettings;

  const updateSettings = (patch: Partial<CaptionCustomSettings>) => {
    const updated = { ...settings, ...patch };
    setLocalSettings(updated);
    onUpdateSettings?.(updated);
  };

  // --- 1. Manual Typing State ---
  const [newText, setNewText] = useState('');
  const [newStartSec, setNewStartSec] = useState<number>(0);
  const [newEndSec, setNewEndSec] = useState<number>(2.5);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [isScriptModalOpen, setIsScriptModalOpen] = useState(false);
  const [typedScript, setTypedScript] = useState('');

  // Update default start time when segments change
  useEffect(() => {
    if (segments.length > 0) {
      const last = segments[segments.length - 1];
      const nextStart = Math.min(durationSeconds, Math.round((last.endSec + 0.1) * 10) / 10);
      setNewStartSec(nextStart);
      setNewEndSec(Math.min(durationSeconds, Math.round((nextStart + 2.5) * 10) / 10));
    } else {
      setNewStartSec(0);
      setNewEndSec(Math.min(durationSeconds, 2.5));
    }
  }, [segments, durationSeconds]);

  // --- 2. Web Speech API State ---
  const isSpeechSupported = CaptionEngine.isSpeechRecognitionSupported();
  const [isListening, setIsListening] = useState(false);
  const [speechLang, setSpeechLang] = useState('en-US');
  const [interimText, setInterimText] = useState('');
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [speechMode, setSpeechMode] = useState<'append' | 'replace'>('append');
  const recognitionRef = useRef<any>(null);

  // Stop speech recognition, transcription and the undo timer on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
    };
  }, []);

  const handleStartSpeech = () => {
    setSpeechError(null);
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      setSpeechError('Voice dictation is not supported in this browser. Use Chrome, Edge or Safari, or type the captions.');
      return;
    }

    try {
      const rec = new SpeechRec();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = speechLang;

      const sessionStartTime = Date.now();
      let workingSegments = speechMode === 'replace' ? [] : [...segments];

      rec.onstart = () => {
        setIsListening(true);
        setInterimText('');
      };

      rec.onresult = (event: any) => {
        let currentInterim = '';
        const nowSec = (Date.now() - sessionStartTime) / 1000;

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          const transcript = res[0].transcript.trim();

          if (res.isFinal) {
            if (transcript) {
              const lastSeg = workingSegments[workingSegments.length - 1];
              const segStart = lastSeg ? lastSeg.endSec + 0.2 : Math.max(0, nowSec - 2);
              const segEnd = Math.max(segStart + 1.5, nowSec);

              const wordsRaw = transcript.split(/\s+/).filter(Boolean);
              const wordStep = (segEnd - segStart) / Math.max(1, wordsRaw.length);
              const words = wordsRaw.map((w: string, idx: number) => ({
                word: w,
                startSec: segStart + idx * wordStep,
                endSec: segStart + (idx + 1) * wordStep
              }));

              const newSegment: CaptionSegment = {
                id: `voice_${Date.now()}_${i}`,
                text: transcript,
                startSec: Math.round(segStart * 10) / 10,
                endSec: Math.round(segEnd * 10) / 10,
                words
              };

              workingSegments = [...workingSegments, newSegment];
              onUpdateSegments(workingSegments);
              onToggleEnabled(true);
            }
          } else {
            currentInterim += transcript + ' ';
          }
        }

        setInterimText(currentInterim.trim());
      };

      rec.onerror = (e: any) => {
        console.warn('SpeechRecognition error:', e);
        if (e.error === 'not-allowed') {
          setSpeechError('Microphone permission denied. Please allow microphone access in your browser settings.');
        } else if (e.error === 'no-speech') {
          // No speech detected, ignore or keep listening
        } else {
          setSpeechError(friendlyError({ message: String(e.error) }, 'transcribe'));
        }
      };

      rec.onend = () => {
        setIsListening(false);
        setInterimText('');
      };

      recognitionRef.current = rec;
      rec.start();
    } catch (e: any) {
      console.error('Failed to launch Web Speech API:', e);
      setSpeechError(friendlyError(e, 'transcribe'));
      setIsListening(false);
    }
  };

  const handleStopSpeech = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    setIsListening(false);
    setInterimText('');
  };

  // --- Handlers: Whisper AI ---
  const handleTranscribeWithWhisper = async () => {
    setWhisperError(null);
    setWhisperSuccess(null);

    if (!recordedBlob || recordedBlob.size === 0) {
      setWhisperError('There is no recording to transcribe yet.');
      return;
    }

    if (whisperProvider === 'local') {
      setIsTranscribing(true);
      setLocalWhisperProgress({ status: 'Preparing your clip...' });
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const results = await CaptionEngine.transcribeWithLocalWhisper({
          blob: recordedBlob,
          model: localWhisperModel,
          language: whisperLang !== 'auto' ? whisperLang : undefined,
          onProgress: (p) => setLocalWhisperProgress(p),
          signal: controller.signal
        });

        if (!results || results.length === 0) {
          setWhisperError('No speech was detected in this clip.');
          return;
        }

        onUpdateSegments(results);
        onToggleEnabled(true);
        setWhisperSuccess(`Done. Created ${results.length} caption lines on your device.`);
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          setWhisperSuccess('Transcription cancelled.');
        } else {
          console.error('Local transcription error:', err);
          setWhisperError(friendlyError(err, 'transcribe'));
        }
      } finally {
        abortRef.current = null;
        setIsTranscribing(false);
        setLocalWhisperProgress(null);
      }
      return;
    }

    const key = whisperApiKey.trim();
    if (!key) {
      setWhisperError(
        `Enter your ${whisperProvider === 'groq' ? 'Groq' : 'OpenAI'} API key first. Free Groq keys take about 10 seconds to get at console.groq.com.`
      );
      return;
    }
    localStorage.setItem('clipdesk_whisper_key', key);
    localStorage.setItem('clipdesk_whisper_provider', whisperProvider);

    setIsTranscribing(true);
    try {
      const results = await CaptionEngine.transcribeWithWhisper({
        blob: recordedBlob,
        apiKey: key,
        provider: whisperProvider,
        language: whisperLang !== 'auto' ? whisperLang : undefined
      });

      if (!results || results.length === 0) {
        setWhisperError('No speech was detected in this clip.');
        return;
      }

      onUpdateSegments(results);
      onToggleEnabled(true);
      setWhisperSuccess(`Done. Created ${results.length} caption lines.`);
    } catch (err: any) {
      console.error('Transcription error:', err);
      setWhisperError(friendlyError(err, 'transcribe'));
    } finally {
      setIsTranscribing(false);
    }
  };

  // --- Handlers: Subtitle File Import (.srt / .vtt) ---
  const handleImportSubtitleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      if (!content) return;
      try {
        const parsed = CaptionEngine.parseSrtOrVtt(content);
        if (parsed.length > 0) {
          onUpdateSegments(parsed);
          onToggleEnabled(true);
          setWhisperSuccess(`Imported ${parsed.length} subtitle lines from ${file.name}.`);
        } else {
          setWhisperError('No timed subtitle lines were found in this file. Use an .srt or .vtt file.');
        }
      } catch (err: any) {
        setWhisperError('We could not read that subtitle file. Use a valid .srt or .vtt file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExportSrt = () => {
    if (segments.length === 0) return;
    const srtContent = CaptionEngine.exportToSrt(segments);
    const blob = new Blob([srtContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clipdesk_captions_${Date.now()}.srt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // --- Handlers: Manual Typing ---
  const handleAddTypedLine = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = newText.trim();
    if (!trimmed) return;

    const start = Math.max(0, newStartSec);
    const end = Math.max(start + 0.5, newEndSec);

    const wordsRaw = trimmed.split(/\s+/).filter(Boolean);
    const wordStep = (end - start) / Math.max(1, wordsRaw.length);
    const words = wordsRaw.map((w, idx) => ({
      word: w,
      startSec: start + idx * wordStep,
      endSec: start + (idx + 1) * wordStep
    }));

    const newSeg: CaptionSegment = {
      id: `typed_${Date.now()}`,
      text: trimmed,
      startSec: Math.round(start * 10) / 10,
      endSec: Math.round(end * 10) / 10,
      words
    };

    onUpdateSegments([...segments, newSeg]);
    setNewText('');
    onToggleEnabled(true);
  };

  const handleApplyScript = () => {
    if (!typedScript.trim()) return;
    const generated = generateSegmentsFromText(typedScript, durationSeconds);
    if (generated.length > 0) {
      onUpdateSegments(generated);
      onToggleEnabled(true);
      setIsScriptModalOpen(false);
      setTypedScript('');
    }
  };

  const handleStartEdit = (seg: CaptionSegment) => {
    setEditingId(seg.id);
    setEditText(seg.text);
  };

  const handleSaveEdit = (id: string) => {
    const trimmed = editText.trim();
    if (!trimmed) {
      handleDeleteSegment(id);
      return;
    }

    onUpdateSegments(
      segments.map((s) => {
        if (s.id !== id) return s;
        const wordsRaw = trimmed.split(/\s+/).filter(Boolean);
        const wordStep = (s.endSec - s.startSec) / Math.max(1, wordsRaw.length);
        const words = wordsRaw.map((w, idx) => ({
          word: w,
          startSec: s.startSec + idx * wordStep,
          endSec: s.startSec + (idx + 1) * wordStep
        }));
        return { ...s, text: trimmed, words };
      })
    );
    setEditingId(null);
  };

  const showUndo = (previous: CaptionSegment[], label: string) => {
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    setUndoState({ segments: previous, label });
    undoTimerRef.current = window.setTimeout(() => setUndoState(null), 8000);
  };

  const handleDeleteSegment = (id: string) => {
    showUndo(segments, 'Caption line deleted.');
    onUpdateSegments(segments.filter((s) => s.id !== id));
  };

  const handleUndo = () => {
    if (!undoState) return;
    onUpdateSegments(undoState.segments);
    setUndoState(null);
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
  };

  const handleDuplicateSegment = (seg: CaptionSegment) => {
    const shift = 0.5;
    const start = Math.min(durationSeconds, seg.endSec + 0.1);
    const end = Math.min(durationSeconds, start + (seg.endSec - seg.startSec));
    const newSeg: CaptionSegment = {
      ...seg,
      id: `dup_${Date.now()}`,
      startSec: start,
      endSec: end,
      words: seg.words.map((w) => ({
        ...w,
        startSec: w.startSec + shift,
        endSec: w.endSec + shift
      }))
    };
    onUpdateSegments([...segments, newSeg]);
  };

  const handleGenerateSmartDefaults = () => {
    const generated = CaptionEngine.generateSmartCaptions(durationSeconds);
    onUpdateSegments(generated);
    onToggleEnabled(true);
  };

  const handleClearAll = () => {
    showUndo(segments, 'All caption lines cleared.');
    onUpdateSegments([]);
  };

  // --- Handlers: Location Presets ---
  const handleSelectPositionPreset = (preset: Exclude<CaptionPositionPreset, 'custom'>) => {
    const cfg = CAPTION_POSITION_PRESETS[preset];
    updateSettings({
      positionPreset: preset,
      positionYRatio: cfg.ratio
    });
  };

  const handlePositionSliderChange = (ratio: number) => {
    // Check if slider matches any known preset
    let matchedPreset: CaptionPositionPreset = 'custom';
    for (const [key, val] of Object.entries(CAPTION_POSITION_PRESETS)) {
      if (Math.abs(val.ratio - ratio) < 0.02) {
        matchedPreset = key as CaptionPositionPreset;
        break;
      }
    }
    updateSettings({
      positionYRatio: ratio,
      positionPreset: matchedPreset
    });
  };

  // --- Handlers: Size Presets ---
  const handleSelectSizePreset = (preset: Exclude<CaptionSizePreset, 'custom'>) => {
    const cfg = CAPTION_SIZE_PRESETS[preset];
    updateSettings({
      sizePreset: preset,
      fontSize: cfg.fontSize
    });
  };

  const handleSizeSliderChange = (fontSize: number) => {
    let matchedPreset: CaptionSizePreset = 'custom';
    for (const [key, val] of Object.entries(CAPTION_SIZE_PRESETS)) {
      if (Math.abs(val.fontSize - fontSize) < 3) {
        matchedPreset = key as CaptionSizePreset;
        break;
      }
    }
    updateSettings({
      fontSize,
      sizePreset: matchedPreset
    });
  };

  // --- Handlers: Background Presets ---
  const handleSelectBgPreset = (preset: CaptionBgPreset) => {
    const cfg = CAPTION_BG_PRESETS[preset];
    updateSettings({
      bgPreset: preset,
      bgColor: cfg.color,
      bgOpacity: cfg.defaultOpacity
    });
  };

  return (
    <div className="glass-card p-4 space-y-4 border border-amber-500/25 shadow-xl relative overflow-hidden">
      {/* Subtle Glow Accent */}
      <div className="absolute top-0 right-0 w-48 h-48 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Header and Toggle */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400">
            <Subtitles className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white tracking-wide">
                Captions
              </span>
              <span className="text-xs text-amber-300 bg-amber-500/15 px-2 py-0.5 rounded-full border border-amber-500/30 font-bold">
                Boost watch time
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Auto-generate, dictate or type captions. Change position, size and background.
            </p>
          </div>
        </div>

        <button
          id="btn-toggle-captions"
          type="button"
          onClick={() => onToggleEnabled(!enabled)}
          aria-pressed={enabled}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            enabled
              ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/30 hover:bg-amber-400'
              : 'bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10'
          }`}
        >
          <span>{enabled ? 'Captions Active ✓' : '+ Enable Captions'}</span>
        </button>
      </div>

      {enabled && (
        <div className="space-y-4 pt-1 animate-fadeIn">
          {/* Main Navigation Tabs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 bg-black/50 rounded-xl border border-white/10">
            <button
              id="tab-whisper-captions"
              type="button"
              onClick={() => setActiveTab('whisper')}
              aria-pressed={activeTab === 'whisper'}
              className={`flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'whisper'
                  ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Auto captions</span>
              <span className="text-xs px-1.5 py-0.2 rounded-full bg-black/30 font-extrabold uppercase tracking-wider">
                Pro
              </span>
            </button>

            <button
              id="tab-speech-captions"
              type="button"
              onClick={() => setActiveTab('speech')}
              aria-pressed={activeTab === 'speech'}
              className={`flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'speech'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Mic className="w-3.5 h-3.5" />
              <span>Dictate</span>
              {isListening && (
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
              )}
            </button>

            <button
              id="tab-type-captions"
              type="button"
              onClick={() => setActiveTab('type')}
              aria-pressed={activeTab === 'type'}
              className={`flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'type'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Type className="w-3.5 h-3.5" />
              <span>Type / Import</span>
              {segments.length > 0 && (
                <span className="text-xs px-1.5 py-0.2 rounded-full bg-black/40 text-indigo-200">
                  {segments.length}
                </span>
              )}
            </button>

            <button
              id="tab-style-captions"
              type="button"
              onClick={() => setActiveTab('style')}
              aria-pressed={activeTab === 'style'}
              className={`flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'style'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Palette className="w-3.5 h-3.5" />
              <span>Style & Size</span>
            </button>
          </div>

          {/* =================================================================== */}
          {/* TAB 0: WHISPER AI TRANSCRIPTION (GROQ / OPENAI)                      */}
          {/* =================================================================== */}
          {activeTab === 'whisper' && (
            <div className="space-y-4 animate-fadeIn">
              {/* Header Box */}
              <div className="p-3.5 rounded-xl bg-gradient-to-r from-amber-500/10 via-black/40 to-indigo-500/10 border border-amber-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-amber-400" />
                      Automatic captions from your speech
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                      Word-by-word timing
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Turn the spoken audio in this clip into timed captions, on your device or with your own Groq or OpenAI key.
                  </p>
                </div>

                {recordedBlob ? (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs shrink-0 self-start sm:self-center">
                    <Check className="w-3.5 h-3.5" />
                    <span>Clip Ready ({(recordedBlob.size / 1024 / 1024).toFixed(1)} MB)</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-slate-400 text-xs shrink-0 self-start sm:self-center">
                    <span>No clip recorded yet</span>
                  </div>
                )}
              </div>

              {whisperError && (
                <div
                  role="alert"
                  className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 flex items-start justify-between gap-2"
                >
                  <span>{whisperError}</span>
                  <span className="flex items-center gap-3 shrink-0">
                    {recordedBlob && (
                      <button
                        type="button"
                        onClick={() => void handleTranscribeWithWhisper()}
                        disabled={isTranscribing}
                        className="underline font-bold text-rose-200 hover:text-white cursor-pointer disabled:opacity-50"
                      >
                        Try again
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setWhisperError(null)}
                      aria-label="Dismiss message"
                      className="text-rose-300 hover:text-rose-100 cursor-pointer font-bold text-xs"
                    >
                      ✕
                    </button>
                  </span>
                </div>
              )}

              {whisperSuccess && (
                <div
                  role="status"
                  className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 flex items-start justify-between gap-2"
                >
                  <span>{whisperSuccess}</span>
                  <button
                    type="button"
                    onClick={() => setWhisperSuccess(null)}
                    aria-label="Dismiss message"
                    className="text-emerald-400 hover:text-emerald-200 cursor-pointer font-bold text-xs"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Provider & Key Configuration Card */}
              <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-3.5">
                {/* Provider Selector */}
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                    How to create captions:
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setWhisperProvider('local')}
                      aria-pressed={whisperProvider === 'local'}
                      className={`p-2.5 rounded-lg border text-left cursor-pointer transition-all ${
                        whisperProvider === 'local'
                          ? 'bg-emerald-500/15 border-emerald-500/50 text-white shadow-sm shadow-emerald-500/20'
                          : 'bg-black/30 border-white/5 text-slate-400 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-emerald-300">On this device</span>
                        <span className="text-xs px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 font-bold">
                          No key needed
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Private: audio stays on your device. First use downloads about 40 MB once.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setWhisperProvider('groq')}
                      aria-pressed={whisperProvider === 'groq'}
                      className={`p-2.5 rounded-lg border text-left cursor-pointer transition-all ${
                        whisperProvider === 'groq'
                          ? 'bg-amber-500/15 border-amber-500/50 text-white'
                          : 'bg-black/30 border-white/5 text-slate-400 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-amber-300">Groq</span>
                        <span className="text-xs text-amber-400/80 font-mono">Ultra-Fast</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Very fast · needs a free Groq key
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setWhisperProvider('openai')}
                      aria-pressed={whisperProvider === 'openai'}
                      className={`p-2.5 rounded-lg border text-left cursor-pointer transition-all ${
                        whisperProvider === 'openai'
                          ? 'bg-indigo-500/15 border-indigo-500/50 text-white'
                          : 'bg-black/30 border-white/5 text-slate-400 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-indigo-300">OpenAI</span>
                        <span className="text-xs text-indigo-400/80 font-mono">Cloud</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Cloud · needs an OpenAI key (paid)
                      </p>
                    </button>
                  </div>
                </div>

                {/* Local Whisper Settings & Info */}
                {whisperProvider === 'local' ? (
                  <div className="space-y-2.5 p-3 rounded-lg bg-emerald-950/20 border border-emerald-500/20">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
                        <Check className="w-3.5 h-3.5" />
                        <span>No API key needed. Runs in your browser.</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <label htmlFor="select-local-whisper-model" className="text-xs text-slate-400">
                          Language model:
                        </label>
                        <select
                          id="select-local-whisper-model"
                          value={localWhisperModel}
                          onChange={(e: any) => setLocalWhisperModel(e.target.value)}
                          className="bg-black/60 border border-white/10 rounded-lg px-2 py-0.5 text-xs text-emerald-300 focus:outline-none"
                        >
                          <option value="Xenova/whisper-tiny.en">English only (~39 MB, fastest)</option>
                          <option value="Xenova/whisper-base">All languages (~80 MB, recommended)</option>
                          <option value="Xenova/whisper-small">All languages, best accuracy (~250 MB, slower)</option>
                        </select>
                      </div>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Your audio is processed inside your browser and never leaves your computer. After the first download the model is saved for quick reuse.
                    </p>

                    {/* Progress when transcribing */}
                    {localWhisperProgress && (
                      <ProgressBar
                        className="p-2.5 rounded-lg bg-black/60 border border-emerald-500/30 animate-fadeIn"
                        label={localWhisperProgress.status}
                        value={typeof localWhisperProgress.progress === 'number' ? localWhisperProgress.progress / 100 : null}
                        detail="The first time, a speech model (about 40 MB) is downloaded and saved in your browser. Later runs are faster."
                        onCancel={() => abortRef.current?.abort()}
                        cancelLabel="Cancel"
                      />
                    )}
                  </div>
                ) : (
                  /* Cloud API Key Input for Groq / OpenAI */
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label htmlFor="input-whisper-api-key" className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                        <Key className="w-3.5 h-3.5 text-amber-400" />
                        <span>{whisperProvider === 'groq' ? 'Groq' : 'OpenAI'} API Key:</span>
                      </label>
                      <a
                        href={whisperProvider === 'groq' ? 'https://console.groq.com/keys' : 'https://platform.openai.com/api-keys'}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1"
                      >
                        <span>Get Free API Key</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <input
                      id="input-whisper-api-key"
                      type="password"
                      value={whisperApiKey}
                      onChange={(e) => setWhisperApiKey(e.target.value)}
                      placeholder={whisperProvider === 'groq' ? 'gsk_...' : 'sk-...'}
                      className="w-full bg-black/60 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 font-mono"
                    />
                    <p className="text-xs text-slate-400">
                      Stored in this browser only. When you transcribe, the key and your audio are sent
                      directly to {whisperProvider === 'groq' ? 'Groq' : 'OpenAI'}, not to ClipDesk.
                    </p>
                  </div>
                )}

                {/* Audio Language & Transcribe Trigger Button */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                  <div className="flex items-center gap-2">
                    <label htmlFor="select-whisper-lang" className="text-xs text-slate-400">
                      Spoken Language:
                    </label>
                    <select
                      id="select-whisper-lang"
                      value={whisperLang}
                      onChange={(e) => setWhisperLang(e.target.value)}
                      className="bg-black/60 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-amber-300 focus:outline-none"
                    >
                      <option value="auto">🌐 Auto-Detect Language</option>
                      <option value="en">English (EN)</option>
                      <option value="es">Spanish (ES)</option>
                      <option value="fr">French (FR)</option>
                      <option value="de">German (DE)</option>
                      <option value="it">Italian (IT)</option>
                      <option value="pt">Portuguese (PT)</option>
                      <option value="hi">Hindi (HI)</option>
                      <option value="ja">Japanese (JA)</option>
                    </select>
                  </div>

                  <button
                    id="btn-run-whisper-transcribe"
                    type="button"
                    onClick={handleTranscribeWithWhisper}
                    disabled={
                      isTranscribing ||
                      !recordedBlob ||
                      (whisperProvider !== 'local' && !whisperApiKey.trim())
                    }
                    className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-40 text-black font-bold text-xs shadow-lg shadow-amber-500/20 cursor-pointer transition-all"
                  >
                    {isTranscribing ? (
                      <>
                        <span className="w-3 h-3 border-2 border-black border-t-transparent rounded-full animate-spin" />
                        <span>Creating captions...</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-3.5 h-3.5 fill-black" />
                        <span>
                          {whisperProvider === 'local'
                            ? 'Create captions on this device'
                            : 'Create captions'}
                        </span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* =================================================================== */}
          {/* TAB 1: TYPE CAPTIONS & SUBTITLES IMPORT/EXPORT                      */}
          {/* =================================================================== */}
          {activeTab === 'type' && (
            <div className="space-y-3.5 animate-fadeIn">
              {/* Quick Add Bar */}
              <form onSubmit={handleAddTypedLine} className="space-y-2 bg-black/40 p-3 rounded-xl border border-white/5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Edit3 className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Type Caption Line</span>
                  </span>

                  <div className="flex items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".srt,.vtt,text/plain"
                      onChange={handleImportSubtitleFile}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer"
                      title="Import external .SRT or .VTT subtitles"
                    >
                      <Upload className="w-3 h-3" />
                      <span>Import .SRT / .VTT</span>
                    </button>

                    {segments.length > 0 && (
                      <button
                        type="button"
                        onClick={handleExportSrt}
                        className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
                        title="Download captions as standard .SRT file"
                      >
                        <Download className="w-3 h-3" />
                        <span>Export .SRT</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setIsScriptModalOpen(!isScriptModalOpen)}
                      className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer"
                    >
                      <FileText className="w-3 h-3" />
                      <span>{isScriptModalOpen ? 'Hide Script Box' : 'Full Script Box'}</span>
                    </button>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    id="input-type-caption-text"
                    aria-label="Caption text"
                    type="text"
                    value={newText}
                    onChange={(e) => setNewText(e.target.value)}
                    placeholder="Type caption text (e.g. 'Build fast with ClipDesk')..."
                    className="flex-1 bg-black/60 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />

                  <div className="flex items-center gap-1.5">
                    <div className="flex items-center gap-1 bg-black/60 border border-white/10 rounded-lg px-2 py-1 text-xs text-slate-300">
                      <span className="text-slate-400 text-xs">Start:</span>
                      <input
                        type="number"
                        aria-label="Caption start time in seconds"
                        step="0.1"
                        min="0"
                        max={durationSeconds}
                        value={newStartSec}
                        onChange={(e) => setNewStartSec(parseFloat(e.target.value) || 0)}
                        className="w-12 bg-transparent text-amber-400 font-mono text-center focus:outline-none"
                      />
                      <span className="text-slate-400 text-xs">s</span>
                    </div>

                    <div className="flex items-center gap-1 bg-black/60 border border-white/10 rounded-lg px-2 py-1 text-xs text-slate-300">
                      <span className="text-slate-400 text-xs">End:</span>
                      <input
                        type="number"
                        aria-label="Caption end time in seconds"
                        step="0.1"
                        min="0.1"
                        max={durationSeconds}
                        value={newEndSec}
                        onChange={(e) => setNewEndSec(parseFloat(e.target.value) || 0)}
                        className="w-12 bg-transparent text-amber-400 font-mono text-center focus:outline-none"
                      />
                      <span className="text-slate-400 text-xs">s</span>
                    </div>

                    <button
                      id="btn-add-typed-caption"
                      type="submit"
                      disabled={!newText.trim()}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-bold transition-all cursor-pointer shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add</span>
                    </button>
                  </div>
                </div>
              </form>

              {/* Full Script Importer (Collapsible) */}
              {isScriptModalOpen && (
                <div className="p-3 rounded-xl bg-indigo-950/30 border border-indigo-500/30 space-y-2 animate-fadeIn">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Type or Paste Complete Script</span>
                    </span>
                    <span className="text-xs text-slate-400">
                      Evenly timed across {durationSeconds.toFixed(1)}s clip
                    </span>
                  </div>

                  <textarea
                    id="textarea-typed-script"
                    rows={4}
                    value={typedScript}
                    onChange={(e) => setTypedScript(e.target.value)}
                    placeholder="Type or paste your multi-line script here... Each line or sentence becomes a perfectly timed viral caption segment."
                    className="w-full bg-black/60 border border-white/10 rounded-lg p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-400 font-sans leading-relaxed"
                  />

                  <div className="flex items-center justify-between pt-1">
                    <button
                      type="button"
                      onClick={() => setTypedScript('')}
                      className="text-xs text-slate-400 hover:text-white cursor-pointer"
                    >
                      Clear
                    </button>

                    <button
                      id="btn-apply-typed-script"
                      type="button"
                      onClick={handleApplyScript}
                      disabled={!typedScript.trim()}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-bold transition-all cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Generate Captions from Script</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Subtitle Segments List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300">
                    Captions Transcript ({segments.length} segments)
                  </span>

                  <div className="flex items-center gap-2">
                    {segments.length === 0 ? (
                      <button
                        type="button"
                        onClick={handleGenerateSmartDefaults}
                        className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 cursor-pointer"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>Insert sample lines</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmClear(true)}
                        className="text-xs text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                      >
                        Clear All
                      </button>
                    )}
                  </div>
                </div>

                <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                  {segments.length === 0 ? (
                    <div className="p-4 rounded-xl bg-black/30 border border-dashed border-white/10 text-center text-xs text-slate-400">
                      No captions added yet.{' '}
                      <button
                        type="button"
                        onClick={handleGenerateSmartDefaults}
                        className="text-amber-400 underline cursor-pointer hover:text-amber-300"
                      >
                        Insert sample lines
                      </button>{' '}
                      or type above.
                    </div>
                  ) : (
                    segments.map((seg, idx) => (
                      <div
                        key={seg.id}
                        className="flex items-center justify-between p-2 rounded-lg bg-black/40 border border-white/5 text-xs text-slate-300 hover:border-white/10 transition-colors group"
                      >
                        <div className="flex items-center gap-2 flex-1 mr-2 min-w-0">
                          {/* Seek to time button */}
                          <button
                            type="button"
                            onClick={() => onSeek?.(seg.startSec)}
                            title={`Jump video to ${seg.startSec.toFixed(1)}s`}
                            className="font-mono text-xs text-amber-400 hover:text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 shrink-0 cursor-pointer"
                          >
                            {seg.startSec.toFixed(1)}s - {seg.endSec.toFixed(1)}s
                          </button>

                          {editingId === seg.id ? (
                            <input
                              type="text"
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveEdit(seg.id);
                                if (e.key === 'Escape') setEditingId(null);
                              }}
                              autoFocus
                              className="flex-1 bg-black/80 border border-amber-500/50 rounded px-2 py-0.5 text-xs text-white focus:outline-none"
                            />
                          ) : (
                            <span
                              onClick={() => handleStartEdit(seg)}
                              className="truncate cursor-text hover:text-white"
                              title="Click to edit text"
                            >
                              {seg.text}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {editingId === seg.id ? (
                            <button
                              type="button"
                              onClick={() => handleSaveEdit(seg.id)}
                              className="p-1 text-emerald-400 hover:text-emerald-300 cursor-pointer"
                              title="Save changes"
                              aria-label="Save changes"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleStartEdit(seg)}
                              className="p-1 text-slate-400 hover:text-white cursor-pointer"
                              title="Edit caption"
                              aria-label="Edit caption"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleDuplicateSegment(seg)}
                            className="p-1 text-slate-400 hover:text-indigo-400 cursor-pointer"
                            title="Duplicate line"
                            aria-label="Duplicate line"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteSegment(seg.id)}
                            className="p-1 text-slate-400 hover:text-rose-400 cursor-pointer"
                            title="Delete caption"
                            aria-label="Delete caption"
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

          {/* =================================================================== */}
          {/* TAB 2: WEB SPEECH API (SPEECH TO TEXT)                              */}
          {/* =================================================================== */}
          {activeTab === 'speech' && (
            <div className="space-y-4 animate-fadeIn">
              {/* Compatibility Notice */}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-black/30 border border-white/10">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      isSpeechSupported ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50' : 'bg-rose-500'
                    }`}
                  />
                  <span className="text-xs font-semibold text-white">
                    {isSpeechSupported ? 'Voice dictation available' : 'Voice dictation not available'}
                  </span>
                </div>
                <span className="text-xs text-slate-400">
                  {isSpeechSupported
                    ? 'Uses your browser\'s speech service (Chrome sends audio to Google)'
                    : 'Type captions instead'}
                </span>
              </div>

              {speechError && (
                <div
                  role="alert"
                  className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300"
                >
                  {speechError}
                </div>
              )}

              {/* Dictation Control Card */}
              <div className="p-4 rounded-xl bg-gradient-to-b from-black/60 to-black/30 border border-amber-500/20 text-center space-y-3">
                <div className="flex items-center justify-center gap-2">
                  <label htmlFor="select-speech-lang" className="text-xs text-slate-400">
                    Dictation Language:
                  </label>
                  <select
                    id="select-speech-lang"
                    value={speechLang}
                    onChange={(e) => setSpeechLang(e.target.value)}
                    disabled={isListening}
                    className="bg-black/60 border border-white/10 rounded-lg px-2 py-1 text-xs text-amber-300 focus:outline-none"
                  >
                    {SUPPORTED_LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Big Mic Button */}
                <div className="flex flex-col items-center justify-center py-2">
                  <button
                    id="btn-voice-dictation"
                    type="button"
                    onClick={isListening ? handleStopSpeech : handleStartSpeech}
                    aria-label={isListening ? 'Stop voice dictation' : 'Start voice dictation'}
                    className={`relative p-5 rounded-full transition-all cursor-pointer ${
                      isListening
                        ? 'bg-rose-500 text-white shadow-2xl shadow-rose-500/50 scale-105 animate-pulse'
                        : 'bg-amber-500 hover:bg-amber-400 text-black shadow-xl shadow-amber-500/25 hover:scale-105'
                    }`}
                  >
                    {isListening ? (
                      <MicOff className="w-7 h-7 animate-bounce" />
                    ) : (
                      <Mic className="w-7 h-7" />
                    )}
                  </button>

                  <div className="mt-3">
                    <span className="text-xs font-bold text-white block">
                      {isListening ? 'Listening to Microphone...' : 'Start Voice Dictation'}
                    </span>
                    <span className="text-xs text-slate-400">
                      {isListening ? 'Click button to stop dictation' : 'Click mic and speak clearly'}
                    </span>
                  </div>
                </div>

                {/* Interim Live Transcript */}
                {isListening && (
                  <div className="p-3 rounded-lg bg-black/70 border border-amber-500/40 text-left animate-fadeIn">
                    <div className="text-xs font-mono text-amber-400 flex items-center gap-1.5 mb-1">
                      <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                      <span>What we hear:</span>
                    </div>
                    <div className="text-xs text-white italic min-h-[20px]">
                      {interimText || 'Listening for speech input...'}
                    </div>
                  </div>
                )}

                {/* Speech Dictation Mode Option */}
                <div className="flex items-center justify-center gap-4 pt-1 text-xs text-slate-400">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="speechMode"
                      checked={speechMode === 'append'}
                      onChange={() => setSpeechMode('append')}
                      className="accent-amber-500"
                    />
                    <span>Append to existing lines</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="speechMode"
                      checked={speechMode === 'replace'}
                      onChange={() => setSpeechMode('replace')}
                      className="accent-amber-500"
                    />
                    <span>Start fresh transcript</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* =================================================================== */}
          {/* TAB 3: LOCATION, SIZE & BACKGROUND                                  */}
          {/* =================================================================== */}
          {activeTab === 'style' && (
            <div className="space-y-4 animate-fadeIn">
              {/* 1. LOCATION CONTROLS */}
              <div className="p-3.5 rounded-xl bg-black/40 border border-white/5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <MoveVertical className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Caption position</span>
                  </span>
                  <span className="text-xs font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                    {Math.round(settings.positionYRatio * 100)}% Y-Axis
                  </span>
                </div>

                {/* Location Presets */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                  {(
                    Object.keys(CAPTION_POSITION_PRESETS) as Array<
                      Exclude<CaptionPositionPreset, 'custom'>
                    >
                  ).map((presetKey) => {
                    const preset = CAPTION_POSITION_PRESETS[presetKey];
                    const isSelected = settings.positionPreset === presetKey;
                    return (
                      <button
                        key={presetKey}
                        type="button"
                        onClick={() => handleSelectPositionPreset(presetKey)}
                        aria-pressed={isSelected}
                        className={`p-2 rounded-lg border text-center transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-amber-500/20 border-amber-500 text-white font-bold shadow-md'
                            : 'bg-black/30 border-white/5 text-slate-400 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        <div className="text-xs">{preset.name}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{Math.round(preset.ratio * 100)}%</div>
                      </button>
                    );
                  })}
                </div>

                {/* Fine-tune Location Slider */}
                <div className="space-y-1 pt-1">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Top (10%)</span>
                    <span>Middle (50%)</span>
                    <span>Bottom (90%)</span>
                  </div>
                  <input
                    id="slider-caption-location"
                    aria-label="Caption vertical position"
                    type="range"
                    min="0.10"
                    max="0.90"
                    step="0.02"
                    value={settings.positionYRatio}
                    onChange={(e) => handlePositionSliderChange(parseFloat(e.target.value))}
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                </div>

                {/* Alignment */}
                <div className="flex items-center justify-between pt-1 border-t border-white/5">
                  <span className="text-xs text-slate-400">Text Alignment:</span>
                  <div className="flex items-center gap-1 bg-black/60 p-0.5 rounded-lg border border-white/10">
                    {(['left', 'center', 'right'] as CaptionAlignment[]).map((align) => {
                      const isSelected = settings.alignment === align;
                      return (
                        <button
                          key={align}
                          type="button"
                          onClick={() => updateSettings({ alignment: align })}
                          className={`p-1.5 rounded-md cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-amber-500 text-black shadow-sm'
                              : 'text-slate-400 hover:text-white'
                          }`}
                          title={`Align ${align}`}
                          aria-label={`Align ${align}`}
                          aria-pressed={isSelected}
                        >
                          {align === 'left' && <AlignLeft className="w-3.5 h-3.5" />}
                          {align === 'center' && <AlignCenter className="w-3.5 h-3.5" />}
                          {align === 'right' && <AlignRight className="w-3.5 h-3.5" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* 2. SIZE CONTROLS */}
              <div className="p-3.5 rounded-xl bg-black/40 border border-white/5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Caption size</span>
                  </span>
                  <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    {Math.round(settings.fontSize)}px
                  </span>
                </div>

                {/* Size Presets */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {(
                    Object.keys(CAPTION_SIZE_PRESETS) as Array<
                      Exclude<CaptionSizePreset, 'custom'>
                    >
                  ).map((sizeKey) => {
                    const preset = CAPTION_SIZE_PRESETS[sizeKey];
                    const isSelected = settings.sizePreset === sizeKey;
                    return (
                      <button
                        key={sizeKey}
                        type="button"
                        onClick={() => handleSelectSizePreset(sizeKey)}
                        aria-pressed={isSelected}
                        className={`p-2 rounded-lg border text-center transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-emerald-500/20 border-emerald-500 text-white font-bold shadow-md'
                            : 'bg-black/30 border-white/5 text-slate-400 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        <div className="text-xs">{preset.name}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{preset.label}</div>
                      </button>
                    );
                  })}
                </div>

                {/* Fine-tune Font Size Slider */}
                <div className="space-y-1 pt-1">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Compact (28px)</span>
                    <span>Standard (50px)</span>
                    <span>Heroic (84px)</span>
                  </div>
                  <input
                    id="slider-caption-size"
                    aria-label="Caption font size"
                    type="range"
                    min="28"
                    max="84"
                    step="2"
                    value={settings.fontSize}
                    onChange={(e) => handleSizeSliderChange(parseInt(e.target.value, 10))}
                    className="w-full accent-emerald-500 cursor-pointer"
                  />
                </div>
              </div>

              {/* 3. BACKGROUND CONTROLS */}
              <div className="p-3.5 rounded-xl bg-black/40 border border-white/5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Palette className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Caption background</span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-400">Opacity:</span>
                    <span className="text-xs font-mono text-indigo-400">
                      {Math.round(settings.bgOpacity * 100)}%
                    </span>
                  </div>
                </div>

                {/* Background Preset Color Chips */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(Object.keys(CAPTION_BG_PRESETS) as CaptionBgPreset[]).map((bgKey) => {
                    const preset = CAPTION_BG_PRESETS[bgKey];
                    const isSelected = settings.bgPreset === bgKey;
                    return (
                      <button
                        key={bgKey}
                        type="button"
                        onClick={() => handleSelectBgPreset(bgKey)}
                        aria-pressed={isSelected}
                        className={`flex items-center gap-2 p-2 rounded-lg border text-left transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-white/15 border-white text-white font-bold shadow-md'
                            : 'bg-black/40 border-white/5 text-slate-400 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        <span
                          className="w-3.5 h-3.5 rounded-full border border-white/20 shrink-0"
                          style={{
                            backgroundColor: preset.color === 'transparent' ? 'transparent' : preset.color,
                            boxShadow: preset.color === 'transparent' ? 'none' : '0 0 8px ' + preset.color
                          }}
                        />
                        <span className="text-xs truncate">{preset.name}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Custom Color & Opacity Sliders */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-white/5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 shrink-0">Custom Color:</span>
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        type="color"
                        aria-label="Caption background color"
                        value={settings.bgColor.startsWith('#') ? settings.bgColor : '#18181b'}
                        onChange={(e) =>
                          updateSettings({
                            bgColor: e.target.value,
                            bgPreset: 'custom'
                          })
                        }
                        className="w-7 h-7 rounded-lg border border-white/20 cursor-pointer bg-transparent"
                      />
                      <span className="font-mono text-xs text-slate-400">
                        {settings.bgColor}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 shrink-0">Box Opacity:</span>
                    <input
                      type="range"
                      aria-label="Caption box opacity"
                      min="0"
                      max="1"
                      step="0.05"
                      value={settings.bgOpacity}
                      onChange={(e) => updateSettings({ bgOpacity: parseFloat(e.target.value) })}
                      className="flex-1 accent-indigo-500 cursor-pointer"
                    />
                  </div>
                </div>

                {/* Corner Radius & Border Controls */}
                <div className="flex items-center justify-between pt-1 border-t border-white/5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">Corner shape:</span>
                    <div className="flex gap-1 text-xs">
                      {[
                        { label: 'Pill', radius: 14 },
                        { label: 'Box', radius: 8 },
                        { label: 'Sharp', radius: 2 }
                      ].map((item) => (
                        <button
                          key={item.label}
                          type="button"
                          onClick={() => updateSettings({ borderRadius: item.radius })}
                          className={`px-2 py-0.5 rounded border cursor-pointer ${
                            settings.borderRadius === item.radius
                              ? 'bg-indigo-600 border-indigo-400 text-white font-bold'
                              : 'bg-black/30 border-white/10 text-slate-400 hover:text-white'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.hasBorder}
                      onChange={(e) => updateSettings({ hasBorder: e.target.checked })}
                      className="accent-indigo-500"
                    />
                    <span>Subtle Border</span>
                  </label>
                </div>
              </div>

              {/* 4. VISUAL THEME SELECTION */}
              <div>
                <div className="text-xs font-semibold text-slate-300 mb-2">Caption look</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {Object.values(CAPTION_STYLES).map((s) => {
                    const isSelected = styleId === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => onSelectStyle(s.id)}
                        aria-pressed={isSelected}
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-amber-500/20 border-amber-500 text-white shadow-md'
                            : 'bg-black/40 border-white/5 text-slate-400 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        <div className="text-xs font-bold">{s.name}</div>
                        <div className="text-xs text-slate-400 mt-1 line-clamp-1">{s.description}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {undoState && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-800 border border-white/15 text-xs text-white"
        >
          <span>{undoState.label}</span>
          <button
            type="button"
            onClick={handleUndo}
            className="font-bold text-amber-300 hover:text-amber-200 underline cursor-pointer"
          >
            Undo
          </button>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmClear}
        title="Clear all captions?"
        message={`This removes all ${segments.length} caption lines. You can undo it right after.`}
        confirmLabel="Clear all"
        danger
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          setConfirmClear(false);
          handleClearAll();
        }}
      />
    </div>
  );
};
