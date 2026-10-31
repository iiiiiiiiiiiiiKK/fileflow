import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative base keeps the production build portable: GitHub Pages project
  // sites (https://user.github.io/fileflow/), Cloudflare Pages, Vercel and any
  // plain static host (including sub-directories) all work without edits.
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          // Papa Parse + JSZip only load with the workspace, they are kept apart
          // so the landing page stays small.
          parsing: ['papaparse'],
          zip: ['jszip'],
        },
      },
    },
  },
  server: {
    port: 5173,
    host: true,
  },
  preview: {
    port: 4173,
    host: true,
  },
});
