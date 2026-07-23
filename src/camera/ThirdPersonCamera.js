/**
 * ThirdPersonCamera.js
 * --------------------
 * A GTA-style follow camera that orbits behind the player.
 *
 * - The player controls the *orbit* (yaw/pitch) by dragging on the right half
 *   of the screen — this is wired up by TouchControls, which just feeds us
 *   delta values via `orbit()` and `zoom()`.
 * - The camera position is computed from spherical coordinates around the
 *   player, then smoothly damped toward that ideal so motion feels weighty
 *   rather than rigid.
 *
 * Physics-based collision (camera pulling in when a wall is behind the player)
 * is deliberately left for a later part; the hooks are here for it.
 */

import * as THREE from 'three';

export class ThirdPersonCamera {
  /**
   * @param {object} config Flat game config.
   * @param {number} aspect Initial viewport aspect ratio.
   */
  constructor(config, aspect) {
    this.config = config;

    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);

    // Orbit state, in spherical coordinates around the follow target.
    this.yaw = 0; // horizontal angle (radians)
    this.pitch = 0.5; // vertical angle (radians), 0 = level
    this.distance = 8; // metres behind the player

    // Limits so the camera can't flip over or clip into the ground.
    this.minPitch = 0.1;
    this.maxPitch = 1.2;
    this.minDistance = 4;
    this.maxDistance = 14;

    // Sensitivities (tuned for touch drag in screen-pixels).
    this.orbitSpeed = 0.005;
    this.zoomSpeed = 0.01;

    // How high above the player's feet the camera aims (roughly head height).
    this.targetHeight = 1.6;
    // Position smoothing factor (0..1 per frame). Lower = floatier.
    this.followLerp = 0.12;

    // Scratch objects to avoid per-frame allocations.
    this._idealPos = new THREE.Vector3();
    this._lookTarget = new THREE.Vector3();
  }

  /** Apply a drag delta (screen pixels) to the orbit angles. */
  orbit(dx, dy) {
    this.yaw -= dx * this.orbitSpeed;
    this.pitch += dy * this.orbitSpeed;
    // Clamp pitch so we never look straight up/down or under the floor.
    this.pitch = Math.max(this.minPitch, Math.min(this.maxPitch, this.pitch));
  }

  /** Apply a pinch delta to the follow distance (positive = zoom out). */
  zoom(deltaDistance) {
    this.distance = Math.max(
      this.minDistance,
      Math.min(this.maxDistance, this.distance + deltaDistance * this.zoomSpeed)
    );
  }

  /**
   * Reposition the camera to follow `target` this frame.
   * @param {THREE.Vector3} target Player position.
   * @param {number} _delta Seconds since last frame (reserved for later use).
   */
  update(target, _delta) {
    // Aim point sits a bit above the target's origin (head, not feet).
    this._lookTarget.set(target.x, target.y + this.targetHeight, target.z);

    // Convert spherical (yaw, pitch, distance) -> offset behind the player.
    const cosPitch = Math.cos(this.pitch);
    const offsetX = Math.sin(this.yaw) * cosPitch * this.distance;
    const offsetY = Math.sin(this.pitch) * this.distance;
    const offsetZ = Math.cos(this.yaw) * cosPitch * this.distance;

    this._idealPos.set(
      this._lookTarget.x + offsetX,
      this._lookTarget.y + offsetY,
      this._lookTarget.z + offsetZ
    );

    // Smoothly damp the real camera toward the ideal position for weighty feel.
    this.camera.position.lerp(this._idealPos, this.followLerp);
    this.camera.lookAt(this._lookTarget);
  }

  /**
   * Auto-align the orbit yaw to sit *behind* a heading (classic driving cam).
   * Called each frame in vehicle mode so the camera trails the car smoothly
   * without the player having to drag. Manual look-drag is disabled while
   * driving, so there's no fight between the two.
   *
   * @param {number} headingYaw The vehicle's heading (radians).
   * @param {number} delta Seconds since last frame.
   * @param {number} [rate] Alignment speed (higher = snappier follow).
   */
  followBehind(headingYaw, delta, rate = 3) {
    // Behind the car = heading + PI in this camera's yaw convention.
    const targetYaw = headingYaw + Math.PI;
    let diff = targetYaw - this.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    // Frame-rate independent exponential approach.
    this.yaw += diff * (1 - Math.exp(-rate * delta));
  }

  /**
   * Configure the camera framing for a mode (on-foot vs driving). Vehicle mode
   * pulls back and lowers the aim so you can see the road ahead.
   */
  configureFor(mode) {
    if (mode === 'vehicle') {
      this.distance = 11;
      this.minDistance = 7;
      this.maxDistance = 18;
      this.pitch = 0.35;
      this.targetHeight = 1.8;
    } else {
      this.distance = 8;
      this.minDistance = 4;
      this.maxDistance = 14;
      this.pitch = 0.5;
      this.targetHeight = 1.6;
    }
  }

  /** Keep projection correct on rotate / resize. */
  setAspect(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
