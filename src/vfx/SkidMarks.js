/**
 * SkidMarks.js
 * ------------
 * A pool of dark quads laid flat on the road to mark tyre skids while the
 * player's car drifts or brakes hard. Pooled + slowly fading, so the effect
 * costs almost nothing and never grows unbounded.
 */

import * as THREE from 'three';

const CAP = 80;
const MARK_GEO = new THREE.PlaneGeometry(0.5, 1.4);

export class SkidMarks {
  constructor(scene) {
    this.scene = scene;
    this.marks = [];
    this.index = 0;

    const mat = new THREE.MeshBasicMaterial({
      color: 0x141414,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });

    for (let i = 0; i < CAP; i++) {
      const m = new THREE.Mesh(MARK_GEO, mat.clone());
      m.rotation.x = -Math.PI / 2; // lie flat
      m.position.y = 0.03;
      m.visible = false;
      scene.add(m);
      this.marks.push({ mesh: m, life: 0 });
    }
  }

  /**
   * Drop a skid mark at a wheel position, oriented to the car's heading.
   * @param {number} x @param {number} z @param {number} heading
   */
  drop(x, z, heading) {
    const slot = this.marks[this.index];
    this.index = (this.index + 1) % this.marks.length;
    slot.mesh.position.set(x, 0.03, z);
    slot.mesh.rotation.z = -heading; // align with travel (mesh already tilted)
    slot.mesh.material.opacity = 0.5;
    slot.mesh.visible = true;
    slot.life = 6; // seconds before fully faded
  }

  update(delta) {
    for (const s of this.marks) {
      if (s.life <= 0) continue;
      s.life -= delta;
      if (s.life <= 0) {
        s.mesh.visible = false;
        continue;
      }
      // Fade over the last 2 seconds of life.
      s.mesh.material.opacity = Math.min(0.5, (s.life / 2) * 0.5);
    }
  }

  dispose() {
    for (const s of this.marks) this.scene.remove(s.mesh);
  }
}
