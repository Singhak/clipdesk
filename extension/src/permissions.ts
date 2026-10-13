import './ext.css';

// Camera and mic prompts can't appear in the popup or in the background recorder tab, so the
// extension asks once here; Chrome then remembers the grant for every extension page.

const btn = document.getElementById('allow') as HTMLButtonElement;
const out = document.getElementById('result')!;

type Kind = 'camera' | 'microphone';
const KINDS: { label: string; kind: Kind; constraints: MediaStreamConstraints }[] = [
  { label: 'Camera', kind: 'camera', constraints: { video: true } },
  { label: 'Microphone', kind: 'microphone', constraints: { audio: true } }
];

async function state(kind: Kind): Promise<PermissionState | 'unknown'> {
  try {
    return (await navigator.permissions.query({ name: kind as PermissionName })).state;
  } catch {
    return 'unknown';
  }
}

const settingsUrl = (kind: Kind) => `chrome://settings/content/${kind}`;

function showBlocked(kinds: Kind[]): void {
  out.replaceChildren();
  const p = document.createElement('span');
  p.textContent = `Chrome has blocked the ${kinds.join(' and ')} for ClipDesk, so this button cannot ask again. Open Chrome's site settings, find this extension and set it to Allow, then come back and press the button. `;
  out.append(p);
  for (const kind of kinds) {
    const a = document.createElement('button');
    a.type = 'button';
    a.className = 'underline font-bold cursor-pointer mr-3';
    a.textContent = `Open ${kind} settings`;
    a.addEventListener('click', () => void chrome.tabs.create({ url: settingsUrl(kind) }));
    out.append(a);
  }
}

async function refresh(): Promise<void> {
  const blocked: Kind[] = [];
  for (const k of KINDS) if ((await state(k.kind)) === 'denied') blocked.push(k.kind);
  if (blocked.length) showBlocked(blocked);
}
void refresh();

btn.addEventListener('click', async () => {
  btn.disabled = true;
  const results: string[] = [];
  const blocked: Kind[] = [];
  let allOk = true;
  for (const k of KINDS) {
    try {
      const s = await navigator.mediaDevices.getUserMedia(k.constraints);
      s.getTracks().forEach((t) => t.stop());
      results.push(`${k.label}: allowed`);
    } catch (e) {
      allOk = false;
      const name = e instanceof DOMException ? e.name : '';
      if (name === 'NotFoundError') results.push(`${k.label}: no device found`);
      else {
        blocked.push(k.kind);
        results.push(`${k.label}: blocked`);
      }
    }
  }
  btn.disabled = false;
  if (allOk) {
    out.textContent = 'Camera and microphone are allowed. Closing this tab…';
    window.setTimeout(() => {
      void chrome.tabs.getCurrent().then((t) => (t?.id !== undefined ? chrome.tabs.remove(t.id) : window.close()));
    }, 1200);
    return;
  }
  if (blocked.length) showBlocked(blocked);
  else out.textContent = `${results.join('. ')}. You can close this tab and start recording from the ClipDesk button.`;
});
