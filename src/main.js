/**
 * main.js
 * -------
 * Application entry point. Kept deliberately tiny: pick a quality tier, grab
 * the canvas, build the Game and start it. Everything interesting lives in the
 * subsystem modules so this file never grows.
 */

import { createConfig } from './core/Config.js';
import { Game } from './core/Game.js';
import { Models } from './core/Models.js';

async function boot() {
  const canvas = document.getElementById('game-canvas');

  // Auto-detect a quality tier from the device (see Config.js). A ?q=low|medium|high
  // URL param can force a tier (handy for testing / low-end fallback).
  const forced = new URLSearchParams(location.search).get('q');
  const config = forced ? createConfig(forced) : createConfig();

  // Preload the real 3D models (animated human + car) before starting. On
  // failure the game falls back to built-in meshes and still runs.
  const models = new Models();
  await models.loadAll();

  // Expose for quick debugging from the browser console.
  const game = new Game(canvas, config, models);
  window.__game = game;

  game.start();
}

// Wait for the DOM so the canvas + HUD elements exist.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
