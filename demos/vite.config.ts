import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@pck': resolve(__dirname, 'src/pck'),
      '@elements': resolve(__dirname, 'src/elements'),
      '@pck-diff': resolve(__dirname, 'src/pck-diff'),
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        elements: resolve(__dirname, 'elements/index.html'),
        pck: resolve(__dirname, 'pck/index.html'),
        'pck-diff': resolve(__dirname, 'pck-diff/index.html'),
      },
      external: [
        'three',
        'three/addons/controls/OrbitControls.js',
      ],
    },
  },
  server: {
    fs: {
      allow: ['..'],
    },
  },
  worker: {
    format: 'es',
  },
  test: {
    exclude: ['e2e/**', 'node_modules/**'],
  },
});
