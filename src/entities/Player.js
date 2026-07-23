/**
 * Player.js
 * ---------
 * PART 1 PLACEHOLDER.
 *
 * The full player (animated character, physics, health, inventory) is Part 2.
 * For now the player is a simple capsule so we have something for the camera
 * to follow and something to drive with the touch joystick, proving the core
 * loop, streaming and controls all work together.
 *
 * Movement here is intentionally kinematic (no gravity/collision yet) — that
 * arrives with the physics pass in Part 2.
 */

import * as THREE from 'three';

export class Player {
  constructor(scene, config) {
    this.config = config;

    // Visible capsule body.
    const geo = new THREE.CapsuleGeometry(0.5, 1.1, 6, 12);
    const mat = new THREE.MeshLambertMaterial({ color: 0xff5533 });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = config.shadows;
    this.mesh.position.set(0, 1.1, 0); // stand on the ground plane
    scene.add(this.mesh);

    // A small "nose" cone so we can see which way the player faces.
    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(0.25, 0.6, 8),
      new THREE.MeshLambertMaterial({ color: 0xffe08a })
    );
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 0.2, 0.6);
    this.mesh.add(nose);

    // Movement tuning.
    this.moveSpeed = 8; // metres / second
    this.turnLerp = 0.18; // how quickly the body rotates to face travel dir

    // Reusable scratch vectors (avoid per-frame allocation on mobile GC).
    this._moveDir = new THREE.Vector3();
    this._forward = new THREE.Vector3();
    this._right = new THREE.Vector3();
  }

  get position() {
    return this.mesh.position;
  }

  /**
   * Move the player from a 2D input vector, interpreted relative to the
   * camera's facing so "up" on the joystick always means "away from camera".
   *
   * @param {{x:number, y:number}} input Joystick vector, components in [-1,1].
   * @param {THREE.Camera} camera Used to derive camera-relative directions.
   * @param {number} delta Seconds since last frame.
   */
  update(input, camera, delta) {
    const mag = Math.hypot(input.x, input.y);
    if (mag < 0.05) return; // dead-zone: ignore tiny drift

    // Camera-relative basis flattened onto the ground plane.
    camera.getWorldDirection(this._forward);
    this._forward.y = 0;
    this._forward.normalize();
    // Right vector = forward x up.
    this._right.crossVectors(this._forward, camera.up).normalize();

    // input.y = forward/back, input.x = strafe left/right.
    this._moveDir
      .copy(this._forward)
      .multiplyScalar(-input.y)
      .addScaledVector(this._right, input.x);

    if (this._moveDir.lengthSq() > 0) {
      this._moveDir.normalize();
      // Speed scales with how far the stick is pushed (analog movement).
      const speed = this.moveSpeed * Math.min(mag, 1);
      this.mesh.position.addScaledVector(this._moveDir, speed * delta);

      // Smoothly rotate the body to face the travel direction.
      const targetYaw = Math.atan2(this._moveDir.x, this._moveDir.z);
      this.mesh.rotation.y = this._lerpAngle(
        this.mesh.rotation.y,
        targetYaw,
        this.turnLerp
      );
    }
  }

  /** Shortest-path angular interpolation (handles the -PI/PI wrap). */
  _lerpAngle(a, b, t) {
    let diff = b - a;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return a + diff * t;
  }
}
