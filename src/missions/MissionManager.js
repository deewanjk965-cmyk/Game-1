/**
 * MissionManager.js
 * -----------------
 * A tiny objective engine for the starter mission:
 *
 *   1. GOTO_CAR  — a beacon marks a designated car; reach & steal it.
 *   2. DRIVE     — the beacon moves to a drop-off; drive the car there.
 *   3. DONE      — pay out a cash reward.
 *
 * The beacon is a glowing 3D pillar + spinning ring you can see across the map;
 * the HUD shows the live distance to it. The design is deliberately generic so
 * Part 5 can queue more missions through the same interface.
 */

import * as THREE from 'three';

const Stage = { NONE: 'none', GOTO_CAR: 'goto_car', DRIVE: 'drive', DONE: 'done' };

export class MissionManager {
  constructor(scene) {
    this.scene = scene;
    this.stage = Stage.NONE;
    this.target = new THREE.Vector3();
    this.designatedCar = null;
    this.dropOff = new THREE.Vector3();
    this.reward = 500;
    this.onComplete = null; // (cash) => void

    this._buildBeacon();
  }

  _buildBeacon() {
    this.beacon = new THREE.Group();

    // Translucent light pillar.
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 1.6, 24, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffd23f,
        transparent: true,
        opacity: 0.28,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    pillar.position.y = 12;
    this.beacon.add(pillar);

    // Spinning ground ring.
    this.ring = new THREE.Mesh(
      new THREE.TorusGeometry(2, 0.22, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd23f })
    );
    this.ring.rotation.x = Math.PI / 2;
    this.ring.position.y = 0.3;
    this.beacon.add(this.ring);

    this.beacon.visible = false;
    this.scene.add(this.beacon);
  }

  /**
   * Kick off the starter mission.
   * @param {Vehicle} designatedCar The car to steal.
   * @param {{x:number,z:number}} dropOff Where to deliver it.
   */
  start(designatedCar, dropOff) {
    this.designatedCar = designatedCar;
    this.dropOff.set(dropOff.x, 0, dropOff.z);
    this.stage = Stage.GOTO_CAR;
    this._moveBeaconTo(designatedCar.position);
  }

  _moveBeaconTo(pos) {
    this.target.set(pos.x, 0, pos.z);
    this.beacon.position.set(pos.x, 0, pos.z);
    this.beacon.visible = true;
  }

  /** Player entered a car — advance if it's the designated one. */
  onEnterVehicle(vehicle) {
    if (this.stage === Stage.GOTO_CAR && vehicle === this.designatedCar) {
      this.stage = Stage.DRIVE;
      this._moveBeaconTo(this.dropOff);
    }
  }

  /**
   * @param {number} delta
   * @param {THREE.Vector3} playerPos
   * @param {boolean} inDesignatedCar Is the player currently driving the car?
   */
  update(delta, playerPos, inDesignatedCar) {
    if (this.stage === Stage.NONE || this.stage === Stage.DONE) return;

    // Keep the beacon tracking the car until it's stolen.
    if (this.stage === Stage.GOTO_CAR && this.designatedCar) {
      this._moveBeaconTo(this.designatedCar.position);
    }

    this.ring.rotation.z += delta * 1.5; // spin the ring

    // Arrived at the drop-off in the right car → mission complete.
    if (this.stage === Stage.DRIVE && inDesignatedCar) {
      const d = Math.hypot(playerPos.x - this.dropOff.x, playerPos.z - this.dropOff.z);
      if (d < 5) this._complete();
    }
  }

  _complete() {
    this.stage = Stage.DONE;
    this.beacon.visible = false;
    if (this.onComplete) this.onComplete(this.reward);
  }

  /** Distance from a position to the active beacon (metres), or null. */
  distanceTo(pos) {
    if (!this.beacon.visible) return null;
    return Math.hypot(pos.x - this.target.x, pos.z - this.target.z);
  }

  /** Short objective line for the HUD. */
  get objectiveText() {
    switch (this.stage) {
      case Stage.GOTO_CAR:
        return 'Steal the marked car';
      case Stage.DRIVE:
        return 'Drive to the drop-off';
      case Stage.DONE:
        return 'Mission complete!';
      default:
        return '';
    }
  }
}
