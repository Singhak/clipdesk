import { app, dialog, Notification } from 'electron';
import { autoUpdater } from 'electron-updater';
import { log } from './diagnostics';

// Updates come from GitHub Releases (the `publish` block in package.json). They download in the
// background and install when the app quits, so a recording is never interrupted; the tray also
// offers "Restart to update" once one is ready.

const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

export type UpdateStatus =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'downloading'; version: string; percent: number }
  | { kind: 'ready'; version: string }
  | { kind: 'error' };

let status: UpdateStatus = { kind: 'idle' };
let onChange: () => void = () => {};
/** Set while the user asked from the tray, so "no update" and errors get a dialog */
let manualCheck = false;

export const updateStatus = (): UpdateStatus => status;

function setStatus(next: UpdateStatus): void {
  status = next;
  onChange();
}

export function initUpdater(changed: () => void): void {
  onChange = changed;
  // Unpackaged builds have no app-update.yml to read
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = {
    info: (m: unknown) => log('info', 'updater', String(m)),
    warn: (m: unknown) => log('warn', 'updater', String(m)),
    error: (m: unknown) => log('error', 'updater', String(m)),
    debug: () => {}
  };

  autoUpdater.on('checking-for-update', () => setStatus({ kind: 'checking' }));
  autoUpdater.on('update-not-available', () => {
    setStatus({ kind: 'idle' });
    if (manualCheck) void dialog.showMessageBox({ type: 'info', message: `ClipDesk ${app.getVersion()} is the latest version.` });
    manualCheck = false;
  });
  autoUpdater.on('update-available', (info) => setStatus({ kind: 'downloading', version: info.version, percent: 0 }));
  autoUpdater.on('download-progress', (p) => {
    if (status.kind === 'downloading') setStatus({ ...status, percent: Math.round(p.percent) });
  });
  autoUpdater.on('update-downloaded', (info) => {
    setStatus({ kind: 'ready', version: info.version });
    manualCheck = false;
    if (Notification.isSupported()) {
      new Notification({
        title: `ClipDesk ${info.version} is ready`,
        body: 'It installs the next time you quit, or choose "Restart to update" from the tray.'
      }).show();
    }
  });
  autoUpdater.on('error', (e) => {
    setStatus({ kind: 'error' });
    if (manualCheck) void dialog.showMessageBox({ type: 'error', message: "Couldn't check for updates.", detail: e.message });
    manualCheck = false;
  });

  // Let startup settle before touching the network
  setTimeout(() => void checkNow(false), 15_000);
  setInterval(() => void checkNow(false), CHECK_EVERY_MS);
}

export async function checkNow(manual: boolean): Promise<void> {
  if (!app.isPackaged) {
    if (manual) void dialog.showMessageBox({ type: 'info', message: 'Updates are only available in the installed app.' });
    return;
  }
  if (status.kind === 'checking' || status.kind === 'downloading' || status.kind === 'ready') return;
  manualCheck = manual;
  // Failures are reported through the 'error' event
  await autoUpdater.checkForUpdates().catch(() => undefined);
}

/** Quits and runs the downloaded installer; the caller makes sure nothing is recording */
export function installNow(): void {
  if (status.kind === 'ready') autoUpdater.quitAndInstall(false, true);
}
