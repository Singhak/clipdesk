import './app.css';
import { IDLE_STATE, RecState } from '../shared';

// 3-2-1 before the take starts. Camera takes first show a "place your camera, then Start" panel here.
// Content-protected like the control bar.

const reel = window.reel;
const num = document.getElementById('num')!;
const ready = document.getElementById('ready')!;
const counting = document.getElementById('counting')!;
let state: RecState = { ...IDLE_STATE };

document.getElementById('cancel')!.addEventListener('click', () => reel.control('cancel'));
document.getElementById('ready-cancel')!.addEventListener('click', () => reel.control('cancel'));
document.getElementById('start')!.addEventListener('click', () => reel.control('start'));

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') reel.control('cancel');
});

const notice = document.getElementById('notice')!;
let lastNum = '';

function tick(): void {
  notice.hidden = !state.notice;
  notice.textContent = state.notice ?? '';
  ready.hidden = state.status !== 'ready';
  counting.hidden = state.status === 'ready';
  if (state.status !== 'countdown' || !state.countdownEndsAt) {
    num.textContent = '';
    lastNum = '';
    return;
  }
  // Only touch the text when the digit changes, so the live region announces 3, 2, 1 once each
  const next = String(Math.max(1, Math.ceil((state.countdownEndsAt - Date.now()) / 1000)));
  if (next !== lastNum) {
    lastNum = next;
    num.textContent = next;
  }
}

reel.onState((s) => (state = s));
void reel.getState().then((s) => (state = s));
window.setInterval(tick, 100);
