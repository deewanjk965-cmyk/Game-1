/**
 * Screens.js
 * ----------
 * Full-screen "WASTED" (health = 0) and "BUSTED" (arrested) states, with a
 * respawn button. A single overlay element is recoloured/retitled per state.
 */

export class Screens {
  constructor() {
    this.onRespawn = null;
    this._build();
  }

  _build() {
    this.overlay = document.createElement('div');
    Object.assign(this.overlay.style, {
      position: 'fixed',
      inset: '0',
      display: 'none',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '24px',
      zIndex: '200',
      background: 'rgba(0,0,0,0.72)',
      fontFamily: 'system-ui, sans-serif',
    });

    this.title = document.createElement('div');
    Object.assign(this.title.style, {
      fontSize: '54px',
      fontWeight: '900',
      letterSpacing: '4px',
    });
    this.overlay.appendChild(this.title);

    this.subtitle = document.createElement('div');
    Object.assign(this.subtitle.style, {
      color: '#ddd',
      fontSize: '15px',
    });
    this.overlay.appendChild(this.subtitle);

    this.btn = document.createElement('button');
    this.btn.textContent = 'RESPAWN';
    Object.assign(this.btn.style, {
      padding: '14px 34px',
      fontSize: '18px',
      fontWeight: '800',
      color: '#fff',
      background: '#2f7d46',
      border: '2px solid rgba(255,255,255,0.6)',
      borderRadius: '30px',
      touchAction: 'manipulation',
      cursor: 'pointer',
    });
    this.btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.hide();
      if (this.onRespawn) this.onRespawn();
    });
    this.overlay.appendChild(this.btn);

    document.body.appendChild(this.overlay);
  }

  /** @param {'wasted'|'busted'} type */
  show(type) {
    if (type === 'busted') {
      this.title.textContent = 'BUSTED';
      this.title.style.color = '#5aa0ff';
      this.subtitle.textContent = 'The police caught you. You lost some cash.';
    } else {
      this.title.textContent = 'WASTED';
      this.title.style.color = '#e0392b';
      this.subtitle.textContent = 'You were killed. Respawn at the hospital.';
    }
    this.overlay.style.display = 'flex';
  }

  hide() {
    this.overlay.style.display = 'none';
  }

  get isOpen() {
    return this.overlay.style.display !== 'none';
  }

  dispose() {
    this.overlay.remove();
  }
}
