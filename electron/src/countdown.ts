import './app.css';
import { IDLE_STATE, RecState } from '../shared';
import { DEFAULT_FOCUS, FocusRegion, clampFocus, focusSize } from '../../src/core/focusRegion';

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

// Fixed-area takes: drag a 9:16 frame over a live view of the screen, then Start
const picker = document.getElementById('picker')!;
const pickerArea = document.getElementById('picker-area') as HTMLDivElement;
const pickerImg = document.getElementById('picker-img') as HTMLImageElement;
const pickerBox = document.getElementById('picker-box') as HTMLDivElement;
const pickerZoom = document.getElementById('picker-zoom') as HTMLInputElement;
const pickerZoomVal = document.getElementById('picker-zoom-val')!;
const readyTitle = document.getElementById('ready-title')!;
const readyHint = document.getElementById('ready-hint')!;
let focus: FocusRegion = DEFAULT_FOCUS;
let src = { w: 1920, h: 1080 };
let dragging = false;

function drawPicker(): void {
  const f = clampFocus(focus, src.w, src.h);
  const { w, h } = focusSize(f.zoom, src.w, src.h);
  pickerBox.style.left = `${(f.cx - w / 2) * 100}%`;
  pickerBox.style.top = `${(f.cy - h / 2) * 100}%`;
  pickerBox.style.width = `${w * 100}%`;
  pickerBox.style.height = `${h * 100}%`;
  pickerZoom.value = String(f.zoom);
  pickerZoomVal.textContent = `${f.zoom.toFixed(2)}x`;
}

function changeFocus(next: FocusRegion): void {
  focus = clampFocus(next, src.w, src.h);
  drawPicker();
  reel.setFocus(focus);
}

function moveTo(clientX: number, clientY: number): void {
  const r = pickerArea.getBoundingClientRect();
  if (r.width === 0) return;
  changeFocus({ ...focus, cx: (clientX - r.left) / r.width, cy: (clientY - r.top) / r.height });
}

pickerArea.addEventListener('pointerdown', (e) => {
  dragging = true;
  pickerArea.setPointerCapture(e.pointerId);
  moveTo(e.clientX, e.clientY);
});
pickerArea.addEventListener('pointermove', (e) => dragging && moveTo(e.clientX, e.clientY));
pickerArea.addEventListener('pointerup', () => (dragging = false));
pickerArea.addEventListener('pointercancel', () => (dragging = false));
pickerZoom.addEventListener('input', () => changeFocus({ ...focus, zoom: Number(pickerZoom.value) }));
pickerImg.addEventListener('load', () => {
  if (pickerImg.naturalWidth > 0 && (pickerImg.naturalWidth !== src.w || pickerImg.naturalHeight !== src.h)) {
    src = { w: pickerImg.naturalWidth, h: pickerImg.naturalHeight };
    pickerArea.style.aspectRatio = `${src.w} / ${src.h}`;
    drawPicker();
  }
});
reel.onPickerFrame((dataUrl) => (pickerImg.src = dataUrl));
void reel.getConfig().then((c) => {
  if (c.focus) focus = c.focus;
  drawPicker();
});

const notice = document.getElementById('notice')!;
let lastNum = '';

function tick(): void {
  notice.hidden = !state.notice;
  notice.textContent = state.notice ?? '';
  ready.hidden = state.status !== 'ready';
  const picking = state.status === 'ready' && !!state.areaPick;
  picker.hidden = !picking;
  if (picking) {
    readyTitle.textContent = 'Choose the area to record';
    readyHint.textContent = `Drag the frame over the part of the screen you want${state.camera ? '. The camera bubble can be moved too' : ''}. Nothing is being recorded yet.`;
  }
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
