import { app, crashReporter, ipcMain, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

// Local crash reporting: native crashes leave minidumps in the crashDumps folder and JavaScript
// errors from every process go to a small rotating log. Nothing is uploaded; the user can open
// the folder from the tray and attach the files to a support request.

const MAX_LOG_BYTES = 2 * 1024 * 1024;
const MAX_FIELD = 4000;

let logFile: string | null = null;

export function logsDir(): string {
  return path.join(app.getPath('userData'), 'logs');
}

function ensureLogFile(): string {
  if (logFile) return logFile;
  fs.mkdirSync(logsDir(), { recursive: true });
  logFile = path.join(logsDir(), 'clipdesk.log');
  return logFile;
}

function rotateIfLarge(file: string): void {
  try {
    if (fs.statSync(file).size > MAX_LOG_BYTES) fs.renameSync(file, `${file}.old`);
  } catch {
    // no log yet
  }
}

const clip = (s: string) => (s.length > MAX_FIELD ? `${s.slice(0, MAX_FIELD)}…` : s);

export function log(level: 'info' | 'warn' | 'error', source: string, message: string): void {
  try {
    const file = ensureLogFile();
    rotateIfLarge(file);
    fs.appendFileSync(file, `${new Date().toISOString()} [${level}] [${source}] ${clip(message)}\n`);
  } catch {
    // Logging must never take the app down
  }
}

const describe = (e: unknown) => (e instanceof Error ? e.stack || e.message : String(e));

/** Call before app is ready so crashes during startup are captured too */
export function initDiagnostics(): void {
  crashReporter.start({ uploadToServer: false, compress: true });

  process.on('uncaughtException', (e) => log('error', 'main', `uncaught: ${describe(e)}`));
  process.on('unhandledRejection', (e) => log('error', 'main', `unhandled rejection: ${describe(e)}`));

  app.on('render-process-gone', (_e, contents, details) =>
    log('error', 'renderer', `gone (${details.reason}, exit ${details.exitCode}) at ${contents.getURL()}`)
  );
  app.on('child-process-gone', (_e, details) =>
    log('error', 'child', `${details.type} gone (${details.reason}, exit ${details.exitCode})`)
  );

  // Errors the preload catches in a renderer; fields are clipped because the sender is untrusted
  ipcMain.on('diag:renderer-error', (e, report: unknown) => {
    if (typeof report !== 'object' || report === null) return;
    const { message, stack } = report as { message?: unknown; stack?: unknown };
    if (typeof message !== 'string') return;
    const where = e.senderFrame?.url ?? 'unknown';
    log('error', 'renderer', `${message}${typeof stack === 'string' ? `\n${stack}` : ''}\n  at ${where}`);
  });

  void app.whenReady().then(() => log('info', 'main', `ClipDesk ${app.getVersion()} started on ${process.platform} ${process.getSystemVersion()}`));
}

/** Opens the folder holding the log; crash dumps sit next to it under Crashpad */
export function openDiagnosticsFolder(): void {
  ensureLogFile();
  void shell.openPath(app.getPath('userData'));
}
