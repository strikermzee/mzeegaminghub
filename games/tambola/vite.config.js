import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Tambola is no longer its own site: it is served by MZeeGamingHub under /games/tambola/.
// `base` rewrites every asset URL to that prefix, and the build lands directly in the
// hub's public tree so the hub's static middleware serves it with no extra copy step.
export default defineConfig({
  base: '/games/tambola/',
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, '../../public/games/tambola'),
    emptyOutDir: true
  },
  server: {
    port: 3000,
    proxy: {
      // Dev-only: forward API + realtime traffic to the running hub.
      '/api': 'http://localhost:3000',
      '/games/tambola/ws': { target: 'ws://localhost:3000', ws: true }
    }
  }
})
