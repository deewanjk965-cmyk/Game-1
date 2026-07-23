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

  /** Keep projection correct on rotate / resize. */
  setAspect(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
