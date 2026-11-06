import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5173,
    // Browser calls /api/*, Vite forwards to FastAPI. Same path works behind nginx in Docker.
    proxy: {
      '/api': {
        target: process.env.TS_API_URL ?? 'http://localhost:8000',
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
      // Evidence cards link structures as /structures/{id}.cif (nginx proxies the same path).
      '/structures': { target: process.env.TS_API_URL ?? 'http://localhost:8000' },
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
