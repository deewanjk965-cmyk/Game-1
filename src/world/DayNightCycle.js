/**
 * DayNightCycle.js
 * ----------------
 * Drives a smooth day → sunset → night → sunrise loop by animating the sun's
 * direction/intensity/colour and the sky + fog colour. Cheap: it just tweaks a
 * few light and colour values each frame — no extra render passes.
 */

import * as THREE from 'three';

// Palette anchors (linear-ish RGB) blended by the sun's height.
const SKY_NIGHT = new THREE.Color(0x0a1420);
const SKY_DAY = new THREE.Color(0x87b7e0);
const SKY_SUNSET = new THREE.Color(0xe0894f);

export class DayNightCycle {
  /**
   * @param {Engine} engine
   * @param {number} [dayLength] Seconds for one full cycle.
   * @param {number} [startT] Initial time of day (0..1; 0.35 = mid-morning).
   */
  constructor(engine, dayLength = 180, startT = 0.35) {
    this.engine = engine;
    this.dayLength = dayLength;
    this.t = startT;

    this._sky = new THREE.Color();
    this._sun = new THREE.Color();
  }

  update(delta) {
    // Advance time of day, wrapping at 1.
    this.t = (this.t + delta / this.dayLength) % 1;

    // Sun height: -1 at midnight, 0 at sunrise/sunset, +1 at noon.
    const angle = this.t * Math.PI * 2;
    const elevation = -Math.cos(angle);
    const day = THREE.MathUtils.clamp((elevation + 0.1) / 0.6, 0, 1);
    // Warm glow strength when the sun is near the horizon.
    const sunset = Math.max(0, 1 - Math.abs(elevation) / 0.28);

    // --- Sun direction (drives shadows) -------------------------------------
    // Sweep east→west; keep it a bit above the horizon even at "night" so the
    // scene never goes fully black.
    const horiz = Math.cos(angle);
    const height = Math.max(0.12, elevation);
    this.engine.sunOffset.set(horiz * 90, height * 130 + 15, 40);

    // --- Sky + fog colour ---------------------------------------------------
    this._sky.copy(SKY_NIGHT).lerp(SKY_DAY, day);
    this._sky.lerp(SKY_SUNSET, sunset * 0.55);
    this.engine.scene.background.copy(this._sky);
    if (this.engine.scene.fog) this.engine.scene.fog.color.copy(this._sky);

    // --- Light intensities + colour -----------------------------------------
    this.engine.sun.intensity = 0.12 + day * 1.35;
    this._sun.setRGB(1, 1, 1).lerp(new THREE.Color(0xffb066), sunset * 0.7);
    this.engine.sun.color.copy(this._sun);
    this.engine.hemiLight.intensity = 0.2 + day * 0.5;
  }

  /** Current phase label for UI/debug. */
  get phase() {
    if (this.t < 0.22 || this.t > 0.78) return 'Night';
    if (this.t < 0.3) return 'Dawn';
    if (this.t > 0.7) return 'Dusk';
    return 'Day';
  }
}
