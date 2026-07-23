/**
 * Helicopter.js
 * -------------
 * A flyable helicopter with a simple, fun arcade flight model:
 *   - collective (ascend/descend buttons) controls vertical speed,
 *   - the joystick tilts the nose to fly forward/back and yaws to turn,
 *   - spinning main + tail rotors sell the motion.
 *
 * Kept deliberately forgiving (auto-hover, soft damping) so it's flyable with
 * thumbs on a phone. Landing is just descending until the skids touch ground.
 */

import * as THREE from 'three';

const D = THREE.MathUtils.damp;

export class Helicopter {
  constructor(scene, config, opts = {}) {
    this.config = config;
    this.scene = scene;

    this.position = new THREE.Vector3(opts.position?.x ?? 0, 0, opts.position?.z ?? 0);
    this.heading = 0;
    this.pitch = 0;
    this.roll = 0;
    this.velocity = new THREE.Vector3();
    this.vy = 0;
    this.occupied = false;

    // Handling.
    this.maxHoriz = 30; // m/s cruise
    this.climbRate = 13; // m/s vertical
    this.yawRate = 1.7; // rad/s
    this.groundY = 0;

    this.group = new THREE.Group();
    this.group.rotation.order = 'YXZ'; // yaw, then pitch/roll in local frame
    this._build(opts.color ?? 0x2f4a63);
    this.group.position.copy(this.position);
    this.scene.add(this.group);

    this._buildPad();

    this._fwd = new THREE.Vector3();
  }

  /** A static landing pad (dark disc + painted "H") at the spawn point. */
  _buildPad() {
    const pad = new THREE.Group();
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(5, 24),
      new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.9 })
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.03;
    disc.receiveShadow = this.config.shadows;
    pad.add(disc);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(4.2, 4.6, 24),
      new THREE.MeshStandardMaterial({ color: 0xf2c14e })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    pad.add(ring);
    // "H" from three bars.
    const barMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2 });
    const mk = (w, d, x) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), barMat);
      m.position.set(x, 0.06, 0);
      pad.add(m);
    };
    mk(0.6, 3.4, -1.1);
    mk(0.6, 3.4, 1.1);
    mk(1.8, 0.6, 0);
    pad.position.set(this.position.x, 0, this.position.z);
    this.scene.add(pad);
    this.pad = pad;
  }

  get collisionRadius() {
    return 2.4;
  }
  get speedMS() {
    return this.velocity.length();
  }
  get airborne() {
    return this.position.y > 1.2;
  }

  _build(color) {
    const bodyMat = new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.45 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x15181d, metalness: 0.3, roughness: 0.6 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x121a22, metalness: 0.1, roughness: 0.15 });
    const shadows = this.config.shadows;

    // Fuselage + rounded cockpit.
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.5, 3.6), bodyMat);
    body.position.y = 1.6;
    body.castShadow = shadows;
    this.group.add(body);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(1.0, 12, 10), glassMat);
    nose.scale.set(0.9, 0.8, 1.1);
    nose.position.set(0, 1.6, 1.9);
    this.group.add(nose);

    // Tail boom + fin.
    const boom = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 3.2), bodyMat);
    boom.position.set(0, 1.9, -3);
    this.group.add(boom);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1, 0.6), bodyMat);
    fin.position.set(0, 2.3, -4.4);
    this.group.add(fin);

    // Skids.
    for (const x of [-0.8, 0.8]) {
      const skid = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 3), darkMat);
      skid.position.set(x, 0.5, 0.2);
      this.group.add(skid);
      const strutF = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 0.1), darkMat);
      strutF.position.set(x, 0.9, 1);
      this.group.add(strutF);
      const strutB = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 0.1), darkMat);
      strutB.position.set(x, 0.9, -0.6);
      this.group.add(strutB);
    }

    // Main rotor (spins on Y).
    this.rotor = new THREE.Group();
    this.rotor.position.set(0, 2.5, 0);
    for (let i = 0; i < 2; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(9, 0.06, 0.35), darkMat);
      blade.rotation.y = i * Math.PI / 2;
      this.rotor.add(blade);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.3, 8), darkMat);
    this.rotor.add(hub);
    this.group.add(this.rotor);

    // Tail rotor (spins on X).
    this.tailRotor = new THREE.Group();
    this.tailRotor.position.set(0.3, 2.3, -4.5);
    for (let i = 0; i < 2; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.6, 0.18), darkMat);
      blade.rotation.z = i * Math.PI / 2;
      this.tailRotor.add(blade);
    }
    this.group.add(this.tailRotor);
  }

  setOccupied(v) {
    this.occupied = v;
  }

  /**
   * @param {{collective:number, forward:number, yaw:number}} input
   *        collective -1..1 (down..up), forward -1..1, yaw -1..1.
   */
  update(input, delta) {
    const collective = input.collective || 0;
    const forward = input.forward || 0;
    const yaw = input.yaw || 0;

    // Rotor spin (faster while the engine is "on"/occupied).
    const spin = this.occupied ? 34 : 6;
    this.rotor.rotation.y += delta * spin;
    this.tailRotor.rotation.x += delta * spin * 1.3;

    // Vertical.
    this.vy = D(this.vy, collective * this.climbRate, 3, delta);

    // Yaw.
    this.heading -= yaw * this.yawRate * delta;
    this._fwd.set(Math.sin(this.heading), 0, Math.cos(this.heading));

    // Horizontal velocity toward the facing direction (joystick forward).
    const targetX = this._fwd.x * forward * this.maxHoriz;
    const targetZ = this._fwd.z * forward * this.maxHoriz;
    this.velocity.x = D(this.velocity.x, targetX, 2, delta);
    this.velocity.z = D(this.velocity.z, targetZ, 2, delta);

    // Integrate.
    this.position.x += this.velocity.x * delta;
    this.position.z += this.velocity.z * delta;
    this.position.y += this.vy * delta;
    if (this.position.y < this.groundY) {
      this.position.y = this.groundY;
      this.vy = 0;
    }

    // Visual tilt (nose down when flying forward, bank into turns).
    this.pitch = D(this.pitch, -forward * 0.3, 4, delta);
    this.roll = D(this.roll, yaw * 0.35, 4, delta);
    this.group.position.copy(this.position);
    this.group.rotation.set(this.pitch, this.heading, this.roll);
  }

  distanceTo(p) {
    return Math.hypot(p.x - this.position.x, p.z - this.position.z);
  }

  /** Drop-off point beside the skids (on the ground). */
  getExitPosition() {
    return new THREE.Vector3(this.position.x + 3, 0, this.position.z);
  }
}
