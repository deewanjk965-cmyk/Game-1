import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Separate build that inlines EVERYTHING (JS + CSS) into one self-contained
// index.html. Used to publish the game as a single clickable Artifact link —
// no external requests, which is exactly what the Artifact sandbox requires.
export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    target: 'es2020',
    outDir: 'dist-single',
    assetsInlineLimit: 100000000, // inline all assets
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        // One chunk, no manual splitting — the singlefile plugin needs it all
        // in one place to inline.
        inlineDynamicImports: true,
      },
    },
  },
});
