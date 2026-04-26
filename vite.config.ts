import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    global: 'globalThis',
  },
  optimizeDeps: {
    include: ['epubjs', 'jszip'],
  },
  server: {
    port: 5173,
    open: true,
  },
});
