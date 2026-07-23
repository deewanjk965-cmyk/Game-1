/**
 * main.js
 * -------
 * Application entry point. Kept deliberately tiny: pick a quality tier, grab
 * the canvas, build the Game and start it. Everything interesting lives in the
 * subsystem modules so this file never grows.
 */

import { createConfig } from './core/Config.js';
import { Game } from './core/Game.js';

function boot() {
  const canvas = document.getElementById('game-canvas');

  // Auto-detect a quality tier from the device (see Config.js). You can force
  // one for testing, e.g. createConfig('low'), createConfig('high').
  const config = createConfig();

  // Expose for quick debugging from the browser console.
  const game = new Game(canvas, config);
  window.__game = game;

  game.start();
}

// Wait for the DOM so the canvas + HUD elements exist.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
