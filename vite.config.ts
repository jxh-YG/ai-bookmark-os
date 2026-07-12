import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(root, 'src'),
    },
  },
  build: {
    outDir: 'dist-ai',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        sidepanel: path.resolve(root, 'sidepanel.html'),
        bookmarkNav: path.resolve(root, 'bookmark-nav.html'),
      },
    },
  },
});
