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
  }
}

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
