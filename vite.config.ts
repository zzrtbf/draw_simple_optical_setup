import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // relative asset paths so dist/index.html also works when opened straight from disk
  base: './',
  plugins: [react()],
  server: { port: 5180, strictPort: true, host: '127.0.0.1' },
  build: { outDir: 'dist', assetsInlineLimit: 0 },
});
