import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { readFileSync } from 'fs';

/** Serve /autoangel-wasm-pkg/* from ../autoangel-wasm/pkg/ without junctions. */
function localWasmPlugin(): Plugin {
  const pkgDir = resolve(__dirname, '..', 'autoangel-wasm', 'pkg');
  const prefix = '/autoangel-wasm-pkg/';
  const mimeTypes: Record<string, string> = {
    '.js': 'application/javascript',
    '.wasm': 'application/wasm',
    '.json': 'application/json',
  };
  return {
    name: 'local-wasm-pkg',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith(prefix)) return next();
        const file = resolve(pkgDir, req.url.slice(prefix.length));
        if (!file.startsWith(pkgDir)) return next();
        try {
          const content = readFileSync(file);
          const ext = file.slice(file.lastIndexOf('.'));
          res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.end(content);
        } catch {
          return next();
        }
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), localWasmPlugin()],
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
  optimizeDeps: {
    exclude: ['autoangel-wasm-pkg'],
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
