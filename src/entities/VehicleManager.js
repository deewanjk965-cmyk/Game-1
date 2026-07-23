/**
 * VehicleManager.js
 * -----------------
 * Owns every car in the world and answers the one question the enter/exit
 * system needs: "is the player standing close enough to a car to get in, and
 * if so, which one?"
 *
 * In Part 1 the world streams around the player; for Part 2 we spawn a handful
 * of parked cars near spawn so there's always something to drive. Part 3 can
 * hand traffic/AI cars to this same manager without changing the interface.
 */

import { Vehicle } from './Vehicle.js';

export class VehicleManager {
  constructor(scene, config, models = null) {
    this.scene = scene;
    this.config = config;
    this.models = models;
    this.vehicles = [];

    // How near the player must be (metres) for the "Enter" prompt to show.
    this.enterRadius = 3.5;
  }

  /** Spawn a car and track it. */
  spawn(opts) {
    const v = new Vehicle(this.scene, this.config, opts, this.models);
    this.vehicles.push(v);
    return v;
  }

  /** Convenience: drop a few parked demo cars around the spawn point. */
  spawnDemoFleet() {
    this.spawn({ position: { x: 6, z: 4 }, heading: 0, color: 0xcc2222 });
    this.spawn({ position: { x: -7, z: 8 }, heading: Math.PI / 2, color: 0x2266cc });
    this.spawn({ position: { x: 10, z: -10 }, heading: -0.6, color: 0xeeaa22 });
  }

  /**
   * Find the closest enterable car to a world position.
   * @param {THREE.Vector3} pos Usually the player position.
   * @returns {Vehicle|null} Nearest car within enterRadius, or null.
   */
  findNearest(pos) {
    let best = null;
    let bestDist = this.enterRadius;
    for (const v of this.vehicles) {
      if (v.occupied) continue;
      const d = Math.hypot(pos.x - v.position.x, pos.z - v.position.z);
      if (d < bestDist) {
        bestDist = d;
        best = v;
      }
    }
    return best;
  }

  /** Step any un-driven cars (kept trivial in Part 2; AI arrives in Part 3). */
  update(delta) {
    for (const v of this.vehicles) {
      if (!v.occupied) {
        // Parked cars just bleed off any residual velocity so a car the player
        // hops out of at speed rolls to a gentle, stable stop.
        v.update({ throttle: 0, brake: 0, steer: 0 }, delta);
      }
    }
  }

  dispose() {
    for (const v of this.vehicles) v.dispose();
    this.vehicles.length = 0;
  }
}
