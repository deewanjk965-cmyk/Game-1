/**
 * World.js
 * --------
 * Thin façade over the world systems. Right now that's just the ChunkManager,
 * but keeping a World layer means Part 3+ (weather, traffic, time-of-day) can
 * plug in here without touching the game loop.
 */

import { ChunkManager } from './ChunkManager.js';

export class World {
  constructor(scene, config) {
    this.config = config;
    this.chunkManager = new ChunkManager(scene, config);
  }

  /** Advance world streaming for this frame. */
  update(playerPos, _delta) {
    this.chunkManager.update(playerPos);
  }

  /** How many chunks are resident in memory (for the HUD). */
  get loadedChunkCount() {
    return this.chunkManager.loadedCount;
  }

  dispose() {
    this.chunkManager.dispose();
  }
}
