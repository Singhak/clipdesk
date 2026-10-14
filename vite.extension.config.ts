import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Chrome extension pages and service worker. The content script is a classic script and is built
// separately by vite.content.config.ts.
export default defineConfig({
  // Compile-time flag: only the Chrome extension bundles its own ONNX runtime (see whisper.worker.ts)
  define: { __EXTENSION_BUILD__: "true" },
  root: resolve(__dirname, 'extension'),
  // root is extension/, so without this the project-root .env (VITE_LICENSE_*) is never loaded
  envDir: __dirname,
  base: './',
  publicDir: resolve(__dirname, 'extension/public'),
  plugins: [tailwindcss(), react()],
  // The Whisper worker lazy-loads Transformers.js; only ES module workers can code-split
  worker: { format: 'es' },
  build: {
    outDir: resolve(__dirname, 'dist-extension'),
    emptyOutDir: true,
    // Extension pages load from disk; preload polyfills and inline data URLs aren't needed
    modulePreload: false,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'extension/popup.html'),
        recorder: resolve(__dirname, 'extension/recorder.html'),
        result: resolve(__dirname, 'extension/result.html'),
        permissions: resolve(__dirname, 'extension/permissions.html'),
        background: resolve(__dirname, 'extension/src/background.ts')
      },
      output: {
        // The manifest points at a fixed service worker file name
        entryFileNames: (chunk) => (chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js')
      }
    }
  }
});
