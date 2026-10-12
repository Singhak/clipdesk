import React from 'react';
import {
  Monitor,
  AppWindow,
  Crop,
  Radio,
  MousePointer2,
  ZoomIn,
  Sparkles,
  Eye,
  Sliders,
  Mic,
  Volume2,
  Play,
  ArrowLeft,
  Check,
  ShieldCheck,
  Camera,
  CameraOff,
  Wind
} from 'lucide-react';
import { InstagramIcon, YoutubeIcon } from './SocialIcons';
import { BubbleStyleControls } from './BubbleStyleControls';
import { AudioMeter } from './AudioMeter';
import { RecordingSource, SmartFeatures, AudioConfig, NoiseSuppressionMode, TemplateId, LayoutMode, WebcamConfig } from '../core/types';
import { TEMPLATES } from '../core/templateManager';

interface RecordingSetupProps {
  selectedTemplate: TemplateId;
  source: RecordingSource;
  onSelectSource: (s: RecordingSource) => void;
  smartFeatures: SmartFeatures;
  onToggleFeature: (k: keyof SmartFeatures) => void;
  audioConfig: AudioConfig;
  onToggleAudio: (k: keyof AudioConfig) => void;
  layoutMode: LayoutMode;
  onSelectLayout: (m: LayoutMode) => void;
  onSelectFormat: (f: 'widescreen' | 'vertical') => void;
  onBack: () => void;
  onStartRecording: () => void;
  webcamConfig: WebcamConfig;
  onUpdateWebcamConfig: (updater: (prev: WebcamConfig) => WebcamConfig) => void;
  onToggleWebcam: () => void;
  cameraOnly: boolean;
  onSetCameraOnly: (v: boolean) => void;
  onUpdateZoomIntensity?: (intensity: 'subtle' | 'deep' | 'ultra') => void;
  onUpdateNoiseCancellation?: (mode: NoiseSuppressionMode) => void;
  onSelectMicDevice?: (deviceId: string) => void;
}

export const RecordingSetup: React.FC<RecordingSetupProps> = ({
  selectedTemplate,
  source,
  onSelectSource,
  smartFeatures,
  onToggleFeature,
  audioConfig,
  onToggleAudio,
  layoutMode,
  onSelectLayout,
  onSelectFormat,
  onBack,
  onStartRecording,
  webcamConfig,
  onUpdateWebcamConfig,
  onToggleWebcam,
  cameraOnly,
  onSetCameraOnly,
  onUpdateZoomIntensity,
  onUpdateNoiseCancellation,
  onSelectMicDevice
}) => {
  const currentTemplate = TEMPLATES[selectedTemplate];
  const isWide = layoutMode === 'widescreen';

  const [audioDevices, setAudioDevices] = React.useState<MediaDeviceInfo[]>([]);
  const [testStream, setTestStream] = React.useState<MediaStream | null>(null);
  const [isTestingMic, setIsTestingMic] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    const fetchDevices = async () => {
      try {
        if (!navigator.mediaDevices?.enumerateDevices) return;
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (active) {
          const inputs = devices.filter((d) => d.kind === 'audioinput');
          setAudioDevices(inputs);
        }
      } catch (e) {
        console.warn('Failed to enumerate audio devices:', e);
      }
    };
    void fetchDevices();
    navigator.mediaDevices?.addEventListener?.('devicechange', fetchDevices);
    return () => {
      active = false;
      navigator.mediaDevices?.removeEventListener?.('devicechange', fetchDevices);
    };
  }, []);

  const handleToggleTestMic = async () => {
    if (isTestingMic) {
      testStream?.getTracks().forEach((t) => t.stop());
      setTestStream(null);
      setIsTestingMic(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: audioConfig.micDeviceId
            ? { deviceId: { ideal: audioConfig.micDeviceId } }
            : true
        });
        setTestStream(stream);
        setIsTestingMic(true);
      } catch (e) {
        console.warn('Could not start test microphone stream:', e);
      }
    }
  };

  React.useEffect(() => {
    return () => {
      testStream?.getTracks().forEach((t) => t.stop());
    };
  }, [testStream]);

  return (
    <div className="max-w-4xl mx-auto px-5 py-8 animate-fadeIn">
      {/* Top Breadcrumb */}
      <div className="flex items-center justify-between mb-6">
        <button
          id="btn-setup-back"
          onClick={onBack}
          className="flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/5 transition-all cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Templates</span>
        </button>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400">Preset:</span>
          <span className="text-indigo-400 font-bold bg-indigo-500/10 px-2.5 py-0.5 rounded-md border border-indigo-500/20">
            {currentTemplate.name}
          </span>
        </div>
      </div>

      <div className="text-center max-w-xl mx-auto mb-6">
        <h1 className="text-3xl font-black text-white tracking-tight">
          Recording Setup
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-2">
          Configure screen source, audio inputs, and smart deterministic camera rules.
        </p>
      </div>

      {/* Platform Sandbox Notice */}
      <div className="mb-6 p-4 rounded-xl bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-transparent border border-indigo-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
        <div className="space-y-0.5">
          <div className="font-bold text-white flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>Web Browser Sandbox Notice</span>
          </div>
          <p className="text-slate-400 text-[11px] leading-relaxed">
            Standard web browsers cannot track your OS mouse or clicks when working in external desktop apps (VS Code, terminal, etc.).
            For automatic OS-wide cursor follow & click zoom across all apps, launch the ClipDesk Desktop App or Chrome Extension.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <a
            href="https://github.com/singhak/clipdesk/releases"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-all text-[11px]"
          >
            Get Desktop App
          </a>
        </div>
      </div>

      {/* Recording mode */}
      <div className="studio-card p-5 mb-6">
        <h2 className="text-sm font-bold text-white mb-3">Recording mode</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { id: false, label: 'Screen + camera', desc: 'Record your screen with an optional camera bubble' },
            { id: true, label: 'Camera only', desc: 'Just you, filling the whole frame. No screen share prompt' }
          ].map((m) => (
            <button
              type="button"
              key={String(m.id)}
              id={`mode-btn-${m.id ? 'camera' : 'screen'}`}
              onClick={() => onSetCameraOnly(m.id)}
              aria-pressed={cameraOnly === m.id}
              className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                cameraOnly === m.id
                  ? 'bg-indigo-600/25 border-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                  : 'bg-black/30 border-white/5 text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <div className="font-bold text-sm">{m.label}</div>
              <div className="text-[11px] text-slate-400 mt-1">{m.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Output format: Loom-style widescreen or vertical reel */}
      <div className="studio-card p-5 mb-6">
        <h2 className="text-sm font-bold text-white mb-3">Output format</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { id: 'widescreen' as const, label: 'Widescreen 16:9 (Loom-style)', desc: '1920 × 1080 · full screen plus camera bubble · for tutorials, demos, YouTube, docs' },
            { id: 'vertical' as const, label: 'Vertical Reel 9:16', desc: '1080 × 1920 · auto-follow cursor and zoom · for Reels, Shorts, TikTok' }
          ].map((f) => {
            const selected = (f.id === 'widescreen') === isWide;
            return (
              <button
                key={f.id}
                id={`format-btn-${f.id}`}
                onClick={() => onSelectFormat(f.id)}
                aria-pressed={selected}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                  selected
                    ? 'bg-indigo-600/25 border-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                    : 'bg-black/30 border-white/5 text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <div className="font-bold text-sm">{f.label}</div>
                <div className="text-[11px] text-slate-400 mt-1">{f.desc}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left Column: Source, Formats & Audio */}
        <div className="space-y-6">
          {/* Recording Source */}
          <div className="studio-card p-5">
            <h2 className="text-sm font-bold text-white mb-3.5 flex items-center gap-2">
              <Monitor className="w-4 h-4 text-indigo-400" />
              <span>Recording Source</span>
            </h2>
            <div className="grid grid-cols-3 gap-3">
              {[
                { id: 'screen' as RecordingSource, label: 'Full Screen', desc: 'Entire display', icon: Monitor },
                { id: 'window' as RecordingSource, label: 'Window', desc: 'Specific app', icon: AppWindow },
                { id: 'region' as RecordingSource, label: 'Region', desc: 'Custom area', icon: Crop }
              ].map((s) => {
                const Icon = s.icon;
                const isSelected = source === s.id;
                return (
                  <button
                    key={s.id}
                    id={`source-btn-${s.id}`}
                    onClick={() => onSelectSource(s.id)}
                    className={`p-3.5 rounded-xl flex flex-col items-center justify-center gap-2 border text-xs font-semibold transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-600/25 border-indigo-500 text-white shadow-lg shadow-indigo-500/20 scale-[1.02]'
                        : 'bg-black/30 border-white/5 text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${isSelected ? 'text-indigo-400' : 'text-slate-400'}`} />
                    <span className="font-bold">{s.label}</span>
                    <span className="text-[10px] text-slate-500">{s.desc}</span>
                  </button>
                );
              })}
            </div>

            {/* Infinity Mirror Prevention Advice */}
            {source === 'screen' && (
              <div className="mt-4 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-3 text-xs text-amber-200">
                <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-bold text-amber-300">How to Prevent the Infinity Mirror Effect:</span>
                  <p className="text-[11px] text-amber-200/80 leading-relaxed">
                    Recording a single monitor in "Full Screen" can create a recursive window-inside-window mirror loop.
                  </p>
                  <ul className="text-[11px] text-amber-200/90 list-disc list-inside space-y-1 pt-0.5">
                    <li>
                      <strong>Recommended:</strong> Select <strong>"Window"</strong> mode above to capture only VS Code, Chrome, or your target app without any mirroring!
                    </li>
                    <li>
                      In Live Studio, our built-in <strong>Mirror Shield</strong> automatically mutes the local preview so your recording stays 100% clean.
                    </li>
                  </ul>
                </div>
              </div>
            )}
          </div>

          {/* Target Platforms */}
          <div className="studio-card p-5">
            <h2 className="text-sm font-bold text-white mb-3.5 flex items-center gap-2">
              <Radio className="w-4 h-4 text-pink-400" />
              <span>{isWide ? 'Output' : 'Target Platforms (9:16 Vertical)'}</span>
            </h2>
            <div className={isWide ? 'hidden' : 'grid grid-cols-3 gap-2.5 mb-4'}>
              <div className="p-3 rounded-xl bg-pink-500/10 border border-pink-500/25 flex items-center gap-2 text-xs text-pink-300 font-semibold shadow-inner">
                <InstagramIcon className="w-4 h-4 text-pink-400" />
                <span>IG Reel</span>
              </div>
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/25 flex items-center gap-2 text-xs text-red-300 font-semibold shadow-inner">
                <YoutubeIcon className="w-4 h-4 text-red-400" />
                <span>Shorts</span>
              </div>
              <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/25 flex items-center gap-2 text-xs text-cyan-300 font-semibold shadow-inner">
                <span className="font-bold text-xs">TT</span>
                <span>TikTok</span>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-black/40 border border-white/10 text-xs">
              <span className="text-slate-400 font-medium">Output Resolution:</span>
              <span className="font-mono text-emerald-400 font-bold bg-emerald-500/10 px-2.5 py-1 rounded border border-emerald-500/20">
                {isWide ? '1920 × 1080 (16:9)' : '1080 × 1920 (9:16)'}
              </span>
            </div>
          </div>

          {/* Audio Inputs */}
          <div className="studio-card p-5">
            <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-cyan-400" />
              <span>Audio Inputs</span>
            </h2>
            <div className="space-y-2.5">
              <label
                id="toggle-mic"
                className="flex items-center justify-between p-3 rounded-xl bg-black/30 border border-white/5 hover:bg-white/[0.04] transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2.5 text-xs text-slate-200 font-medium">
                  <Mic className="w-4 h-4 text-indigo-400" />
                  <span>Microphone Audio</span>
                </div>
                <input
                  type="checkbox"
                  checked={audioConfig.recordMic}
                  onChange={() => onToggleAudio('recordMic')}
                  className="w-4 h-4 accent-indigo-500 rounded cursor-pointer"
                />
              </label>

              {audioConfig.recordMic && (
                <>
                  {/* Microphone Device Selection & Live VU Meter */}
                  {audioDevices.length > 0 && (
                    <div className="p-3.5 rounded-xl bg-black/40 border border-white/5 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-semibold text-slate-300">Choose Microphone Device</label>
                        <button
                          type="button"
                          onClick={handleToggleTestMic}
                          className={`text-[10px] font-bold px-2 py-0.5 rounded cursor-pointer transition-colors ${
                            isTestingMic
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-white/5 text-slate-400 hover:text-white'
                          }`}
                        >
                          {isTestingMic ? 'Stop Test' : 'Test Mic Level'}
                        </button>
                      </div>
                      <select
                        value={audioConfig.micDeviceId || ''}
                        onChange={(e) => onSelectMicDevice?.(e.target.value)}
                        className="w-full bg-black/60 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
                      >
                        <option value="">Default Microphone</option>
                        {audioDevices.map((d, i) => (
                          <option key={d.deviceId || i} value={d.deviceId}>
                            {d.label || `Microphone ${i + 1}`}
                          </option>
                        ))}
                      </select>
                      {isTestingMic && testStream && (
                        <div className="pt-2 animate-fadeIn">
                          <AudioMeter stream={testStream} showLabels={true} />
                        </div>
                      )}
                    </div>
                  )}

                  <div className="p-3.5 rounded-xl bg-black/40 border border-indigo-500/20 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                        <Wind className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Noise Cancellation</span>
                      </span>
                      <span className="text-[10px] text-indigo-400 font-bold bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20">
                        Fan, AC & Traffic Filter
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-tight">
                      Active High-Pass DSP cuts low-frequency traffic rumble and AC breeze, while the intelligent dynamic gate eliminates desk fan whir during speech pauses.
                    </p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        { id: 'studio', label: 'Studio Clear', desc: 'Kills fan/traffic + dynamic gate' },
                        { id: 'fan_killer', label: 'Fan & Traffic Killer', desc: 'Heavy cut for loud fans & AC' },
                        { id: 'mild', label: 'Mild Ambient', desc: 'Gentle room noise cut' },
                        { id: 'off', label: 'Off / Raw', desc: 'Direct microphone feed' }
                      ].map((m) => {
                        const active = (audioConfig.noiseCancellation ?? 'studio') === m.id;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => onUpdateNoiseCancellation?.(m.id as NoiseSuppressionMode)}
                            className={`text-left p-2.5 rounded-lg border transition-all cursor-pointer ${
                              active
                                ? 'bg-indigo-600/25 border-indigo-500 text-white shadow-sm'
                                : 'bg-black/20 border-white/5 text-slate-400 hover:text-white hover:bg-white/5'
                            }`}
                          >
                            <div className="text-xs font-bold">{m.label}</div>
                            <div className="text-[10px] text-slate-400 mt-0.5">{m.desc}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}

              <label
                id="toggle-sys-audio"
                className="flex items-center justify-between p-3 rounded-xl bg-black/30 border border-white/5 hover:bg-white/[0.04] transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2.5 text-xs text-slate-200 font-medium">
                  <Volume2 className="w-4 h-4 text-cyan-400" />
                  <span>Desktop System Audio</span>
                </div>
                <input
                  type="checkbox"
                  checked={audioConfig.recordSystemAudio}
                  onChange={() => onToggleAudio('recordSystemAudio')}
                  className="w-4 h-4 accent-indigo-500 rounded cursor-pointer"
                />
              </label>

              {/* macOS System Audio Guidance */}
              <div className="p-3 rounded-xl bg-black/30 border border-white/5 flex items-start gap-2.5 text-[11px] text-slate-400">
                <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                <p>
                  <strong className="text-slate-300">macOS Audio Notice:</strong> Browser security requires choosing "Share tab audio" in Chrome's tab sharing prompt. For full desktop system sound recording on macOS, launch the ClipDesk Desktop App.
                </p>
              </div>
            </div>
          </div>

          {/* Creator Camera (Circular Bubble PiP) */}
          <div className="studio-card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Camera className="w-4 h-4 text-indigo-400" />
                <span>Creator Camera (Bubble PiP)</span>
              </h2>
              <button
                type="button"
                id="toggle-setup-webcam"
                onClick={onToggleWebcam}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                  webcamConfig.enabled
                    ? 'bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-600/30'
                    : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                }`}
              >
                {webcamConfig.enabled ? <Camera className="w-3.5 h-3.5" /> : <CameraOff className="w-3.5 h-3.5" />}
                <span>{webcamConfig.enabled ? 'Enabled' : 'Disabled'}</span>
              </button>
            </div>

            <p className="text-xs text-slate-400 mb-3.5">
              Records your camera in a floating circular bubble composited into the 9:16 vertical reel. You can resize and drag it anywhere at any time!
            </p>

            {webcamConfig.enabled && (
              <div className="space-y-3.5 pt-3 border-t border-white/10 animate-fadeIn text-xs">
                {/* Bubble Size Options */}
                <div>
                  <label className="text-slate-300 font-semibold text-[11px] block mb-1.5">
                    Camera Bubble Size
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['small', 'medium', 'large'] as const).map((sz) => (
                      <button
                        type="button"
                        key={sz}
                        id={`setup-cam-size-${sz}`}
                        onClick={() => onUpdateWebcamConfig((prev) => ({ ...prev, size: sz }))}
                        className={`py-2 px-3 rounded-xl border text-center font-bold capitalize transition-all cursor-pointer ${
                          webcamConfig.size === sz
                            ? 'bg-indigo-600/30 border-indigo-500 text-indigo-200 shadow-md'
                            : 'bg-black/40 border-white/5 text-slate-400 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        {sz}
                      </button>
                    ))}
                  </div>
                </div>

                <BubbleStyleControls config={webcamConfig} onUpdate={onUpdateWebcamConfig} idPrefix="setup-cam" />

                {/* Starting Corner Preset */}
                <div>
                  <label className="text-slate-300 font-semibold text-[11px] block mb-1.5">
                    Initial Position Preset
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'bottom_right' as const, label: '↘ Bottom-Right', pos: { x: 0.82, y: 0.85 } },
                      { id: 'bottom_left' as const, label: '↙ Bottom-Left', pos: { x: 0.18, y: 0.85 } },
                      { id: 'top_right' as const, label: '↗ Top-Right', pos: { x: 0.82, y: 0.15 } },
                      { id: 'top_left' as const, label: '↖ Top-Left', pos: { x: 0.18, y: 0.15 } }
                    ].map((preset) => (
                      <button
                        type="button"
                        key={preset.id}
                        id={`setup-cam-pos-${preset.id}`}
                        onClick={() =>
                          onUpdateWebcamConfig((prev) => ({
                            ...prev,
                            position: preset.pos,
                            presetPosition: preset.id
                          }))
                        }
                        className={`py-2 px-2.5 rounded-xl border text-left font-semibold text-[11px] transition-all cursor-pointer ${
                          webcamConfig.presetPosition === preset.id
                            ? 'bg-indigo-600/30 border-indigo-500 text-indigo-200'
                            : 'bg-black/40 border-white/5 text-slate-400 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Mirror Toggle */}
                <label className="flex items-center justify-between p-3 rounded-xl bg-black/30 border border-white/5 hover:bg-white/[0.04] transition-colors cursor-pointer">
                  <span className="text-slate-300 font-medium">Mirror Selfie Camera</span>
                  <input
                    type="checkbox"
                    checked={webcamConfig.mirror !== false}
                    onChange={(e) =>
                      onUpdateWebcamConfig((prev) => ({ ...prev, mirror: e.target.checked }))
                    }
                    className="w-4 h-4 accent-indigo-500 rounded cursor-pointer"
                  />
                </label>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Smart Rules & Layout Backdrops */}
        <div className="space-y-6">
          {/* Smart Features */}
          <div className="studio-card p-5">
            <div className="flex items-center justify-between mb-3.5">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>Smart Deterministic Rules</span>
              </h2>
              <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 font-mono">
                No AI Required
              </span>
            </div>

            <div className="space-y-2.5">
              {[
                {
                  key: 'followMouse' as keyof SmartFeatures,
                  label: 'Follow Mouse',
                  desc: '60 FPS dynamic viewport tracks cursor into safe zone',
                  icon: MousePointer2
                },
                {
                  key: 'zoomOnClick' as keyof SmartFeatures,
                  label: 'Zoom on Click',
                  desc: 'Smooth 1.4x cubic easing focus on user clicks',
                  icon: ZoomIn
                },
                {
                  key: 'cursorHighlight' as keyof SmartFeatures,
                  label: 'Cursor Highlight & Halo',
                  desc: 'Glowing accent ripple pulse around active items',
                  icon: Eye
                },
                {
                  key: 'blurSideAreas' as keyof SmartFeatures,
                  label: 'Blur Side Areas',
                  desc: 'Fills 9:16 frame with ambient Gaussian background',
                  icon: Sliders
                },
                {
                  key: 'smoothCameraDamping' as keyof SmartFeatures,
                  label: 'Smooth Camera Damping',
                  desc: 'Spring physics lerp eliminates abrupt camera jerks',
                  icon: Sparkles
                }
              ].map((feat) => {
                const Icon = feat.icon;
                const isChecked = smartFeatures[feat.key];
                return (
                  <div
                    key={feat.key}
                    id={`feature-toggle-${feat.key}`}
                    onClick={() => onToggleFeature(feat.key)}
                    className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                      isChecked
                        ? 'bg-indigo-600/15 border-indigo-500/40 shadow-sm'
                        : 'bg-black/30 border-white/5 opacity-70 hover:opacity-100'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <Icon className={`w-4 h-4 mt-0.5 ${isChecked ? 'text-indigo-400' : 'text-slate-500'}`} />
                      <div>
                        <div className="text-xs font-semibold text-white">{feat.label}</div>
                        <div className="text-[11px] text-slate-400">{feat.desc}</div>
                      </div>
                    </div>
                    <div
                      className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all ${
                        isChecked ? 'bg-indigo-600 border-indigo-400 text-white' : 'border-white/20 bg-black/40'
                      }`}
                    >
                      {isChecked && <Check className="w-3.5 h-3.5" />}
                    </div>
                  </div>
                );
              })}

              {smartFeatures.zoomOnClick && (
                <div className="pt-3 border-t border-white/5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-300">Click Zoom Intensity</span>
                    <span className="text-[11px] font-mono text-indigo-400 font-bold">
                      {(smartFeatures.zoomIntensity ?? 'deep') === 'subtle'
                        ? 'Subtle 1.5x'
                        : (smartFeatures.zoomIntensity ?? 'deep') === 'ultra'
                        ? 'Ultra 2.35x'
                        : 'Deep 1.95x'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'subtle' as const, label: 'Subtle 1.5x' },
                      { id: 'deep' as const, label: 'Deep 1.95x' },
                      { id: 'ultra' as const, label: 'Ultra 2.35x' }
                    ].map((z) => (
                      <button
                        key={z.id}
                        type="button"
                        onClick={() => onUpdateZoomIntensity?.(z.id)}
                        className={`py-1.5 px-2 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                          (smartFeatures.zoomIntensity ?? 'deep') === z.id
                            ? 'bg-indigo-600 border-indigo-500 text-white shadow-sm'
                            : 'bg-black/30 border-white/10 text-slate-400 hover:text-white'
                        }`}
                      >
                        {z.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Background Layout Mode */}
          <div className={isWide ? 'hidden' : 'studio-card p-5'}>
            <h2 className="text-sm font-bold text-white mb-3">Vertical Layout Mode</h2>
            <div className="grid grid-cols-2 gap-2.5 text-xs">
              {[
                { id: 'blur_backdrop' as LayoutMode, label: 'Ambient Blur Backdrop', desc: 'Sleek mirrored background' },
                { id: 'dynamic_crop' as LayoutMode, label: 'Dynamic Full Crop', desc: 'Fills 100% of vertical frame' },
                { id: 'gradient_mesh' as LayoutMode, label: 'Gradient Mesh Frame', desc: 'Modern glowing dark border' },
                { id: 'brand_canvas' as LayoutMode, label: 'Brand & Handle Banner', desc: 'Header + footer tags' }
              ].map((m) => {
                const isSelected = layoutMode === m.id;
                return (
                  <button
                    key={m.id}
                    id={`layout-btn-${m.id}`}
                    onClick={() => onSelectLayout(m.id)}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-sm'
                        : 'bg-black/30 border-white/5 text-slate-400 hover:text-white'
                    }`}
                  >
                    <div className="font-bold text-xs">{m.label}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{m.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Action CTA Bar */}
      <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 p-5 glass-panel border-indigo-500/30 shadow-2xl">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
          <div>
            <div className="text-xs font-bold text-white">Ready to capture studio reel</div>
            <div className="text-[11px] text-slate-400">
              Desktop feed and the live preview will initialize simultaneously.
            </div>
          </div>
        </div>
        <button
          id="btn-start-recording-studio"
          onClick={onStartRecording}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl btn-primary text-sm font-extrabold shadow-xl shadow-indigo-500/30 cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-all"
        >
          <Play className="w-4 h-4 fill-white" />
          <span>Launch Recording Studio</span>
        </button>
      </div>
    </div>
  );
};
