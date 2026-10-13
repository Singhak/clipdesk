import './app.css';
import React, { useCallback, useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import type { TemplateId } from '../../src/core/types';
import { LicensePanel } from '../../src/components/LicensePanel';
import { openCheckout } from './license';
import {
  DEFAULT_DESKTOP_CONFIG,
  DesktopConfig,
  DesktopLayout,
  IDLE_STATE,
  NoiseSuppressionMode,
  RecState,
  SourceInfo,
  elapsedMs,
  formatTime
} from '../shared';

const reel = window.reel;
const CONFIG_STORAGE = 'clipdesk.desktopConfig';

const LAYOUTS: { id: DesktopLayout; label: string; hint: string }[] = [
  { id: 'dynamic_crop', label: 'Follow cursor', hint: '9:16 crop that follows your mouse and zooms on clicks' },
  { id: 'blur_backdrop', label: 'Blur backdrop', hint: 'Whole screen in the middle, blurred copy behind it' },
  { id: 'gradient_mesh', label: 'Gradient', hint: 'Whole screen on a gradient background' },
  { id: 'widescreen', label: '16:9 video', hint: 'Classic landscape video, like Loom' }
];

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
      {hint && <span className="block text-[11px] text-slate-400">{hint}</span>}
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
  <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-slate-400">
    <span>{children}</span>
    {action}
  </div>
);

const Launcher: React.FC = () => {
  const [config, setConfig] = useState<DesktopConfig>(loadSavedConfig);
  const [state, setRecState] = useState<RecState>(IDLE_STATE);
  const [sources, setSources] = useState<SourceInfo[] | null>(null);
  const [kind, setKind] = useState<'screen' | 'window'>('screen');
  const [now, setNow] = useState(Date.now());
  const [starting, setStarting] = useState(false);

  const refresh = useCallback(async () => {
    const list = await reel.getSources();
    setSources(list);
    setConfig((c) => (list.some((s) => s.id === c.sourceId) ? c : { ...c, sourceId: list.find((s) => s.kind === 'screen')?.id ?? '' }));
  }, []);

  useEffect(() => {
    void refresh();
    void reel.getState().then(setRecState);
    const off = reel.onState((s) => {
      setRecState(s);
      if (s.status === 'idle') setStarting(false);
    });
    const id = window.setInterval(() => setNow(Date.now()), 250);
    // Window list goes stale while the launcher sits in the background
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      off();
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

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
          <span className="text-base font-bold capitalize">{state.status === 'countdown' ? 'Starting…' : state.status === 'ready' ? 'Place your camera' : state.status}</span>
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
        <button onClick={() => reel.control('cancel')} className="py-1.5 text-[12px] text-slate-400 hover:text-rose-300 cursor-pointer">
          Discard recording
        </button>
        <p className="text-[12px] text-slate-500">You can close this window. The floating bar, the tray icon and Alt+Shift+P / Alt+Shift+S keep working.</p>
      </main>
    );
  }

  const shown = sources?.filter((s) => s.kind === kind) ?? [];
  const selected = sources?.find((s) => s.id === config.sourceId);
  const isWindow = selected?.kind === 'window';

  return (
    <main className="p-5 space-y-5">
      <header className="flex items-center gap-2">
        <img src="icons/icon-32.png" alt="" className="w-7 h-7" />
        <h1 className="text-[17px] font-extrabold">ClipDesk</h1>
        <span className="ml-auto text-[10px] font-bold text-indigo-300 bg-indigo-500/15 px-2 py-0.5 rounded-full">9:16 RECORDER</span>
      </header>

      {state.error && (
        <div role="alert" className="text-[12px] p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-200">
          {state.error}
        </div>
      )}

      <section className="space-y-2">
        <SectionTitle
          action={
            <button onClick={() => void refresh()} className="normal-case tracking-normal text-indigo-300 hover:text-indigo-200 cursor-pointer">
              Refresh
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
              {kind === 'screen' ? 'No screens found. Check the screen recording permission.' : 'No windows found.'}
            </p>
          )}
          {shown.map((s) => (
            <button
              key={s.id}
              onClick={() => update({ sourceId: s.id })}
              aria-pressed={config.sourceId === s.id}
              title={s.name}
              className={`text-left rounded-xl border p-1.5 cursor-pointer ${
                config.sourceId === s.id ? 'border-indigo-500 bg-indigo-500/15' : 'border-white/10 bg-white/5 hover:bg-white/10'
              }`}
            >
              <img src={s.thumbnail} alt="" className="w-full aspect-video object-contain rounded-md bg-black" />
              <span className="flex items-center gap-1.5 mt-1 text-[11px] font-semibold">
                {s.appIcon && <img src={s.appIcon} alt="" className="w-3.5 h-3.5" />}
                <span className="truncate">{s.name}</span>
              </span>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-slate-400">
          {isWindow
            ? 'Window recording keeps the crop centred. Pick a screen to have the reel follow your cursor and zoom on clicks.'
            : 'The reel follows your cursor anywhere on this screen and zooms where you click.'}
        </p>
      </section>

      <section className="space-y-2">
        <SectionTitle>Format</SectionTitle>
        <div className="grid grid-cols-2 gap-1.5">
          {LAYOUTS.map((l) => (
            <button
              key={l.id}
              onClick={() => update({ layout: l.id })}
              aria-pressed={config.layout === l.id}
              className={`text-left px-2.5 py-2 rounded-xl border cursor-pointer ${
                config.layout === l.id ? 'border-indigo-500 bg-indigo-500/15' : 'border-white/10 bg-white/5 hover:bg-white/10'
              }`}
            >
              <span className="block text-[12px] font-bold">{l.label}</span>
              <span className="block text-[10px] text-slate-400 leading-tight mt-0.5">{l.hint}</span>
            </button>
          ))}
        </div>
        <select
          value={config.templateId}
          onChange={(e) => update({ templateId: e.target.value as TemplateId })}
          className="w-full px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[12px]"
          aria-label="Camera style"
        >
          {TEMPLATES.map((t) => (
            <option key={t.id} value={t.id} className="bg-slate-900">
              Camera style: {t.label}
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
        {(config.layout === 'dynamic_crop' || (config.layout === 'widescreen' && config.wideZoom)) && (
          <div className="space-y-1.5 pt-1">
            <span className="block text-[11px] font-semibold text-slate-300">Click Zoom Intensity</span>
            <div className="grid grid-cols-3 gap-1.5">
              {([
                { id: 'subtle', label: 'Subtle 1.5x' },
                { id: 'deep', label: 'Deep 1.95x' },
                { id: 'ultra', label: 'Ultra 2.35x' }
              ] as const).map((z) => (
                <button
                  key={z.id}
                  type="button"
                  onClick={() => update({ zoomIntensity: z.id })}
                  aria-pressed={(config.zoomIntensity ?? 'deep') === z.id}
                  className={`py-1.5 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
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
        <div>
          <Toggle label="Microphone" checked={config.mic} onChange={(mic) => update({ mic })} />
          {config.mic && (
            <div className="py-2.5 px-3 bg-white/[0.03] rounded-xl border border-white/5 space-y-2 mt-1 mb-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-200 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
                  Noise Cancellation
                </span>
                <span className="text-[9.5px] text-indigo-400 font-bold bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20">
                  Fan, AC & Traffic Filter
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { id: 'studio', label: 'Studio Clear', hint: 'Kills fan & traffic rumble + dynamic gate' },
                  { id: 'fan_killer', label: 'Fan & Traffic Killer', hint: 'Aggressive filter for loud fans & AC' },
                  { id: 'mild', label: 'Mild Ambient', hint: 'Light reduction, natural room warmth' },
                  { id: 'off', label: 'Off / Raw', hint: 'Direct microphone without DSP' }
                ].map((m) => {
                  const active = (config.noiseCancellation ?? 'studio') === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => update({ noiseCancellation: m.id as NoiseSuppressionMode })}
                      className={`text-left p-2 rounded-lg border transition-all cursor-pointer ${
                        active
                          ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-sm'
                          : 'bg-white/5 border-white/5 text-slate-400 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      <span className="block text-[11px] font-bold leading-tight">{m.label}</span>
                      <span className="block text-[9.5px] text-slate-400 leading-tight mt-0.5">{m.hint}</span>
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
      <p className="text-[11px] text-slate-500 text-center">
        The floating controls are hidden from the video. Shortcuts work in any app: Alt+Shift+P pause, Alt+Shift+S stop.
      </p>

      <LicensePanel openUrl={openCheckout} />
    </main>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(<Launcher />);
