/**
 * PoliceManager.js
 * ----------------
 * Spawns and runs the police response. The number of cops scales with the
 * wanted level: more stars → more officers and cruisers hunting the player.
 * When the meter is clear, police are recalled (despawned).
 *
 * Also owns the two "game over" transitions:
 *   - Busted: a cop stays right on top of the player for a moment.
 *   - (Wasted is owned by the player-health side; see Game.js.)
 */

import { PoliceOfficer } from './PoliceOfficer.js';
import { PoliceCar } from './PoliceCar.js';

export class PoliceManager {
  constructor(scene, config, roads, world, models = null) {
    this.scene = scene;
    this.config = config;
    this.roads = roads;
    this.world = world;
    this.models = models;

    // Fixed pools sized for the maximum 5-star response (kept mobile-modest).
    this.officers = [];
    this.cars = [];
    for (let i = 0; i < 8; i++) this.officers.push(new PoliceOfficer(scene, config, roads));
    for (let i = 0; i < 4; i++) this.cars.push(new PoliceCar(scene, config, roads, models));

    this.spawnAccum = 0;
    this.bustTimer = 0; // time a cop has been on top of the player
  }

  get engaged() {
    return this.activeOfficerCount > 0 || this.activeCarCount > 0;
  }
  get activeOfficerCount() {
    let n = 0;
    for (const o of this.officers) if (o.active) n++;
    return n;
  }
  get activeCarCount() {
    let n = 0;
    for (const c of this.cars) if (c.active) n++;
    return n;
  }

  /** Live officers, exposed as weapon targets for the player. */
  get activeOfficers() {
    return this.officers.filter((o) => o.active && !o.isDead);
  }
  forEachActiveCar(fn) {
    for (const c of this.cars) if (c.active) fn(c);
  }

  /** Recall everyone (on Busted/Wasted/clear wanted). */
  clear() {
    for (const o of this.officers) o.deactivate();
    for (const c of this.cars) c.deactivate();
    this.bustTimer = 0;
  }

  /**
   * @param {number} delta
   * @param {THREE.Vector3} playerPos
   * @param {number} stars Current wanted level 0..5.
   * @param {(dmg:number) => void} onShootPlayer Apply police gunfire to player.
   * @param {() => void} onBusted Called when the player is arrested.
   * @param {(cop) => void} onCopKilled Called when the player kills a cop.
   */
  update(delta, playerPos, stars, onShootPlayer, onBusted, onCopKilled) {
    // Desired force scales with the wanted level.
    const wantOfficers = stars === 0 ? 0 : Math.min(2 + stars, this.officers.length);
    const wantCars = stars <= 1 ? Math.min(stars, 1) : Math.min(stars - 1, this.cars.length);

    this._manageSpawns(delta, playerPos, wantOfficers, wantCars);

    // Officers chase + shoot; watch for kills (for wanted scoring) and arrests.
    let closestOfficerDist = Infinity;
    for (const o of this.officers) {
      if (!o.active) continue;
      const wasDead = o.isDead;
      o.updateChase(delta, playerPos, this.world, onShootPlayer);
      if (!wasDead && o.isDead) onCopKilled(o);

      if (!o.isDead) {
        const d = Math.hypot(o.position.x - playerPos.x, o.position.z - playerPos.z);
        if (d < closestOfficerDist) closestOfficerDist = d;
      }
    }

    // Cruisers home in on the player (their driving/collision is TrafficCar's).
    for (const c of this.cars) {
      if (!c.active) continue;
      c.chase(playerPos);
      c.update(delta, c.maxSpeed);
    }

    // Busted: a cop pinning the player at point-blank for ~1.5s.
    if (stars > 0 && closestOfficerDist < 2.4) {
      this.bustTimer += delta;
      if (this.bustTimer >= 1.5) {
        this.bustTimer = 0;
        onBusted();
      }
    } else {
      this.bustTimer = Math.max(0, this.bustTimer - delta);
    }
  }

  _manageSpawns(delta, playerPos, wantOfficers, wantCars) {
    // Despawn beyond a generous radius (police give chase, so keep it wide).
    const far2 = 120 * 120;
    for (const o of this.officers) {
      if (o.active) {
        const dx = o.position.x - playerPos.x;
        const dz = o.position.z - playerPos.z;
        if (dx * dx + dz * dz > far2) o.deactivate();
      }
    }
    for (const c of this.cars) {
      if (c.active) {
        const dx = c.position.x - playerPos.x;
        const dz = c.position.z - playerPos.z;
        if (dx * dx + dz * dz > far2) c.deactivate();
      }
    }

    this.spawnAccum += delta;
    if (this.spawnAccum < 0.6) return;
    this.spawnAccum = 0;

    // Spawn officers on a nearby sidewalk, cars on a nearby road node — both a
    // bit away so they arrive from off-screen.
    if (this.activeOfficerCount < wantOfficers) {
      const idle = this.officers.find((o) => !o.active);
      if (idle) {
        const p = this.roads.randomSidewalkPoint({
          x: playerPos.x + (Math.random() - 0.5) * 40,
          z: playerPos.z + (Math.random() - 0.5) * 40,
        });
        idle.activate(p.x, p.z);
      }
    }
    if (this.activeCarCount < wantCars) {
      const idle = this.cars.find((c) => !c.active);
      if (idle) {
        const node = this.roads.randomNodeInRing(playerPos, 35, 70);
        const dir = this.roads.directions[(Math.random() * 4) | 0];
        idle.activate(node.ix, node.iz, dir);
      }
    }
  }

  dispose() {
    for (const o of this.officers) {
      o.deactivate();
      this.scene.remove(o.mesh);
    }
    for (const c of this.cars) {
      c.deactivate();
      this.scene.remove(c.group);
    }
  }
}
