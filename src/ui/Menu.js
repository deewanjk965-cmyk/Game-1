/**
 * Menu.js
 * -------
 * The main menu (shown at boot) and the pause menu, plus the small pause button
 * on the HUD. Both menus share a graphics-quality toggle (Low / Medium / High).
 *
 * Callbacks the host (Game) wires up:
 *   onPlay(), onResume(), onRestart(), onPause(), onQuality(tier)
 */

export class Menu {
  constructor(initialQuality = 'medium') {
    this.quality = initialQuality;
    this.onPlay = null;
    this.onResume = null;
    this.onRestart = null;
    this.onPause = null;
    this.onQuality = null;

    this._buildMainMenu();
    this._buildPauseButton();
    this._buildPauseMenu();
  }

  // ---- Shared bits ----------------------------------------------------------

  _overlay() {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'fixed',
      inset: '0',
      display: 'none',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '18px',
      zIndex: '150',
      background: 'linear-gradient(160deg, rgba(10,16,24,0.92), rgba(20,30,44,0.92))',
      fontFamily: 'system-ui, sans-serif',
      color: '#fff',
    });
    document.body.appendChild(el);
    return el;
  }

  _bigButton(label, color = '#2f7d46') {
    const b = document.createElement('button');
    b.textContent = label;
    Object.assign(b.style, {
      padding: '14px 40px',
      fontSize: '18px',
      fontWeight: '800',
      color: '#fff',
      background: color,
      border: '2px solid rgba(255,255,255,0.6)',
      borderRadius: '30px',
      cursor: 'pointer',
      touchAction: 'manipulation',
      minWidth: '200px',
    });
    return b;
  }

  /** A Low / Medium / High segmented control. */
  _qualityToggle() {
    const wrap = document.createElement('div');
    Object.assign(wrap.style, { display: 'flex', gap: '8px', marginTop: '6px' });
    const label = document.createElement('div');
    label.textContent = 'Graphics';
    Object.assign(label.style, {
      width: '100%',
      textAlign: 'center',
      fontSize: '12px',
      opacity: '0.8',
      marginBottom: '4px',
    });

    const buttons = {};
    const container = document.createElement('div');
    Object.assign(container.style, { display: 'flex', flexDirection: 'column', alignItems: 'center' });
    container.appendChild(label);

    ['low', 'medium', 'high'].forEach((tier) => {
      const b = document.createElement('button');
      b.textContent = tier[0].toUpperCase() + tier.slice(1);
      Object.assign(b.style, {
        padding: '8px 14px',
        fontSize: '13px',
        fontWeight: '700',
        color: '#fff',
        background: 'rgba(255,255,255,0.12)',
        border: '2px solid rgba(255,255,255,0.3)',
        borderRadius: '18px',
        cursor: 'pointer',
        touchAction: 'manipulation',
      });
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this._setQuality(tier);
        if (this.onQuality) this.onQuality(tier);
      });
      buttons[tier] = b;
      wrap.appendChild(b);
    });
    container.appendChild(wrap);
    this._qualityButtons = { ...(this._qualityButtons || {}), ...buttons };
    this._refreshQualityButtons();
    return container;
  }

  _setQuality(tier) {
    this.quality = tier;
    this._refreshQualityButtons();
  }

  _refreshQualityButtons() {
    if (!this._qualityButtons) return;
    for (const [tier, b] of Object.entries(this._qualityButtons)) {
      const on = tier === this.quality;
      b.style.background = on ? '#3a78d0' : 'rgba(255,255,255,0.12)';
      b.style.borderColor = on ? '#fff' : 'rgba(255,255,255,0.3)';
    }
  }

  // ---- Main menu ------------------------------------------------------------

  _buildMainMenu() {
    this.main = this._overlay();

    const title = document.createElement('div');
    title.textContent = 'OPEN WORLD';
    Object.assign(title.style, { fontSize: '44px', fontWeight: '900', letterSpacing: '3px' });
    const sub = document.createElement('div');
    sub.textContent = 'A mobile GTA-style sandbox';
    Object.assign(sub.style, { fontSize: '14px', opacity: '0.8', marginBottom: '10px' });

    const play = this._bigButton('▶  PLAY');
    play.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.hideMain();
      if (this.onPlay) this.onPlay();
    });

    this.main.append(title, sub, play, this._qualityToggle());
    this.main.style.display = 'flex';
  }

  hideMain() {
    this.main.style.display = 'none';
  }

  // ---- Pause button + menu --------------------------------------------------

  _buildPauseButton() {
    this.pauseBtn = document.createElement('button');
    this.pauseBtn.textContent = '❚❚';
    Object.assign(this.pauseBtn.style, {
      position: 'fixed',
      top: 'calc(env(safe-area-inset-top, 0px) + 152px)',
      left: 'calc(env(safe-area-inset-left, 0px) + 12px)',
      width: '40px',
      height: '40px',
      borderRadius: '50%',
      background: 'rgba(0,0,0,0.45)',
      color: '#fff',
      border: '2px solid rgba(255,255,255,0.4)',
      fontSize: '13px',
      zIndex: '16',
      cursor: 'pointer',
      touchAction: 'manipulation',
    });
    this.pauseBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.showPause();
      if (this.onPause) this.onPause();
    });
    document.body.appendChild(this.pauseBtn);
  }

  _buildPauseMenu() {
    this.pause = this._overlay();

    const title = document.createElement('div');
    title.textContent = 'PAUSED';
    Object.assign(title.style, { fontSize: '36px', fontWeight: '900', letterSpacing: '3px' });

    const resume = this._bigButton('RESUME');
    resume.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.hidePause();
      if (this.onResume) this.onResume();
    });

    const restart = this._bigButton('RESTART', '#a0442f');
    restart.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.hidePause();
      if (this.onRestart) this.onRestart();
    });

    this.pause.append(title, resume, restart, this._qualityToggle());
  }

  showPause() {
    this._refreshQualityButtons();
    this.pause.style.display = 'flex';
  }

  hidePause() {
    this.pause.style.display = 'none';
  }

  dispose() {
    this.main.remove();
    this.pause.remove();
    this.pauseBtn.remove();
  }
}
