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
import { buildHuman } from '../entities/humanMesh.js';

export const PedState = {
  IDLE: 'idle',
  WALK: 'walk',
  FLEE: 'flee',
  INJURED: 'injured', // still alive but limping/slow after a glancing hit
  DEAD: 'dead', // killed (by a car or a weapon); lies down then despawns
};

export class Pedestrian {
  /** @param {THREE.Scene} scene @param {object} config @param {RoadNetwork} roads @param {Models} [models] */
  constructor(scene, config, roads, models = null) {
    this.config = config;
    this.roads = roads;

    // Visual: a real animated glTF character when available, else the built-in
    // low-poly humanoid.
    this._useModel = false;
    const char = models && models.makeCharacter(config);
    if (char) {
      this.mesh = char.group;
      this.mixer = char.mixer;
      this._actions = char.actions;
      this._current = null;
      this._useModel = true;
      this._playAction('idle');
    } else {
      const human = buildHuman(config);
      this.mesh = human.group;
      this._limbs = human.limbs;
      this._mats = human.materials; // exposed so PoliceOfficer can re-dress it
    }
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

    // Advance the character animation (model only).
    if (this._useModel && this.mixer) this.mixer.update(delta);

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
    if (this._useModel) {
      // Fleeing pedestrians sprint; otherwise they walk.
      this._playAction(this.state === PedState.FLEE ? 'run' : 'walk');
      return;
    }
    // Stylized fallback: swing the legs and (opposite) arms.
    this._animTime += delta * (3 + speed * 1.4);
    const amp = Math.min(0.35 + speed * 0.08, 0.8);
    const s = Math.sin(this._animTime) * amp;
    if (this._limbs) {
      this._limbs.legL.rotation.x = s;
      this._limbs.legR.rotation.x = -s;
      this._limbs.armL.rotation.x = -s * 0.8;
      this._limbs.armR.rotation.x = s * 0.8;
    }
    this.mesh.position.y = Math.abs(Math.sin(this._animTime)) * 0.04;
  }

  _animateIdle(delta) {
    if (this._useModel) {
      this._playAction('idle');
      return;
    }
    if (this._limbs) {
      for (const k of ['legL', 'legR', 'armL', 'armR']) {
        this._limbs[k].rotation.x *= 0.85;
      }
    }
    this.mesh.position.y *= 0.85;
  }

  /** Crossfade to a named clip (idle/walk/run) — model characters only. */
  _playAction(name) {
    const next = this._actions && this._actions[name];
    if (!next || next === this._current) return;
    if (this._current) this._current.fadeOut(0.25);
    next.reset().setEffectiveWeight(1).fadeIn(0.25).play();
    this._current = next;
  }
}
