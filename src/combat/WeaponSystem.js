/**
 * WeaponSystem.js
 * ---------------
 * Player weapons: inventory + switching, firing with mobile "assisted aim"
 * (auto-locks the nearest enemy in front, like GTA mobile), ammo, and the
 * visual feedback — muzzle flash + bullet tracer — via small reusable pools.
 *
 * It's decoupled from the camera/entities: `fire()` is handed an origin, a
 * forward direction and the list of targetable NPCs, and it returns what it hit
 * so the caller can score crimes / wanted level.
 */

import * as THREE from 'three';

// Weapon definitions. `ammoKey` indexes PlayerStats.ammo (null = melee/none).
export const WEAPONS = [
  { id: 'fists', name: 'Fists', melee: true, range: 2.4, damage: 22, rate: 0.4, auto: false, ammoKey: null },
  { id: 'knife', name: 'Knife', melee: true, range: 2.6, damage: 55, rate: 0.45, auto: false, ammoKey: null },
  { id: 'pistol', name: 'Pistol', melee: false, range: 55, damage: 34, rate: 0.34, auto: false, ammoKey: 'pistol' },
  { id: 'rifle', name: 'Rifle', melee: false, range: 85, damage: 26, rate: 0.11, auto: true, ammoKey: 'rifle' },
];

const TRACER_POOL = 6;
const FLASH_POOL = 4;

export class WeaponSystem {
  /** @param {THREE.Scene} scene @param {PlayerStats} stats */
  constructor(scene, stats) {
    this.scene = scene;
    this.stats = stats;
    this.index = 0; // start Unarmed
    this.cooldown = 0;

    this._buildEffects();

    // Scratch vectors.
    this._muzzle = new THREE.Vector3();
    this._toTarget = new THREE.Vector3();
    this._hitPoint = new THREE.Vector3();
  }

  get current() {
    return WEAPONS[this.index];
  }

  /** Ammo left for the current weapon (Infinity for melee). */
  get ammo() {
    const key = this.current.ammoKey;
    return key ? this.stats.ammo[key] : Infinity;
  }

  /** Cycle to the next weapon (wraps). */
  switchNext() {
    this.index = (this.index + 1) % WEAPONS.length;
    return this.current;
  }

  // ---- Firing ---------------------------------------------------------------

  /**
   * Attempt to fire this frame.
   * @param {THREE.Vector3} origin Shooter position (feet).
   * @param {THREE.Vector3} forward Facing direction (unit, flattened).
   * @param {Array} targets Enemies with { position, radius, active, isDead,
   *        hit(dmg, sx, sz) }.
   * @param {(target, killed:boolean) => void} onHit Per-damaged-target callback.
   * @returns {boolean} True if a shot/swing actually happened (for crime score).
   */
  fire(origin, forward, targets, onHit) {
    if (this.cooldown > 0) return false;
    const w = this.current;

    // Ammo check for firearms.
    if (w.ammoKey && this.stats.ammo[w.ammoKey] <= 0) return false;

    this.cooldown = w.rate;
    if (w.ammoKey) this.stats.ammo[w.ammoKey]--;

    // Muzzle sits at roughly chest height, a bit in front of the shooter.
    this._muzzle.set(
      origin.x + forward.x * 0.6,
      origin.y + 1.2,
      origin.z + forward.z * 0.6
    );

    // Assisted aim: pick the nearest live target inside range + a frontal cone.
    const target = this._acquireTarget(this._muzzle, forward, targets, w.range);

    if (target) {
      this._hitPoint.set(target.position.x, 1.1, target.position.z);
      const killed = target.hit(w.damage, origin.x, origin.z) === 'killed';
      onHit(target, killed);
    } else {
      // Missed / no target: send the tracer off into the distance.
      this._hitPoint.set(
        this._muzzle.x + forward.x * w.range,
        this._muzzle.y,
        this._muzzle.z + forward.z * w.range
      );
    }

    // Visual feedback (skip a tracer for melee).
    this._flash(this._muzzle);
    if (!w.melee) this._tracer(this._muzzle, this._hitPoint);

    return true;
  }

  /** Nearest active, alive target within range and a ~40° frontal cone. */
  _acquireTarget(muzzle, forward, targets, range) {
    let best = null;
    let bestDist = range;
    const minDot = 0.55; // cos(~57°) — forgiving aim assist
    for (const t of targets) {
      if (!t.active || t.isDead) continue;
      const dx = t.position.x - muzzle.x;
      const dz = t.position.z - muzzle.z;
      const dist = Math.hypot(dx, dz);
      if (dist > bestDist || dist < 0.001) continue;
      const dot = (dx / dist) * forward.x + (dz / dist) * forward.z;
      if (dot < minDot) continue; // behind / too far to the side
      bestDist = dist;
      best = t;
    }
    return best;
  }

  // ---- Effects (pooled) -----------------------------------------------------

  _buildEffects() {
    // Tracers: thin bright line segments, reused and faded out.
    this._tracers = [];
    const tracerMat = new THREE.LineBasicMaterial({
      color: 0xfff2a8,
      transparent: true,
      opacity: 0,
    });
    for (let i = 0; i < TRACER_POOL; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array(6), 3)
      );
      const line = new THREE.Line(geo, tracerMat.clone());
      line.visible = false;
      line.frustumCulled = false;
      this.scene.add(line);
      this._tracers.push({ line, life: 0 });
    }

    // Muzzle flashes: small emissive planes that pop for a couple of frames.
    this._flashes = [];
    const flashGeo = new THREE.PlaneGeometry(0.5, 0.5);
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffdd66,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    for (let i = 0; i < FLASH_POOL; i++) {
      const m = new THREE.Mesh(flashGeo, flashMat.clone());
      m.visible = false;
      this.scene.add(m);
      this._flashes.push({ mesh: m, life: 0 });
    }
  }

  _tracer(from, to) {
    const slot = this._tracers.find((t) => t.life <= 0) || this._tracers[0];
    const pos = slot.line.geometry.attributes.position;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
    slot.line.visible = true;
    slot.line.material.opacity = 0.9;
    slot.life = 0.06;
  }

  _flash(at) {
    const slot = this._flashes.find((f) => f.life <= 0) || this._flashes[0];
    slot.mesh.position.copy(at);
    slot.mesh.visible = true;
    slot.mesh.material.opacity = 1;
    slot.mesh.rotation.z = Math.random() * Math.PI;
    slot.mesh.scale.setScalar(0.7 + Math.random() * 0.6);
    slot.life = 0.05;
  }

  /** Advance cooldown + fade effects. Call every frame. */
  update(delta) {
    if (this.cooldown > 0) this.cooldown -= delta;

    for (const t of this._tracers) {
      if (t.life <= 0) continue;
      t.life -= delta;
      t.line.material.opacity = Math.max(0, (t.life / 0.06) * 0.9);
      if (t.life <= 0) t.line.visible = false;
    }
    for (const f of this._flashes) {
      if (f.life <= 0) continue;
      f.life -= delta;
      f.mesh.material.opacity = Math.max(0, f.life / 0.05);
      if (f.life <= 0) f.mesh.visible = false;
    }
  }
}
