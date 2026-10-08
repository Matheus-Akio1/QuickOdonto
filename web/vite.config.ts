/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// A API é servida no mesmo domínio via proxy (/api → backend): cookies httpOnly SameSite=Strict
// funcionam sem CORS, igual ao que o Nginx fará em produção.
const alvoApi = process.env.API_PROXY_TARGET ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': { target: alvoApi, changeOrigin: false } },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
