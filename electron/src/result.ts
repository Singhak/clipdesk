import './app.css';
import {
  CaptionEngine,
  type CaptionStyleId,
  type CaptionSegment,
  type CaptionCustomSettings,
  DEFAULT_CAPTION_SETTINGS,
  CAPTION_POSITION_PRESETS,
  CAPTION_SIZE_PRESETS,
  CAPTION_BG_PRESETS,
  CAPTION_STYLES,
  generateSegmentsFromText,
  colorWithAlpha,
  type CaptionPositionPreset,
  type CaptionSizePreset,
  type CaptionBgPreset,
  type CaptionAlignment
} from '../../src/core/captionEngine';
import { formatTime } from '../shared';
import { CutTimeline } from '../../src/components/cutTimeline';
import { cutsFromKept, remapCaptions, type TimeRange } from '../../src/core/cutList';

const reel = window.reel;
const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

function formatSubSec(sec: number): string {
  const clamped = Math.max(0, sec);
  const m = Math.floor(clamped / 60);
  const s = Math.floor(clamped % 60);
  const ms = Math.floor((clamped % 1) * 10);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${ms}`;
}

/** Duration from the video element's metadata, or null if it can't be read in time */
function probeDuration(video: HTMLVideoElement, timeoutMs = 5000): Promise<number | null> {
  return new Promise((resolve) => {
    const done = (value: number | null) => {
      window.clearTimeout(timer);
      video.removeEventListener('loadedmetadata', onMeta);
      video.removeEventListener('error', onError);
      resolve(value);
    };
    const onMeta = () => done(Number.isFinite(video.duration) ? video.duration : null);
    const onError = () => done(null);
    const timer = window.setTimeout(() => done(null), timeoutMs);
    if (video.readyState >= 1) return onMeta();
    video.addEventListener('loadedmetadata', onMeta);
    video.addEventListener('error', onError);
  });
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

  let { meta } = got;
  const { mediaUrl } = got;
  const video = $<HTMLVideoElement>('video');
  const wide = meta.layout === 'widescreen';
  video.classList.toggle('wide', wide);

  // The editor always shows the untouched take (main streams the source even after an edit was saved)
  video.src = mediaUrl;
  /** Loads the whole take into memory: only for transcription, which decodes all of its audio anyway */
  const loadTakeBlob = async (): Promise<Blob> => (await fetch(mediaUrl)).blob();
  const probed = (await probeDuration(video)) ?? meta.timerMs / 1000;
  const totalDuration = probed > 0 ? probed : 1;
  const lengthOf = (ranges: TimeRange[]) => ranges.reduce((n, r) => n + r.endSec - r.startSec, 0);

  function updateMetaDisplay() {
    const ext = meta.path.split('.').pop()!.toUpperCase();
    const length = meta.kept ? lengthOf(meta.kept) : totalDuration;
    $('title').textContent = wide ? 'Your video is ready' : 'Your reel is ready';
    $('meta').textContent = `${wide ? '1920 × 1080' : '1080 × 1920'} · ${formatTime(length * 1000)} · ${ext} · ${(meta.size / 1e6).toFixed(1)} MB`;
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
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'ml-2 px-2 py-0.5 rounded-md bg-white/10 hover:bg-white/20 font-semibold text-amber-100 cursor-pointer';
    open.textContent = 'Open folder';
    open.addEventListener('click', () => reel.result.showInFolder(id));
    notesEl.appendChild(open);
  }

  // Toast feedback helper
  let toastTimer: number | undefined;
  const TOAST_OK = 'w-full max-w-2xl p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-xs text-emerald-300 font-semibold transition-all';
  const TOAST_ERR = 'w-full max-w-2xl p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-xs text-rose-200 font-semibold transition-all';
  /** Errors stay until dismissed or replaced and can carry actions (Try again, Open folder) */
  function showToast(msg: string, opts: { error?: boolean; actions?: { label: string; run: () => void }[] } = {}) {
    const toast = $('toast');
    window.clearTimeout(toastTimer);
    toast.className = opts.error ? TOAST_ERR : TOAST_OK;
    toast.setAttribute('role', opts.error ? 'alert' : 'status');
    toast.textContent = msg.replace(/^[^\w\s]+\s*/u, '');
    for (const action of opts.actions ?? []) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ml-2 px-2 py-0.5 rounded-md bg-white/10 hover:bg-white/20 cursor-pointer';
      b.textContent = action.label;
      b.addEventListener('click', () => {
        toast.hidden = true;
        action.run();
      });
      toast.appendChild(b);
    }
    toast.hidden = false;
    if (!opts.error) toastTimer = window.setTimeout(() => (toast.hidden = true), 3800);
  }
  const openFolder = { label: 'Open folder', run: () => reel.result.showInFolder(id) };

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

  playPauseBtn.addEventListener('click', () => timeline.togglePlay());

  video.addEventListener('play', updatePlayBtn);
  video.addEventListener('pause', updatePlayBtn);

  // Spacebar shortcut to toggle play
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && (e.target === document.body || e.target === video)) {
      e.preventDefault();
      timeline.togglePlay();
    }
  });

  // ==========================================
  // 2. Cut editor
  // ==========================================
  // Cuts are kept as an edit of the source and only rendered on save, so undo works until then and
  // a saved edit can be changed again later.
  const cutState = $('cut-state');
  const applyCutsBtn = $<HTMLButtonElement>('apply-cuts');
  const cutSpinner = $('cut-spinner');
  const applyCutsLabel = $('apply-cuts-label');
  /** What the file on disk keeps */
  let savedKept: TimeRange[] = meta.kept ?? [{ startSec: 0, endSec: totalDuration }];
  let savingCuts = false;

  const sameRanges = (a: TimeRange[], b: TimeRange[]) =>
    a.length === b.length &&
    a.every((r, i) => Math.abs(r.startSec - b[i].startSec) < 1e-3 && Math.abs(r.endSec - b[i].endSec) < 1e-3);

  function updateCutState(kept: TimeRange[]) {
    const dirty = !sameRanges(kept, savedKept);
    applyCutsBtn.disabled = !dirty || savingCuts;
    cutState.textContent = dirty ? 'Unsaved edits' : meta.sourcePath ? 'Edited video saved' : '';
  }

  const timeline = new CutTimeline($('cut-editor'), video, {
    onChange: (_cuts, kept) => updateCutState(kept),
    notify: showToast
  });
  timeline.setDuration(totalDuration, meta.kept ? cutsFromKept(meta.kept, totalDuration) : []);

  async function saveCuts(): Promise<void> {
    const kept = timeline.keptRanges;
    savingCuts = true;
    updateCutState(kept);
    cutSpinner.hidden = false;
    applyCutsLabel.textContent = 'Saving edited video…';
    try {
      const updated = await reel.result.cut(id, kept, totalDuration);
      if (!updated) {
        showToast("Couldn't save the edited video. Your original recording is untouched.", {
          error: true,
          actions: [{ label: 'Try again', run: () => void saveCuts() }, openFolder]
        });
        return;
      }
      meta = updated;
      savedKept = kept;
      updateMetaDisplay();
      showToast(
        meta.kept ? `✅ Saved the edited video (${formatSubSec(lengthOf(kept))})` : '✅ Back to the original recording'
      );
    } catch (err) {
      console.error('Cut error:', err);
      showToast('Something went wrong while saving the edit. Your original recording is untouched.', {
        error: true,
        actions: [{ label: 'Try again', run: () => void saveCuts() }, openFolder]
      });
    } finally {
      savingCuts = false;
      cutSpinner.hidden = true;
      applyCutsLabel.textContent = 'Save edited video';
      updateCutState(timeline.keptRanges);
    }
  }
  applyCutsBtn.addEventListener('click', () => void saveCuts());

  // ==========================================
  // 3. Dynamic AI Captions Studio (Desktop)
  // ==========================================
  // Off and empty until the user adds captions: nothing placeholder ends up in an export
  let captionsEnabled = false;
  let currentCaptionStyle: CaptionStyleId = 'viral_karaoke';
  let captionSettings: CaptionCustomSettings = { ...DEFAULT_CAPTION_SETTINGS };
  let segments: CaptionSegment[] = [];

  const captionsToggle = $<HTMLInputElement>('captions-toggle');
  const captionBox = $('caption-box');
  const captionsOverlay = $('captions-overlay');

  function setCaptionsEnabled(on: boolean) {
    captionsEnabled = on;
    captionsToggle.checked = on;
    captionsOverlay.style.display = on ? 'flex' : 'none';
    if (!on) captionBox.innerHTML = '';
    updateExportButton();
  }

  captionsToggle.addEventListener('change', () => setCaptionsEnabled(captionsToggle.checked));
  captionsOverlay.style.display = 'none';

  // Export with captions: libass burns the same styling the preview shows, in a native ffmpeg pass
  const exportCaptionsBtn = $<HTMLButtonElement>('export-captions');
  function updateExportButton() {
    exportCaptionsBtn.hidden = !captionsEnabled || segments.length === 0;
  }
  reel.result.onBurnProgress((sec) => {
    const pct = Math.min(99, Math.round((sec / Math.max(0.1, lengthOf(timeline.keptRanges))) * 100));
    exportCaptionsBtn.textContent = `Burning captions… ${pct}%`;
  });
  async function exportCaptions(): Promise<void> {
    exportCaptionsBtn.disabled = true;
    exportCaptionsBtn.textContent = 'Burning captions…';
    try {
      const w = video.videoWidth || (wide ? 1920 : 1080);
      const h = video.videoHeight || (wide ? 1080 : 1920);
      // Captions are timed against the source; with cuts they move onto the cut timeline
      const cut = timeline.cuts.length > 0;
      const kept = timeline.keptRanges;
      const lines = cut ? remapCaptions(segments, kept) : segments;
      const ass = CaptionEngine.toASS(lines, CAPTION_STYLES[currentCaptionStyle], captionSettings, w, h);
      const out = cut
        ? await reel.result.burnCaptions(id, ass, kept, totalDuration)
        : await reel.result.burnCaptions(id, ass);
      $('path').textContent = `Saved to ${out}`;
      showToast('✅ Exported a copy with burned-in captions');
    } catch (err) {
      console.error('Caption export failed:', err);
      showToast("Couldn't export the video with captions. Your recording is untouched.", {
        error: true,
        actions: [{ label: 'Try again', run: () => void exportCaptions() }, openFolder]
      });
    } finally {
      exportCaptionsBtn.disabled = false;
      exportCaptionsBtn.textContent = 'Export with captions';
    }
  }
  exportCaptionsBtn.addEventListener('click', () => void exportCaptions());

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
    countLabel.textContent = `Caption lines (${segments.length})`;
    updateExportButton();
    list.innerHTML = '';

    if (segments.length === 0) {
      list.innerHTML = '<div class="p-3 text-center text-slate-500 bg-black/20 rounded-lg border border-dashed border-white/5">No captions added yet. Type a phrase above or dictate with speech-to-text.</div>';
      return;
    }

    segments.forEach((seg) => {
      const row = document.createElement('div');
      row.className = 'flex items-center justify-between p-1.5 bg-black/30 rounded-lg border border-white/5 text-slate-300 hover:border-white/10 gap-2';

      const timeBtn = document.createElement('span');
      timeBtn.className = 'font-mono text-[12px] text-amber-400 shrink-0 cursor-pointer hover:underline';
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
    setCaptionsEnabled(true);
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
      setCaptionsEnabled(true);
      showToast(`✓ Generated ${gen.length} captions from script!`);
    }
  });

  $('btn-clear-captions').addEventListener('click', () => {
    segments = [];
    renderSegmentsList();
    renderActiveCaption();
  });

  // --- TAB 2: On-device transcription (Whisper in a worker) ---
  const selectLang = $<HTMLSelectElement>('select-speech-lang');
  const btnTranscribe = $<HTMLButtonElement>('btn-transcribe');
  const transcribeStatus = $('transcribe-status');

  btnTranscribe.addEventListener('click', async () => {
    btnTranscribe.disabled = true;
    transcribeStatus.hidden = false;
    transcribeStatus.textContent = 'Preparing audio…';
    try {
      const lang = selectLang.value;
      const result = await CaptionEngine.transcribeWithLocalWhisper({
        blob: await loadTakeBlob(),
        language: lang,
        model: lang === 'en' ? 'Xenova/whisper-tiny.en' : 'Xenova/whisper-base',
        onProgress: ({ status }) => {
          transcribeStatus.textContent = status;
        }
      });
      if (result.length === 0) {
        transcribeStatus.textContent = 'No speech was found in this recording.';
        return;
      }
      segments = result;
      setCaptionsEnabled(true);
      renderSegmentsList();
      renderActiveCaption();
      transcribeStatus.textContent = `Done: ${result.length} caption lines. Edit them in the Type Captions tab.`;
      showToast(`✓ Transcribed ${result.length} caption lines`);
    } catch (err) {
      console.error('Transcription failed:', err);
      console.error('Transcription failed:', err);
      transcribeStatus.textContent =
        "Couldn't create captions from speech. The first run needs an internet connection to download the speech model. Check your connection and try again.";
    } finally {
      btnTranscribe.disabled = false;
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
    // A dragged position no longer matches a preset, so none stays highlighted
    document.querySelectorAll('.btn-pos-preset').forEach((b) => {
      b.className = 'btn-pos-preset p-1.5 rounded border border-white/10 hover:bg-white/10 cursor-pointer';
    });
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
    // Highlight the preset this size matches, if any
    document.querySelectorAll<HTMLButtonElement>('.btn-size-preset').forEach((b) => {
      const preset = CAPTION_SIZE_PRESETS[b.dataset.size as Exclude<CaptionSizePreset, 'custom'>];
      b.className =
        preset?.fontSize === sz
          ? 'btn-size-preset p-1.5 rounded border border-emerald-500 bg-emerald-500/20 text-white font-bold cursor-pointer'
          : 'btn-size-preset p-1.5 rounded border border-white/10 hover:bg-white/10 cursor-pointer';
    });
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
    // Raising the opacity with "None" picked would change nothing; switch to the custom color instead
    if (captionSettings.bgPreset === 'transparent' && op > 0) {
      captionSettings.bgPreset = 'custom';
      captionSettings.bgColor = $<HTMLInputElement>('input-custom-bg-color').value;
      document.querySelectorAll('.btn-bg-preset').forEach((b) => {
        b.classList.remove('border-white', 'bg-white/15', 'text-white', 'font-bold');
        b.classList.add('border-white/10', 'text-slate-300');
      });
    }
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
    // The overlay is a column, so horizontal placement is the cross axis
    captionsOverlay.style.alignItems =
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

  // Captions follow playback; the cut timeline moves its own playhead and skips cut parts
  video.addEventListener('timeupdate', renderActiveCaption);

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
  const trashBtn = $('trash') as HTMLButtonElement;
  const binName = reel.platform === 'darwin' ? 'Trash' : 'Recycle Bin';
  const trashLabel = `Move to ${binName}`;
  trashBtn.textContent = trashLabel;
  let trashTimer: number | undefined;
  function resetTrash() {
    window.clearTimeout(trashTimer);
    delete trashBtn.dataset.confirm;
    trashBtn.textContent = trashLabel;
    trashBtn.classList.remove('bg-rose-600', 'text-white');
  }
  // Esc backs out of the confirmation
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && trashBtn.dataset.confirm === '1') resetTrash();
  });
  trashBtn.addEventListener('click', async () => {
    if (trashBtn.dataset.confirm !== '1') {
      trashBtn.dataset.confirm = '1';
      trashBtn.textContent = `Yes, move to ${binName}`;
      trashBtn.classList.add('bg-rose-600', 'text-white');
      showToast(`This moves the video to the ${binName}. You can restore it from there. Click again to confirm, or press Esc to cancel.`);
      trashTimer = window.setTimeout(resetTrash, 8000);
      return;
    }
    window.clearTimeout(trashTimer);
    try {
      if (await reel.result.trash(id)) {
        video.pause();
        video.removeAttribute('src');
        video.load();
        window.close();
      } else {
        resetTrash();
        showToast("Couldn't find the file to delete. It may already have been moved.", { error: true, actions: [openFolder] });
      }
    } catch (err) {
      console.error('Trash failed:', err);
      resetTrash();
      showToast(`Couldn't move the video to the ${binName}. It may be open in another program.`, {
        error: true,
        actions: [{ label: 'Try again', run: () => trashBtn.click() }, openFolder]
      });
    }
  });

  // Auto-play the preview, skipping anything cut
  timeline.togglePlay();
}

void main();
