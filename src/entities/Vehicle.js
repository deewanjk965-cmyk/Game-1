/**
 * Vehicle.js
 * ----------
 * Mobile-optimized, arcade-style car.
 *
 * The physics is a deliberately simple, *stable* velocity model — not a full
 * rigid-body simulation — because on mobile we want predictable, fun handling
 * at 60fps, not accuracy. The model tracks:
 *
 *   - `heading`  : which way the car points (yaw radians)
 *   - a velocity vector on the ground, split each frame into:
 *       vLong  : speed along the car's forward axis (drive/brake act here)
 *       vLat   : sideways speed (this is what "drift" is — sideways sliding)
 *
 * Handling comes from three tunable forces:
 *   1. Engine / brake      → change vLong.
 *   2. Grip                → bleeds off vLat so the car stops sliding sideways.
 *                            Lower grip while braking-and-turning at speed lets
 *                            the car drift, then grip smoothly recovers → the
 *                            "drifting stability" the brief asks for.
 *   3. Steering            → rotates `heading`, scaled by speed so the car
 *                            can't spin on the spot and reverses correctly.
 *
 * Public contract used by Game.js / VehicleManager:
 *   position, heading, speedKmh, group,
 *   update(input, delta), setOccupied(bool), getExitPosition()
 */

import * as THREE from 'three';
import { buildCarMesh } from './carMesh.js';

export class Vehicle {
  /**
   * @param {THREE.Scene} scene
   * @param {object} config Flat game config.
   * @param {object} [opts]
   * @param {THREE.Vector3|{x,y,z}} [opts.position] Spawn position.
   * @param {number} [opts.heading] Spawn heading (radians).
   * @param {number} [opts.color] Body colour.
   */
  constructor(scene, config, opts = {}) {
    this.config = config;
    this.scene = scene;

    // --- Physics state ------------------------------------------------------
    this.position = new THREE.Vector3(
      opts.position?.x ?? 0,
      0,
      opts.position?.z ?? 0
    );
    this.heading = opts.heading ?? 0;
    this.velocity = new THREE.Vector3(); // world-space, on the ground plane
    this.occupied = false;

    // --- Handling tuning (metres, seconds) ----------------------------------
    this.enginePower = 40; // forward acceleration (m/s²) at full throttle
    this.reversePower = 16; // reverse acceleration
    this.brakePower = 42; // deceleration when braking
    this.maxSpeed = 52; // ~187 km/h top speed (punchy, arcade)
    this.maxReverseSpeed = 12;
    this.rollingResistance = 3.0; // natural slow-down when coasting
    this.maxSteer = 0.55; // max steering angle (radians)
    this.steerResponse = 2.4; // how quickly heading turns with steering
    // Grip = how fast sideways velocity is killed (higher = more planted).
    this.gripNormal = 7.0;
    this.gripDrift = 2.2; // reduced grip while drifting → longer slides

    // --- Visual model -------------------------------------------------------
    this.group = new THREE.Group();
    this.group.name = 'vehicle';
    const parts = buildCarMesh(config, opts.color ?? 0xcc2222);
    this.group.add(parts.group);
    this.flWheel = parts.frontWheels[0];
    this.frWheel = parts.frontWheels[1];
    this._taillightMat = parts.taillightMat;
    this.group.position.copy(this.position);
    this.group.rotation.y = this.heading;
    scene.add(this.group);

    // Scratch vectors (no per-frame allocation).
    this._forward = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._steerAngle = 0; // smoothed visual/again logical steering
  }

  /** Current speed in km/h (signed: negative = reversing). Handy for the HUD. */
  get speedKmh() {
    const s = this.velocity.dot(this._forwardDir());
    return s * 3.6;
  }

  /** Unit forward vector from heading (points out the front of the car). */
  _forwardDir(out = this._forward) {
    return out.set(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  /** Unit right vector from heading. */
  _rightDir(out = this._right) {
    return out.set(Math.cos(this.heading), 0, -Math.sin(this.heading));
  }

  /**
   * Advance the vehicle one frame from a driving-input object.
   * @param {{throttle:number, brake:number, steer:number}} input
   *        throttle 0..1, brake 0..1, steer -1..1 (left..right)
   * @param {number} delta Seconds.
   */
  update(input, delta) {
    const forward = this._forwardDir();
    const right = this._rightDir();

    // Decompose current velocity into longitudinal + lateral components.
    let vLong = this.velocity.dot(forward);
    let vLat = this.velocity.dot(right);

    // --- Longitudinal forces: engine, brake/reverse, rolling resistance -----
    const throttle = input.throttle ?? 0;
    const brake = input.brake ?? 0;

    if (throttle > 0) {
      vLong += this.enginePower * throttle * delta;
    }

    if (brake > 0) {
      if (vLong > 0.5) {
        // Moving forward + brake pressed → brake toward zero.
        vLong -= this.brakePower * brake * delta;
      } else {
        // Stopped or already moving back → brake pedal acts as reverse.
        vLong -= this.reversePower * brake * delta;
      }
    }

    // Rolling resistance / coasting (always pulls speed toward zero).
    const resist = this.rollingResistance * delta;
    if (vLong > 0) vLong = Math.max(0, vLong - resist);
    else if (vLong < 0) vLong = Math.min(0, vLong + resist);

    // Clamp to speed limits.
    vLong = THREE.MathUtils.clamp(vLong, -this.maxReverseSpeed, this.maxSpeed);

    // --- Steering: rotate the heading, scaled by speed ----------------------
    // Smooth the raw steer input for a natural, non-twitchy wheel feel.
    const targetSteer = (input.steer ?? 0) * this.maxSteer;
    this._steerAngle = THREE.MathUtils.damp(
      this._steerAngle,
      targetSteer,
      8,
      delta
    );

    // Turn rate falls off at very low speed (can't pivot in place) and flips
    // sign in reverse so the car steers intuitively when backing up.
    // NOTE: the chase camera looks down +forward, which mirrors world X on the
    // screen — so a positive steer must DECREASE heading for the car to turn
    // the same way (right) the player pressed. Hence the minus sign here.
    const speedFactor = THREE.MathUtils.clamp(Math.abs(vLong) / 6, 0, 1);
    const dir = Math.sign(vLong || 1);
    this.heading -= this._steerAngle * this.steerResponse * speedFactor * dir * delta;

    // --- Grip / drift: bleed off sideways velocity --------------------------
    // Drift when braking hard while turning at speed; otherwise stay planted.
    const turningHard = Math.abs(this._steerAngle) > this.maxSteer * 0.4;
    const fast = Math.abs(vLong) > 10;
    const drifting = brake > 0.3 && turningHard && fast;
    const grip = drifting ? this.gripDrift : this.gripNormal;
    // Exponential decay of lateral velocity toward 0 (stable at any framerate).
    vLat = THREE.MathUtils.damp(vLat, 0, grip, delta);
    this.drifting = drifting;

    // --- Reassemble world velocity + integrate position ---------------------
    // Recompute basis (heading changed) so motion follows the new facing.
    this._forwardDir(forward);
    this._rightDir(right);
    this.velocity
      .copy(forward)
      .multiplyScalar(vLong)
      .addScaledVector(right, vLat);

    this.position.addScaledVector(this.velocity, delta);

    // --- Sync visuals -------------------------------------------------------
    this.group.position.copy(this.position);
    this.group.rotation.y = this.heading;
    // Turn the front wheels for visual feedback (matches the steer direction).
    if (this.flWheel) this.flWheel.rotation.y = -this._steerAngle;
    if (this.frWheel) this.frWheel.rotation.y = -this._steerAngle;

    // Brake lights glow brighter while braking / reversing.
    if (this._taillightMat) {
      this._taillightMat.emissiveIntensity = brake > 0 ? 2.4 : 0.55;
    }

    // A subtle body roll into drifts/turns adds a lot of arcade "juice".
    const roll = THREE.MathUtils.clamp(-vLat * 0.02, -0.12, 0.12);
    this.group.rotation.z = roll;
  }

  setOccupied(v) {
    this.occupied = v;
  }

  // Approximate collision circle radius for building collision (the car is a
  // 2×4 box; a ~1.7 m circle is a good, cheap stand-in on mobile).
  get collisionRadius() {
    return 1.7;
  }

  /** Current absolute speed in m/s (used for run-over/impact damage). */
  get speedMS() {
    return this.velocity.length();
  }

  /**
   * React to being pushed out of a building by the collision system. We remove
   * the velocity component heading *into* the wall so the car scrapes along it
   * and loses speed, instead of tunnelling through.
   * @param {{x:number, z:number}} normal Unit push-out direction.
   */
  onCollide(normal) {
    const into = this.velocity.x * normal.x + this.velocity.z * normal.z;
    if (into < 0) {
      // Cancel the inward part; keep the tangential part (slide along wall).
      this.velocity.x -= into * normal.x;
      this.velocity.z -= into * normal.z;
      // Bleed a little extra speed so a head-on hit feels like a real bump.
      this.velocity.multiplyScalar(0.6);
    }
  }

  /**
   * A world position beside the driver door to drop the player on exit.
   * Left side of the car (car's local -X).
   */
  getExitPosition() {
    const right = this._rightDir(new THREE.Vector3());
    return this.position.clone().addScaledVector(right, -2.2);
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.isMesh && o.geometry) o.geometry.dispose();
    });
  }
}
