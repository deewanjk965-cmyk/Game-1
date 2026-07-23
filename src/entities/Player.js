/**
 * Player.js
 * ---------
 * PART 2 — Character locomotion.
 *
 * The player is still represented by a capsule (a rigged, animated character
 * model is an art task for a later pass), but the *locomotion system* is now
 * real and production-shaped:
 *
 *   - A small state machine: IDLE → WALK → RUN, driven by how far the joystick
 *     is pushed. Speeds accelerate/decelerate smoothly instead of snapping.
 *   - Camera-relative movement (push "up" = away from camera), unchanged from
 *     Part 1 but now feeding the state machine.
 *   - Lightweight *procedural* animation (a walk/run bob + a lean into motion)
 *     so the different states are visible without animation clips. When a real
 *     model arrives, swap `_animate()` for clip playback — nothing else changes.
 *
 * The public contract Game.js relies on (`position`, `update`, plus the new
 * `show`/`hide`/`placeAt`/`facingYaw`) is intentionally small so vehicle mode
 * can take the player in and out of the world cleanly.
 */

import * as THREE from 'three';
import { buildHuman } from './humanMesh.js';

// Locomotion states, exported so the HUD / future animation system can read them.
export const LocomotionState = {
  IDLE: 'idle',
  WALK: 'walk',
  RUN: 'run',
};

export class Player {
  constructor(scene, config, models = null) {
    this.config = config;
    this.scene = scene;

    // --- Visual body --------------------------------------------------------
    // A pivot group at ground level; the character sits inside it so the pivot
    // handles world position/facing while the character animates locally.
    this.mesh = new THREE.Group();
    this.mesh.position.set(0, 0, 0);
    scene.add(this.mesh);

    this._useModel = false;
    const char = models && models.makeCharacter(config);
    if (char) {
      // Real animated character (glTF) with idle/walk/run clips.
      this.body = char.group;
      this.mixer = char.mixer;
      this._actions = char.actions;
      this.mesh.add(this.body);
      this._current = null;
      this._playAction('idle');
      this._useModel = true;
    } else {
      // Fallback: built-in low-poly humanoid ("hero" outfit).
      const human = buildHuman(config, { shirt: 0xd23b2b, pants: 0x1c2733 });
      this.body = human.group;
      this._limbs = human.limbs;
      this.mesh.add(this.body);
    }

    // --- Locomotion tuning --------------------------------------------------
    this.walkSpeed = 3.2; // m/s
    this.runSpeed = 8.0; // m/s
    this.accel = 12; // how fast current speed ramps toward the target speed
    this.turnLerp = 0.2; // body rotation smoothing toward travel direction
    // Push past this joystick magnitude to break into a run.
    this.runThreshold = 0.85;

    // --- Runtime state ------------------------------------------------------
    this.state = LocomotionState.IDLE;
    this.currentSpeed = 0; // smoothed actual speed (m/s)
    this._animTime = 0; // accumulator driving the procedural bob

    // Reusable scratch vectors (avoid per-frame allocation → less GC on mobile).
    this._moveDir = new THREE.Vector3();
    this._forward = new THREE.Vector3();
    this._right = new THREE.Vector3();
  }

  /** Logical world position (feet on the ground). */
  get position() {
    return this.mesh.position;
  }

  /** Current facing angle (radians) — used when seating the player in a car. */
  get facingYaw() {
    return this.mesh.rotation.y;
  }

  /**
   * Advance locomotion for this frame.
   * @param {{x:number, y:number}} input Joystick vector, components in [-1,1].
   * @param {THREE.Camera} camera For camera-relative movement.
   * @param {number} delta Seconds since last frame.
   */
  update(input, camera, delta) {
    const mag = Math.min(Math.hypot(input.x, input.y), 1);
    const moving = mag > 0.05; // dead-zone

    // Decide the target state + speed from the stick magnitude.
    let targetSpeed = 0;
    if (moving) {
      if (mag >= this.runThreshold) {
        this.state = LocomotionState.RUN;
        targetSpeed = this.runSpeed;
      } else {
        this.state = LocomotionState.WALK;
        // Walk speed scales analogically with a partial push.
        targetSpeed = this.walkSpeed * (mag / this.runThreshold);
      }
    } else {
      this.state = LocomotionState.IDLE;
    }

    // Smoothly ramp current speed toward the target (no instant snapping).
    this.currentSpeed = THREE.MathUtils.damp(
      this.currentSpeed,
      targetSpeed,
      this.accel,
      delta
    );

    if (moving) {
      // Camera-relative basis flattened onto the ground plane.
      camera.getWorldDirection(this._forward);
      this._forward.y = 0;
      this._forward.normalize();
      this._right.crossVectors(this._forward, camera.up).normalize();

      // input.y = forward/back, input.x = strafe.
      this._moveDir
        .copy(this._forward)
        .multiplyScalar(-input.y)
        .addScaledVector(this._right, input.x);

      if (this._moveDir.lengthSq() > 0) {
        this._moveDir.normalize();

        // Rotate body smoothly toward the travel direction.
        const targetYaw = Math.atan2(this._moveDir.x, this._moveDir.z);
        this.mesh.rotation.y = this._lerpAngle(
          this.mesh.rotation.y,
          targetYaw,
          this.turnLerp
        );
      }
    }

    // Apply movement along the smoothed direction at the smoothed speed.
    if (this.currentSpeed > 0.01 && this._moveDir.lengthSq() > 0) {
      this.mesh.position.addScaledVector(
        this._moveDir,
        this.currentSpeed * delta
      );
    }

    if (this._useModel) this._animateModel(delta);
    else this._animate(delta);
  }

  _action(clips, name) {
    const clip = THREE.AnimationClip.findByName(clips, name);
    return clip ? this.mixer.clipAction(clip) : null;
  }

  /** Crossfade to a named clip (idle/walk/run). */
  _playAction(name) {
    const next = this._actions[name];
    if (!next || next === this._current) return;
    if (this._current) this._current.fadeOut(0.22);
    next.reset().setEffectiveWeight(1).fadeIn(0.22).play();
    this._current = next;
  }

  /** Drive the glTF character's animation from the locomotion state. */
  _animateModel(delta) {
    this.mixer.update(delta);
    let name = 'idle';
    if (this.state === LocomotionState.RUN) name = 'run';
    else if (this.state === LocomotionState.WALK) name = 'walk';
    this._playAction(name);
  }

  /**
   * Procedural locomotion animation. A vertical bob + a slight forward lean
   * whose frequency/amplitude scale with speed, so IDLE/WALK/RUN read clearly.
   * Replace with skeletal clip playback once a rigged model exists.
   */
  _animate(delta) {
    const speedRatio = this.currentSpeed / this.runSpeed; // 0..1
    const L = this._limbs;
    if (speedRatio > 0.02) {
      // Swing legs/arms; frequency + stride grow with speed (walk → run).
      this._animTime += delta * (5 + speedRatio * 7);
      const amp = 0.4 + speedRatio * 0.5;
      const s = Math.sin(this._animTime) * amp;
      if (L) {
        L.legL.rotation.x = s;
        L.legR.rotation.x = -s;
        L.armL.rotation.x = -s * 0.85;
        L.armR.rotation.x = s * 0.85;
      }
      // Vertical bob + a lean into the run.
      this.body.position.y = Math.abs(Math.sin(this._animTime)) * 0.05 * (0.6 + speedRatio);
      this.body.rotation.x = -speedRatio * 0.16;
    } else {
      // Ease back to a neutral idle pose.
      if (L) for (const k of ['legL', 'legR', 'armL', 'armR']) L[k].rotation.x *= 0.8;
      this.body.position.y *= 0.8;
      this.body.rotation.x *= 0.8;
    }
  }

  /** Hide the character (used when the player enters a vehicle). */
  hide() {
    this.mesh.visible = false;
  }

  /** Show the character again (on exiting a vehicle). */
  show() {
    this.mesh.visible = true;
  }

  /**
   * Teleport the player to a world position + facing. Used to place the player
   * beside a car when they exit it.
   * @param {THREE.Vector3} pos
   * @param {number} [yaw]
   */
  placeAt(pos, yaw = this.mesh.rotation.y) {
    this.mesh.position.copy(pos);
    this.mesh.rotation.y = yaw;
    this.currentSpeed = 0;
    this.state = LocomotionState.IDLE;
  }

  /** Shortest-path angular interpolation (handles the -PI/PI wrap). */
  _lerpAngle(a, b, t) {
    let diff = b - a;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return a + diff * t;
  }
}
