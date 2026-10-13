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

function tick(): void {
  ready.hidden = state.status !== 'ready';
  counting.hidden = state.status === 'ready';
  if (state.status !== 'countdown' || !state.countdownEndsAt) {
    num.textContent = '';
    return;
  }
  num.textContent = String(Math.max(1, Math.ceil((state.countdownEndsAt - Date.now()) / 1000)));
}

reel.onState((s) => (state = s));
void reel.getState().then((s) => (state = s));
window.setInterval(tick, 100);
