import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: './',
  plugins: [tailwindcss(), react()],
  server: {
    port: 5173,
    host: true,
    watch: {
      ignored: ['**/dist-desktop/**', '**/dist-electron/**', '**/dist-extension/**', '**/release/**']
    }
  }
});
