/**
 * ParticleSystem.js
 * -----------------
 * Lightweight, pooled particle effects:
 *   - sparks     : bright additive points (bullet impacts, small hits)
 *   - explosion  : a fiery burst of sparks (destroyed cars)
 *   - smoke      : soft billboarded puffs (a damaged engine)
 *
 * Sparks/explosions all live in ONE THREE.Points object (a single draw call,
 * regardless of how many are flying). Smoke uses a tiny sprite pool with real
 * per-puff opacity. Everything is recycled — no per-effect allocation.
 */

import * as THREE from 'three';

const SPARK_CAP = 140;
const SMOKE_CAP = 18;

export class ParticleSystem {
  constructor(scene) {
    this.scene = scene;
    this._buildSparks();
    this._buildSmoke();
  }

  // ---- Sparks / explosion (single additive Points) --------------------------

  _buildSparks() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARK_CAP * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(SPARK_CAP * 3), 3));
    const mat = new THREE.PointsMaterial({
      size: 0.4,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.scene.add(this.points);

    // CPU-side particle data.
    this._sparks = [];
    for (let i = 0; i < SPARK_CAP; i++) {
      this._sparks.push({ life: 0, max: 1, vx: 0, vy: 0, vz: 0, r: 0, g: 0, b: 0 });
      geo.attributes.position.setXYZ(i, 0, -9999, 0); // park off-screen
    }
  }

  _emitSpark(x, y, z, spread, up, r, g, b, life) {
    const i = this._sparks.findIndex((s) => s.life <= 0);
    if (i < 0) return;
    const s = this._sparks[i];
    s.life = s.max = life;
    s.vx = (Math.random() - 0.5) * spread;
    s.vz = (Math.random() - 0.5) * spread;
    s.vy = Math.random() * up + 1;
    s.r = r; s.g = g; s.b = b;
    const p = this.points.geometry.attributes.position;
    p.setXYZ(i, x, y, z);
    this.points.geometry.attributes.color.setXYZ(i, r, g, b);
  }

  /** A small shower of sparks at a bullet impact. */
  sparks(pos, count = 8) {
    for (let i = 0; i < count; i++) {
      this._emitSpark(pos.x, pos.y ?? 1, pos.z, 6, 5, 1, 0.85, 0.4, 0.25 + Math.random() * 0.2);
    }
  }

  /** A bigger fiery burst for a destroyed vehicle. */
  explosion(pos) {
    for (let i = 0; i < 40; i++) {
      const warm = Math.random();
      this._emitSpark(pos.x, 1.2, pos.z, 14, 9, 1, 0.5 + warm * 0.4, warm * 0.2, 0.4 + Math.random() * 0.5);
    }
    this.smoke(pos);
    this.smoke(pos);
  }

  // ---- Smoke (sprite pool) --------------------------------------------------

  _buildSmoke() {
    // Generate a soft radial puff texture once (canvas → texture).
    const cvs = document.createElement('canvas');
    cvs.width = cvs.height = 64;
    const g = cvs.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(120,120,120,0.9)');
    grad.addColorStop(1, 'rgba(120,120,120,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(cvs);

    this._smoke = [];
    for (let i = 0; i < SMOKE_CAP; i++) {
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false });
      const sp = new THREE.Sprite(mat);
      sp.visible = false;
      this.scene.add(sp);
      this._smoke.push({ sp, life: 0, max: 1, vy: 0 });
    }
  }

  /** Emit one rising smoke puff (call repeatedly for a steady plume). */
  smoke(pos) {
    const slot = this._smoke.find((s) => s.life <= 0);
    if (!slot) return;
    slot.life = slot.max = 1.1 + Math.random() * 0.6;
    slot.vy = 1.2 + Math.random();
    slot.sp.position.set(pos.x + (Math.random() - 0.5), 1.3, pos.z + (Math.random() - 0.5));
    slot.sp.scale.setScalar(1.5);
    slot.sp.material.opacity = 0.55;
    slot.sp.visible = true;
  }

  // ---- Per-frame update -----------------------------------------------------

  update(delta) {
    // Sparks: gravity + fade (colour dimmed toward black under additive blend).
    const pos = this.points.geometry.attributes.position;
    const col = this.points.geometry.attributes.color;
    for (let i = 0; i < this._sparks.length; i++) {
      const s = this._sparks[i];
      if (s.life <= 0) continue;
      s.life -= delta;
      if (s.life <= 0) {
        pos.setXYZ(i, 0, -9999, 0);
        continue;
      }
      s.vy -= 9 * delta; // gravity
      pos.setX(i, pos.getX(i) + s.vx * delta);
      pos.setY(i, Math.max(0.05, pos.getY(i) + s.vy * delta));
      pos.setZ(i, pos.getZ(i) + s.vz * delta);
      const f = s.life / s.max;
      col.setXYZ(i, s.r * f, s.g * f, s.b * f);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;

    // Smoke: rise, expand, fade.
    for (const s of this._smoke) {
      if (s.life <= 0) continue;
      s.life -= delta;
      if (s.life <= 0) {
        s.sp.visible = false;
        continue;
      }
      s.sp.position.y += s.vy * delta;
      const f = s.life / s.max;
      s.sp.material.opacity = 0.55 * f;
      s.sp.scale.setScalar(1.5 + (1 - f) * 2.5);
    }
  }

  dispose() {
    this.scene.remove(this.points);
    for (const s of this._smoke) this.scene.remove(s.sp);
  }
}
