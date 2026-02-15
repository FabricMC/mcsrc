import { defineConfig } from 'vitest/config';
import { comlink } from "vite-plugin-comlink";
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    comlink(),
    react(),
    svgr(),
    {
      name: 'suppress-wasm-warnings',
      configResolved(config) {
        // oxlint-disable-next-line typescript/unbound-method
        const originalWarn = config.logger.warn;
        config.logger.warn = (msg, options) => {
          // Suppress WASM runtime externalization warnings
          if (msg.includes('externalized for browser compatibility') && msg.includes('wasm-runtime.js')) {
            return;
          }
          originalWarn(msg, options);
        };
      },
    },
  ],
  worker: {
    plugins: () => [comlink()],
    format: 'es',
  },
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/**'],
  },
  server: {
    headers: {
      // E2E tests will fail on WebKit if caching enabled.
      // Only seem to be a problem in localhost.
      // https://predr.ag/blog/debugging-safari-if-at-first-you-succeed/
      'Cache-Control': 'no-store',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    // For javadoc API during development
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
    chunkSizeWarningLimit: 10000,
    rollupOptions: {
      onwarn(warning, warn) {
        // Suppress "Module externalized for browser compatibility" warnings for WASM runtime files
        if (warning.code === 'MODULE_EXTERNALIZED' && warning.message?.includes('wasm-runtime.js')) {
          return;
        }
        warn(warning);
      },
      output: {
        manualChunks: {
          'inheritance': ['@xyflow/react', 'dagre'],
        },
      },
    },
  },
});
