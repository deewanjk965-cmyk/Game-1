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

// Locomotion states, exported so the HUD / future animation system can read them.
export const LocomotionState = {
  IDLE: 'idle',
  WALK: 'walk',
  RUN: 'run',
};

export class Player {
  constructor(scene, config) {
    this.config = config;
    this.scene = scene;

    // --- Visual body --------------------------------------------------------
    // A pivot group at ground level; the body sits inside it so the procedural
    // bob/lean can be applied to the body without moving the logical position.
    this.mesh = new THREE.Group();
    this.mesh.position.set(0, 0, 0);
    scene.add(this.mesh);

    this.body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.5, 1.1, 6, 12),
      new THREE.MeshLambertMaterial({ color: 0xff5533 })
    );
    this.body.castShadow = config.shadows;
    this.body.position.y = 1.1; // stand the capsule on the ground plane
    this.mesh.add(this.body);

    // "Nose" cone showing facing direction (+Z local).
    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(0.25, 0.6, 8),
      new THREE.MeshLambertMaterial({ color: 0xffe08a })
    );
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 0.2, 0.6);
    this.body.add(nose);

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

    this._animate(delta);
  }

  /**
   * Procedural locomotion animation. A vertical bob + a slight forward lean
   * whose frequency/amplitude scale with speed, so IDLE/WALK/RUN read clearly.
   * Replace with skeletal clip playback once a rigged model exists.
   */
  _animate(delta) {
    const speedRatio = this.currentSpeed / this.runSpeed; // 0..1
    if (speedRatio > 0.02) {
      // Step frequency rises with speed; amplitude too (a bigger run stride).
      this._animTime += delta * (6 + speedRatio * 8);
      const bob = Math.sin(this._animTime) * 0.06 * (0.5 + speedRatio);
      this.body.position.y = 1.1 + Math.abs(bob);
      // Lean into the direction of travel.
      this.body.rotation.x = -speedRatio * 0.18;
    } else {
      // Ease back to a neutral idle pose.
      this.body.position.y += (1.1 - this.body.position.y) * 0.2;
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
