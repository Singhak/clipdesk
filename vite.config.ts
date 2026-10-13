import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Compile-time flag: only the Chrome extension bundles its own ONNX runtime (see whisper.worker.ts)
  define: { __EXTENSION_BUILD__: "false" },
  base: './',
  plugins: [tailwindcss(), react()],
  // The Whisper worker lazy-loads Transformers.js; only ES module workers can code-split
  worker: { format: 'es' },
  // Pre-bundling rewrites ffmpeg.wasm's internal worker URL and conversions then never start in dev
  optimizeDeps: { exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'] },
  // The web app lives at /app/; public/index.html is the static landing page at /
  build: { rollupOptions: { input: 'app/index.html' } },
  server: {
    port: 5173,
    host: true,
    watch: {
      ignored: ['**/dist-desktop/**', '**/dist-electron/**', '**/dist-extension/**', '**/release/**']
    }
  }
});
