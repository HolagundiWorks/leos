import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// LEOS desktop renderer (Vite + React + Mantine), loaded by Electron.
// The relative base keeps packaged file:// asset URLs portable.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    host: true,
    port: 5174,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
