import { defineConfig } from 'vite';

// Vite config tuned for a lightweight mobile web game.
// - `host: true` lets you open the dev server on a real phone over your LAN.
// - Manual chunking keeps the heavy three.js core in its own cacheable file.
export default defineConfig({
  // Relative base so the built site + its assets (incl. /models/*.glb) resolve
  // correctly whether served from a domain root (Vercel) or a project subpath
  // like /Game-1/ (GitHub Pages).
  base: './',
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: 'es2020',
    // Split three.js into its own vendor chunk so the game code stays small
    // and the browser can cache the engine separately between updates.
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
        },
      },
    },
  },
});
