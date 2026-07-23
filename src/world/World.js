/**
 * World.js
 * --------
 * Thin façade over the world systems: chunk streaming + building collision.
 * Keeping a World layer means Part 3+ (traffic, crowds, weather, time-of-day)
 * can plug in here without touching the game loop.
 */

import { ChunkManager } from './ChunkManager.js';
import { CollisionSystem } from './CollisionSystem.js';

export class World {
  constructor(scene, config) {
    this.config = config;
    // Collision is fed by the chunk manager as chunks load/unload, so it only
    // ever holds colliders for geometry that is actually resident in memory.
    this.collision = new CollisionSystem(config.world.chunkSize);
    this.chunkManager = new ChunkManager(scene, config, this.collision);
  }

  /** Advance world streaming for this frame. */
  update(playerPos, _delta) {
    this.chunkManager.update(playerPos);
  }

  /**
   * Push a circle out of any building it overlaps (shared by the player, the
   * car and pedestrians). Mutates `pos`; returns the push normal or null.
   */
  resolveCircle(pos, radius) {
    return this.collision.resolveCircle(pos, radius);
  }

  /** How many chunks are resident in memory (for the HUD). */
  get loadedChunkCount() {
    return this.chunkManager.loadedCount;
  }

  dispose() {
    this.chunkManager.dispose();
    this.collision.dispose();
  }
}
