import { clampFocus, focusSize } from '../../src/core/focusRegion';
import { ControlAction, IDLE_STATE, RecState, STATE_KEY, elapsedMs, formatTime, send } from './shared';

// Injected by the service worker when a recording starts (see injectControls in background.ts). Shows the floating control bar,
// the 3-2-1 countdown, and reports the pointer so the reel camera can follow it and zoom on clicks.

declare global {
  interface Window {
    __clipdeskControls?: boolean;
  }
}

if (!window.__clipdeskControls && window.top === window) {
  window.__clipdeskControls = true;
  init();
}

function init(): void {
  let state: RecState = { ...IDLE_STATE };
  let host: HTMLDivElement | null = null;
  let root: ShadowRoot | null = null;
  let timerId: number | null = null;
  let collapsed = false;
  let confirmCancel = false;
  let pos: { x: number; y: number } | null = null;

  const control = (action: ControlAction) => void send({ type: 'control', action });

  const css = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
    .bar { position: fixed; z-index: 2147483647; display: flex; align-items: center; gap: 6px; padding: 6px 8px;
      border-radius: 999px; background: rgba(10, 13, 22, 0.94); border: 1.5px solid #6366f1; color: #fff;
      box-shadow: 0 8px 30px rgba(0,0,0,0.45), 0 0 24px rgba(99,102,241,0.35); user-select: none; font-size: 13px; }
    .grip { cursor: grab; color: #818cf8; padding: 2px 2px 2px 4px; font-size: 14px; line-height: 1; letter-spacing: -2px; }
    .grip:active { cursor: grabbing; }
    .dot { width: 10px; height: 10px; border-radius: 50%; background: #f43f5e; box-shadow: 0 0 0 0 rgba(244,63,94,0.6); animation: pulse 1.4s infinite; }
    .dot.paused { background: #f59e0b; animation: none; }
    @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(244,63,94,0.6); } 70% { box-shadow: 0 0 0 8px rgba(244,63,94,0); } 100% { box-shadow: 0 0 0 0 rgba(244,63,94,0); } }
    .time { font-variant-numeric: tabular-nums; font-weight: 800; min-width: 44px; }
    button { all: unset; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 5px;
      height: 30px; min-width: 30px; padding: 0 9px; border-radius: 999px; font-size: 12px; font-weight: 700;
      background: rgba(255,255,255,0.1); color: #fff; }
    button:hover { background: rgba(255,255,255,0.2); }
    button:focus-visible { outline: 2px solid #a5b4fc; outline-offset: 1px; }
    .stop { background: #e11d48; }
    .stop:hover { background: #f43f5e; }
    .on { background: rgba(99,102,241,0.35); }
    .danger { background: rgba(244,63,94,0.25); color: #fecdd3; }
    .sep { width: 1px; height: 18px; background: rgba(255,255,255,0.15); }
    .icon { width: 14px; height: 14px; display: block; }
    .countdown { position: fixed; inset: 0; z-index: 2147483647; display: flex; flex-direction: column; align-items: center;
      justify-content: center; gap: 18px; background: rgba(5, 6, 10, 0.55); color: #fff; }
    .num { font-size: 140px; font-weight: 900; line-height: 1; text-shadow: 0 10px 40px rgba(99,102,241,0.6); }
    .hint { font-size: 14px; color: #e2e8f0; }
  `;

  const icon = {
    pause: '<svg class="icon" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
    play: '<svg class="icon" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
    stop: '<svg class="icon" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
    cam: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 10l5-3v10l-5-3z"/><rect x="3" y="6" width="12" height="12" rx="2"/></svg>',
    trash: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
    min: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 12h12"/></svg>'
  };

  function ensureHost(): ShadowRoot {
    if (root) return root;
    host = document.createElement('div');
    host.id = 'clipdesk-controls';
    // Closed shadow root: page styles and scripts can't restyle or click the controls
    root = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = css;
    root.appendChild(style);
    document.documentElement.appendChild(host);
    return root;
  }

  function teardown(): void {
    if (timerId !== null) window.clearInterval(timerId);
    timerId = null;
    host?.remove();
    host = null;
    root = null;
    confirmCancel = false;
  }

  function button(html: string, title: string, onClick: () => void, cls = ''): HTMLButtonElement {
    const b = document.createElement('button');
    b.innerHTML = html;
    b.title = title;
    b.setAttribute('aria-label', title);
    if (cls) b.className = cls;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
    return b;
  }

  function placeBar(bar: HTMLElement): void {
    if (pos) {
      bar.style.left = `${pos.x}px`;
      bar.style.top = `${pos.y}px`;
    } else {
      bar.style.left = '20px';
      bar.style.bottom = '20px';
    }
  }

  function makeDraggable(bar: HTMLElement, grip: HTMLElement): void {
    grip.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const rect = bar.getBoundingClientRect();
      const dx = e.clientX - rect.left;
      const dy = e.clientY - rect.top;
      const move = (ev: PointerEvent) => {
        pos = {
          x: Math.max(4, Math.min(window.innerWidth - rect.width - 4, ev.clientX - dx)),
          y: Math.max(4, Math.min(window.innerHeight - rect.height - 4, ev.clientY - dy))
        };
        bar.style.bottom = '';
        placeBar(bar);
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  }

  function renderCountdown(r: ShadowRoot): void {
    const wrap = document.createElement('div');
    wrap.className = 'countdown';
    const num = document.createElement('div');
    num.className = 'num';
    wrap.setAttribute('role', 'status');
    wrap.setAttribute('aria-live', 'polite');
    wrap.setAttribute('aria-label', 'Recording countdown');
    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = 'Recording starts soon. Alt+Shift+P pauses, Alt+Shift+S stops.';
    const cancel = button('Cancel', 'Cancel recording', () => control('cancel'));
    wrap.append(num, hint, cancel);
    r.appendChild(wrap);
    const tick = () => {
      const left = Math.max(0, (state.countdownEndsAt ?? 0) - Date.now());
      num.textContent = String(Math.max(1, Math.ceil(left / 1000)));
    };
    tick();
    timerId = window.setInterval(tick, 100);
  }

  function renderBar(r: ShadowRoot): void {
    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'ClipDesk recording controls');
    placeBar(bar);

    const grip = document.createElement('span');
    grip.className = 'grip';
    grip.textContent = '⋮⋮';
    grip.title = 'Drag to move';
    makeDraggable(bar, grip);

    const paused = state.status === 'paused';
    const dot = document.createElement('span');
    dot.className = paused ? 'dot paused' : 'dot';
    const time = document.createElement('span');
    time.className = 'time';
    const tick = () => {
      time.textContent = state.status === 'saving' ? 'Saving…' : formatTime(elapsedMs(state));
    };
    tick();
    timerId = window.setInterval(tick, 250);

    bar.append(grip, dot, time);
    if (state.status === 'saving') {
      r.appendChild(bar);
      return;
    }

    if (!collapsed) {
      bar.append(
        button(paused ? `${icon.play}Resume` : `${icon.pause}Pause`, paused ? 'Resume (Alt+Shift+P)' : 'Pause (Alt+Shift+P)', () =>
          control('togglePause')
        ),
        button(`${icon.stop}Stop`, 'Stop and save (Alt+Shift+S)', () => control('stop'), 'stop'),
        button(icon.cam, state.camera ? 'Turn camera bubble off' : 'Turn camera bubble on', () => control('toggleCamera'), state.camera ? 'on' : '')
      );
      const sep = document.createElement('span');
      sep.className = 'sep';
      bar.append(
        sep,
        confirmCancel
          ? button('Discard?', 'Click again to discard this recording', () => control('cancel'), 'danger')
          : button(icon.trash, 'Discard recording', () => {
              confirmCancel = true;
              render();
              setTimeout(() => {
                confirmCancel = false;
                render();
              }, 3000);
            })
      );
    }
    bar.append(
      button(collapsed ? '›' : icon.min, collapsed ? 'Show controls' : 'Minimize controls', () => {
        collapsed = !collapsed;
        render();
      })
    );
    r.appendChild(bar);
  }

  // Dashed outline of the fixed area. It sits just outside the area, so the crop leaves it out of the video.
  let guideHost: HTMLDivElement | null = null;
  function renderGuide(): void {
    const on = !!state.guide && (state.status === 'countdown' || state.status === 'recording' || state.status === 'paused');
    if (!on) {
      guideHost?.remove();
      guideHost = null;
      return;
    }
    const W = window.innerWidth;
    const H = window.innerHeight;
    const f = clampFocus(state.guide!, W, H);
    const { w, h } = focusSize(f.zoom, W, H);
    if (!guideHost) {
      guideHost = document.createElement('div');
      guideHost.id = 'clipdesk-guide';
      guideHost.style.cssText =
        'position:fixed;z-index:2147483646;pointer-events:none;box-sizing:content-box;outline:3px dashed #818cf8;outline-offset:3px;border-radius:2px';
      document.documentElement.appendChild(guideHost);
    }
    guideHost.style.left = `${(f.cx - w / 2) * W}px`;
    guideHost.style.top = `${(f.cy - h / 2) * H}px`;
    guideHost.style.width = `${w * W}px`;
    guideHost.style.height = `${h * H}px`;
  }
  window.addEventListener('resize', renderGuide);

  function render(): void {
    renderGuide();
    const visible =
      state.showControls && (state.status === 'countdown' || state.status === 'recording' || state.status === 'paused' || state.status === 'saving');
    teardown();
    if (!visible) return;
    const r = ensureHost();
    if (state.status === 'countdown') renderCountdown(r);
    else renderBar(r);
  }

  // Pointer → reel camera. Only while recording, only from the focused page, at most ~30 per second.
  const recordingNow = () => state.status === 'recording' || state.status === 'countdown';
  const sample = (e: MouseEvent) => {
    const availLeft = (screen as Screen & { availLeft?: number }).availLeft ?? 0;
    const availTop = (screen as Screen & { availTop?: number }).availTop ?? 0;
    return {
      vx: e.clientX / window.innerWidth,
      vy: e.clientY / window.innerHeight,
      sx: (e.screenX - availLeft) / screen.width,
      sy: (e.screenY - availTop) / screen.height,
      wx: (e.screenX - window.screenX) / window.outerWidth,
      wy: (e.screenY - window.screenY) / window.outerHeight
    };
  };
  let lastSent = 0;
  window.addEventListener(
    'mousemove',
    (e) => {
      if (!recordingNow()) return;
      const now = performance.now();
      if (now - lastSent < 33) return;
      lastSent = now;
      void send({ type: 'pointer', click: false, p: sample(e) });
    },
    { capture: true, passive: true }
  );
  window.addEventListener(
    'mousedown',
    (e) => {
      if (!recordingNow() || e.button !== 0) return;
      // Clicks on the control bar itself shouldn't zoom the reel
      if (host && e.composedPath().includes(host)) return;
      void send({ type: 'pointer', click: true, p: sample(e) });
    },
    { capture: true, passive: true }
  );

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[STATE_KEY]) return;
    state = { ...IDLE_STATE, ...changes[STATE_KEY].newValue };
    render();
  });
  void chrome.storage.local.get(STATE_KEY).then((got) => {
    state = { ...IDLE_STATE, ...got[STATE_KEY] };
    render();
  });
}
