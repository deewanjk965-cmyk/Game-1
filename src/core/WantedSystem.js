/**
 * WantedSystem.js
 * ---------------
 * The 1–5 star "wanted" meter. Crimes add heat; heat maps to a star level;
 * heat slowly cools off when the player stops committing crimes (and stays hot
 * while police are actively engaged). The police system reads `stars` to decide
 * how many cops to send.
 */

export class WantedSystem {
  constructor() {
    this.heat = 0; // 0..100 internal meter
    this.stars = 0; // derived 0..5 for the HUD
    // Heat thresholds for each star level.
    this.thresholds = [0, 10, 30, 50, 72, 90];
    // Cool-down: heat lost per second when no fresh crime is happening.
    this.coolRate = 2.5;
    this._sinceCrime = 0;
  }

  /**
   * Register a crime. Each type adds a different amount of heat.
   * @param {'shoot'|'injurePed'|'killPed'|'stealCar'|'killCop'} type
   */
  registerCrime(type) {
    const heatByCrime = {
      shoot: 3,
      injurePed: 6,
      killPed: 18,
      stealCar: 8,
      killCop: 25,
    };
    this.heat = Math.min(100, this.heat + (heatByCrime[type] || 0));
    this._sinceCrime = 0;
    this._recomputeStars();
  }

  update(delta, policeEngaged) {
    // Only start cooling a short while after the last crime, and never while
    // cops are still actively chasing (that keeps the heat on, GTA-style).
    this._sinceCrime += delta;
    if (!policeEngaged && this._sinceCrime > 4) {
      this.heat = Math.max(0, this.heat - this.coolRate * delta);
      this._recomputeStars();
    }
  }

  _recomputeStars() {
    let s = 0;
    for (let i = 1; i < this.thresholds.length; i++) {
      if (this.heat >= this.thresholds[i]) s = i;
    }
    this.stars = s;
  }

  clear() {
    this.heat = 0;
    this.stars = 0;
    this._sinceCrime = 0;
  }
}
