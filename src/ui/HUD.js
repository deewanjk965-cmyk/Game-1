/**
 * HUD.js
 * ------
 * The gameplay HUD overlay (separate from the tiny debug readout): health &
 * armor bars, cash, current weapon + ammo, the wanted-level stars, and the
 * current mission objective with live distance. Pure DOM so it's razor-sharp
 * at any DPI and costs the GPU nothing.
 */

export class HUD {
  constructor() {
    this._build();
  }

  _build() {
    const root = document.createElement('div');
    Object.assign(root.style, {
      position: 'fixed',
      top: 'calc(env(safe-area-inset-top, 0px) + 8px)',
      right: 'calc(env(safe-area-inset-right, 0px) + 10px)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-end',
      gap: '6px',
      zIndex: '15',
      pointerEvents: 'none',
      fontFamily: 'system-ui, sans-serif',
      color: '#fff',
      textShadow: '0 1px 2px rgba(0,0,0,0.8)',
    });

    // Wanted stars.
    this.stars = document.createElement('div');
    Object.assign(this.stars.style, {
      fontSize: '20px',
      letterSpacing: '2px',
      color: '#ffd23f',
    });
    root.appendChild(this.stars);

    // Cash.
    this.cash = document.createElement('div');
    Object.assign(this.cash.style, {
      fontSize: '20px',
      fontWeight: '800',
      color: '#8ef0a0',
    });
    root.appendChild(this.cash);

    // Weapon + ammo.
    this.weapon = document.createElement('div');
    Object.assign(this.weapon.style, { fontSize: '13px', fontWeight: '700' });
    root.appendChild(this.weapon);

    // Health + armor bars.
    this.healthBar = this._bar('#e0392b');
    this.armorBar = this._bar('#3a78d0');
    root.appendChild(this.healthBar.wrap);
    root.appendChild(this.armorBar.wrap);

    document.body.appendChild(root);

    // Mission objective banner (top-centre).
    this.objective = document.createElement('div');
    Object.assign(this.objective.style, {
      position: 'fixed',
      top: 'calc(env(safe-area-inset-top, 0px) + 8px)',
      left: '50%',
      transform: 'translateX(-50%)',
      padding: '6px 14px',
      background: 'rgba(0,0,0,0.45)',
      borderRadius: '10px',
      color: '#fff',
      fontSize: '13px',
      fontWeight: '700',
      textAlign: 'center',
      zIndex: '15',
      pointerEvents: 'none',
      display: 'none',
      maxWidth: '70vw',
    });
    document.body.appendChild(this.objective);
  }

  _bar(color) {
    const wrap = document.createElement('div');
    Object.assign(wrap.style, {
      width: '150px',
      height: '10px',
      background: 'rgba(0,0,0,0.45)',
      borderRadius: '6px',
      overflow: 'hidden',
      border: '1px solid rgba(255,255,255,0.25)',
    });
    const fill = document.createElement('div');
    Object.assign(fill.style, {
      height: '100%',
      width: '100%',
      background: color,
      transition: 'width 0.12s linear',
    });
    wrap.appendChild(fill);
    return { wrap, fill };
  }

  /**
   * Push the latest values into the HUD.
   * @param {object} s { health, maxHealth, armor, maxArmor, cash, stars,
   *                     weaponName, ammo, objective, distance }
   */
  update(s) {
    this.healthBar.fill.style.width = `${(s.health / s.maxHealth) * 100}%`;
    this.armorBar.fill.style.width = `${(s.armor / s.maxArmor) * 100}%`;
    this.cash.textContent = `$${s.cash.toLocaleString()}`;

    // Ammo shows only for firearms (Infinity = melee/unarmed).
    const ammoStr = s.ammo === Infinity ? '' : `  ${s.ammo}`;
    this.weapon.textContent = `${s.weaponName}${ammoStr}`;

    // Wanted stars: filled ★ up to the level, dim ☆ for the rest.
    this.stars.textContent = '★'.repeat(s.stars) + '☆'.repeat(5 - s.stars);

    if (s.objective) {
      const dist = s.distance != null ? `  (${Math.round(s.distance)} m)` : '';
      this.objective.textContent = `${s.objective}${dist}`;
      this.objective.style.display = 'block';
    } else {
      this.objective.style.display = 'none';
    }
  }
}
