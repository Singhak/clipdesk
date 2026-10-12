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
  colorWithAlpha
} from '../core/captionEngine';

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
  const [localWhisperModel, setLocalWhisperModel] = useState<'Xenova/whisper-tiny.en' | 'Xenova/whisper-tiny'>(
    'Xenova/whisper-tiny.en'
  );
  const [localWhisperProgress, setLocalWhisperProgress] = useState<{ status: string; progress?: number } | null>(null);
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

  // Stop speech recognition on unmount
  useEffect(() => {
    return () => {
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
      setSpeechError('Web Speech API is not supported in this browser. Please use Chrome, Edge, or Safari.');
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
          setSpeechError(`Speech recognition notice: ${e.error}`);
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
      setSpeechError(e?.message || 'Could not start speech recognition.');
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
      setWhisperError('No recorded video/audio track available to transcribe.');
      return;
    }

    if (whisperProvider === 'local') {
      setIsTranscribing(true);
      setLocalWhisperProgress({ status: 'Initializing local Whisper.wasm engine...', progress: 10 });
      try {
        const results = await CaptionEngine.transcribeWithLocalWhisper({
          blob: recordedBlob,
          model: localWhisperModel,
          language: whisperLang !== 'auto' ? whisperLang : undefined,
          onProgress: (p) => setLocalWhisperProgress(p)
        });

        if (!results || results.length === 0) {
          setWhisperError('Local Whisper completed, but no spoken audio was detected in this clip.');
          return;
        }

        onUpdateSegments(results);
        onToggleEnabled(true);
        setWhisperSuccess(
          `🎉 Success! Local Whisper.wasm transcribed ${results.length} lines on your device with 0 API keys!`
        );
      } catch (err: any) {
        console.error('Local Whisper error:', err);
        setWhisperError(err?.message || 'Failed to transcribe audio locally with Whisper.');
      } finally {
        setIsTranscribing(false);
        setLocalWhisperProgress(null);
      }
      return;
    }

    const key = whisperApiKey.trim();
    if (!key) {
      setWhisperError(
        `Please enter your ${whisperProvider === 'groq' ? 'Groq' : 'OpenAI'} API key. Free Groq keys take 10 seconds at console.groq.com.`
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
        setWhisperError('Whisper completed, but no spoken audio was detected in this clip.');
        return;
      }

      onUpdateSegments(results);
      onToggleEnabled(true);
      setWhisperSuccess(`🎉 Success! Transcribed ${results.length} timestamped caption lines from your video.`);
    } catch (err: any) {
      console.error('Whisper transcription error:', err);
      setWhisperError(err?.message || 'Failed to transcribe audio with Whisper.');
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
          setWhisperSuccess(`✓ Imported ${parsed.length} subtitle lines from ${file.name}!`);
        } else {
          setWhisperError('No timestamped subtitle segments found in this file.');
        }
      } catch (err: any) {
        setWhisperError('Could not parse subtitle file: ' + err.message);
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

  const handleDeleteSegment = (id: string) => {
    onUpdateSegments(segments.filter((s) => s.id !== id));
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
                Dynamic Captions Studio
              </span>
              <span className="text-[10px] text-amber-300 bg-amber-500/15 px-2 py-0.5 rounded-full border border-amber-500/30 font-bold">
                +80% Viewer Retention
              </span>
            </div>
            <p className="text-[10px] text-slate-400">
              Type subtitles or dictate with Web Speech API · Fully customizable location, size & background
            </p>
          </div>
        </div>

        <button
          id="btn-toggle-captions"
          type="button"
          onClick={() => onToggleEnabled(!enabled)}
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
              className={`flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'whisper'
                  ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Whisper AI</span>
              <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-black/30 font-extrabold uppercase tracking-wider">
                Pro
              </span>
            </button>

            <button
              id="tab-speech-captions"
              type="button"
              onClick={() => setActiveTab('speech')}
              className={`flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'speech'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Mic className="w-3.5 h-3.5" />
              <span>Web Speech</span>
              {isListening && (
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
              )}
            </button>

            <button
              id="tab-type-captions"
              type="button"
              onClick={() => setActiveTab('type')}
              className={`flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'type'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Type className="w-3.5 h-3.5" />
              <span>Type / SRT</span>
              {segments.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/40 text-indigo-200">
                  {segments.length}
                </span>
              )}
            </button>

            <button
              id="tab-style-captions"
              type="button"
              onClick={() => setActiveTab('style')}
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
                      Automatic Speech-To-Text (Whisper AI)
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                      Word-Level Precision
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Accurately transcribe spoken audio from this video take using Groq or OpenAI Whisper.
                    Zero audio stored on servers — calls run client-side.
                  </p>
                </div>

                {recordedBlob ? (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[11px] shrink-0 self-start sm:self-center">
                    <Check className="w-3.5 h-3.5" />
                    <span>Clip Ready ({(recordedBlob.size / 1024 / 1024).toFixed(1)} MB)</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-slate-400 text-[11px] shrink-0 self-start sm:self-center">
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
                  <button
                    type="button"
                    onClick={() => setWhisperError(null)}
                    className="text-rose-400 hover:text-rose-200 cursor-pointer font-bold text-xs"
                  >
                    ✕
                  </button>
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
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1.5">
                    Whisper AI Engine:
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setWhisperProvider('local')}
                      className={`p-2.5 rounded-lg border text-left cursor-pointer transition-all ${
                        whisperProvider === 'local'
                          ? 'bg-emerald-500/15 border-emerald-500/50 text-white shadow-sm shadow-emerald-500/20'
                          : 'bg-black/30 border-white/5 text-slate-400 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-emerald-300">Local Whisper</span>
                        <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 font-bold">
                          Zero Key
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        Runs in your browser · audio stays on device (~40 MB model download once)
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setWhisperProvider('groq')}
                      className={`p-2.5 rounded-lg border text-left cursor-pointer transition-all ${
                        whisperProvider === 'groq'
                          ? 'bg-amber-500/15 border-amber-500/50 text-white'
                          : 'bg-black/30 border-white/5 text-slate-400 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-amber-300">Groq Whisper</span>
                        <span className="text-[9px] text-amber-400/80 font-mono">Ultra-Fast</span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        whisper-large-v3-turbo · Free tier key
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setWhisperProvider('openai')}
                      className={`p-2.5 rounded-lg border text-left cursor-pointer transition-all ${
                        whisperProvider === 'openai'
                          ? 'bg-indigo-500/15 border-indigo-500/50 text-white'
                          : 'bg-black/30 border-white/5 text-slate-400 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-indigo-300">OpenAI Whisper</span>
                        <span className="text-[9px] text-indigo-400/80 font-mono">Cloud</span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        whisper-1 · OpenAI API credits
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
                        <span>Zero API Key Required (Runs via WebAssembly ONNX)</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <label htmlFor="select-local-whisper-model" className="text-[10px] text-slate-400">
                          Neural Model:
                        </label>
                        <select
                          id="select-local-whisper-model"
                          value={localWhisperModel}
                          onChange={(e: any) => setLocalWhisperModel(e.target.value)}
                          className="bg-black/60 border border-white/10 rounded-lg px-2 py-0.5 text-xs text-emerald-300 focus:outline-none"
                        >
                          <option value="Xenova/whisper-tiny.en">whisper-tiny.en (English, ~39MB Fast)</option>
                          <option value="Xenova/whisper-tiny">whisper-tiny (Multilingual, ~39MB)</option>
                        </select>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      Audio is processed directly inside your browser using client-side WebAssembly. Zero data leaves your computer.
                      Once loaded, models are saved in browser cache for instantaneous re-use.
                    </p>

                    {/* Progress Bar when transcribing */}
                    {localWhisperProgress && (
                      <div className="p-2.5 rounded-lg bg-black/60 border border-emerald-500/30 space-y-1.5 animate-fadeIn">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-emerald-300 font-semibold flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                            {localWhisperProgress.status}
                          </span>
                          <span className="text-emerald-400 font-mono">{localWhisperProgress.progress ?? 0}%</span>
                        </div>
                        <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-gradient-to-r from-emerald-500 to-amber-500 h-full transition-all duration-300"
                            style={{ width: `${Math.min(100, Math.max(5, localWhisperProgress.progress ?? 5))}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Cloud API Key Input for Groq / OpenAI */
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label htmlFor="input-whisper-api-key" className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                        <Key className="w-3.5 h-3.5 text-amber-400" />
                        <span>{whisperProvider === 'groq' ? 'Groq' : 'OpenAI'} API Key:</span>
                      </label>
                      <a
                        href={whisperProvider === 'groq' ? 'https://console.groq.com/keys' : 'https://platform.openai.com/api-keys'}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-amber-400 hover:text-amber-300 flex items-center gap-1"
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
                    <p className="text-[10px] text-slate-500">
                      Stored in this browser only. When you transcribe, the key and your audio are sent
                      directly to {whisperProvider === 'groq' ? 'Groq' : 'OpenAI'}, not to ClipDesk.
                    </p>
                  </div>
                )}

                {/* Audio Language & Transcribe Trigger Button */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                  <div className="flex items-center gap-2">
                    <label htmlFor="select-whisper-lang" className="text-[11px] text-slate-400">
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
                        <span>Transcribing Clip...</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-3.5 h-3.5 fill-black" />
                        <span>
                          {whisperProvider === 'local'
                            ? 'Transcribe Locally (Whisper.wasm)'
                            : 'Transcribe Video Audio'}
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
                  <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
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
                      className="text-[11px] text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer"
                      title="Import external .SRT or .VTT subtitles"
                    >
                      <Upload className="w-3 h-3" />
                      <span>Import .SRT / .VTT</span>
                    </button>

                    {segments.length > 0 && (
                      <button
                        type="button"
                        onClick={handleExportSrt}
                        className="text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
                        title="Download captions as standard .SRT file"
                      >
                        <Download className="w-3 h-3" />
                        <span>Export .SRT</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setIsScriptModalOpen(!isScriptModalOpen)}
                      className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer"
                    >
                      <FileText className="w-3 h-3" />
                      <span>{isScriptModalOpen ? 'Hide Script Box' : 'Full Script Box'}</span>
                    </button>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    id="input-type-caption-text"
                    type="text"
                    value={newText}
                    onChange={(e) => setNewText(e.target.value)}
                    placeholder="Type caption text (e.g. 'Build fast with ClipDesk')..."
                    className="flex-1 bg-black/60 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />

                  <div className="flex items-center gap-1.5">
                    <div className="flex items-center gap-1 bg-black/60 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-slate-300">
                      <span className="text-slate-500 text-[10px]">Start:</span>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max={durationSeconds}
                        value={newStartSec}
                        onChange={(e) => setNewStartSec(parseFloat(e.target.value) || 0)}
                        className="w-12 bg-transparent text-amber-400 font-mono text-center focus:outline-none"
                      />
                      <span className="text-slate-500 text-[10px]">s</span>
                    </div>

                    <div className="flex items-center gap-1 bg-black/60 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-slate-300">
                      <span className="text-slate-500 text-[10px]">End:</span>
                      <input
                        type="number"
                        step="0.1"
                        min="0.1"
                        max={durationSeconds}
                        value={newEndSec}
                        onChange={(e) => setNewEndSec(parseFloat(e.target.value) || 0)}
                        className="w-12 bg-transparent text-amber-400 font-mono text-center focus:outline-none"
                      />
                      <span className="text-slate-500 text-[10px]">s</span>
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
                    <span className="text-[10px] text-slate-400">
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
                      className="text-[11px] text-slate-400 hover:text-white cursor-pointer"
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
                  <span className="text-[11px] font-semibold text-slate-300">
                    Captions Transcript ({segments.length} segments)
                  </span>

                  <div className="flex items-center gap-2">
                    {segments.length === 0 ? (
                      <button
                        type="button"
                        onClick={handleGenerateSmartDefaults}
                        className="flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300 cursor-pointer"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>Insert Placeholder Outline</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleClearAll}
                        className="text-[11px] text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                      >
                        Clear All
                      </button>
                    )}
                  </div>
                </div>

                <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                  {segments.length === 0 ? (
                    <div className="p-4 rounded-xl bg-black/30 border border-dashed border-white/10 text-center text-xs text-slate-500">
                      No captions added yet.{' '}
                      <button
                        type="button"
                        onClick={handleGenerateSmartDefaults}
                        className="text-amber-400 underline cursor-pointer hover:text-amber-300"
                      >
                        Insert placeholder outline lines
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
                            className="font-mono text-[10px] text-amber-400 hover:text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 shrink-0 cursor-pointer"
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
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleStartEdit(seg)}
                              className="p-1 text-slate-400 hover:text-white cursor-pointer"
                              title="Edit caption"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleDuplicateSegment(seg)}
                            className="p-1 text-slate-500 hover:text-indigo-400 cursor-pointer"
                            title="Duplicate line"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteSegment(seg.id)}
                            className="p-1 text-slate-500 hover:text-rose-400 cursor-pointer"
                            title="Delete caption"
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
                    {isSpeechSupported ? 'Web Speech API Available' : 'Web Speech API Not Available'}
                  </span>
                </div>
                <span className="text-[10px] text-slate-400">
                  {isSpeechSupported
                    ? 'Uses your browser\'s speech service (Chrome sends audio to Google)'
                    : 'Please type manually'}
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
                  <label htmlFor="select-speech-lang" className="text-[11px] text-slate-400">
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
                    <span className="text-[10px] text-slate-400">
                      {isListening ? 'Click button to stop dictation' : 'Click mic and speak clearly'}
                    </span>
                  </div>
                </div>

                {/* Interim Live Transcript */}
                {isListening && (
                  <div className="p-3 rounded-lg bg-black/70 border border-amber-500/40 text-left animate-fadeIn">
                    <div className="text-[10px] font-mono text-amber-400 flex items-center gap-1.5 mb-1">
                      <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                      <span>Live Speech Transcript:</span>
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
                    <span>Caption Location (Position)</span>
                  </span>
                  <span className="text-[11px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
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
                        className={`p-2 rounded-lg border text-center transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-amber-500/20 border-amber-500 text-white font-bold shadow-md'
                            : 'bg-black/30 border-white/5 text-slate-400 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        <div className="text-[11px]">{preset.name}</div>
                        <div className="text-[9px] text-slate-500 mt-0.5">{Math.round(preset.ratio * 100)}%</div>
                      </button>
                    );
                  })}
                </div>

                {/* Fine-tune Location Slider */}
                <div className="space-y-1 pt-1">
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span>Top (10%)</span>
                    <span>Safe Center (50%)</span>
                    <span>Bottom (90%)</span>
                  </div>
                  <input
                    id="slider-caption-location"
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
                  <span className="text-[11px] text-slate-400">Text Alignment:</span>
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
                    <span>Caption Size (Font Scale)</span>
                  </span>
                  <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
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
                        className={`p-2 rounded-lg border text-center transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-emerald-500/20 border-emerald-500 text-white font-bold shadow-md'
                            : 'bg-black/30 border-white/5 text-slate-400 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        <div className="text-[11px]">{preset.name}</div>
                        <div className="text-[9px] text-slate-500 mt-0.5">{preset.label}</div>
                      </button>
                    );
                  })}
                </div>

                {/* Fine-tune Font Size Slider */}
                <div className="space-y-1 pt-1">
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span>Compact (28px)</span>
                    <span>Standard (50px)</span>
                    <span>Heroic (84px)</span>
                  </div>
                  <input
                    id="slider-caption-size"
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
                    <span>Caption Background & Box Styling</span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-400">Opacity:</span>
                    <span className="text-[11px] font-mono text-indigo-400">
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
                        <span className="text-[10px] truncate">{preset.name}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Custom Color & Opacity Sliders */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-white/5">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400 shrink-0">Custom Color:</span>
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        type="color"
                        value={settings.bgColor.startsWith('#') ? settings.bgColor : '#18181b'}
                        onChange={(e) =>
                          updateSettings({
                            bgColor: e.target.value,
                            bgPreset: 'custom'
                          })
                        }
                        className="w-7 h-7 rounded-lg border border-white/20 cursor-pointer bg-transparent"
                      />
                      <span className="font-mono text-[10px] text-slate-400">
                        {settings.bgColor}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400 shrink-0">Box Opacity:</span>
                    <input
                      type="range"
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
                    <span className="text-[11px] text-slate-400">Pill Shape:</span>
                    <div className="flex gap-1 text-[10px]">
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

                  <label className="flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer">
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
                <div className="text-[11px] font-semibold text-slate-300 mb-2">Typography & Animation Theme</div>
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
            </div>
          )}
        </div>
      )}
    </div>
  );
};
