import './app.css';
import { ExportEngine } from '../../src/core/exportEngine';
import {
  CaptionEngine,
  type CaptionStyleId,
  type CaptionSegment,
  type CaptionCustomSettings,
  DEFAULT_CAPTION_SETTINGS,
  CAPTION_POSITION_PRESETS,
  CAPTION_SIZE_PRESETS,
  CAPTION_BG_PRESETS,
  generateSegmentsFromText,
  colorWithAlpha,
  type CaptionPositionPreset,
  type CaptionSizePreset,
  type CaptionBgPreset,
  type CaptionAlignment
} from '../../src/core/captionEngine';
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

    handleStart.style.left = `${startPct}%`;
    handleEnd.style.left = `${endPct}%`;

    trimDimLeft.style.width = `${startPct}%`;
    trimRegion.style.left = `${startPct}%`;
    trimRegion.style.width = `${Math.max(0, endPct - startPct)}%`;
    trimDimRight.style.left = `${endPct}%`;
    trimDimRight.style.width = `${100 - endPct}%`;

    timeStartEl.textContent = formatSubSec(trimStart);
    timeEndEl.textContent = formatSubSec(trimEnd);
    timeSpanEl.textContent = formatSubSec(Math.max(0, trimEnd - trimStart));
  }
  updateTrimmerUI();

  let isDraggingStart = false;
  let isDraggingEnd = false;

  function getTimeFromTrackEvent(e: MouseEvent): number {
    const rect = trimTrack.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const pct = x / rect.width;
    return pct * totalDuration;
  }

  handleStart.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    isDraggingStart = true;
  });

  handleEnd.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    isDraggingEnd = true;
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDraggingStart && !isDraggingEnd) return;
    const t = getTimeFromTrackEvent(e);

    if (isDraggingStart) {
      trimStart = Math.max(0, Math.min(trimEnd - 0.2, t));
      video.currentTime = trimStart;
    } else if (isDraggingEnd) {
      trimEnd = Math.max(trimStart + 0.2, Math.min(totalDuration, t));
      video.currentTime = trimEnd;
    }
    updateTrimmerUI();
  });

  window.addEventListener('mouseup', () => {
    isDraggingStart = false;
    isDraggingEnd = false;
  });

  trimTrack.addEventListener('click', (e) => {
    if (isDraggingStart || isDraggingEnd) return;
    const t = getTimeFromTrackEvent(e);
    video.currentTime = Math.max(trimStart, Math.min(trimEnd, t));
  });

  $('cut-start-2s').addEventListener('click', () => {
    trimStart = Math.min(trimEnd - 0.5, trimStart + 2);
    video.currentTime = trimStart;
    updateTrimmerUI();
  });

  $('cut-end-3s').addEventListener('click', () => {
    trimEnd = Math.max(trimStart + 0.5, trimEnd - 3);
    video.currentTime = trimEnd;
    updateTrimmerUI();
  });

  $('trim-reset').addEventListener('click', () => {
    trimStart = 0;
    trimEnd = totalDuration;
    video.currentTime = 0;
    updateTrimmerUI();
  });

  const applyTrimBtn = $<HTMLButtonElement>('apply-trim');
  const trimSpinner = $('trim-spinner');
  const applyTrimLabel = $('apply-trim-label');

  applyTrimBtn.addEventListener('click', async () => {
    if (trimStart <= 0.05 && trimEnd >= totalDuration - 0.05) {
      showToast('⚠️ No trim changes to apply.');
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
      renderSegmentsList();
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
  // 3. Dynamic AI Captions Studio (Desktop)
  // ==========================================
  let captionsEnabled = true;
  let currentCaptionStyle: CaptionStyleId = 'viral_karaoke';
  let captionSettings: CaptionCustomSettings = { ...DEFAULT_CAPTION_SETTINGS };
  let segments: CaptionSegment[] = CaptionEngine.generateSmartCaptions(totalDuration);

  const captionsToggle = $<HTMLInputElement>('captions-toggle');
  const captionBox = $('caption-box');
  const captionsOverlay = $('captions-overlay');

  captionsToggle.addEventListener('change', () => {
    captionsEnabled = captionsToggle.checked;
    captionsOverlay.style.display = captionsEnabled ? 'flex' : 'none';
    if (!captionsEnabled) captionBox.innerHTML = '';
  });

  // Module Tabs
  const capTabType = $('cap-tab-type');
  const capTabSpeech = $('cap-tab-speech');
  const capTabStyle = $('cap-tab-style');
  const capViewType = $('cap-view-type');
  const capViewSpeech = $('cap-view-speech');
  const capViewStyle = $('cap-view-style');

  function switchCapTab(tab: 'type' | 'speech' | 'style') {
    [capTabType, capTabSpeech, capTabStyle].forEach((btn) => {
      btn.className = 'flex-1 py-1.5 px-2.5 rounded-lg font-bold transition cursor-pointer text-slate-400 hover:text-white hover:bg-white/5';
    });
    capViewType.hidden = tab !== 'type';
    capViewSpeech.hidden = tab !== 'speech';
    capViewStyle.hidden = tab !== 'style';

    const activeBtn = tab === 'type' ? capTabType : tab === 'speech' ? capTabSpeech : capTabStyle;
    activeBtn.className = 'flex-1 py-1.5 px-2.5 rounded-lg font-bold transition cursor-pointer bg-indigo-600 text-white shadow-sm';
  }

  capTabType.addEventListener('click', () => switchCapTab('type'));
  capTabSpeech.addEventListener('click', () => switchCapTab('speech'));
  capTabStyle.addEventListener('click', () => switchCapTab('style'));

  // --- TAB 1: Manual Typing Logic ---
  const formAddCaption = $('form-add-caption') as HTMLFormElement;
  const inputCaptionText = $('input-caption-text') as HTMLInputElement;
  const inputCaptionStart = $('input-caption-start') as HTMLInputElement;
  const inputCaptionEnd = $('input-caption-end') as HTMLInputElement;

  function renderSegmentsList() {
    const list = $('segments-list');
    const countLabel = $('segments-count-label');
    countLabel.textContent = `Transcript Segments (${segments.length})`;
    list.innerHTML = '';

    if (segments.length === 0) {
      list.innerHTML = '<div class="p-3 text-center text-slate-500 bg-black/20 rounded-lg border border-dashed border-white/5">No captions added yet. Type a phrase above or dictate with speech-to-text.</div>';
      return;
    }

    segments.forEach((seg) => {
      const row = document.createElement('div');
      row.className = 'flex items-center justify-between p-1.5 bg-black/30 rounded-lg border border-white/5 text-slate-300 hover:border-white/10 gap-2';

      const timeBtn = document.createElement('span');
      timeBtn.className = 'font-mono text-[10px] text-amber-400 shrink-0 cursor-pointer hover:underline';
      timeBtn.textContent = `${seg.startSec.toFixed(1)}s - ${seg.endSec.toFixed(1)}s`;
      timeBtn.title = 'Click to seek video';
      timeBtn.addEventListener('click', () => {
        video.currentTime = seg.startSec;
      });

      const input = document.createElement('input');
      input.type = 'text';
      input.value = seg.text;
      input.className = 'flex-1 bg-transparent text-white border-b border-transparent focus:border-indigo-400 focus:outline-none px-1 text-xs truncate';
      input.addEventListener('change', () => {
        const val = input.value.trim();
        if (val) {
          seg.text = val;
          const wordsRaw = val.split(/\s+/).filter(Boolean);
          const step = (seg.endSec - seg.startSec) / Math.max(1, wordsRaw.length);
          seg.words = wordsRaw.map((w, idx) => ({
            word: w,
            startSec: seg.startSec + idx * step,
            endSec: seg.startSec + (idx + 1) * step
          }));
          renderActiveCaption();
        }
      });

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'text-slate-500 hover:text-rose-400 p-1 cursor-pointer';
      delBtn.textContent = '✕';
      delBtn.title = 'Delete';
      delBtn.addEventListener('click', () => {
        segments = segments.filter((s) => s.id !== seg.id);
        renderSegmentsList();
        renderActiveCaption();
      });

      row.appendChild(timeBtn);
      row.appendChild(input);
      row.appendChild(delBtn);
      list.appendChild(row);
    });
  }
  renderSegmentsList();

  formAddCaption.addEventListener('submit', (e) => {
    e.preventDefault();
    const txt = inputCaptionText.value.trim();
    if (!txt) return;

    const start = parseFloat(inputCaptionStart.value) || 0;
    const end = Math.max(start + 0.5, parseFloat(inputCaptionEnd.value) || start + 2);

    const wordsRaw = txt.split(/\s+/).filter(Boolean);
    const step = (end - start) / Math.max(1, wordsRaw.length);
    const words = wordsRaw.map((w, idx) => ({
      word: w,
      startSec: start + idx * step,
      endSec: start + (idx + 1) * step
    }));

    segments.push({
      id: `typed_${Date.now()}`,
      text: txt,
      startSec: start,
      endSec: end,
      words
    });

    inputCaptionText.value = '';
    inputCaptionStart.value = end.toFixed(1);
    inputCaptionEnd.value = Math.min(totalDuration, end + 2.5).toFixed(1);

    renderSegmentsList();
    renderActiveCaption();
    showToast('✓ Caption line added!');
  });

  // Script Importer
  const toggleScript = $('toggle-script-drawer');
  const scriptDrawer = $('script-drawer');
  const textScript = $('textarea-full-script') as HTMLTextAreaElement;

  toggleScript.addEventListener('click', () => {
    scriptDrawer.hidden = !scriptDrawer.hidden;
  });
  $('btn-cancel-script').addEventListener('click', () => {
    scriptDrawer.hidden = true;
  });
  $('btn-apply-script').addEventListener('click', () => {
    const val = textScript.value.trim();
    if (!val) return;
    const gen = generateSegmentsFromText(val, totalDuration);
    if (gen.length > 0) {
      segments = gen;
      renderSegmentsList();
      renderActiveCaption();
      scriptDrawer.hidden = true;
      textScript.value = '';
      showToast(`✓ Generated ${gen.length} captions from script!`);
    }
  });

  $('captions-regen').addEventListener('click', () => {
    segments = CaptionEngine.generateSmartCaptions(totalDuration);
    renderSegmentsList();
    renderActiveCaption();
    showToast('✨ Captions refreshed for video duration.');
  });

  $('btn-clear-captions').addEventListener('click', () => {
    segments = [];
    renderSegmentsList();
    renderActiveCaption();
  });

  // --- TAB 2: Web Speech API Dictation ---
  let isDictating = false;
  let speechRec: any = null;
  const btnDictate = $('btn-desktop-dictate');
  const micIcon = $('mic-icon');
  const micLabel = $('mic-label');
  const interimBubble = $('interim-bubble');
  const selectLang = $('select-speech-lang') as HTMLSelectElement;

  btnDictate.addEventListener('click', () => {
    if (isDictating) {
      if (speechRec) {
        try {
          speechRec.stop();
        } catch {}
        speechRec = null;
      }
      isDictating = false;
      micIcon.textContent = '🎙️';
      micLabel.textContent = 'Start Voice Dictation';
      btnDictate.className = 'p-4 rounded-full bg-amber-500 hover:bg-amber-400 text-black shadow-xl shadow-amber-500/25 transition-transform hover:scale-105 cursor-pointer';
      interimBubble.hidden = true;
      return;
    }

    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      showToast('❌ Web Speech API not supported in this environment.');
      return;
    }

    try {
      speechRec = new SpeechRec();
      speechRec.continuous = true;
      speechRec.interimResults = true;
      speechRec.lang = selectLang.value || 'en-US';

      speechRec.onstart = () => {
        isDictating = true;
        micIcon.textContent = '🛑';
        micLabel.textContent = 'Listening… Click to Stop';
        btnDictate.className = 'p-4 rounded-full bg-rose-500 text-white shadow-2xl shadow-rose-500/50 scale-105 animate-pulse cursor-pointer';
        interimBubble.hidden = false;
        interimBubble.textContent = 'Listening for speech…';
      };

      speechRec.onresult = (event: any) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          const transcript = res[0].transcript.trim();
          if (res.isFinal && transcript) {
            const lastSeg = segments[segments.length - 1];
            const segStart = lastSeg ? lastSeg.endSec + 0.1 : Math.max(0, video.currentTime - 1.5);
            const segEnd = Math.min(totalDuration, segStart + 2.5);
            const wordsRaw = transcript.split(/\s+/).filter(Boolean);
            const step = (segEnd - segStart) / Math.max(1, wordsRaw.length);
            const words = wordsRaw.map((w: string, idx: number) => ({
              word: w,
              startSec: segStart + idx * step,
              endSec: segStart + (idx + 1) * step
            }));
            segments.push({
              id: `speech_${Date.now()}_${i}`,
              text: transcript,
              startSec: segStart,
              endSec: segEnd,
              words
            });
            renderSegmentsList();
            renderActiveCaption();
          } else {
            interim += transcript + ' ';
          }
        }
        if (interim) interimBubble.textContent = `Transcribing: "${interim.trim()}"`;
      };

      speechRec.onerror = (e: any) => {
        console.warn('Speech error:', e);
        if (e.error !== 'no-speech') showToast(`Speech notice: ${e.error}`);
      };

      speechRec.onend = () => {
        isDictating = false;
        micIcon.textContent = '🎙️';
        micLabel.textContent = 'Start Voice Dictation';
        btnDictate.className = 'p-4 rounded-full bg-amber-500 hover:bg-amber-400 text-black shadow-xl shadow-amber-500/25 transition-transform hover:scale-105 cursor-pointer';
        interimBubble.hidden = true;
      };

      speechRec.start();
    } catch (err: any) {
      showToast('Could not start speech recognition.');
      isDictating = false;
    }
  });

  // --- TAB 3: Location, Size & Background Controls ---
  // Location
  document.querySelectorAll<HTMLButtonElement>('.btn-pos-preset').forEach((btn) => {
    btn.addEventListener('click', () => {
      const pos = btn.dataset.pos as Exclude<CaptionPositionPreset, 'custom'>;
      if (!pos) return;
      const cfg = CAPTION_POSITION_PRESETS[pos];
      captionSettings.positionPreset = pos;
      captionSettings.positionYRatio = cfg.ratio;
      ($('slider-caption-pos') as HTMLInputElement).value = String(cfg.ratio);
      $('val-location-label').textContent = `${Math.round(cfg.ratio * 100)}%`;
      document.querySelectorAll('.btn-pos-preset').forEach((b) => {
        b.className = 'btn-pos-preset p-1.5 rounded border border-white/10 hover:bg-white/10 cursor-pointer';
      });
      btn.className = 'btn-pos-preset p-1.5 rounded border border-amber-500 bg-amber-500/20 text-white font-bold cursor-pointer';
      renderActiveCaption();
    });
  });

  $('slider-caption-pos').addEventListener('input', (e) => {
    const ratio = parseFloat((e.target as HTMLInputElement).value);
    captionSettings.positionYRatio = ratio;
    captionSettings.positionPreset = 'custom';
    $('val-location-label').textContent = `${Math.round(ratio * 100)}%`;
    renderActiveCaption();
  });

  document.querySelectorAll<HTMLButtonElement>('.btn-align-preset').forEach((btn) => {
    btn.addEventListener('click', () => {
      const align = btn.dataset.align as CaptionAlignment;
      if (!align) return;
      captionSettings.alignment = align;
      document.querySelectorAll('.btn-align-preset').forEach((b) => {
        b.className = 'btn-align-preset px-2 py-0.5 rounded border border-white/10 hover:bg-white/10 cursor-pointer';
      });
      btn.className = 'btn-align-preset px-2 py-0.5 rounded border border-amber-500 bg-amber-500/20 text-white font-bold cursor-pointer';
      renderActiveCaption();
    });
  });

  // Size
  document.querySelectorAll<HTMLButtonElement>('.btn-size-preset').forEach((btn) => {
    btn.addEventListener('click', () => {
      const size = btn.dataset.size as Exclude<CaptionSizePreset, 'custom'>;
      if (!size) return;
      const cfg = CAPTION_SIZE_PRESETS[size];
      captionSettings.sizePreset = size;
      captionSettings.fontSize = cfg.fontSize;
      ($('slider-caption-size') as HTMLInputElement).value = String(cfg.fontSize);
      $('val-size-label').textContent = `${cfg.fontSize}px`;
      document.querySelectorAll('.btn-size-preset').forEach((b) => {
        b.className = 'btn-size-preset p-1.5 rounded border border-white/10 hover:bg-white/10 cursor-pointer';
      });
      btn.className = 'btn-size-preset p-1.5 rounded border border-emerald-500 bg-emerald-500/20 text-white font-bold cursor-pointer';
      renderActiveCaption();
    });
  });

  $('slider-caption-size').addEventListener('input', (e) => {
    const sz = parseInt((e.target as HTMLInputElement).value, 10);
    captionSettings.fontSize = sz;
    captionSettings.sizePreset = 'custom';
    $('val-size-label').textContent = `${sz}px`;
    renderActiveCaption();
  });

  // Background
  document.querySelectorAll<HTMLButtonElement>('.btn-bg-preset').forEach((btn) => {
    btn.addEventListener('click', () => {
      const bg = btn.dataset.bg as CaptionBgPreset;
      if (!bg) return;
      const cfg = CAPTION_BG_PRESETS[bg];
      captionSettings.bgPreset = bg;
      captionSettings.bgColor = cfg.color;
      captionSettings.bgOpacity = cfg.defaultOpacity;
      ($('slider-bg-opacity') as HTMLInputElement).value = String(cfg.defaultOpacity);
      $('val-bg-opacity-label').textContent = `${Math.round(cfg.defaultOpacity * 100)}% Opacity`;
      document.querySelectorAll('.btn-bg-preset').forEach((b) => {
        b.classList.remove('border-white', 'bg-white/15', 'text-white', 'font-bold');
        b.classList.add('border-white/10', 'text-slate-300');
      });
      btn.classList.remove('border-white/10', 'text-slate-300');
      btn.classList.add('border-white', 'bg-white/15', 'text-white', 'font-bold');
      renderActiveCaption();
    });
  });

  $('input-custom-bg-color').addEventListener('input', (e) => {
    const col = (e.target as HTMLInputElement).value;
    captionSettings.bgColor = col;
    captionSettings.bgPreset = 'custom';
    renderActiveCaption();
  });

  $('slider-bg-opacity').addEventListener('input', (e) => {
    const op = parseFloat((e.target as HTMLInputElement).value);
    captionSettings.bgOpacity = op;
    $('val-bg-opacity-label').textContent = `${Math.round(op * 100)}% Opacity`;
    renderActiveCaption();
  });

  // Caption Theme buttons
  const styleButtons = document.querySelectorAll<HTMLButtonElement>('.caption-style-btn');
  styleButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const style = btn.dataset.style as CaptionStyleId;
      if (!style) return;
      currentCaptionStyle = style;

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

    // Apply custom location (Y-axis and alignment)
    captionsOverlay.style.top = `${captionSettings.positionYRatio * 100}%`;
    captionsOverlay.style.bottom = 'auto';
    captionsOverlay.style.transform = 'translateY(-50%)';
    captionsOverlay.style.justifyContent =
      captionSettings.alignment === 'left'
        ? 'flex-start'
        : captionSettings.alignment === 'right'
          ? 'flex-end'
          : 'center';

    // Apply custom font size
    const previewScale = wide ? 0.35 : 0.30;
    const previewFontSize = Math.max(12, Math.round(captionSettings.fontSize * previewScale));
    captionBox.style.fontSize = `${previewFontSize}px`;

    // Apply custom background & opacity
    const isTransparent = captionSettings.bgPreset === 'transparent' || captionSettings.bgOpacity === 0;
    if (isTransparent) {
      captionBox.style.backgroundColor = 'transparent';
      captionBox.style.boxShadow = 'none';
      captionBox.style.border = 'none';
      captionBox.style.textShadow = '0 2px 8px rgba(0,0,0,0.95), 0 0 3px #000';
    } else {
      captionBox.style.backgroundColor = colorWithAlpha(captionSettings.bgColor, captionSettings.bgOpacity);
      captionBox.style.borderRadius = `${captionSettings.borderRadius}px`;
      captionBox.style.boxShadow = '0 10px 25px -5px rgba(0,0,0,0.6)';
      captionBox.style.border = captionSettings.hasBorder ? '1.5px solid rgba(255,255,255,0.2)' : 'none';
      captionBox.style.textShadow = '';
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
