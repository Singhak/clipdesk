import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const publicDownloads = path.join(rootDir, 'public', 'downloads');
const distExtDir = path.join(rootDir, 'dist-extension');
const distDesktopDir = path.join(rootDir, 'dist-desktop');

fs.mkdirSync(publicDownloads, { recursive: true });

console.log('📦 Packaging ClipDesk download artifacts...');

// 1. Package Chrome Extension
if (!fs.existsSync(distExtDir)) {
  console.log('Building Chrome extension first...');
  execSync('npm run build:ext', { cwd: rootDir, stdio: 'inherit' });
}

const extZipPath = path.join(publicDownloads, 'clipdesk-extension.zip');
try {
  console.log('Zipping Chrome extension to public/downloads/clipdesk-extension.zip...');
  execSync(
    `powershell -Command "Compress-Archive -Path '${distExtDir}\\*' -DestinationPath '${extZipPath}' -Force"`,
    { cwd: rootDir, stdio: 'inherit' }
  );
  const stat = fs.statSync(extZipPath);
  console.log(`✓ Chrome Extension packaged: ${(stat.size / 1024).toFixed(1)} KB`);
} catch (err) {
  console.warn('Could not zip extension via PowerShell:', err.message);
}

// 2. Copy desktop installers if available in dist-desktop
if (fs.existsSync(distDesktopDir)) {
  const files = fs.readdirSync(distDesktopDir);
  for (const file of files) {
    if (file.endsWith('.exe') || file.endsWith('.msi')) {
      const src = path.join(distDesktopDir, file);
      const dest = path.join(publicDownloads, file);
      fs.copyFileSync(src, dest);
      const stat = fs.statSync(dest);
      console.log(`✓ Copied Windows installer [${file}] to public/downloads: ${(stat.size / 1024 / 1024).toFixed(1)} MB`);
    }
  }
}

console.log('✨ Download artifacts ready in public/downloads/:');
const downloadItems = fs.readdirSync(publicDownloads);
for (const item of downloadItems) {
  const stat = fs.statSync(path.join(publicDownloads, item));
  console.log(`  - ${item} (${(stat.size / 1024).toFixed(1)} KB)`);
}
