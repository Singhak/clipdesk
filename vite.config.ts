import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: './',
  plugins: [tailwindcss(), react()],
  // The Whisper worker lazy-loads Transformers.js; only ES module workers can code-split
  worker: { format: 'es' },
  // Pre-bundling rewrites ffmpeg.wasm's internal worker URL and conversions then never start in dev
  optimizeDeps: { exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'] },
  server: {
    port: 5173,
    host: true,
    watch: {
      ignored: ['**/dist-desktop/**', '**/dist-electron/**', '**/dist-extension/**', '**/release/**']
    }
  }
});
