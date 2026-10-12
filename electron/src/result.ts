import './app.css';
import { ExportEngine } from '../../src/core/exportEngine';
import { formatTime } from '../shared';

const reel = window.reel;
const $ = (id: string) => document.getElementById(id)!;

async function main(): Promise<void> {
  const id = location.hash.slice(1);
  const got = id ? await reel.result.get(id) : null;
  if (!got) {
    $('title').textContent = 'Recording not found';
    $('meta').textContent = 'The file may have been moved or deleted.';
    $('actions').hidden = true;
    return;
  }
  const { meta, bytes } = got;
  const blob = new Blob([bytes as BlobPart], { type: meta.path.endsWith('.webm') ? 'video/webm' : 'video/mp4' });
  const wide = meta.layout === 'widescreen';
  const video = $('video') as HTMLVideoElement;
  video.classList.toggle('wide', wide);
  const url = URL.createObjectURL(blob);
  video.src = url;

  const duration = await ExportEngine.probeDuration(blob);
  const seconds = duration ?? meta.timerMs / 1000;
  const ext = meta.path.split('.').pop()!.toUpperCase();
  $('title').textContent = wide ? 'Your video is ready' : 'Your reel is ready';
  $('meta').textContent = `${wide ? '1920 × 1080' : '1080 × 1920'} · ${formatTime(seconds * 1000)} · ${ext} · ${(meta.size / 1e6).toFixed(1)} MB`;
  $('path').textContent = `Saved to ${meta.path}`;

  const notes = [...meta.warnings];
  if (duration !== null && meta.timerMs >= 3000 && duration * 1000 < meta.timerMs * 0.6) {
    notes.unshift(`The file is ${duration.toFixed(1)} s long but you recorded for ${formatTime(meta.timerMs)}, so part of the recording was lost.`);
  }
  if (notes.length) {
    $('notes').hidden = false;
    $('notes').textContent = notes.join(' ');
  }

  $('folder').addEventListener('click', () => reel.result.showInFolder(id));
  $('save-as').addEventListener('click', async () => {
    const saved = await reel.result.saveAs(id);
    if (saved) $('path').textContent = `Saved to ${saved}`;
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
    URL.revokeObjectURL(url);
    if (await reel.result.trash(id)) window.close();
  });
}

void main();
