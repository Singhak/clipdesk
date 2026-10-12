import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Desktop app pages (launcher, recorder, controls, countdown, result). The main process and preload
// are built by vite.electron-main.config.ts.
export default defineConfig({
  root: resolve(__dirname, 'electron'),
  base: './',
  publicDir: resolve(__dirname, 'electron/public'),
  plugins: [tailwindcss(), react()],
  build: {
    outDir: resolve(__dirname, 'dist-electron/renderer'),
    emptyOutDir: true,
    modulePreload: false,
    target: 'chrome130',
    rollupOptions: {
      input: Object.fromEntries(
        ['launcher', 'recorder', 'controls', 'countdown', 'result', 'camera'].map((p) => [p, resolve(__dirname, `electron/${p}.html`)])
      )
    }
  }
});
