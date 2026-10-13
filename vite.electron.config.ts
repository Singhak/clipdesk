import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Desktop app pages (launcher, recorder, controls, countdown, result). The main process and preload
// are built by vite.electron-main.config.ts.
export default defineConfig({
  // Compile-time flag: only the Chrome extension bundles its own ONNX runtime (see whisper.worker.ts)
  define: { __EXTENSION_BUILD__: "false" },
  root: resolve(__dirname, 'electron'),
  base: './',
  publicDir: resolve(__dirname, 'electron/public'),
  plugins: [tailwindcss(), react()],
  // The Whisper worker lazy-loads Transformers.js; only ES module workers can code-split
  worker: { format: 'es' },
  // Pre-bundling rewrites ffmpeg.wasm's internal worker URL and conversions then never start in dev
  optimizeDeps: { exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'] },
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
