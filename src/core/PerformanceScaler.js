/**
 * PerformanceScaler.js
 * --------------------
 * Dynamic resolution scaling. It watches the real frame rate and nudges the
 * renderer's pixel ratio up or down to hold a target FPS — the single biggest
 * lever for smoothness on low-end mobile GPUs. When frames are cheap it sharpens
 * back up toward the device's native ratio.
 */

export class PerformanceScaler {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {number} maxRatio Upper bound (usually the tier's pixelRatio).
   * @param {number} targetFps FPS to hold (e.g. 55 for a 60 target).
   */
  constructor(renderer, maxRatio, targetFps = 55) {
    this.renderer = renderer;
    this.maxRatio = maxRatio;
    this.minRatio = 0.6;
    this.targetFps = targetFps;
    this.ratio = maxRatio;

    this._accum = 0;
    this._frames = 0;
    this.currentFps = 60;
  }

  setTargetFps(fps) {
    this.targetFps = fps;
  }

  /** Reset bounds when the graphics quality changes at runtime. */
  setMaxRatio(maxRatio) {
    this.maxRatio = maxRatio;
    this.ratio = Math.min(this.ratio, maxRatio);
    this.renderer.setPixelRatio(this.ratio);
  }

  update(delta) {
    this._accum += delta;
    this._frames++;
    if (this._accum < 0.5) return; // re-evaluate twice a second

    this.currentFps = this._frames / this._accum;
    this._accum = 0;
    this._frames = 0;

    let changed = false;
    if (this.currentFps < this.targetFps - 6 && this.ratio > this.minRatio) {
      // Struggling → drop resolution a notch.
      this.ratio = Math.max(this.minRatio, this.ratio - 0.15);
      changed = true;
    } else if (this.currentFps > this.targetFps + 8 && this.ratio < this.maxRatio) {
      // Plenty of headroom → sharpen back up gently.
      this.ratio = Math.min(this.maxRatio, this.ratio + 0.08);
      changed = true;
    }
    if (changed) this.renderer.setPixelRatio(this.ratio);
  }
}
