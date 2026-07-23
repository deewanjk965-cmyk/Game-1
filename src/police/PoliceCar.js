/**
 * PoliceCar.js
 * ------------
 * A police cruiser. Reuses the TrafficCar driving/collision machinery but, via
 * `chaseTarget`, homes in on the player instead of following the road grid.
 * Pooled by PoliceManager.
 */

import * as THREE from 'three';
import { TrafficCar } from '../ai/TrafficCar.js';

export class PoliceCar extends TrafficCar {
  constructor(scene, config, roads, models = null) {
    // Police always drive a fast sedan-style cruiser.
    super(scene, config, roads, models, 'Sedan');

    // Repaint the body white so it reads as a cruiser (both model + built-in).
    if (this.paintMat) {
      this.paintMat = this.paintMat.clone();
      this.paintMat.color.set(0xf2f4f8);
      this.group.traverse((o) => {
        if (o.isMesh && o.material && o.material.metalness === 0.7) o.material = this.paintMat;
      });
    } else {
      // glTF car: recolour its body material white.
      this.group.traverse((o) => {
        if (o.isMesh && o.material && /body|paint|carpaint/i.test(o.material.name || '')) {
          o.material.color.set(0xf2f4f8);
        }
      });
    }

    // Roof light bar (emissive red + blue blocks).
    const bar = new THREE.Group();
    const red = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.18, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff0000, emissiveIntensity: 2 })
    );
    red.position.x = -0.28;
    const blue = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.18, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x000033, emissive: 0x2040ff, emissiveIntensity: 2 })
    );
    blue.position.x = 0.28;
    bar.add(red, blue);
    bar.position.set(0, 1.72, -0.2);
    this.group.add(bar);
    this._lightBar = { red: red.material, blue: blue.material };

    this.maxSpeed = 16 + Math.random() * 3; // faster than civilian traffic
  }

  /** Flash the light bar (called each frame while active). */
  update(delta, targetSpeed) {
    super.update(delta, targetSpeed);
    if (this._lightBar && this.active) {
      const t = (performance.now() % 600) / 600;
      this._lightBar.red.emissiveIntensity = t < 0.5 ? 2.5 : 0.2;
      this._lightBar.blue.emissiveIntensity = t < 0.5 ? 0.2 : 2.5;
    }
  }

  /** Point the cruiser at the player each frame. */
  chase(playerPos) {
    if (!this.chaseTarget) this.chaseTarget = { x: 0, z: 0 };
    this.chaseTarget.x = playerPos.x;
    this.chaseTarget.z = playerPos.z;
  }
}
