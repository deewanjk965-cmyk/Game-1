/**
 * ChunkManager.js
 * ---------------
 * The heart of the low-memory streaming system.
 *
 * Instead of loading the whole map, we keep only a small grid of chunks loaded
 * around the player. As the player moves we:
 *   1. figure out which chunk they're standing in,
 *   2. load any missing chunks within `viewDistance`,
 *   3. unload chunks that fall outside `viewDistance + unloadBuffer`.
 *
 * Two details keep it smooth on mobile:
 *   - We only recompute the visible set when the player *crosses* a chunk
 *     border, not every frame.
 *   - We load at most a few chunks per frame (a build budget) so streaming
 *     never causes a frame-time spike / stutter.
 */

import * as THREE from 'three';
import { Chunk } from './Chunk.js';

export class ChunkManager {
  /**
   * @param {THREE.Scene} scene Scene to add/remove chunk groups from.
   * @param {object} config Flat game config (see Config.js).
   */
  constructor(scene, config) {
    this.scene = scene;
    this.config = config;
    this.chunkSize = config.world.chunkSize;
    this.viewDistance = config.viewDistance;
    this.unloadDistance = config.viewDistance + config.world.unloadBuffer;

    // key -> Chunk instance, for all currently loaded chunks.
    this.loaded = new Map();
    // Queue of chunks waiting to be built, so we can spread work over frames.
    this.buildQueue = [];

    // Remember the last chunk the player occupied so we can detect crossings.
    this._lastChunkX = null;
    this._lastChunkZ = null;

    // Max chunk builds per frame — the streaming "budget" that prevents hitches.
    this.buildBudget = 2;
  }

  /** Convert a world coordinate to its chunk grid index. */
  worldToChunk(worldValue) {
    return Math.floor((worldValue + this.chunkSize / 2) / this.chunkSize);
  }

  /**
   * Called every frame with the player's world position. Cheap in the common
   * case (no border crossing) — it just early-returns after two comparisons.
   * @param {THREE.Vector3} playerPos
   */
  update(playerPos) {
    const cx = this.worldToChunk(playerPos.x);
    const cz = this.worldToChunk(playerPos.z);

    // Only re-plan the visible set when the player changes chunk.
    if (cx !== this._lastChunkX || cz !== this._lastChunkZ) {
      this._lastChunkX = cx;
      this._lastChunkZ = cz;
      this._refreshAround(cx, cz);
    }

    // Drain a little of the build queue each frame (frame-time safe streaming).
    this._processBuildQueue();
  }

  /**
   * Decide which chunks should exist around (cx, cz), queue new ones for
   * building and unload ones that have drifted too far away.
   */
  _refreshAround(cx, cz) {
    const wanted = new Set();

    // 1) Everything inside view distance should be loaded. Queue nearest first
    //    so the world fills in outward from the player.
    const toLoad = [];
    for (let dz = -this.viewDistance; dz <= this.viewDistance; dz++) {
      for (let dx = -this.viewDistance; dx <= this.viewDistance; dx++) {
        const x = cx + dx;
        const z = cz + dz;
        const key = Chunk.keyFor(x, z);
        wanted.add(key);
        if (!this.loaded.has(key) && !this._isQueued(key)) {
          toLoad.push({ x, z, dist: dx * dx + dz * dz });
        }
      }
    }
    toLoad.sort((a, b) => a.dist - b.dist);
    for (const c of toLoad) this.buildQueue.push(c);

    // 2) Unload chunks beyond the unload distance (hysteresis avoids thrash).
    for (const [key, chunk] of this.loaded) {
      const dist = Math.max(
        Math.abs(chunk.cx - cx),
        Math.abs(chunk.cz - cz)
      );
      if (dist > this.unloadDistance) {
        this._unloadChunk(key, chunk);
      }
    }

    // 3) Drop any queued-but-no-longer-wanted chunks (player turned around).
    this.buildQueue = this.buildQueue.filter((c) =>
      wanted.has(Chunk.keyFor(c.x, c.z))
    );
  }

  _isQueued(key) {
    return this.buildQueue.some((c) => Chunk.keyFor(c.x, c.z) === key);
  }

  /** Build up to `buildBudget` queued chunks this frame. */
  _processBuildQueue() {
    let built = 0;
    while (this.buildQueue.length > 0 && built < this.buildBudget) {
      const { x, z } = this.buildQueue.shift();
      const key = Chunk.keyFor(x, z);
      if (this.loaded.has(key)) continue; // already loaded meanwhile

      const chunk = new Chunk(x, z, this.chunkSize);
      chunk.build(this.config.shadows);
      this.scene.add(chunk.group);
      this.loaded.set(key, chunk);
      built++;
    }
  }

  _unloadChunk(key, chunk) {
    this.scene.remove(chunk.group);
    chunk.dispose(); // frees per-chunk GPU memory
    this.loaded.delete(key);
  }

  /** Number of chunks currently in memory — handy for the debug HUD. */
  get loadedCount() {
    return this.loaded.size;
  }

  /** Tear everything down (e.g. on scene change). */
  dispose() {
    for (const [key, chunk] of this.loaded) this._unloadChunk(key, chunk);
    this.buildQueue.length = 0;
  }
}
