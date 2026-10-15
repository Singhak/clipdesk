import './app.css';

const reel = window.reel;
const video = document.getElementById('webcam') as HTMLVideoElement;
const btnSize = document.getElementById('btn-size') as HTMLButtonElement;
const btnMirror = document.getElementById('btn-mirror') as HTMLButtonElement;
const btnClose = document.getElementById('btn-close') as HTMLButtonElement;

let currentSize: 'small' | 'medium' | 'large' = 'medium';
let isMirrored = true;
let stream: MediaStream | null = null;

// Start local webcam feed
async function initWebcam(): Promise<void> {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: 'user'
      },
      audio: false
    });
    if (video) {
      video.srcObject = stream;
      void video.play().catch(() => {});
    }
  } catch (err) {
    console.warn('Failed to access camera in desktop bubble:', err);
    showCameraError(err);
  }
}

/** Replaces the black circle with a plain explanation and a way forward */
function showCameraError(err: unknown): void {
  const name = err instanceof DOMException ? err.name : '';
  const text =
    name === 'NotAllowedError' || name === 'SecurityError'
      ? 'Camera access is blocked'
      : name === 'NotFoundError' || name === 'OverconstrainedError'
        ? 'No camera found'
        : name === 'NotReadableError' || name === 'AbortError'
          ? 'Camera is in use by another app'
          : 'Camera unavailable';
  const box = document.getElementById('cam-error');
  const label = document.getElementById('cam-error-text');
  if (label) label.textContent = text;
  if (box) box.hidden = false;
  // Windows and macOS both have a settings page for blocked access
  const settings = document.getElementById('btn-cam-settings');
  if (settings && name === 'NotAllowedError' && (reel.platform === 'win32' || reel.platform === 'darwin')) settings.hidden = false;
}

document.getElementById('btn-cam-off')?.addEventListener('click', (e) => {
  e.stopPropagation();
  reel.camera.close();
});
document.getElementById('btn-cam-settings')?.addEventListener('click', (e) => {
  e.stopPropagation();
  reel.permissions.openSettings('camera');
});

// Window dragging logic using Pointer Events and capture
let isDragging = false;
let startX = 0;
let startY = 0;
const bubbleCard = document.getElementById('bubble-card');

if (bubbleCard) {
  bubbleCard.addEventListener('pointerdown', (e: PointerEvent) => {
    // Only primary left click
    if (e.button !== 0) return;
    // Don't drag if clicking buttons
    if ((e.target as HTMLElement).closest('button')) return;

    isDragging = true;
    startX = e.screenX;
    startY = e.screenY;
    try {
      bubbleCard.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    e.preventDefault();
  });

  bubbleCard.addEventListener('pointermove', (e: PointerEvent) => {
    if (!isDragging) return;
    const dx = e.screenX - startX;
    const dy = e.screenY - startY;
    if (dx === 0 && dy === 0) return;
    startX = e.screenX;
    startY = e.screenY;
    reel.camera.moveBy({ x: dx, y: dy });
  });

  const onPointerEnd = (e: PointerEvent) => {
    if (isDragging) {
      isDragging = false;
      try {
        bubbleCard.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      reel.camera.syncPosition();
    }
  };

  bubbleCard.addEventListener('pointerup', onPointerEnd);
  bubbleCard.addEventListener('pointercancel', onPointerEnd);
}

// Position presets: the button swaps the toolbar for a 3x3 grid; dragging stays available for any custom spot
const posGrid = document.getElementById('pos-grid');
const toolRow = document.getElementById('tool-row');
const showPosGrid = (open: boolean): void => {
  if (posGrid) posGrid.hidden = !open;
  if (toolRow) toolRow.hidden = open;
};
document.getElementById('btn-pos')?.addEventListener('click', (e) => {
  e.stopPropagation();
  showPosGrid(true);
});
posGrid?.querySelectorAll<HTMLButtonElement>('.pos-cell').forEach((cell) => {
  cell.addEventListener('click', (e) => {
    e.stopPropagation();
    reel.camera.setPosition({ x: Number(cell.dataset.x), y: Number(cell.dataset.y) });
    showPosGrid(false);
  });
});
// Leaving the bubble puts the toolbar back, so the grid never stays open unseen
bubbleCard?.addEventListener('pointerleave', () => showPosGrid(false));

// Resize handler (Small 140 -> Medium 190 -> Large 250 -> Small)
btnSize?.addEventListener('click', (e) => {
  e.stopPropagation();
  if (currentSize === 'small') currentSize = 'medium';
  else if (currentSize === 'medium') currentSize = 'large';
  else currentSize = 'small';
  reel.camera.setSize(currentSize);
});

// Mirror toggle handler
btnMirror?.addEventListener('click', (e) => {
  e.stopPropagation();
  isMirrored = !isMirrored;
  video.style.transform = isMirrored ? 'scaleX(-1)' : 'scaleX(1)';
  reel.camera.setMirror(isMirrored);
});

// Close / Hide handler
btnClose?.addEventListener('click', (e) => {
  e.stopPropagation();
  reel.camera.close();
});

window.addEventListener('beforeunload', () => {
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
  }
});

void initWebcam();
