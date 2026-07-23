/**
 * Pedestrian.js
 * -------------
 * A single ambient NPC. Cheap to run and cheap to look at: a small capsule
 * that walks between sidewalk waypoints, idles, and panics (runs away) when a
 * fast car or a horn scares it.
 *
 * Designed for object pooling — instances are never destroyed, just
 * `activate()`d and `deactivate()`d — so the crowd system can recycle a fixed
 * set of NPCs and keep memory/GC flat on mobile.
 */

import * as THREE from 'three';

export const PedState = {
  IDLE: 'idle',
  WALK: 'walk',
  FLEE: 'flee',
  INJURED: 'injured', // still alive but limping/slow after a glancing hit
  DEAD: 'dead', // killed (by a car or a weapon); lies down then despawns
};

// Shared geometries/materials across all pedestrians (tiny GPU footprint).
const BODY_GEO = new THREE.CapsuleGeometry(0.28, 0.7, 4, 8);
const HEAD_GEO = new THREE.SphereGeometry(0.2, 8, 8);
const SKINS = [0x3d6cb5, 0xb5523d, 0x4c9a5a, 0xb59a3d, 0x8a4cb5, 0x555b66];

export class Pedestrian {
  /** @param {THREE.Scene} scene @param {object} config @param {RoadNetwork} roads */
  constructor(scene, config, roads) {
    this.config = config;
    this.roads = roads;

    // Visual: a body + a head, in a shared random colour.
    this.mesh = new THREE.Group();
    const skin = SKINS[(Math.random() * SKINS.length) | 0];
    const mat = new THREE.MeshLambertMaterial({ color: skin });
    const body = new THREE.Mesh(BODY_GEO, mat);
    body.position.y = 0.65;
    body.castShadow = config.shadows;
    this.mesh.add(body);
    const head = new THREE.Mesh(HEAD_GEO, mat);
    head.position.y = 1.2;
    this.mesh.add(head);
    this.mesh.visible = false;
    scene.add(this.mesh);

    this.active = false;
    this.state = PedState.IDLE;

    // Movement tuning.
    this.baseWalkSpeed = 1.4 + Math.random() * 0.5;
    this.walkSpeed = this.baseWalkSpeed;
    this.fleeSpeed = 4.5;

    // Health / damage (Part 4). A glancing hit injures; a big hit kills.
    this.maxHealth = 100;
    this.health = this.maxHealth;
    this.deadTimer = 0; // seconds a corpse lingers before it despawns

    // Runtime state.
    this.target = { x: 0, z: 0 };
    this.idleTimer = 0;
    this.fleeTimer = 0;
    this._animTime = Math.random() * 10;

    // Collision circle (used for car / bullet hit tests).
    this.radius = 0.4;

    // Scratch.
    this._dir = new THREE.Vector3();
  }

  get isDead() {
    return this.state === PedState.DEAD;
  }

  get position() {
    return this.mesh.position;
  }

  /** Bring this NPC into the world at a spawn point. */
  activate(x, z) {
    this.mesh.position.set(x, 0, z);
    // Reset any pose left over from a previous (dead) life.
    this.mesh.rotation.set(0, Math.random() * Math.PI * 2, 0);
    this.mesh.visible = true;
    this.active = true;
    this.state = PedState.WALK;
    this.health = this.maxHealth;
    this.walkSpeed = this.baseWalkSpeed;
    this.deadTimer = 0;
    this._pickNewTarget();
  }

  /** Return this NPC to the pool. */
  deactivate() {
    this.active = false;
    this.mesh.visible = false;
  }

  /**
   * Take damage from a car or a weapon.
   * @param {number} amount Damage points.
   * @param {number} [threatX] Source of the hit (for a knock-away).
   * @param {number} [threatZ]
   * @returns {'killed'|'injured'|'hit'|'none'} What happened, for crime scoring.
   */
  hit(amount, threatX, threatZ) {
    if (this.state === PedState.DEAD) return 'none';
    this.health -= amount;

    if (this.health <= 0) {
      this._die(threatX, threatZ);
      return 'killed';
    }

    // Survived: become injured (limp + slower) and flee the source.
    const wasInjured = this.state === PedState.INJURED;
    this.state = PedState.INJURED;
    this.walkSpeed = this.baseWalkSpeed * 0.45;
    if (threatX !== undefined) this._setFleeTarget(threatX, threatZ);
    this.fleeTimer = 3;
    return wasInjured ? 'hit' : 'injured';
  }

  /** Collapse: lie flat, stop, and start the corpse despawn timer. */
  _die(threatX, threatZ) {
    this.state = PedState.DEAD;
    this.deadTimer = 12;
    // Fall over — tip the whole body onto the ground.
    const fallDir =
      threatX !== undefined
        ? Math.atan2(this.mesh.position.x - threatX, this.mesh.position.z - threatZ)
        : Math.random() * Math.PI * 2;
    this.mesh.rotation.y = fallDir;
    this.mesh.rotation.x = Math.PI / 2; // lie down
    this.mesh.position.y = 0.3;
  }

  /** Panic: run away from a threat position for a couple of seconds. */
  flee(threatX, threatZ) {
    if (this.state === PedState.DEAD) return;
    // Injured pedestrians stay injured (slow) but still flee.
    if (this.state !== PedState.INJURED) this.state = PedState.FLEE;
    this.fleeTimer = 1.8 + Math.random() * 1.2;
    this._setFleeTarget(threatX, threatZ);
  }

  /** Aim a waypoint directly away from a threat position. */
  _setFleeTarget(threatX, threatZ) {
    const dx = this.mesh.position.x - threatX;
    const dz = this.mesh.position.z - threatZ;
    const len = Math.hypot(dx, dz) || 1;
    this.target.x = this.mesh.position.x + (dx / len) * 15;
    this.target.z = this.mesh.position.z + (dz / len) * 15;
  }

  _pickNewTarget() {
    const p = this.roads.randomSidewalkPoint(this.mesh.position);
    this.target.x = p.x;
    this.target.z = p.z;
  }

  /**
   * Advance one frame.
   * @param {number} delta Seconds.
   * @param {World} world For building avoidance (resolveCircle).
   */
  update(delta, world) {
    if (!this.active) return;

    // Dead: just lie there and count down to despawn (no AI, no movement).
    if (this.state === PedState.DEAD) {
      this.deadTimer -= delta;
      if (this.deadTimer <= 0) this.deactivate();
      return;
    }

    if (this.state === PedState.FLEE || this.state === PedState.INJURED) {
      this.fleeTimer -= delta;
      if (this.fleeTimer <= 0) {
        // Injured NPCs recover to a normal (if slower for life) walk.
        this.state = PedState.WALK;
        this._pickNewTarget();
      }
    } else if (this.state === PedState.IDLE) {
      // Stand still for a beat, then wander again.
      this.idleTimer -= delta;
      if (this.idleTimer <= 0) {
        this.state = PedState.WALK;
        this._pickNewTarget();
      }
      this._animateIdle(delta);
      return;
    }

    // Move toward the current target.
    const dx = this.target.x - this.mesh.position.x;
    const dz = this.target.z - this.mesh.position.z;
    const dist = Math.hypot(dx, dz);

    if (dist < 0.6) {
      if (this.state === PedState.WALK) {
        // Arrived → sometimes idle, sometimes immediately pick a new target.
        if (Math.random() < 0.5) {
          this.state = PedState.IDLE;
          this.idleTimer = 1 + Math.random() * 2.5;
        } else {
          this._pickNewTarget();
        }
      }
      return;
    }

    const speed = this.state === PedState.FLEE ? this.fleeSpeed : this.walkSpeed;
    const nx = dx / dist;
    const nz = dz / dist;
    this.mesh.position.x += nx * speed * delta;
    this.mesh.position.z += nz * speed * delta;

    // Face travel direction + a little walking bob.
    this.mesh.rotation.y = Math.atan2(nx, nz);
    this._animateWalk(delta, speed);

    // Don't walk through buildings.
    if (world) world.resolveCircle(this.mesh.position, 0.35);
  }

  _animateWalk(delta, speed) {
    this._animTime += delta * (4 + speed);
    this.mesh.position.y = Math.abs(Math.sin(this._animTime)) * 0.06;
  }

  _animateIdle(delta) {
    this._animTime += delta;
    this.mesh.position.y = Math.sin(this._animTime * 1.5) * 0.01;
  }
}
