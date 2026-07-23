/**
 * PedestrianManager.js
 * --------------------
 * The pedestrian crowd system: object pool + spawn/despawn ring + culling.
 *
 * - Object pool: a fixed array of `Pedestrian` instances is created once. We
 *   never allocate/free NPCs at runtime — we just flip them active/inactive.
 * - Spawn ring: keeps up to `maxPedestrians` NPCs alive within a ring around
 *   the player; NPCs that drift past `despawnRadius` are recycled.
 * - Culling: NPCs that are far AND outside the camera frustum have their AI
 *   paused entirely (no per-frame work), which is where most of the mobile CPU
 *   saving comes from.
 * - Panic: reacts to fast player cars nearby and to the horn (see `alert`).
 */

import { Pedestrian } from './Pedestrian.js';
import { AIConfig } from '../core/Config.js';

export class PedestrianManager {
  /**
   * @param {THREE.Scene} scene
   * @param {object} config Flat game config.
   * @param {RoadNetwork} roads
   * @param {World} world For building avoidance.
   */
  constructor(scene, config, roads, world, models = null) {
    this.scene = scene;
    this.config = config;
    this.roads = roads;
    this.world = world;
    this.models = models;

    this.max = config.maxPedestrians;
    this.cfg = AIConfig.ped;

    // Pre-allocate the pool once (this is the whole point — flat memory).
    this.pool = [];
    for (let i = 0; i < this.max; i++) {
      this.pool.push(new Pedestrian(scene, config, roads, models));
    }

    // A car is "scary" when faster than this (m/s) and within this radius (m).
    this.scareSpeed = 8;
    this.scareRadius = 9;

    this._spawnAccum = 0;
  }

  get activeCount() {
    let n = 0;
    for (const p of this.pool) if (p.active) n++;
    return n;
  }

  /** Scare every nearby NPC away from a point (used by the car horn). */
  alert(x, z, radius = 14) {
    const r2 = radius * radius;
    for (const p of this.pool) {
      if (!p.active) continue;
      const dx = p.position.x - x;
      const dz = p.position.z - z;
      if (dx * dx + dz * dz < r2) p.flee(x, z);
    }
  }

  /**
   * @param {number} delta
   * @param {THREE.Vector3} playerPos Centre of the spawn ring.
   * @param {THREE.Frustum} frustum For off-screen culling.
   * @param {{position:THREE.Vector3, speed:number}|null} threatCar Player's car
   *        while driving (position + speed in m/s), or null on foot.
   */
  update(delta, playerPos, frustum, threatCar) {
    // 1) Recycle NPCs that wandered too far, and top up the population.
    this._manageDensity(delta, playerPos, frustum);

    // 2) Fast-car panic: scare NPCs the speeding player drives close to.
    if (threatCar && threatCar.speed > this.scareSpeed) {
      this.alert(threatCar.position.x, threatCar.position.z, this.scareRadius);
    }

    // 3) Update active NPCs — but skip the ones that are culled.
    for (const p of this.pool) {
      if (!p.active) continue;
      if (this._isCulled(p.position, playerPos, frustum)) continue;
      p.update(delta, this.world);
    }
  }

  _manageDensity(delta, playerPos, frustum) {
    // Despawn anything beyond the despawn radius.
    const despawn2 = this.cfg.despawnRadius * this.cfg.despawnRadius;
    for (const p of this.pool) {
      if (!p.active) continue;
      const dx = p.position.x - playerPos.x;
      const dz = p.position.z - playerPos.z;
      if (dx * dx + dz * dz > despawn2) p.deactivate();
    }

    // Spawn up to the cap, a few per second so a whole crowd never pops in.
    this._spawnAccum += delta;
    if (this._spawnAccum < 0.15) return;
    this._spawnAccum = 0;

    if (this.activeCount >= this.max) return;
    const idle = this.pool.find((p) => !p.active);
    if (!idle) return;

    // Try a few candidate points; prefer one that's off-screen so NPCs appear
    // out of view rather than popping in front of the player.
    let best = null;
    for (let i = 0; i < 4; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r =
        this.cfg.spawnMin + Math.random() * (this.cfg.spawnMax - this.cfg.spawnMin);
      const pt = this.roads.randomSidewalkPoint({
        x: playerPos.x + Math.cos(angle) * r,
        z: playerPos.z + Math.sin(angle) * r,
      });
      best = pt;
      if (frustum && !frustum.containsPoint({ x: pt.x, y: 1, z: pt.z })) break;
    }
    idle.activate(best.x, best.z);
  }

  /** True if an entity is far from the player AND outside the camera frustum. */
  _isCulled(pos, playerPos, frustum) {
    const dx = pos.x - playerPos.x;
    const dz = pos.z - playerPos.z;
    const near = AIConfig.cullNearRadius;
    if (dx * dx + dz * dz < near * near) return false; // always sim things close by
    if (!frustum) return false;
    return !frustum.containsPoint({ x: pos.x, y: 1, z: pos.z });
  }

  dispose() {
    for (const p of this.pool) {
      p.deactivate();
      this.scene.remove(p.mesh);
    }
    this.pool.length = 0;
  }
}
