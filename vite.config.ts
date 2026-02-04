import { defineConfig } from 'vitest/config';
import { comlink } from "vite-plugin-comlink";
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [comlink(), react()],
  worker: {
    plugins: () => [comlink()],
    format: 'es',
  },
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/**'],
  },
  // For javadoc API during development
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    proxy: {
      '/v1': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'inheritance': ['@xyflow/react', 'dagre'],
        },
      },
    },
  },
});
