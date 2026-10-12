import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { builtinModules } from 'node:module';

// Electron main process and preload, as CommonJS (sandboxed preloads can't be ES modules)
export default defineConfig({
  // Don't copy the web app's public/ folder next to main.cjs
  publicDir: false,
  build: {
    outDir: resolve(__dirname, 'dist-electron'),
    emptyOutDir: false,
    target: 'node22',
    minify: false,
    sourcemap: true,
    lib: {
      entry: {
        main: resolve(__dirname, 'electron/main.ts'),
        preload: resolve(__dirname, 'electron/preload.ts')
      },
      formats: ['cjs'],
      fileName: (_format, name) => `${name}.cjs`
    },
    rollupOptions: {
      external: ['electron', 'uiohook-napi', 'ffmpeg-static', ...builtinModules, ...builtinModules.map((m) => `node:${m}`)]
    }
  }
});
