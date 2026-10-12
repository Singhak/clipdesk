// Starts the desktop app. Clears ELECTRON_RUN_AS_NODE, which VS Code and some tools set and which
// makes Electron start as plain Node (crashing with "Cannot read properties of undefined (reading 'commandLine')").
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const electron = createRequire(import.meta.url)('electron');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electron, ['.', ...process.argv.slice(2)], { stdio: 'inherit', env });
child.on('exit', (code) => process.exit(code ?? 0));
