import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import fs from 'node:fs';
import path from 'node:path';
import { securityHeaders } from './security-headers.ts';

function headersPlugin(connect: string[]): Plugin {
  const h = securityHeaders(connect);
  // Must return nothing: a returned function would be treated by Vite as a post-middleware hook.
  const apply = (server: { middlewares: { use: (fn: (req: unknown, res: { setHeader: (k: string, v: string) => void }, next: () => void) => void) => unknown } }): void => {
    server.middlewares.use((_req, res, next) => {
      for (const [k, v] of Object.entries(h)) res.setHeader(k, v);
      next();
    });
  };
  return {
    name: 'tracepad-headers',
    configureServer: apply,
    configurePreviewServer: apply,
    closeBundle() {
      const lines = ['/*', ...Object.entries(h).map(([k, v]) => `  ${k}: ${v}`), '', '/assets/*', '  Cache-Control: public, max-age=31536000, immutable', '', '/pyodide/*', '  Cache-Control: public, max-age=31536000, immutable', ''];
      fs.writeFileSync(path.resolve(import.meta.dirname, 'dist/_headers'), lines.join('\n'));
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const supa = env.VITE_SUPABASE_URL ? [new URL(env.VITE_SUPABASE_URL).origin, new URL(env.VITE_SUPABASE_URL).origin.replace('https', 'wss').replace('http', 'ws')] : ['http://127.0.0.1:54321', 'ws://127.0.0.1:54321'];
  return {
    plugins: [
      react(),
      headersPlugin(supa),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'script',
        includeAssets: ['icon.svg'],
        manifest: {
          name: 'Tracepad',
          short_name: 'Tracepad',
          description: 'Learn Python: predict, run, see the memory.',
          theme_color: '#1D4ED8',
          background_color: '#EDF0F4',
          display: 'standalone',
          start_url: '/',
          icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,woff2,json}'],
          globIgnores: ['pyodide/**', 'content/**'],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/pyodide\//, /^\/content\//],
          maximumFileSizeToCacheInBytes: 3_000_000,
          runtimeCaching: [
            { urlPattern: ({ url }) => url.pathname.startsWith('/content/'), handler: 'StaleWhileRevalidate', options: { cacheName: 'tracepad-content' } },
            { urlPattern: ({ url }) => url.pathname.startsWith('/pyodide/'), handler: 'CacheFirst', options: { cacheName: 'tracepad-pyodide', expiration: { maxEntries: 12 }, cacheableResponse: { statuses: [200] } } },
          ],
        },
      }),
    ],
    server: { port: 5173, host: true },
    preview: { port: 4173, host: true },
    worker: { format: 'es' },
    test: { environment: 'jsdom', include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'], setupFiles: ['tests/setup.ts'] },
  };
});
