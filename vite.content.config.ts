import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Content scripts can't be ES modules, so this one is bundled into a single classic script.
export default defineConfig({
  publicDir: false,
  build: {
    outDir: resolve(__dirname, 'dist-extension'),
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'extension/src/content.ts'),
      formats: ['iife'],
      name: 'ClipDeskContent',
      fileName: () => 'content.js'
    }
  }
});
