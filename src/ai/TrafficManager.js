/**
 * TrafficManager.js
 * -----------------
 * Autonomous traffic system: a pool of AI cars, a spawn/despawn ring, culling,
 * and the anti-collision logic that keeps traffic from driving through things.
 *
 * Anti-collision is distance + direction based (cheaper than raycasting on
 * mobile): for each car we look a short distance *ahead* along its heading and,
 * if any obstacle — another traffic car, the player's car, or a pedestrian —
 * sits inside that narrow forward corridor, we cap the car's speed to 0 so it
 * waits. With ≤10 cars this stays trivially cheap.
 */

import * as THREE from 'three';
import { TrafficCar } from './TrafficCar.js';
import { AIConfig } from '../core/Config.js';

export class TrafficManager {
  constructor(scene, config, roads, models = null) {
    this.scene = scene;
    this.config = config;
    this.roads = roads;
    this.models = models;

    this.max = config.maxTrafficCars;
    this.cfg = AIConfig.traffic;

    // Pre-allocate the pool.
    this.pool = [];
    for (let i = 0; i < this.max; i++) {
      this.pool.push(new TrafficCar(scene, config, roads, models));
    }

    // Look-ahead corridor for stopping.
    this.lookAhead = 7; // metres ahead to watch
    this.corridorHalf = 2.0; // metres to each side of the car's centreline

    this._spawnAccum = 0;
    this._fwd = new THREE.Vector3();
  }

  get activeCount() {
    let n = 0;
    for (const c of this.pool) if (c.active) n++;
    return n;
  }

  /** All active traffic-car positions — used by peds/other systems if needed. */
  forEachActive(fn) {
    for (const c of this.pool) if (c.active) fn(c);
  }

  /** Nearest active traffic car within `radius` metres of pos (for carjacking). */
  findNearest(pos, radius = 4) {
    let best = null;
    let bestD = radius;
    for (const c of this.pool) {
      if (!c.active) continue;
      const d = Math.hypot(c.position.x - pos.x, c.position.z - pos.z);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  /**
   * @param {number} delta
   * @param {THREE.Vector3} playerPos Spawn-ring centre.
   * @param {THREE.Frustum} frustum For culling.
   * @param {Array<{x:number,z:number}>} extraObstacles Player car + pedestrians
   *        the traffic must not drive into.
   */
  update(delta, playerPos, frustum, extraObstacles = []) {
    this._manageDensity(delta, playerPos, frustum);

    for (const car of this.pool) {
      if (!car.active) continue;
      if (this._isCulled(car.position, playerPos, frustum)) continue;

      // Decide this car's allowed speed by scanning the corridor ahead.
      const blocked = this._obstacleAhead(car, extraObstacles);
      car.update(delta, blocked ? 0 : car.maxSpeed);
    }
  }

  /** Is anything sitting in the short corridor directly ahead of `car`? */
  _obstacleAhead(car, extraObstacles) {
    const f = car.forward(this._fwd);
    const px = car.position.x;
    const pz = car.position.z;

    // Check other traffic cars…
    for (const other of this.pool) {
      if (other === car || !other.active) continue;
      if (this._inCorridor(px, pz, f, other.position.x, other.position.z)) {
        return true;
      }
    }
    // …and the player car + pedestrians passed in.
    for (const o of extraObstacles) {
      if (this._inCorridor(px, pz, f, o.x, o.z)) return true;
    }
    return false;
  }

  _inCorridor(px, pz, f, ox, oz) {
    const rx = ox - px;
    const rz = oz - pz;
    const forwardDist = rx * f.x + rz * f.z; // projection along heading
    if (forwardDist <= 0.5 || forwardDist > this.lookAhead) return false;
    // Perpendicular distance from the centreline.
    const lateral = Math.abs(rx * f.z - rz * f.x);
    return lateral < this.corridorHalf;
  }

  _manageDensity(delta, playerPos, frustum) {
    const despawn2 = this.cfg.despawnRadius * this.cfg.despawnRadius;
    for (const c of this.pool) {
      if (!c.active) continue;
      const dx = c.position.x - playerPos.x;
      const dz = c.position.z - playerPos.z;
      if (dx * dx + dz * dz > despawn2) c.deactivate();
    }

    this._spawnAccum += delta;
    if (this._spawnAccum < 0.4) return; // stagger spawns
    this._spawnAccum = 0;

    if (this.activeCount >= this.max) return;
    const idle = this.pool.find((c) => !c.active);
    if (!idle) return;

    // Seed on a road node — but OFF-SCREEN, so cars are never seen popping into
    // existence in the middle of the road ahead of the player. Try several
    // spots and take the first one outside the camera view.
    const dirs = this.roads.directions;
    let node = null;
    for (let i = 0; i < 6; i++) {
      const cand = this.roads.randomNodeInRing(playerPos, this.cfg.spawnMin, this.cfg.spawnMax);
      if (!frustum || !frustum.containsPoint({ x: cand.x, y: 1, z: cand.z })) {
        node = cand;
        break;
      }
      node = cand; // fallback to the last candidate
    }
    const dir = dirs[(Math.random() * dirs.length) | 0];
    idle.activate(node.ix, node.iz, dir);
  }

  _isCulled(pos, playerPos, frustum) {
    const dx = pos.x - playerPos.x;
    const dz = pos.z - playerPos.z;
    const near = AIConfig.cullNearRadius;
    if (dx * dx + dz * dz < near * near) return false;
    if (!frustum) return false;
    return !frustum.containsPoint({ x: pos.x, y: 1, z: pos.z });
  }

  dispose() {
    for (const c of this.pool) {
      c.deactivate();
      this.scene.remove(c.group);
    }
    this.pool.length = 0;
  }
}
