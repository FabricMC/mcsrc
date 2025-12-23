import { defineConfig } from 'vite';
import { comlink } from "vite-plugin-comlink";
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [comlink(), react()],
  worker: {
    plugins: () => [comlink()],
    format: 'es',
  },
});
