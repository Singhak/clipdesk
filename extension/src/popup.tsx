import './ext.css';
import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import {
  ALL_PAGES,
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
import { CAMERA_BACKGROUNDS, type CameraBackgroundId } from '../../src/core/cameraBackground';
import { LicensePanel } from '../../src/components/LicensePanel';
import { LicenseService } from '../../src/licensing/licenseService';
import { getTierConfig } from '../../src/licensing/tierFeatures';

const openUrl = (url: string) => void chrome.tabs.create({ url });

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
      {hint && <span className="block text-xs text-slate-400">{hint}</span>}
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
  const [allPages, setAllPages] = useState(false);
  const [allPagesNote, setAllPagesNote] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [isPro, setIsPro] = useState(() => LicenseService.getLicense().tier === 'pro');
  const [statusSince, setStatusSince] = useState(Date.now());

  useEffect(() => {
    void chrome.storage.local.get([CONFIG_KEY, STATE_KEY]).then((got) => {
      if (got[CONFIG_KEY]) setConfig({ ...DEFAULT_CONFIG, ...got[CONFIG_KEY] });
      setRecState({ ...IDLE_STATE, ...got[STATE_KEY] });
    });
    void chrome.tabs.query({ active: true, currentWindow: true }).then(([t]) => setTab(t ?? null));
    void permission('camera').then(setCamPerm);
    void permission('microphone').then(setMicPerm);
    void chrome.permissions.contains(ALL_PAGES).then(setAllPages);
    const onChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes[STATE_KEY]) setRecState({ ...IDLE_STATE, ...changes[STATE_KEY].newValue });
    };
    chrome.storage.onChanged.addListener(onChange);
    const unsub = LicenseService.subscribe((info) => setIsPro(info.tier === 'pro'));
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => {
      chrome.storage.onChanged.removeListener(onChange);
      window.clearInterval(id);
      unsub();
    };
  }, []);

  useEffect(() => {
    setStatusSince(Date.now());
    setConfirmDiscard(false);
  }, [state.status]);

  const update = (patch: Partial<RecordingConfig>) => {
    const next = { ...config, ...patch };
    setConfig(next);
    void chrome.storage.local.set({ [CONFIG_KEY]: next });
  };

  const url = tab?.url ?? '';
  const tabCapturable = /^https?:|^file:/.test(url) && !url.startsWith('https://chromewebstore.google.com');
  const camNeeds = config.camera && camPerm !== 'granted';
  const micNeeds = config.mic && micPerm !== 'granted';
  const needsPermission = camNeeds || micNeeds;
  const deniedWhat = [camNeeds && camPerm === 'denied' ? 'camera' : '', micNeeds && micPerm === 'denied' ? 'microphone' : ''].filter(Boolean);
  const denied = deniedWhat.length > 0;
  const freeLimit = getTierConfig(isPro).maxDurationSeconds;

  // Site access is asked for straight from the click, as Chrome requires a user gesture for the prompt
  const toggleAllPages = (on: boolean) => {
    const done = (ok: boolean) => {
      setAllPages(on ? ok : !ok);
      setAllPagesNote(
        on && !ok
          ? 'Site access was not granted, so the floating controls and cursor follow only work in the tab you start from. Turn this on and choose Allow to change that.'
          : !on && !ok
            ? 'Chrome could not remove site access. You can remove it in chrome://extensions under ClipDesk, Details.'
            : ''
      );
    };
    if (on) void chrome.permissions.request(ALL_PAGES).then(done, () => done(false));
    else void chrome.permissions.remove(ALL_PAGES).then(done, () => done(false));
  };

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
          <span role="status" className="text-sm font-bold capitalize">{state.status === 'countdown' ? 'Starting…' : state.status}</span>
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
        {!isPro && Number.isFinite(freeLimit) && state.status === 'recording' && elapsedMs(state, now) > (freeLimit - 30) * 1000 && (
          <p role="status" className="text-xs text-amber-300">
            Free plan limit: this recording stops and saves at {freeLimit} seconds.
          </p>
        )}
        <button
          onClick={() => {
            if (!confirmDiscard) {
              setConfirmDiscard(true);
              window.setTimeout(() => setConfirmDiscard(false), 4000);
            } else void send({ type: 'control', action: 'cancel' });
          }}
          className={`w-full py-1.5 rounded-lg text-xs cursor-pointer ${
            confirmDiscard ? 'bg-rose-600 text-white font-bold' : 'text-slate-400 hover:text-rose-300'
          }`}
        >
          {confirmDiscard ? 'Click again to discard (cannot be undone)' : 'Discard recording'}
        </button>
        {(state.status === 'starting' ||
          state.status === 'countdown' ||
          (state.status === 'saving' && now - statusSince > 20000)) && (
          <button
            onClick={() => void setState({ ...IDLE_STATE })}
            className="w-full py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
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
        <h1 className="text-[15px] font-extrabold">ClipDesk</h1>
        <span className="ml-auto text-xs font-bold text-indigo-300 bg-indigo-500/15 px-2 py-0.5 rounded-full">
          {config.layout === 'widescreen' ? '16:9 VIDEO' : '9:16 REEL'}
        </span>
      </div>

      {state.error && (
        <div role="alert" className="text-[12px] p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-200 space-y-1.5">
          <div>{state.error}</div>
          <button
            onClick={() => void setState({ error: undefined })}
            className="text-xs font-bold underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      <section className="space-y-1.5">
        <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Record</div>
        <Segmented
          value={config.source}
          onChange={(source) => update({ source })}
          options={[
            { id: 'tab', label: 'This tab' },
            { id: 'screen', label: 'Screen or window' }
          ]}
        />
        {config.source === 'tab' && !tabCapturable && (
          <p className="text-xs text-amber-300">Chrome pages can't be recorded as a tab. Open a website, or choose Screen or window.</p>
        )}
        {config.source === 'tab' && tabCapturable && (
          <p className="text-xs text-slate-400">Best for websites: the reel follows your cursor and zooms where you click.</p>
        )}
        {config.source === 'screen' && (
          <p className="text-xs text-slate-400">
            Cursor follow works while the pointer is over a web page in Chrome{allPages ? '.' : ', and only in this tab unless you turn on “Follow on every page” below.'}
          </p>
        )}
      </section>

      <section className="space-y-1.5">
        <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Format</div>
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
              <span className="block text-xs text-slate-400 leading-tight mt-0.5">{l.hint}</span>
            </button>
          ))}
        </div>
        <label className="block mt-1">
          <span className="block text-xs text-slate-400 mb-1">Look: sets the frame, cursor halo and camera bubble style</span>
          <select
            value={config.templateId}
            onChange={(e) => update({ templateId: e.target.value as TemplateId })}
            className="w-full px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[12px]"
          >
            {TEMPLATES.map((t) => (
              <option key={t.id} value={t.id} className="bg-slate-900">
                {t.label}
              </option>
            ))}
          </select>
        </label>
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
      </section>

      <section className="divide-y divide-white/5">
        <Toggle label="Camera bubble" checked={config.camera} onChange={(camera) => update({ camera })} />
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
        <Toggle label="Microphone" checked={config.mic} onChange={(mic) => update({ mic })} />
        <Toggle
          label="Floating controls on the page"
          hint="They are part of the page, so they can show in the video. Shortcuts: Alt+Shift+P, Alt+Shift+S"
          checked={config.showControls}
          onChange={(showControls) => update({ showControls })}
        />
        <Toggle
          label="Follow on every page"
          hint="Lets the controls and cursor follow work on pages you open while recording. Chrome asks for site access once; off keeps ClipDesk to this tab."
          checked={allPages}
          onChange={toggleAllPages}
        />
        {allPagesNote && (
          <p role="status" className="text-xs text-amber-300 py-2">
            {allPagesNote}
          </p>
        )}
      </section>

      {needsPermission && !denied && (
        <div className="space-y-1">
          <button
            onClick={() => void chrome.tabs.create({ url: chrome.runtime.getURL('permissions.html') })}
            className="w-full py-2 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-200 text-[12px] font-bold cursor-pointer"
          >
            Allow camera & mic (one time)
          </button>
          <p className="text-xs text-slate-400">Without this, your recording will have no {[camNeeds && 'camera bubble', micNeeds && 'voice-over'].filter(Boolean).join(' or ')}.</p>
        </div>
      )}
      {denied && (
        <div role="alert" className="text-xs p-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-200 space-y-1.5">
          <div>
            Chrome has blocked the {deniedWhat.join(' and ')} for ClipDesk, so asking again will not work. To fix it, open Chrome&apos;s site settings, find this
            extension and set {deniedWhat.join(' and ')} to Allow. Or turn it off above and record without it.
          </div>
          <button
            onClick={() => void chrome.tabs.create({ url: `chrome://settings/content/${deniedWhat.includes('camera') ? 'camera' : 'microphone'}` })}
            className="font-bold underline cursor-pointer"
          >
            Open Chrome {deniedWhat.includes('camera') ? 'camera' : 'microphone'} settings
          </button>
        </div>
      )}

      <button
        onClick={() => void start()}
        disabled={!tab?.id || (config.source === 'tab' && !tabCapturable)}
        className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-extrabold cursor-pointer"
      >
        Start recording
      </button>
      {!isPro && Number.isFinite(freeLimit) && (
        <p className="text-xs text-slate-400 -mt-2">
          Free plan: recordings stop automatically after {freeLimit} seconds and include a ClipDesk watermark.
        </p>
      )}

      <LicensePanel openUrl={openUrl} />
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(<Popup />);
