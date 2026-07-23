/**
 * TrafficCar.js
 * -------------
 * An autonomous AI car that drives the road grid. Unlike the player's arcade
 * Vehicle, this uses simple *kinematic* waypoint following (no drift physics) —
 * that's all ambient traffic needs and it's very cheap on mobile.
 *
 * Driving loop: head toward the current lane target (a point on the road offset
 * to the right); on arrival at an intersection, pick a new direction (never an
 * immediate U-turn) and a fresh lane target. Speed is governed by a simple
 * "look ahead" check the manager feeds in, so cars stop for each other, the
 * player and pedestrians instead of driving through them.
 *
 * Pooled: `activate()` / `deactivate()`, never destroyed at runtime.
 */

import * as THREE from 'three';

const BODY_COLORS = [0x9fa4ad, 0x2f6fb0, 0xb04a2f, 0xd0b048, 0x3f9a6a, 0x8a8f99];
const WHEEL_MAT = new THREE.MeshLambertMaterial({ color: 0x101014 });

export class TrafficCar {
  /** @param {THREE.Scene} scene @param {object} config @param {RoadNetwork} roads */
  constructor(scene, config, roads) {
    this.config = config;
    this.roads = roads;

    this.group = new THREE.Group();
    this._buildMesh();
    this.group.visible = false;
    scene.add(this.group);

    this.active = false;

    // Navigation state (node indices).
    this.fromIx = 0;
    this.fromIz = 0;
    this.toIx = 0;
    this.toIz = 0;
    this.laneTarget = { x: 0, z: 0, heading: 0 };

    this.heading = 0;
    this.speed = 0;
    this.maxSpeed = 9 + Math.random() * 4; // ~32–47 km/h ambient cruising
    this.accel = 6;
    this.turnRate = 2.5;

    this.position = new THREE.Vector3();
  }

  _buildMesh() {
    const color = BODY_COLORS[(Math.random() * BODY_COLORS.length) | 0];
    const bodyMat = new THREE.MeshLambertMaterial({ color });

    const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.55, 3.8), bodyMat);
    chassis.position.y = 0.55;
    chassis.castShadow = this.config.shadows;
    this.group.add(chassis);

    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.55, 1.8),
      new THREE.MeshLambertMaterial({ color: 0x223040 })
    );
    cabin.position.set(0, 1.05, -0.15);
    this.group.add(cabin);

    const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.28, 10);
    for (const [x, z] of [[-0.95, 1.2], [0.95, 1.2], [-0.95, -1.2], [0.95, -1.2]]) {
      const w = new THREE.Mesh(wheelGeo, WHEEL_MAT);
      w.rotation.z = Math.PI / 2;
      w.position.set(x, 0.38, z);
      this.group.add(w);
    }
  }

  /** Spawn the car at a node and send it toward a neighbouring node. */
  activate(ix, iz, dir) {
    this.fromIx = ix;
    this.fromIz = iz;
    this.toIx = ix + dir.x;
    this.toIz = iz + dir.z;
    this.laneTarget = this.roads.getLanePoint(this.fromIx, this.fromIz, this.toIx, this.toIz);

    this.heading = this.laneTarget.heading;
    this.speed = this.maxSpeed * 0.5;

    // Start AT the origin node, on the same (right-hand) lane as the target so
    // the car sits correctly on the road and drives forward, not across it.
    const size = this.roads.size;
    const off = this.roads.laneOffset;
    // Right-of-travel perpendicular for the from→to direction.
    const rx = dir.z;
    const rz = -dir.x;
    this.position.set(ix * size + rx * off, 0, iz * size + rz * off);

    this.group.position.copy(this.position);
    this.group.rotation.y = this.heading;
    this.group.visible = true;
    this.active = true;
  }

  deactivate() {
    this.active = false;
    this.group.visible = false;
  }

  /** Unit forward vector from heading (matches Vehicle/RoadNetwork convention). */
  forward(out = new THREE.Vector3()) {
    return out.set(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  /**
   * Advance one frame.
   * @param {number} delta
   * @param {number} targetSpeed Speed cap the manager allows this frame (0 to
   *        stop for an obstacle ahead, else this.maxSpeed).
   */
  update(delta, targetSpeed) {
    if (!this.active) return;

    // Ramp speed toward the allowed target (smooth accel/brake).
    this.speed = THREE.MathUtils.damp(this.speed, targetSpeed, this.accel, delta);

    // Steer heading toward the lane target for smooth cornering.
    const dx = this.laneTarget.x - this.position.x;
    const dz = this.laneTarget.z - this.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.001) {
      const desired = Math.atan2(dx, dz);
      this.heading = this._lerpAngle(this.heading, desired, this.turnRate * delta);
    }

    // Move forward.
    const f = this.forward(this._f || (this._f = new THREE.Vector3()));
    this.position.addScaledVector(f, this.speed * delta);

    // Reached the intersection → choose the next segment.
    if (dist < 2.5) this._advanceNode();

    this.group.position.copy(this.position);
    this.group.rotation.y = this.heading;
  }

  /** Pick the next node to drive to, avoiding an immediate U-turn. */
  _advanceNode() {
    const cameFrom = { x: this.fromIx - this.toIx, z: this.fromIz - this.toIz };
    this.fromIx = this.toIx;
    this.fromIz = this.toIz;

    const dirs = this.roads.directions;
    // Prefer directions that aren't a reversal.
    const options = dirs.filter(
      (d) => !(d.x === cameFrom.x && d.z === cameFrom.z)
    );
    const dir = options[(Math.random() * options.length) | 0];
    this.toIx = this.fromIx + dir.x;
    this.toIz = this.fromIz + dir.z;
    this.laneTarget = this.roads.getLanePoint(this.fromIx, this.fromIz, this.toIx, this.toIz);
  }

  _lerpAngle(a, b, t) {
    let diff = b - a;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return a + diff * Math.min(t, 1);
  }
}
