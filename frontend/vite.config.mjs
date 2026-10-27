import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const proxy = {
  '/api': {
    target: process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:3000',
    changeOrigin: false,
  },
};
export default defineConfig({
  root: 'frontend',
  plugins: [react(), tailwindcss()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy },
  preview: { host: '127.0.0.1', port: 5173, strictPort: true, proxy },
  build: { outDir: 'dist', emptyOutDir: true },
});
