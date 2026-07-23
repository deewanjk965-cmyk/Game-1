/**
 * PoliceCar.js
 * ------------
 * A police cruiser. Reuses the TrafficCar driving/collision machinery but, via
 * `chaseTarget`, homes in on the player instead of following the road grid.
 * Pooled by PoliceManager.
 */

import { TrafficCar } from '../ai/TrafficCar.js';

export class PoliceCar extends TrafficCar {
  constructor(scene, config, roads) {
    super(scene, config, roads);

    // Repaint the chassis white with a dark roof so it reads as a cruiser.
    const chassis = this.group.children[0];
    if (chassis && chassis.material) {
      chassis.material = chassis.material.clone();
      chassis.material.color.set(0xf2f4f8);
    }

    this.maxSpeed = 16 + Math.random() * 3; // faster than civilian traffic
  }

  /** Point the cruiser at the player each frame. */
  chase(playerPos) {
    if (!this.chaseTarget) this.chaseTarget = { x: 0, z: 0 };
    this.chaseTarget.x = playerPos.x;
    this.chaseTarget.z = playerPos.z;
  }
}
