import './app.css';
import React, { useCallback, useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import type { TemplateId } from '../../src/core/types';
import { CAMERA_BACKGROUNDS, type CameraBackgroundId } from '../../src/core/cameraBackground';
import { CAMERA_PRESETS } from '../../src/core/types';
import { LicensePanel } from '../../src/components/LicensePanel';
import { FocusPicker } from '../../src/components/FocusPicker';
import { DEFAULT_FOCUS } from '../../src/core/focusRegion';
import { openCheckout } from './license';
import {
  DEFAULT_DESKTOP_CONFIG,
  DesktopConfig,
  DesktopLayout,
  FIXED_AREA_DEFAULTS,
  FOLLOW_DEFAULTS,
  IDLE_STATE,
  PermissionStatus,
  NoiseSuppressionMode,
  RecState,
  SourceInfo,
  elapsedMs,
  formatTime
} from '../shared';

const reel = window.reel;
const CONFIG_STORAGE = 'clipdesk.desktopConfig';

const LAYOUTS: { id: DesktopLayout; label: string; hint: string; fixed?: boolean }[] = [
  { id: 'dynamic_crop', label: 'Vertical, follows mouse', hint: 'Tall video for phones. Follows your mouse and zooms where you click' },
  { id: 'dynamic_crop', fixed: true, label: 'Vertical, fixed area', hint: 'Tall video of one part of the screen you pick. No mouse following' },
  { id: 'blur_backdrop', label: 'Vertical, blurred sides', hint: 'Tall video. Whole screen in the middle, blurred copy behind it' },
  { id: 'gradient_mesh', label: 'Vertical, colour sides', hint: 'Tall video. Whole screen on a colourful background' },
  { id: 'widescreen', label: 'Widescreen', hint: 'Normal landscape video (16:9), like Loom' }
];

const NOISE_MODES: { id: NoiseSuppressionMode; label: string; hint: string }[] = [
  { id: 'studio', label: 'Best voice quality', hint: 'Removes fan, air-con and street noise' },
  { id: 'fan_killer', label: 'Strong cleanup', hint: 'For very loud fans or air-con' },
  { id: 'mild', label: 'Light cleanup', hint: 'Keeps some natural room sound' },
  { id: 'off', label: 'No cleanup', hint: 'Your mic exactly as it sounds' }
];

/** Live microphone level (0..1) so people can see the mic works before recording; null when not listening */
function useMicLevel(enabled: boolean): { level: number; error: string | null } {
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) {
      setLevel(0);
      setError(null);
      return;
    }
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let timer: number | undefined;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        setError(null);
        ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        ctx.createMediaStreamSource(s).connect(analyser);
        const data = new Uint8Array(analyser.fftSize);
        timer = window.setInterval(() => {
          analyser.getByteTimeDomainData(data);
          let peak = 0;
          for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
          // Speech peaks well below full scale, so stretch the range a little
          setLevel(Math.min(1, (peak / 128) * 2.2));
        }, 100);
      })
      .catch((e) => {
        if (cancelled) return;
        const name = e instanceof DOMException ? e.name : '';
        setError(
          name === 'NotAllowedError'
            ? 'Microphone access is blocked.'
            : name === 'NotFoundError'
              ? 'No microphone found.'
              : 'The microphone could not be opened.'
        );
      });
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close().catch(() => undefined);
    };
  }, [enabled]);
  return { level, error };
}

const TEMPLATES: { id: TemplateId; label: string }[] = [
  { id: 'browser', label: 'Browser walkthrough' },
  { id: 'product_demo', label: 'Product demo' },
  { id: 'coding', label: 'Coding tutorial' },
  { id: 'presentation', label: 'Slides' }
];

function loadSavedConfig(): DesktopConfig {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE);
    return raw ? { ...DEFAULT_DESKTOP_CONFIG, ...JSON.parse(raw) } : DEFAULT_DESKTOP_CONFIG;
  } catch {
    return DEFAULT_DESKTOP_CONFIG;
  }
}

function persistConfig(config: DesktopConfig): void {
  try {
    localStorage.setItem(CONFIG_STORAGE, JSON.stringify(config));
  } catch {
    // Remembering settings is a convenience only
  }
}

const Toggle: React.FC<{ label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string; disabled?: boolean }> = ({
  label,
  checked,
  onChange,
  hint,
  disabled
}) => (
  <label className={`flex items-center justify-between gap-3 py-2 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
    <span>
      <span className="block text-[13px] font-semibold">{label}</span>
      {hint && <span className="block text-[12px] text-slate-400">{hint}</span>}
    </span>
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
      className="w-4 h-4 accent-indigo-500"
    />
  </label>
);

const SectionTitle: React.FC<{ children: React.ReactNode; action?: React.ReactNode }> = ({ children, action }) => (
  <div className="flex items-center justify-between text-[12px] font-bold uppercase tracking-wide text-slate-400">
    <span>{children}</span>
    {action}
  </div>
);

const PermissionNotice: React.FC<{
  text: string;
  platform: string;
  kind: 'camera' | 'microphone' | 'screen';
  settingsLabel?: string;
  onSkip?: () => void;
  skipLabel?: string;
}> = ({ text, platform, kind, settingsLabel, onSkip, skipLabel }) => (
  <div role="alert" className="text-[12px] p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-100 space-y-2">
    <p>{text}</p>
    <div className="flex flex-wrap gap-2">
      {(platform === 'darwin' || (platform === 'win32' && kind !== 'screen')) && (
        <button
          onClick={() => reel.permissions.openSettings(kind)}
          className="px-2.5 py-1 rounded-md bg-amber-500/80 hover:bg-amber-400 text-black font-semibold cursor-pointer"
        >
          {settingsLabel ?? (platform === 'darwin' ? 'Open System Settings' : 'Open Windows Settings')}
        </button>
      )}
      {onSkip && (
        <button onClick={onSkip} className="px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/20 font-semibold cursor-pointer">
          {skipLabel}
        </button>
      )}
    </div>
  </div>
);

const Launcher: React.FC = () => {
  const [config, setConfig] = useState<DesktopConfig>(loadSavedConfig);
  const [state, setRecState] = useState<RecState>(IDLE_STATE);
  const [sources, setSources] = useState<SourceInfo[] | null>(null);
  const [kind, setKind] = useState<'screen' | 'window'>('screen');
  const [now, setNow] = useState(Date.now());
  const [starting, setStarting] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [perms, setPerms] = useState<PermissionStatus | null>(null);
  const refreshing$ = React.useRef(false);

  const refresh = useCallback(async () => {
    if (refreshing$.current) return;
    refreshing$.current = true;
    setRefreshing(true);
    try {
      const list = await reel.getSources();
      setSources(list);
      setConfig((c) => (list.some((s) => s.id === c.sourceId) ? c : { ...c, sourceId: list.find((s) => s.kind === 'screen')?.id ?? '' }));
    } finally {
      refreshing$.current = false;
      setRefreshing(false);
    }
  }, []);

  const checkPermissions = useCallback(() => void reel.permissions.status().then(setPerms).catch(() => undefined), []);

  useEffect(() => {
    void refresh();
    checkPermissions();
    void reel.getState().then(setRecState);
    const off = reel.onState((s) => {
      setRecState(s);
      if (s.status === 'idle') setStarting(false);
    });
    const id = window.setInterval(() => setNow(Date.now()), 250);
    // Window list goes stale while the launcher sits in the background
    // (and people may have just changed a permission in system settings)
    const onFocus = () => {
      void refresh();
      checkPermissions();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      off();
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh, checkPermissions]);

  // New windows open and close all the time: keep the Windows list fresh while it is on screen
  useEffect(() => {
    if (kind !== 'window') return;
    void refresh();
    const t = window.setInterval(() => document.visibilityState === 'visible' && void refresh(), 5000);
    return () => window.clearInterval(t);
  }, [kind, refresh]);

  // A sharp picture of the chosen source for the fixed-area picker (the list thumbnails are tiny)
  const [preview, setPreview] = useState<string | null>(null);
  const previewNeeded = config.layout === 'dynamic_crop' && !!config.fixedArea && state.status === 'idle';
  useEffect(() => {
    setPreview(null);
    if (!previewNeeded || !config.sourceId) return;
    let cancelled = false;
    void reel.getSourcePreview(config.sourceId).then((p) => !cancelled && setPreview(p)).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [previewNeeded, config.sourceId]);

  const idle = state.status === 'idle';
  const mic = useMicLevel(config.mic && idle && !starting);
  useEffect(() => {
    if (!idle) setConfirmDiscard(false);
  }, [idle]);

  const update = (patch: Partial<DesktopConfig>) => {
    const next = { ...config, ...patch };
    setConfig(next);
    persistConfig(next);
  };

  const start = async () => {
    if (!config.sourceId) return;
    reel.resetError();
    setStarting(true);
    persistConfig(config);
    await reel.start(config);
  };

  if (state.status !== 'idle') {
    const paused = state.status === 'paused';
    const live = state.status === 'recording' || paused;
    return (
      <main className="min-h-screen p-6 flex flex-col justify-center gap-4">
        <div className="flex items-center gap-2">
          <span className={`w-3 h-3 rounded-full ${paused ? 'bg-amber-400' : 'bg-rose-500 rec-dot'}`} />
          <span className="text-base font-bold capitalize">{state.status === 'countdown' ? 'Starting…' : state.status === 'ready' ? (state.areaPick ? 'Choose your area' : 'Place your camera') : state.status}</span>
          <span className="ml-auto font-mono text-2xl font-black">{formatTime(elapsedMs(state, now))}</span>
        </div>
        {live && (
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => reel.control('togglePause')} className="py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-sm font-bold cursor-pointer">
              {paused ? 'Resume' : 'Pause'}
            </button>
            <button onClick={() => reel.control('stop')} className="py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-sm font-extrabold cursor-pointer">
              Stop & save
            </button>
          </div>
        )}
        {state.notice && (
          <div role="alert" className="text-[12px] p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200">
            {state.notice}
          </div>
        )}
        {state.status === 'saving' && (
          <p role="status" className="text-[13px] text-slate-300">
            {typeof state.progress === 'number' && state.progress > 0 ? `Converting to MP4… ${state.progress}%` : 'Saving your recording…'}
          </p>
        )}
        {state.status !== 'saving' &&
          (confirmDiscard ? (
            <div role="alertdialog" aria-label="Discard this recording?" className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 space-y-2">
              <p className="text-[13px] font-semibold text-rose-100">Discard this recording? The video so far will be deleted.</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  autoFocus
                  onClick={() => {
                    setConfirmDiscard(false);
                    reel.control('cancel');
                  }}
                  className="py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-[13px] font-bold cursor-pointer"
                >
                  Yes, discard
                </button>
                <button onClick={() => setConfirmDiscard(false)} className="py-2 rounded-lg bg-white/10 hover:bg-white/20 text-[13px] font-bold cursor-pointer">
                  Keep recording
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => (live ? setConfirmDiscard(true) : reel.control('cancel'))} className="py-1.5 text-[12px] text-slate-400 hover:text-rose-300 cursor-pointer">
              {live ? 'Discard recording…' : 'Cancel'}
            </button>
          ))}
        <p className="text-[12px] text-slate-500">You can close this window. The floating bar, the tray icon and Alt+Shift+P / Alt+Shift+S keep working.</p>
      </main>
    );
  }

  const shown = sources?.filter((s) => s.kind === kind) ?? [];
  const selected = sources?.find((s) => s.id === config.sourceId);
  const isWindow = selected?.kind === 'window';
  const isWide = config.layout === 'widescreen';
  const isFixed = config.layout === 'dynamic_crop' && !!config.fixedArea;
  const isLayoutSelected = (l: (typeof LAYOUTS)[number]) =>
    config.layout === l.id && (l.id !== 'dynamic_crop' || !!config.fixedArea === !!l.fixed);
  const clickZoomOn = isWide ? !!config.wideZoom : config.zoomOnClick ?? true;

  return (
    <main className="p-5 space-y-5">
      <header className="flex items-center gap-2">
        <img src="icons/icon-32.png" alt="" className="w-7 h-7" />
        <h1 className="text-[17px] font-extrabold">ClipDesk</h1>
        <span title="Records your screen as a vertical reel or a normal widescreen video" className="ml-auto text-[12px] font-bold text-indigo-300 bg-indigo-500/15 px-2 py-0.5 rounded-full">Screen recorder</span>
      </header>

      {state.error && (
        <div role="alert" className="text-[12px] p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-200 space-y-2">
          <p>{state.error}</p>
          <div className="flex flex-wrap gap-2">
            {config.sourceId && (
              <button onClick={() => void start()} className="px-2.5 py-1 rounded-md bg-rose-600/80 hover:bg-rose-500 text-white font-semibold cursor-pointer">
                Try again
              </button>
            )}
            <button onClick={() => reel.openRecordingsFolder()} className="px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/20 font-semibold cursor-pointer">
              Open recordings folder
            </button>
            <button onClick={() => reel.resetError()} className="px-2.5 py-1 rounded-md hover:bg-white/10 font-semibold cursor-pointer">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {perms && perms.screen === 'denied' && (
        <PermissionNotice
          text="ClipDesk isn't allowed to record your screen yet."
          platform={perms.platform}
          kind="screen"
          settingsLabel="Open System Settings"
        />
      )}
      {perms && config.camera && perms.camera === 'denied' && (
        <PermissionNotice
          text="Camera access is turned off for ClipDesk, so the camera bubble won't appear."
          platform={perms.platform}
          kind="camera"
          onSkip={() => update({ camera: false })}
          skipLabel="Record without camera"
        />
      )}
      {perms && config.mic && perms.microphone === 'denied' && (
        <PermissionNotice
          text="Microphone access is turned off for ClipDesk, so your voice won't be recorded."
          platform={perms.platform}
          kind="microphone"
          onSkip={() => update({ mic: false })}
          skipLabel="Record without microphone"
        />
      )}

      <section className="space-y-2">
        <SectionTitle
          action={
            <button
              onClick={() => void refresh()}
              aria-label="Refresh the list of screens and windows"
              className="normal-case tracking-normal text-indigo-300 hover:text-indigo-200 cursor-pointer"
            >
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          }
        >
          Record
        </SectionTitle>
        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-white/5 border border-white/10">
          {(['screen', 'window'] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              aria-pressed={kind === k}
              className={`py-1.5 rounded-lg text-[12px] font-semibold cursor-pointer ${kind === k ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-white/10'}`}
            >
              {k === 'screen' ? 'Screens' : 'Windows'}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 max-h-[260px] overflow-y-auto pr-1">
          {sources === null && <p className="col-span-2 text-[12px] text-slate-400 py-6 text-center">Looking for screens and windows…</p>}
          {sources !== null && shown.length === 0 && (
            <p className="col-span-2 text-[12px] text-slate-400 py-6 text-center">
              {kind === 'screen' ? 'No screens found. Check that ClipDesk is allowed to record your screen.' : 'No open windows found. Open the app you want to record, then press Refresh.'}
            </p>
          )}
          {shown.map((s) => (
            <button
              key={s.id}
              onClick={() => update({ sourceId: s.id })}
              aria-pressed={config.sourceId === s.id}
              title={s.name}
              aria-label={`${s.kind === 'screen' ? 'Screen' : 'Window'}: ${s.name}`}
              className={`text-left rounded-xl border p-1.5 cursor-pointer ${
                config.sourceId === s.id ? 'border-indigo-500 bg-indigo-500/15' : 'border-white/10 bg-white/5 hover:bg-white/10'
              }`}
            >
              <img src={s.thumbnail} alt="" className="w-full aspect-video object-contain rounded-md bg-black" />
              <span className="flex items-center gap-1.5 mt-1 text-[12px] font-semibold">
                {s.appIcon && <img src={s.appIcon} alt="" className="w-3.5 h-3.5" />}
                <span className="truncate">{s.name}</span>
              </span>
            </button>
          ))}
        </div>
        <p className="text-[12px] text-slate-400">
          {isWindow
            ? 'Recording one window keeps the view centred. Pick a screen instead to follow your mouse and zoom on clicks.'
            : isFixed
              ? 'Only the area you pick below is recorded. Turn on click zoom or mouse effects if you want them.'
              : 'The video follows your mouse anywhere on this screen and zooms where you click.'}
        </p>
      </section>

      <section className="space-y-2">
        <SectionTitle>Video shape</SectionTitle>
        <div className="grid grid-cols-2 gap-1.5">
          {LAYOUTS.map((l) => (
            <button
              key={`${l.id}-${l.fixed ? 'fixed' : 'free'}`}
              onClick={() =>
                update({
                  layout: l.id,
                  fixedArea: !!l.fixed,
                  // A fixed area starts calm; the other vertical shapes start with everything on
                  ...(l.id === 'widescreen' ? {} : l.fixed ? FIXED_AREA_DEFAULTS : FOLLOW_DEFAULTS)
                })
              }
              aria-pressed={isLayoutSelected(l)}
              className={`text-left px-2.5 py-2 rounded-xl border cursor-pointer ${
                isLayoutSelected(l) ? 'border-indigo-500 bg-indigo-500/15' : 'border-white/10 bg-white/5 hover:bg-white/10'
              }`}
            >
              <span className="block text-[12px] font-bold">{l.label}</span>
              <span className="block text-[12px] text-slate-400 leading-tight mt-0.5">{l.hint}</span>
            </button>
          ))}
        </div>
        <select
          value={config.templateId}
          onChange={(e) => update({ templateId: e.target.value as TemplateId })}
          className="w-full px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[12px]"
          aria-label="Video style"
        >
          {TEMPLATES.map((t) => (
            <option key={t.id} value={t.id} className="bg-slate-900">
              Style: {t.label}
            </option>
          ))}
        </select>
        {config.layout === 'widescreen' && (
          <div className="divide-y divide-white/5">
            <Toggle
              label="Zoom on clicks"
              hint="Punches in where you click, then back to full screen"
              checked={!!config.wideZoom}
              onChange={(wideZoom) => update({ wideZoom })}
            />
            <Toggle
              label="Mouse effects"
              hint="Highlights the cursor and ripples on clicks"
              checked={!!config.wideMouseFx}
              onChange={(wideMouseFx) => update({ wideMouseFx })}
            />
          </div>
        )}
        {!isWide && (
          <div className="divide-y divide-white/5">
            {!isFixed && (
              <Toggle
                label="Follow mouse"
                hint="The view moves with your cursor. Off keeps it centred"
                checked={config.followMouse ?? true}
                onChange={(followMouse) => update({ followMouse })}
              />
            )}
            <Toggle
              label="Zoom on clicks"
              hint="Zooms in where you click, then back out"
              checked={clickZoomOn}
              onChange={(zoomOnClick) => update({ zoomOnClick })}
            />
            <Toggle
              label="Mouse effects"
              hint="Highlights the cursor and ripples on clicks"
              checked={config.mouseFx ?? true}
              onChange={(mouseFx) => update({ mouseFx })}
            />
          </div>
        )}
        {isFixed && (
          <Toggle
            label="Guide frame"
            hint="Outlines your area on screen while recording, so you stay inside it. Not in the video"
            checked={config.guideFrame ?? true}
            onChange={(guideFrame) => update({ guideFrame })}
          />
        )}
        {isFixed && (
          <div className="space-y-1.5 pt-1">
            <span className="block text-[12px] font-semibold text-slate-300">Drag the frame over the part you want to record</span>
            {selected ? (
              <FocusPicker stream={null} image={preview ?? selected.thumbnail} focus={config.focus ?? DEFAULT_FOCUS} onChange={(focus) => update({ focus })} />
            ) : (
              <p className="text-[12px] text-slate-400">Pick a screen or window above first.</p>
            )}
          </div>
        )}
        {clickZoomOn && (
          <div className="space-y-1.5 pt-1">
            <span className="block text-[12px] font-semibold text-slate-300">How much to zoom when you click</span>
            <div className="grid grid-cols-3 gap-1.5">
              {([
                { id: 'subtle', label: 'Gentle 1.5x' },
                { id: 'deep', label: 'Medium 1.95x' },
                { id: 'ultra', label: 'Strong 2.35x' }
              ] as const).map((z) => (
                <button
                  key={z.id}
                  type="button"
                  onClick={() => update({ zoomIntensity: z.id })}
                  aria-pressed={(config.zoomIntensity ?? 'deep') === z.id}
                  className={`py-1.5 rounded-lg text-[12px] font-bold border transition-colors cursor-pointer ${
                    (config.zoomIntensity ?? 'deep') === z.id
                      ? 'bg-indigo-600 border-indigo-500 text-white shadow-sm'
                      : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  {z.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="divide-y divide-white/5">
        <Toggle label="Camera bubble" checked={config.camera} onChange={(camera) => update({ camera })} />
        {config.camera && (
          <div className="flex items-center justify-between gap-3 py-2.5">
            <span className="text-[12px] text-slate-300">Camera position</span>
            <div role="group" aria-label="Camera position" className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-white/5 border border-white/10">
              {CAMERA_PRESETS.map((p) => {
                const active = (config.cameraPosition ?? 'bottom_left') === p.id;
                return (
                  <button
                    type="button"
                    key={p.id}
                    aria-pressed={active}
                    aria-label={p.label}
                    title={p.label}
                    onClick={() => update({ cameraPosition: p.id })}
                    className={`w-8 h-7 rounded text-[13px] font-bold cursor-pointer ${
                      active ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    {p.arrow}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {config.camera && (
          <label className="flex items-center justify-between gap-3 py-2.5">
            <span className="text-[12px] text-slate-300">Camera background</span>
            <select
              value={config.cameraBackground ?? 'none'}
              onChange={(e) => update({ cameraBackground: e.target.value as CameraBackgroundId })}
              className="px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-[12px]"
              title="Blurs or replaces what is behind you. Runs on this device."
            >
              {(Object.keys(CAMERA_BACKGROUNDS) as CameraBackgroundId[]).map((id) => (
                <option key={id} value={id} className="bg-slate-900">
                  {CAMERA_BACKGROUNDS[id].label}
                </option>
              ))}
            </select>
          </label>
        )}
        <div>
          <Toggle label="Microphone" checked={config.mic} onChange={(mic) => update({ mic })} />
          {config.mic && (
            <div className="px-1 pb-2 space-y-1">
              {mic.error ? (
                <div role="alert" className="flex flex-wrap items-center gap-2 text-[12px] text-amber-200">
                  <span>{mic.error}</span>
                  {(reel.platform === 'win32' || reel.platform === 'darwin') && (
                    <button onClick={() => reel.permissions.openSettings('microphone')} className="text-indigo-300 hover:text-indigo-200 underline cursor-pointer">
                      {reel.platform === 'darwin' ? 'Open System Settings' : 'Open Windows Settings'}
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <div
                    role="meter"
                    aria-label="Microphone level"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(mic.level * 100)}
                    className="h-2 rounded-full bg-white/10 overflow-hidden"
                  >
                    <div
                      className={`h-full rounded-full transition-[width] duration-100 ${mic.level > 0.85 ? 'bg-rose-500' : 'bg-emerald-400'}`}
                      style={{ width: `${Math.round(mic.level * 100)}%` }}
                    />
                  </div>
                  <span className="block text-[12px] text-slate-400">Say something: the bar should move. If it doesn't, check your microphone.</span>
                </>
              )}
            </div>
          )}
          {config.mic && (
            <div className="py-2.5 px-3 bg-white/[0.03] rounded-xl border border-white/5 space-y-2 mt-1 mb-2">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-bold text-slate-200 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
                  Background noise
                </span>
                <span className="text-[12px] text-indigo-400 font-bold bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20">
                  Applied when you stop
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {NOISE_MODES.map((m) => {
                  const active = (config.noiseCancellation ?? 'studio') === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => update({ noiseCancellation: m.id })}
                      className={`text-left p-2 rounded-lg border transition-all cursor-pointer ${
                        active
                          ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-sm'
                          : 'bg-white/5 border-white/5 text-slate-400 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      <span className="block text-[12px] font-bold leading-tight">{m.label}</span>
                      <span className="block text-[12px] text-slate-400 leading-tight mt-0.5">{m.hint}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <Toggle
          label="System audio"
          hint={reel.platform === 'win32' ? 'Record what your computer plays' : 'Available on Windows only'}
          checked={reel.platform === 'win32' && config.systemAudio}
          disabled={reel.platform !== 'win32'}
          onChange={(systemAudio) => update({ systemAudio })}
        />
      </section>

      <button
        onClick={() => void start()}
        disabled={!config.sourceId || starting}
        className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-extrabold cursor-pointer"
      >
        {starting ? 'Starting…' : 'Start recording'}
      </button>
      <p className="text-[12px] text-slate-500 text-center">
        The floating controls are hidden from the video. Shortcuts work in any app: Alt+Shift+P pause, Alt+Shift+S stop.
      </p>

      <LicensePanel openUrl={openCheckout} />
    </main>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(<Launcher />);
