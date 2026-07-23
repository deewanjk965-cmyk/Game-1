/**
 * build-artifact.mjs
 * ------------------
 * Turns the fully-inlined single-file build (dist-single/index.html) into a
 * body-only HTML fragment that can be published as a Claude Artifact (a live,
 * clickable link to play the game).
 *
 * The Artifact host wraps the file in its own <!doctype><head><body> skeleton,
 * so we must strip our own document wrappers and hand back just: the <style>,
 * the game markup, and the inlined <script>. Everything is already inlined by
 * vite-plugin-singlefile, so the result is 100% self-contained (no network) —
 * which is exactly what the Artifact sandbox's strict CSP requires.
 *
 * Usage:  node scripts/build-artifact.mjs
 * Output: dist-single/artifact.html
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const srcPath = resolve(root, 'dist-single/index.html');
const outPath = resolve(root, 'dist-single/artifact.html');

const html = readFileSync(srcPath, 'utf8');

// Pull the <style>…</style> block(s) (vite puts them in <head>).
const style = (html.match(/<style[^>]*>[\s\S]*?<\/style>/gi) || []).join('\n');

// Pull the inlined <script>…</script> block(s). vite-plugin-singlefile inlines
// the whole bundle as a script inside <head>, so we must collect it from the
// full document, not just the body.
const scripts = (html.match(/<script[^>]*>[\s\S]*?<\/script>/gi) || []).join('\n');

// Pull the game markup inside <body>…</body> (canvas, HUD, loading splash),
// stripping any <script> that already lives there so we don't duplicate it.
const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
if (!bodyMatch) {
  console.error('Could not find <body> in single-file build.');
  process.exit(1);
}
const markup = bodyMatch[1]
  .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
  .trim();

if (!scripts) {
  console.error('No inlined <script> found — is this a single-file build?');
  process.exit(1);
}

// Order: title, styles, game markup (canvas must exist in the DOM), then the
// bundle script last so it finds the canvas when it boots.
const out = `<title>Mobile Open World — Playable Demo</title>
${style}
${markup}
${scripts}
`;

writeFileSync(outPath, out, 'utf8');
console.log(`Wrote ${outPath} (${(out.length / 1024).toFixed(1)} KB)`);
