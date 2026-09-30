/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  // Production builds are served from GitHub Pages under /<repo>/; the dev server stays at the root.
  base: command === 'build' ? '/wk-custom-burned-review/' : '/',
  plugins: [react()],
  server: { port: 5173 },
  test: { environment: 'node' },
}));
