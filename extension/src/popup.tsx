import './ext.css';
import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import {
  CONFIG_KEY,
  DEFAULT_CONFIG,
  ExtLayout,
  IDLE_STATE,
  RecState,
  RecordingConfig,
  STATE_KEY,
  elapsedMs,
  formatTime,
  send,
  setState
} from './shared';
import type { TemplateId } from '../../src/core/types';

const LAYOUTS: { id: ExtLayout; label: string; hint: string }[] = [
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

type PermissionStatus = 'granted' | 'prompt' | 'denied' | 'unknown';

async function permission(name: 'camera' | 'microphone'): Promise<PermissionStatus> {
  try {
    return (await navigator.permissions.query({ name: name as PermissionName })).state as PermissionStatus;
  } catch {
    return 'unknown';
  }
}

const Toggle: React.FC<{ label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }> = ({
  label,
  checked,
  onChange,
  hint
}) => (
  <label className="flex items-center justify-between gap-3 py-1.5 cursor-pointer">
    <span>
      <span className="block text-[13px] font-semibold">{label}</span>
      {hint && <span className="block text-[11px] text-slate-400">{hint}</span>}
    </span>
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4 accent-indigo-500" />
  </label>
);

const Segmented = <T extends string>({
  value,
  options,
  onChange
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
}) => (
  <div className="grid gap-1 p-1 rounded-xl bg-white/5 border border-white/10" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
    {options.map((o) => (
      <button
        key={o.id}
        onClick={() => onChange(o.id)}
        aria-pressed={value === o.id}
        className={`px-2 py-1.5 rounded-lg text-[12px] font-semibold cursor-pointer ${
          value === o.id ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-white/10'
        }`}
      >
        {o.label}
      </button>
    ))}
  </div>
);

const Popup: React.FC = () => {
  const [config, setConfig] = useState<RecordingConfig>(DEFAULT_CONFIG);
  const [state, setRecState] = useState<RecState>(IDLE_STATE);
  const [now, setNow] = useState(Date.now());
  const [tab, setTab] = useState<chrome.tabs.Tab | null>(null);
  const [camPerm, setCamPerm] = useState<PermissionStatus>('unknown');
  const [micPerm, setMicPerm] = useState<PermissionStatus>('unknown');

  useEffect(() => {
    void chrome.storage.local.get([CONFIG_KEY, STATE_KEY]).then((got) => {
      if (got[CONFIG_KEY]) setConfig({ ...DEFAULT_CONFIG, ...got[CONFIG_KEY] });
      setRecState({ ...IDLE_STATE, ...got[STATE_KEY] });
    });
    void chrome.tabs.query({ active: true, currentWindow: true }).then(([t]) => setTab(t ?? null));
    void permission('camera').then(setCamPerm);
    void permission('microphone').then(setMicPerm);
    const onChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes[STATE_KEY]) setRecState({ ...IDLE_STATE, ...changes[STATE_KEY].newValue });
    };
    chrome.storage.onChanged.addListener(onChange);
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => {
      chrome.storage.onChanged.removeListener(onChange);
      window.clearInterval(id);
    };
  }, []);

  const update = (patch: Partial<RecordingConfig>) => {
    const next = { ...config, ...patch };
    setConfig(next);
    void chrome.storage.local.set({ [CONFIG_KEY]: next });
  };

  const url = tab?.url ?? '';
  const tabCapturable = /^https?:|^file:/.test(url) && !url.startsWith('https://chromewebstore.google.com');
  const needsPermission = (config.camera && camPerm !== 'granted') || (config.mic && micPerm !== 'granted');

  const start = async () => {
    if (!tab?.id) return;
    await send({ type: 'start', config, tabId: tab.id });
    window.close();
  };

  if (state.status !== 'idle') {
    const paused = state.status === 'paused';
    return (
      <div className="w-[300px] p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${paused ? 'bg-amber-400' : 'bg-rose-500 animate-pulse'}`} />
          <span className="text-sm font-bold capitalize">{state.status === 'countdown' ? 'Starting…' : state.status}</span>
          <span className="ml-auto font-mono text-lg font-black">{formatTime(elapsedMs(state, now))}</span>
        </div>
        {(state.status === 'recording' || state.status === 'paused') && (
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => void send({ type: 'control', action: 'togglePause' })}
              className="py-2 rounded-xl bg-white/10 hover:bg-white/20 text-sm font-bold cursor-pointer"
            >
              {paused ? 'Resume' : 'Pause'}
            </button>
            <button
              onClick={() => void send({ type: 'control', action: 'stop' })}
              className="py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-sm font-extrabold cursor-pointer"
            >
              Stop & save
            </button>
          </div>
        )}
        <button
          onClick={() => void send({ type: 'control', action: 'cancel' })}
          className="w-full py-1.5 rounded-lg text-[12px] text-slate-400 hover:text-rose-300 cursor-pointer"
        >
          Discard recording
        </button>
        {state.status === 'starting' && (
          <button
            onClick={() => void setState({ ...IDLE_STATE })}
            className="w-full py-1.5 rounded-lg text-[11px] text-slate-500 hover:text-slate-300 cursor-pointer"
          >
            Stuck? Reset
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="w-[340px] p-4 space-y-4">
      <div className="flex items-center gap-2">
        <img src="icons/icon-32.png" alt="" className="w-6 h-6" />
        <h1 className="text-[15px] font-extrabold">ReelScreen</h1>
        <span className="ml-auto text-[10px] font-bold text-indigo-300 bg-indigo-500/15 px-2 py-0.5 rounded-full">9:16 RECORDER</span>
      </div>

      {state.error && (
        <div role="alert" className="text-[12px] p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-200">
          {state.error}
        </div>
      )}

      <section className="space-y-1.5">
        <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Record</div>
        <Segmented
          value={config.source}
          onChange={(source) => update({ source })}
          options={[
            { id: 'tab', label: 'This tab' },
            { id: 'screen', label: 'Screen or window' }
          ]}
        />
        {config.source === 'tab' && !tabCapturable && (
          <p className="text-[11px] text-amber-300">Chrome pages can't be recorded as a tab. Open a website, or choose Screen or window.</p>
        )}
        {config.source === 'tab' && tabCapturable && (
          <p className="text-[11px] text-slate-400">Best for websites: the reel follows your cursor and zooms where you click.</p>
        )}
        {config.source === 'screen' && (
          <p className="text-[11px] text-slate-400">Cursor follow works while the pointer is over a web page in Chrome.</p>
        )}
      </section>

      <section className="space-y-1.5">
        <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Format</div>
        <div className="grid grid-cols-2 gap-1.5">
          {LAYOUTS.map((l) => (
            <button
              key={l.id}
              onClick={() => update({ layout: l.id })}
              aria-pressed={config.layout === l.id}
              title={l.hint}
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
          className="w-full mt-1 px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[12px]"
          aria-label="Camera style"
        >
          {TEMPLATES.map((t) => (
            <option key={t.id} value={t.id} className="bg-slate-900">
              Camera style: {t.label}
            </option>
          ))}
        </select>
      </section>

      <section className="divide-y divide-white/5">
        <Toggle label="Camera bubble" checked={config.camera} onChange={(camera) => update({ camera })} />
        <Toggle label="Microphone" checked={config.mic} onChange={(mic) => update({ mic })} />
        <Toggle
          label="Floating controls on the page"
          hint="They are part of the page, so they can show in the video. Shortcuts: Alt+Shift+P, Alt+Shift+S"
          checked={config.showControls}
          onChange={(showControls) => update({ showControls })}
        />
      </section>

      {needsPermission && (
        <button
          onClick={() => void chrome.tabs.create({ url: chrome.runtime.getURL('permissions.html') })}
          className="w-full py-2 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-200 text-[12px] font-bold cursor-pointer"
        >
          Allow camera & mic (one time)
        </button>
      )}

      <button
        onClick={() => void start()}
        disabled={!tab?.id || (config.source === 'tab' && !tabCapturable)}
        className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-extrabold cursor-pointer"
      >
        Start recording
      </button>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(<Popup />);
