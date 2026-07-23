/**
 * PoliceOfficer.js
 * ----------------
 * A cop on foot. Reuses the Pedestrian body/health/death machinery (so bullets
 * and cars affect cops exactly like civilians) but replaces the wander AI with
 * "chase the player and shoot". Pooled by PoliceManager.
 */

import { Pedestrian, PedState } from '../ai/Pedestrian.js';

export class PoliceOfficer extends Pedestrian {
  constructor(scene, config, roads) {
    super(scene, config, roads);

    // Navy police uniform (recolour the humanoid's shirt + trousers).
    if (this._mats) {
      this._mats.shirtMat.color.set(0x1b2f5c);
      this._mats.pantsMat.color.set(0x11172b);
    }

    this.chaseSpeed = 3.6;
    this.shootRange = 26;
    this.standoff = 6; // stops and shoots at this distance
    this.shootCooldown = 0;
    this.fireRate = 0.9; // seconds between shots
    this.shotDamage = 7;
  }

  activate(x, z) {
    super.activate(x, z);
    this.shootCooldown = 0.6 + Math.random() * 0.6;
  }

  /**
   * Chase + shoot the player.
   * @returns {boolean} true if the cop fired this frame (for a hit indicator).
   */
  updateChase(delta, playerPos, world, onShootPlayer) {
    if (!this.active) return false;

    // Dead cops lie there and despawn (reuse the base timer behaviour).
    if (this.state === PedState.DEAD) {
      this.deadTimer -= delta;
      if (this.deadTimer <= 0) this.deactivate();
      return false;
    }

    const dx = playerPos.x - this.mesh.position.x;
    const dz = playerPos.z - this.mesh.position.z;
    const dist = Math.hypot(dx, dz) || 0.001;
    this.mesh.rotation.y = Math.atan2(dx, dz); // face the player

    // Close the gap until standoff range.
    if (dist > this.standoff) {
      const nx = dx / dist;
      const nz = dz / dist;
      this.mesh.position.x += nx * this.chaseSpeed * delta;
      this.mesh.position.z += nz * this.chaseSpeed * delta;
      this._animateWalk(delta, this.chaseSpeed);
      if (world) world.resolveCircle(this.mesh.position, 0.35);
    }

    // Shoot when in range.
    this.shootCooldown -= delta;
    if (dist < this.shootRange && this.shootCooldown <= 0) {
      this.shootCooldown = this.fireRate;
      onShootPlayer(this.shotDamage);
      return true;
    }
    return false;
  }
}
