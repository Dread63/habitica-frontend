import path from 'node:path'
// `vitest/config`'s defineConfig re-exports Vite's, extended with a typed
// `test` field — importing it here (instead of from `vite`) is what lets
// the `test: {...}` block below type-check.
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Where the dev server forwards `/api/…`. In production nginx does this (see
// nginx.conf); in `npm run dev` there is no nginx, so without a proxy those
// requests hit Vite's SPA fallback and come back as **200 text/html** — which
// `probeSync()` reads as "sync is available", after which every real sync 404s.
// A dead proxy target is much better than that: it fails cleanly, so the app
// takes its designed offline path and keeps working against localStorage.
//
// Deliberately NOT a `VITE_` variable. Those get inlined into the client bundle
// at build time, and this app has zero build-time configuration on purpose (see
// docs/gotchas.md § Habitica API). This one is read by the dev server process
// only and never reaches the browser or a production build.
const focusApiTarget = process.env.FOCUS_API_TARGET ?? 'http://127.0.0.1:8081'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: focusApiTarget,
        changeOrigin: true,
        configure: (proxy) => {
          // Answer with a real error status when the api isn't running, rather
          // than letting the request hang or fall through. probeSync() only
          // runs once per session, so a missing api costs one line of console
          // noise on load — not a stream of them.
          proxy.on('error', (_err, _req, res) => {
            if ('writeHead' in res && !res.headersSent) {
              res.writeHead(503, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: 'focus api not reachable', target: focusApiTarget }))
            }
          })
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
  },
})
