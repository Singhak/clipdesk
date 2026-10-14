import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { cpSync } from 'node:fs';
import { resolve, basename } from 'node:path';


// Ships the PHP licensing server with the web build: server/ -> dist/api/ (upload dist/ as public_html/).
// config.php holds secrets and logs/ is runtime data, so neither is copied; create config.php on the host.
const serverExclude = new Set(['config.php', 'logs', 'README.md']);
const copyServerToApi = (): Plugin => ({
  name: 'copy-server-to-api',
  apply: 'build',
  closeBundle() {
    cpSync(resolve('server'), resolve('dist/api'), {
      recursive: true,
      filter: (src) => !serverExclude.has(basename(src))
    });
  }
});

export default defineConfig({
  // Compile-time flag: only the Chrome extension bundles its own ONNX runtime (see whisper.worker.ts)
  define: { __EXTENSION_BUILD__: "false" },
  base: './',
  plugins: [tailwindcss(), react(), copyServerToApi()],
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
