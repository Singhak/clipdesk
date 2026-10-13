import './app.css';
import { ControlAction, IDLE_STATE, RecState, elapsedMs, formatTime } from '../shared';

// Floating control bar. Its window is content-protected, so it stays out of the recording.

const reel = window.reel;
let state: RecState = { ...IDLE_STATE };
let collapsed = false;
let showPreview = false;
let confirmDiscard = false;

const icon = {
  pause: '<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
  play: '<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
  stop: '<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
  cam: '<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 10l5-3v10l-5-3z"/><rect x="3" y="6" width="12" height="12" rx="2"/></svg>',
  eye: '<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
  trash: '<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  min: '<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 12h12"/></svg>',
  expand: '<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 6l-6 6 6 6"/></svg>'
};

const btn = 'no-drag inline-flex items-center justify-center gap-1.5 h-8 min-w-8 px-2.5 rounded-full text-[12px] font-bold cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-300';
const root = document.getElementById('bar')!;
const control = (action: ControlAction) => reel.control(action);

function button(id: string, html: string, label: string, extra = 'bg-white/10 hover:bg-white/20'): string {
  return `<button id="${id}" class="${btn} ${extra}" title="${label}" aria-label="${label}">${html}</button>`;
}

function updateWindowDimensions(): void {
  const width = collapsed ? 150 : 440;
  const height = collapsed ? 60 : showPreview ? 280 : 60;
  reel.setControlsSize({ width, height });
}

function togglePreview(): void {
  showPreview = !showPreview;
  const pipContainer = document.getElementById('pip-container');
  if (pipContainer) {
    pipContainer.classList.toggle('hidden', !showPreview);
  }
  updateWindowDimensions();
  render();
}

function statusLabel(): string {
  if (state.status === 'saving') {
    // Real progress while FFmpeg converts the take to MP4
    return typeof state.progress === 'number' && state.progress > 0 ? `Converting… ${state.progress}%` : 'Saving…';
  }
  if (state.status === 'ready') return 'Set up';
  if (state.status === 'countdown' || state.status === 'starting') return 'Get ready';
  return '';
}

function render(): void {
  // Re-rendering replaces every button, so remember which one had focus and give it back
  const focusedId = document.activeElement instanceof HTMLElement ? document.activeElement.id : '';
  const paused = state.status === 'paused';
  const live = state.status === 'recording' || paused;
  const saving = state.status === 'saving';
  const ready = state.status === 'ready';
  const status = statusLabel();

  const head = `
    <span class="drag px-1 text-indigo-400 text-sm tracking-[-2px] cursor-grab" title="Drag to move">⋮⋮</span>
    <span class="w-2.5 h-2.5 rounded-full ${paused ? 'bg-amber-400' : 'bg-rose-500 rec-dot'}"></span>
    <span id="time" role="timer" aria-live="off" class="drag font-extrabold tabular-nums min-w-11 text-[13px]">${status || formatTime(elapsedMs(state))}</span>`;

  if (collapsed) {
    root.innerHTML = head + button('expand', icon.expand, 'Show controls');
  } else if (confirmDiscard && live) {
    // Two explicit choices instead of a timed "click again": nothing expires while the user thinks
    root.innerHTML =
      head +
      `<span role="alert" class="text-[13px] font-bold px-1 whitespace-nowrap">Discard this recording?</span>` +
      button('discard-yes', '<span>Discard</span>', 'Discard the recording permanently', 'bg-rose-600 hover:bg-rose-500') +
      button('discard-no', '<span>Keep recording</span>', 'Keep recording (Esc)');
  } else {
    root.innerHTML =
      head +
      (live
        ? `<span class="w-px h-4.5 bg-white/15"></span>` +
          button('pause', paused ? icon.play : icon.pause, paused ? 'Resume (Alt+Shift+P)' : 'Pause (Alt+Shift+P)') +
          button('stop', `${icon.stop}<span>Stop</span>`, 'Stop and save (Alt+Shift+S)', 'bg-rose-600 hover:bg-rose-500') +
          button('camera', icon.cam, state.camera ? 'Hide camera' : 'Show camera', state.camera ? 'bg-indigo-500/40 hover:bg-indigo-500/60' : 'bg-white/10 hover:bg-white/20') +
          button('preview', icon.eye, showPreview ? 'Hide live preview' : 'Show live preview', showPreview ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white/10 hover:bg-white/20') +
          button('discard', icon.trash, 'Discard recording')
        : ready
          ? `<span class="w-px h-4.5 bg-white/15"></span>` +
            button('start', `${icon.play}<span>Start</span>`, 'Start recording', 'bg-rose-600 hover:bg-rose-500') +
            button('camera', icon.cam, state.camera ? 'Hide camera' : 'Show camera', state.camera ? 'bg-indigo-500/40 hover:bg-indigo-500/60' : 'bg-white/10 hover:bg-white/20') +
            button('preview', icon.eye, showPreview ? 'Hide live preview' : 'Show live preview', showPreview ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white/10 hover:bg-white/20') +
            button('discard', '<span>Cancel</span>', 'Cancel recording')
          : state.status === 'countdown'
            ? button('discard', '<span>Cancel</span>', 'Cancel recording')
            : '') +
      (saving ? '' : button('collapse', icon.min, 'Minimize controls'));
  }

  root.querySelector('#pause')?.addEventListener('click', () => control('togglePause'));
  root.querySelector('#start')?.addEventListener('click', () => control('start'));
  root.querySelector('#stop')?.addEventListener('click', () => control('stop'));
  root.querySelector('#camera')?.addEventListener('click', () => control('toggleCamera'));
  root.querySelector('#preview')?.addEventListener('click', () => togglePreview());
  root.querySelector('#discard')?.addEventListener('click', () => {
    if (state.status === 'countdown' || ready) {
      control('cancel');
      return;
    }
    confirmDiscard = true;
    render();
  });
  root.querySelector('#discard-yes')?.addEventListener('click', () => {
    confirmDiscard = false;
    control('cancel');
  });
  root.querySelector('#discard-no')?.addEventListener('click', () => {
    confirmDiscard = false;
    render();
  });
  root.querySelector('#collapse')?.addEventListener('click', () => setCollapsed(true));
  root.querySelector('#expand')?.addEventListener('click', () => setCollapsed(false));

  // Confirming moves focus to the safe choice; otherwise keep it where it was
  const next = confirmDiscard && live ? 'discard-no' : focusedId === 'discard-no' || focusedId === 'discard-yes' ? 'discard' : focusedId;
  if (next) document.getElementById(next)?.focus();
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && confirmDiscard) {
    confirmDiscard = false;
    render();
  }
});

function setCollapsed(next: boolean): void {
  collapsed = next;
  if (collapsed && showPreview) {
    showPreview = false;
    document.getElementById('pip-container')?.classList.add('hidden');
  }
  updateWindowDimensions();
  reel.setControlsCollapsed(next);
  render();
}

function tick(): void {
  const el = document.getElementById('time');
  if (el && (state.status === 'recording' || state.status === 'paused')) el.textContent = formatTime(elapsedMs(state));
}

reel.onPreviewFrame((dataUrl) => {
  if (!showPreview) return;
  const pipImg = document.getElementById('pip-img') as HTMLImageElement | null;
  if (pipImg) pipImg.src = dataUrl;
});

reel.onState((s) => {
  const changed = s.status !== state.status || s.camera !== state.camera;
  const progressed = s.progress !== state.progress;
  state = s;
  if (state.status !== 'recording' && state.status !== 'paused') confirmDiscard = false;
  if (changed) render();
  else if (progressed) {
    const el = document.getElementById('time');
    if (el && state.status === 'saving') el.textContent = statusLabel();
  }
});

void reel.getState().then((s) => {
  state = s;
  render();
});

window.setInterval(tick, 250);

