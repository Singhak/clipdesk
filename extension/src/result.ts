import './ext.css';
import { ExportEngine } from '../../src/core/exportEngine';
import {
  CaptionEngine,
  CAPTION_STYLES,
  DEFAULT_CAPTION_SETTINGS,
  type CaptionSegment,
  type CaptionStyleId
} from '../../src/core/captionEngine';
import { CutTimeline } from '../../src/components/cutTimeline';
import { remapCaptions, type TimeRange } from '../../src/core/cutList';
import { deleteRecording, formatTime, loadRecording } from './shared';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

async function main(): Promise<void> {
  const id = location.hash.slice(1);
  const rec = id ? await loadRecording(id) : undefined;
  if (!rec) {
    $('title').textContent = 'Recording not found';
    $('meta').textContent = 'It may have been deleted. Only the five newest recordings are kept.';
    $('workspace').hidden = true;
    return;
  }

  const wide = rec.layout === 'widescreen';
  const video = $<HTMLVideoElement>('video');
  video.classList.toggle('wide', wide);
  const url = URL.createObjectURL(rec.blob);
  video.src = url;

  const ext = ExportEngine.extensionFor(rec.blob);
  const probed = await ExportEngine.probeDuration(rec.blob);
  const duration = probed && probed > 0 ? probed : Math.max(1, rec.timerMs / 1000);
  const lengthOf = (ranges: TimeRange[]) => ranges.reduce((n, r) => n + r.endSec - r.startSec, 0);
  const stamp = new Date(rec.createdAt).toISOString().slice(0, 19).replace(/[:T]/g, '-');

  $('title').textContent = wide ? 'Your video is ready' : 'Your reel is ready';
  const showMeta = (seconds: number) => {
    $('meta').textContent = `${wide ? '1920 × 1080' : '1080 × 1920'} · ${formatTime(seconds * 1000)} · ${ext.toUpperCase()} · ${(rec.blob.size / 1e6).toFixed(1)} MB`;
  };
  showMeta(duration);

  const notes = [...rec.warnings];
  if (probed !== null && rec.timerMs >= 3000 && probed * 1000 < rec.timerMs * 0.6) {
    notes.unshift(`The file is ${probed.toFixed(1)} s long but you recorded for ${formatTime(rec.timerMs)}, so part of the recording was lost.`);
  }
  if (notes.length) {
    const box = $('notes');
    box.hidden = false;
    box.textContent = notes.join(' ');
  }

  const progressEl = $('progress');
  const setProgress = (text: string | null) => {
    progressEl.hidden = text === null;
    progressEl.textContent = text ?? '';
  };
  let busy = false;

  // ==========================================
  // Cut editor
  // ==========================================
  const timeline = new CutTimeline($('cut-editor'), video, {
    playButton: true,
    onChange: (_cuts, kept) => {
      showMeta(lengthOf(kept));
      updateButtons();
    },
    notify: showNotice
  });

  // Timeline notices (e.g. why a cut was refused) share the progress line and fade after a few
  // seconds; they never replace the status of a running export
  let noticeTimer = 0;
  function showNotice(msg: string) {
    if (busy) return;
    setProgress(msg);
    clearTimeout(noticeTimer);
    noticeTimer = window.setTimeout(() => {
      if (!busy && progressEl.textContent === msg) setProgress(null);
    }, 4000);
  }
  timeline.setDuration(duration);
  const isCut = () => timeline.cuts.length > 0;

  // The cut file is made once per edit and reused by both download buttons
  let rendered: { key: string; blob: Blob } | null = null;
  const editKey = () => timeline.keptRanges.map((r) => `${r.startSec.toFixed(2)}-${r.endSec.toFixed(2)}`).join(',');

  /** The recording with the cut parts removed (re-encoded to MP4 in the page), or the file itself */
  async function editedBlob(): Promise<Blob> {
    if (!isCut()) return rec!.blob;
    const key = editKey();
    if (rendered?.key === key) return rendered.blob;
    const { convertToMp4 } = await import('../../src/core/mp4Converter');
    setProgress('Cutting… 0%');
    const blob = await convertToMp4(rec!.blob, (p) => setProgress(`Cutting… ${Math.round(p * 100)}%`), {
      ranges: timeline.keptRanges,
      duration
    });
    rendered = { key, blob };
    return blob;
  }

  // ==========================================
  // Captions
  // ==========================================
  // Off and empty until the user adds captions, so nothing placeholder ends up in a download
  let segments: CaptionSegment[] = [];
  let styleId: CaptionStyleId = 'viral_karaoke';
  const settings = { ...DEFAULT_CAPTION_SETTINGS };
  const toggle = $<HTMLInputElement>('captions-toggle');

  const layer = $<HTMLCanvasElement>('captions-layer');
  layer.width = wide ? 1920 : 1080;
  layer.height = wide ? 1080 : 1920;
  const layerCtx = layer.getContext('2d')!;
  function drawCaptions() {
    layerCtx.clearRect(0, 0, layer.width, layer.height);
    if (!toggle.checked) return;
    CaptionEngine.renderCaptions(layerCtx, video.currentTime, segments, CAPTION_STYLES[styleId], layer.width, layer.height, settings);
  }
  // Redraw on every video frame while playing; timeupdate (~4×/s) is too coarse for word highlights
  let frameHandle = 0;
  const onFrame = () => {
    drawCaptions();
    frameHandle = video.paused ? 0 : video.requestVideoFrameCallback(onFrame);
  };
  video.addEventListener('play', () => {
    if (frameHandle) video.cancelVideoFrameCallback(frameHandle);
    frameHandle = video.requestVideoFrameCallback(onFrame);
  });
  video.addEventListener('seeked', drawCaptions);
  toggle.addEventListener('change', () => {
    drawCaptions();
    updateButtons();
  });

  const styleSelect = $<HTMLSelectElement>('caption-style');
  for (const style of Object.values(CAPTION_STYLES)) styleSelect.add(new Option(style.name, style.id));
  styleSelect.value = styleId;
  styleSelect.addEventListener('change', () => {
    styleId = styleSelect.value as CaptionStyleId;
    drawCaptions();
  });

  const posInput = $<HTMLInputElement>('caption-pos');
  posInput.value = String(settings.positionYRatio);
  posInput.addEventListener('input', () => {
    settings.positionYRatio = parseFloat(posInput.value);
    settings.positionPreset = 'custom';
    drawCaptions();
  });

  function setSegments(next: CaptionSegment[]) {
    segments = next;
    toggle.checked = next.length > 0;
    renderSegments();
    drawCaptions();
    updateButtons();
  }

  function renderSegments() {
    const list = $('segments');
    list.replaceChildren();
    $<HTMLButtonElement>('export-srt').disabled = segments.length === 0;
    if (segments.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'p-2 text-center text-slate-500 rounded-lg border border-dashed border-white/10';
      empty.textContent = 'No captions yet. Transcribe the recording or import a subtitle file.';
      list.append(empty);
      return;
    }
    for (const seg of segments) {
      const row = document.createElement('div');
      row.className = 'flex items-center gap-2 p-1.5 rounded-lg bg-black/30 border border-white/5';

      const time = document.createElement('button');
      time.type = 'button';
      time.className = 'font-mono text-[10px] text-amber-400 shrink-0 cursor-pointer hover:underline';
      time.textContent = `${seg.startSec.toFixed(1)}s`;
      time.title = 'Jump to this line';
      time.addEventListener('click', () => {
        video.currentTime = seg.startSec;
      });

      const input = document.createElement('input');
      input.value = seg.text;
      input.className = 'flex-1 min-w-0 bg-transparent border-b border-transparent focus:border-indigo-400 focus:outline-none px-1';
      input.addEventListener('change', () => {
        const text = input.value.trim();
        if (!text) return;
        // Edited text loses its word timing, so the words are spread evenly over the line
        const words = text.split(/\s+/);
        const step = (seg.endSec - seg.startSec) / words.length;
        seg.text = text;
        seg.words = words.map((word, i) => ({ word, startSec: seg.startSec + i * step, endSec: seg.startSec + (i + 1) * step }));
        drawCaptions();
      });

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'text-slate-500 hover:text-rose-400 px-1 cursor-pointer';
      del.textContent = '✕';
      del.title = 'Delete line';
      del.addEventListener('click', () => setSegments(segments.filter((s) => s !== seg)));

      row.append(time, input, del);
      list.append(row);
    }
  }
  renderSegments();

  const transcribeBtn = $<HTMLButtonElement>('transcribe');
  const transcribeStatus = $('transcribe-status');
  transcribeBtn.addEventListener('click', async () => {
    transcribeBtn.disabled = true;
    transcribeStatus.hidden = false;
    transcribeStatus.textContent = 'Preparing audio…';
    try {
      const language = $<HTMLSelectElement>('caption-lang').value;
      const result = await CaptionEngine.transcribeWithLocalWhisper({
        blob: rec.blob,
        language,
        model: language === 'en' ? 'Xenova/whisper-tiny.en' : 'Xenova/whisper-tiny',
        onProgress: ({ status }) => {
          transcribeStatus.textContent = status;
        }
      });
      if (result.length === 0) {
        transcribeStatus.textContent = 'No speech was found in this recording.';
        return;
      }
      setSegments(result);
      transcribeStatus.textContent = `Done: ${result.length} caption lines. Click a line to fix its text.`;
    } catch (err) {
      console.error('Transcription failed:', err);
      transcribeStatus.textContent = `Transcription failed: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      transcribeBtn.disabled = false;
    }
  });

  $<HTMLInputElement>('import-srt').addEventListener('change', async (e) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const parsed = CaptionEngine.parseSrtOrVtt(await file.text());
    transcribeStatus.hidden = false;
    transcribeStatus.textContent = parsed.length
      ? `Imported ${parsed.length} caption lines from ${file.name}.`
      : `No captions were found in ${file.name}.`;
    if (parsed.length) setSegments(parsed);
  });

  $('export-srt').addEventListener('click', () => {
    // Saved against the downloaded video, so cut parts are taken out of the timing too
    const lines = isCut() ? remapCaptions(segments, timeline.keptRanges) : segments;
    ExportEngine.downloadBlob(new Blob([CaptionEngine.exportToSrt(lines)], { type: 'text/plain' }), `clipdesk_${stamp}.srt`);
  });

  // ==========================================
  // Downloads
  // ==========================================
  const downloadBtn = $<HTMLButtonElement>('download');
  const captionsBtn = $<HTMLButtonElement>('download-captions');
  const originalBtn = $<HTMLButtonElement>('download-original');

  function updateButtons() {
    const cut = isCut();
    downloadBtn.textContent = cut ? `Download cut MP4 (${formatTime(lengthOf(timeline.keptRanges) * 1000)})` : `Download ${ext.toUpperCase()}`;
    originalBtn.hidden = !cut;
    captionsBtn.hidden = !toggle.checked || segments.length === 0;
    for (const b of [downloadBtn, captionsBtn]) b.disabled = busy;
    $('format-hint').textContent = cut
      ? 'Cutting re-encodes the video to MP4 in this tab. Long recordings can take a while.'
      : ext === 'mp4'
        ? 'Upload the MP4 straight to Instagram Reels, YouTube Shorts or TikTok.'
        : 'WebM plays on YouTube and desktop players. Convert to MP4 for the Instagram or TikTok apps.';
  }

  async function run(task: () => Promise<void>) {
    busy = true;
    updateButtons();
    try {
      await task();
      setProgress(null);
    } catch (err) {
      console.error(err);
      setProgress(`Failed: ${err instanceof Error ? err.message : String(err)}. You can still download the original file.`);
    } finally {
      busy = false;
      updateButtons();
    }
  }

  downloadBtn.addEventListener('click', () =>
    run(async () => {
      const blob = await editedBlob();
      ExportEngine.downloadBlob(blob, `clipdesk_${stamp}.${ExportEngine.extensionFor(blob)}`);
    })
  );

  captionsBtn.addEventListener('click', () =>
    run(async () => {
      const source = await editedBlob();
      const lines = isCut() ? remapCaptions(segments, timeline.keptRanges) : segments;
      video.pause();
      // Plays the video through once in this tab, so it takes as long as the video
      setProgress('Adding captions… 0% (keep this tab open)');
      const burned = await ExportEngine.burnCaptionsToVideo(
        source,
        lines,
        CAPTION_STYLES[styleId],
        settings,
        rec.layout,
        (p) => setProgress(`Adding captions… ${Math.round(p * 100)}% (keep this tab open)`)
      );
      ExportEngine.downloadBlob(burned, `clipdesk_${stamp}_captions.${ExportEngine.extensionFor(burned)}`);
    })
  );

  originalBtn.addEventListener('click', () => ExportEngine.downloadBlob(rec.blob, `clipdesk_${stamp}_original.${ext}`));

  $('delete').addEventListener('click', async () => {
    await deleteRecording(rec.id);
    timeline.destroy();
    URL.revokeObjectURL(url);
    window.close();
  });

  updateButtons();
  timeline.togglePlay();
}

void main();
