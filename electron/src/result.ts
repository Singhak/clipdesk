import './app.css';
import { ExportEngine } from '../../src/core/exportEngine';
import { CaptionEngine, type CaptionStyleId, type CaptionSegment } from '../../src/core/captionEngine';
import { formatTime } from '../shared';

const reel = window.reel;
const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

function formatSubSec(sec: number): string {
  const clamped = Math.max(0, sec);
  const m = Math.floor(clamped / 60);
  const s = Math.floor(clamped % 60);
  const ms = Math.floor((clamped % 1) * 10);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${ms}`;
}

async function main(): Promise<void> {
  const id = location.hash.slice(1);
  let got = id ? await reel.result.get(id) : null;
  if (!got) {
    $('title').textContent = 'Recording not found';
    $('meta').textContent = 'The file may have been moved or deleted.';
    $('actions').hidden = true;
    const suite = $('editor-suite');
    if (suite) suite.hidden = true;
    return;
  }

  let { meta, bytes } = got;
  let activeUrl = '';
  const video = $<HTMLVideoElement>('video');
  const wide = meta.layout === 'widescreen';
  video.classList.toggle('wide', wide);

  function loadVideoBlob(videoBytes: Uint8Array, videoPath: string): Blob {
    if (activeUrl) URL.revokeObjectURL(activeUrl);
    const blob = new Blob([videoBytes as BlobPart], {
      type: videoPath.endsWith('.webm') ? 'video/webm' : 'video/mp4'
    });
    activeUrl = URL.createObjectURL(blob);
    video.src = activeUrl;
    return blob;
  }

  let currentBlob = loadVideoBlob(bytes, meta.path);
  let totalDuration = (await ExportEngine.probeDuration(currentBlob)) ?? meta.timerMs / 1000;
  if (totalDuration <= 0) totalDuration = 1;

  function updateMetaDisplay() {
    const ext = meta.path.split('.').pop()!.toUpperCase();
    $('title').textContent = wide ? 'Your video is ready' : 'Your reel is ready';
    $('meta').textContent = `${wide ? '1920 × 1080' : '1080 × 1920'} · ${formatTime(totalDuration * 1000)} · ${ext} · ${(meta.size / 1e6).toFixed(1)} MB`;
    $('path').textContent = `Saved to ${meta.path}`;
  }
  updateMetaDisplay();

  const notes = [...meta.warnings];
  if (totalDuration !== null && meta.timerMs >= 3000 && totalDuration * 1000 < meta.timerMs * 0.6) {
    notes.unshift(
      `The file is ${totalDuration.toFixed(1)} s long but you recorded for ${formatTime(meta.timerMs)}, so part of the recording was lost.`
    );
  }
  if (notes.length) {
    const notesEl = $('notes');
    notesEl.hidden = false;
    notesEl.textContent = notes.join(' ');
  }

  // Toast feedback helper
  function showToast(msg: string) {
    const toast = $('toast');
    toast.textContent = msg;
    toast.hidden = false;
    setTimeout(() => {
      toast.hidden = true;
    }, 3800);
  }

  // ==========================================
  // 1. Play / Pause & Playhead Handling
  // ==========================================
  const playPauseBtn = $('play-pause-btn');
  const playIcon = $('play-icon');
  const playText = $('play-text');

  function updatePlayBtn() {
    if (video.paused) {
      playIcon.textContent = '▶';
      playText.textContent = 'Play';
    } else {
      playIcon.textContent = '⏸';
      playText.textContent = 'Pause';
    }
  }

  playPauseBtn.addEventListener('click', () => {
    if (video.paused) {
      if (video.currentTime >= trimEnd || video.currentTime < trimStart) {
        video.currentTime = trimStart;
      }
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  });

  video.addEventListener('play', updatePlayBtn);
  video.addEventListener('pause', updatePlayBtn);

  // Spacebar shortcut to toggle play
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && (e.target === document.body || e.target === video)) {
      e.preventDefault();
      if (video.paused) {
        if (video.currentTime >= trimEnd || video.currentTime < trimStart) {
          video.currentTime = trimStart;
        }
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    }
  });

  // ==========================================
  // 2. Timeline Trimmer
  // ==========================================
  let trimStart = 0;
  let trimEnd = totalDuration;

  const trimTrack = $('trim-track');
  const trimDimLeft = $('trim-dim-left');
  const trimRegion = $('trim-region');
  const trimDimRight = $('trim-dim-right');
  const handleStart = $('handle-start');
  const handleEnd = $('handle-end');
  const playhead = $('playhead');

  const timeStartEl = $('trim-time-start');
  const timeEndEl = $('trim-time-end');
  const timeSpanEl = $('trim-time-span');

  function updateTrimmerUI() {
    const dur = Math.max(0.1, totalDuration);
    const startPct = Math.max(0, Math.min(100, (trimStart / dur) * 100));
    const endPct = Math.max(0, Math.min(100, (trimEnd / dur) * 100));

    trimDimLeft.style.width = `${startPct}%`;
    trimRegion.style.left = `${startPct}%`;
    trimRegion.style.width = `${Math.max(0, endPct - startPct)}%`;
    trimDimRight.style.left = `${endPct}%`;
    trimDimRight.style.width = `${Math.max(0, 100 - endPct)}%`;

    handleStart.style.left = `calc(${startPct}% - 7px)`;
    handleEnd.style.left = `calc(${endPct}% - 7px)`;

    timeStartEl.textContent = formatSubSec(trimStart);
    timeEndEl.textContent = formatSubSec(trimEnd);
    timeSpanEl.textContent = formatSubSec(Math.max(0, trimEnd - trimStart));
  }
  updateTrimmerUI();

  function seekTo(sec: number) {
    video.currentTime = Math.max(0, Math.min(totalDuration, sec));
  }

  // Handle Dragging
  let isDraggingStart = false;
  let isDraggingEnd = false;

  handleStart.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    isDraggingStart = true;
    document.body.style.cursor = 'ew-resize';
  });

  handleEnd.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    isDraggingEnd = true;
    document.body.style.cursor = 'ew-resize';
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDraggingStart && !isDraggingEnd) return;
    const rect = trimTrack.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const sec = ratio * totalDuration;

    if (isDraggingStart) {
      trimStart = Math.min(trimEnd - 0.2, Math.max(0, sec));
      seekTo(trimStart);
    } else if (isDraggingEnd) {
      trimEnd = Math.max(trimStart + 0.2, Math.min(totalDuration, sec));
      seekTo(trimEnd);
    }
    updateTrimmerUI();
  });

  window.addEventListener('mouseup', () => {
    if (isDraggingStart || isDraggingEnd) {
      isDraggingStart = false;
      isDraggingEnd = false;
      document.body.style.cursor = 'default';
    }
  });

  // Track click seeking
  trimTrack.addEventListener('click', (e) => {
    if (e.target === handleStart || e.target === handleEnd) return;
    const rect = trimTrack.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const sec = ratio * totalDuration;
    seekTo(sec);
  });

  // Quick Cut Presets
  $('cut-start-2s').addEventListener('click', () => {
    trimStart = Math.min(trimEnd - 0.5, Math.max(0, trimStart + 2));
    seekTo(trimStart);
    updateTrimmerUI();
  });

  $('cut-end-3s').addEventListener('click', () => {
    trimEnd = Math.max(trimStart + 0.5, Math.min(totalDuration, trimEnd - 3));
    seekTo(trimEnd);
    updateTrimmerUI();
  });

  $('trim-reset').addEventListener('click', () => {
    trimStart = 0;
    trimEnd = totalDuration;
    seekTo(0);
    updateTrimmerUI();
  });

  // Apply Trim & Save with Native FFmpeg
  const applyTrimBtn = $<HTMLButtonElement>('apply-trim');
  const trimSpinner = $('trim-spinner');
  const applyTrimLabel = $('apply-trim-label');

  applyTrimBtn.addEventListener('click', async () => {
    if (trimStart <= 0 && trimEnd >= totalDuration - 0.05) {
      showToast('⚠️ No trim span selected. Adjust handles to trim.');
      return;
    }

    applyTrimBtn.disabled = true;
    trimSpinner.hidden = false;
    applyTrimLabel.textContent = 'Trimming with native FFmpeg…';

    try {
      const trimmed = await reel.result.trim(id, trimStart, trimEnd);
      if (!trimmed) {
        showToast('❌ Trim processing failed. Check logs.');
        return;
      }

      meta = trimmed.meta;
      bytes = trimmed.bytes;
      currentBlob = loadVideoBlob(bytes, meta.path);
      totalDuration = (await ExportEngine.probeDuration(currentBlob)) ?? meta.timerMs / 1000;
      trimStart = 0;
      trimEnd = totalDuration;

      updateMetaDisplay();
      updateTrimmerUI();
      segments = CaptionEngine.generateSmartCaptions(totalDuration);
      renderActiveCaption();

      showToast(`✅ Trimmed to ${formatSubSec(totalDuration)} and saved to disk with native FFmpeg!`);
      video.play().catch(() => {});
    } catch (err) {
      console.error('Trim error:', err);
      showToast('❌ Error during trimming.');
    } finally {
      applyTrimBtn.disabled = false;
      trimSpinner.hidden = true;
      applyTrimLabel.textContent = '✂️ Apply Trim & Save';
    }
  });

  // ==========================================
  // 3. Dynamic AI Captions
  // ==========================================
  let captionsEnabled = true;
  let currentCaptionStyle: CaptionStyleId = 'viral_karaoke';
  let segments: CaptionSegment[] = CaptionEngine.generateSmartCaptions(totalDuration);

  const captionsToggle = $<HTMLInputElement>('captions-toggle');
  const captionBox = $('caption-box');
  const captionsOverlay = $('captions-overlay');

  captionsToggle.addEventListener('change', () => {
    captionsEnabled = captionsToggle.checked;
    captionsOverlay.style.display = captionsEnabled ? 'flex' : 'none';
    if (!captionsEnabled) captionBox.innerHTML = '';
  });

  $('captions-regen').addEventListener('click', () => {
    segments = CaptionEngine.generateSmartCaptions(totalDuration);
    renderActiveCaption();
    showToast('✨ Captions refreshed for video duration.');
  });

  // Caption Style Selection
  const styleButtons = document.querySelectorAll<HTMLButtonElement>('.caption-style-btn');
  styleButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const style = btn.dataset.style as CaptionStyleId;
      if (!style) return;
      currentCaptionStyle = style;

      // Update button visual active state
      styleButtons.forEach((b) => {
        b.classList.remove('border-indigo-500', 'bg-indigo-500/20');
        b.classList.add('border-white/10', 'bg-white/5');
      });
      btn.classList.remove('border-white/10', 'bg-white/5');
      btn.classList.add('border-indigo-500', 'bg-indigo-500/20');

      renderActiveCaption();
    });
  });

  function renderActiveCaption() {
    if (!captionsEnabled) {
      captionBox.innerHTML = '';
      return;
    }

    const cur = video.currentTime;
    const activeSeg = segments.find((s) => cur >= s.startSec && cur <= s.endSec);
    if (!activeSeg) {
      captionBox.innerHTML = '';
      return;
    }

    captionBox.className = `caption-${currentCaptionStyle}`;
    captionBox.innerHTML = '';

    for (const w of activeSeg.words) {
      const span = document.createElement('span');
      span.textContent = w.word;
      if (cur >= w.startSec && cur <= w.endSec + 0.1) {
        span.className = 'word-active';
      }
      captionBox.appendChild(span);
    }
  }

  // Video Time Update: Trimmer Loop & Playhead & Captions
  video.addEventListener('timeupdate', () => {
    const cur = video.currentTime;

    // Loop within trim region during playback
    if (cur >= trimEnd) {
      video.currentTime = trimStart;
    } else if (cur < trimStart && !video.paused) {
      video.currentTime = trimStart;
    }

    // Playhead position
    const dur = Math.max(0.1, totalDuration);
    const pct = Math.max(0, Math.min(100, (cur / dur) * 100));
    playhead.style.left = `${pct}%`;

    // Render captions
    renderActiveCaption();
  });

  // ==========================================
  // 4. Standard Action Buttons
  // ==========================================
  $('folder').addEventListener('click', () => reel.result.showInFolder(id));
  $('save-as').addEventListener('click', async () => {
    const saved = await reel.result.saveAs(id);
    if (saved) {
      $('path').textContent = `Saved to ${saved}`;
      showToast(`📁 Saved copy to: ${saved}`);
    }
  });
  $('again').addEventListener('click', () => reel.result.recordAgain());
  $('trash').addEventListener('click', async () => {
    const btn = $('trash') as HTMLButtonElement;
    if (btn.dataset.confirm !== '1') {
      btn.dataset.confirm = '1';
      btn.textContent = reel.platform === 'darwin' ? 'Move to Trash?' : 'Move to Recycle Bin?';
      return;
    }
    video.pause();
    video.removeAttribute('src');
    video.load();
    if (activeUrl) URL.revokeObjectURL(activeUrl);
    if (await reel.result.trash(id)) window.close();
  });

  // Auto-play preview within trim bounds
  video.currentTime = trimStart;
  video.play().catch(() => {});
}

void main();
