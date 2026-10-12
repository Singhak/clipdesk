import './ext.css';
import { ExportEngine } from '../../src/core/exportEngine';
import { deleteRecording, formatTime, loadRecording } from './shared';

const $ = (id: string) => document.getElementById(id)!;

async function main(): Promise<void> {
  const id = location.hash.slice(1);
  const rec = id ? await loadRecording(id) : undefined;
  if (!rec) {
    $('title').textContent = 'Recording not found';
    $('meta').textContent = 'It may have been deleted. Only the five newest recordings are kept.';
    $('actions').hidden = true;
    return;
  }

  const wide = rec.layout === 'widescreen';
  const video = $('video') as HTMLVideoElement;
  video.classList.toggle('wide', wide);
  const url = URL.createObjectURL(rec.blob);
  video.src = url;

  const ext = ExportEngine.extensionFor(rec.blob);
  const duration = await ExportEngine.probeDuration(rec.blob);
  const seconds = duration ?? rec.timerMs / 1000;
  $('title').textContent = wide ? 'Your video is ready' : 'Your reel is ready';
  $('meta').textContent = `${wide ? '1920 × 1080' : '1080 × 1920'} · ${formatTime(seconds * 1000)} · ${ext.toUpperCase()} · ${(rec.blob.size / 1e6).toFixed(1)} MB`;

  const notes = [...rec.warnings];
  if (duration !== null && rec.timerMs >= 3000 && duration * 1000 < rec.timerMs * 0.6) {
    notes.unshift(`The file is ${duration.toFixed(1)} s long but you recorded for ${formatTime(rec.timerMs)}, so part of the recording was lost.`);
  }
  if (notes.length) {
    const box = $('notes');
    box.hidden = false;
    box.textContent = notes.join(' ');
  }

  const filename = `clipdesk_${new Date(rec.createdAt).toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${ext}`;
  $('download').addEventListener('click', () => ExportEngine.downloadBlob(rec.blob, filename));
  $('delete').addEventListener('click', async () => {
    await deleteRecording(rec.id);
    URL.revokeObjectURL(url);
    window.close();
  });
}

void main();
