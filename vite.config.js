import { defineConfig } from 'vite';

// Vite config tuned for a lightweight mobile web game.
// - `host: true` lets you open the dev server on a real phone over your LAN.
// - Manual chunking keeps the heavy three.js core in its own cacheable file.
export default defineConfig({
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
