import './ext.css';

// Camera and mic prompts can't appear in the popup or in the background recorder tab, so the
// extension asks once here; Chrome then remembers the grant for every extension page.

const btn = document.getElementById('allow') as HTMLButtonElement;
const out = document.getElementById('result')!;

btn.addEventListener('click', async () => {
  btn.disabled = true;
  const results: string[] = [];
  for (const [label, constraints] of [
    ['Camera', { video: true }],
    ['Microphone', { audio: true }]
  ] as const) {
    try {
      const s = await navigator.mediaDevices.getUserMedia(constraints);
      s.getTracks().forEach((t) => t.stop());
      results.push(`${label}: allowed`);
    } catch (e) {
      const name = e instanceof DOMException ? e.name : '';
      results.push(
        name === 'NotFoundError'
          ? `${label}: no device found`
          : `${label}: blocked. Click the camera icon in the address bar to allow it, then try again.`
      );
    }
  }
  out.textContent = `${results.join('. ')}. You can close this tab and start recording from the ReelScreen button.`;
  btn.disabled = false;
});
