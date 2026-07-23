/**
 * ActionPrompt.js
 * ---------------
 * A single contextual action button shown to the on-foot player — right now
 * that's the "ENTER" button that pops up when the player walks up to a car.
 *
 * Kept generic (title + callback) so later parts can reuse it for other
 * context actions ("PICK UP", "TALK", …) without new UI code.
 */

export class ActionPrompt {
  constructor() {
    this.onPress = null;
    this._visible = false;
    this._build();
  }

  _build() {
    this.el = document.createElement('button');
    Object.assign(this.el.style, {
      position: 'fixed',
      left: '50%',
      bottom: 'calc(env(safe-area-inset-bottom, 0px) + 130px)',
      transform: 'translateX(-50%)',
      padding: '12px 22px',
      borderRadius: '24px',
      border: '2px solid rgba(255,255,255,0.7)',
      background: 'rgba(20,120,60,0.85)',
      color: '#fff',
      fontSize: '15px',
      fontWeight: '700',
      letterSpacing: '0.5px',
      zIndex: '25',
      display: 'none',
      touchAction: 'none',
      boxShadow: '0 3px 10px rgba(0,0,0,0.4)',
    });
    // pointerdown (not click) for snappy, no-300ms-delay mobile response.
    this.el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.onPress) this.onPress();
    });
    document.body.appendChild(this.el);
  }

  /** Show the prompt with a label (idempotent — cheap to call every frame). */
  show(label = 'ENTER') {
    if (this._visible && this.el.textContent === label) return;
    this.el.textContent = label;
    this.el.style.display = 'block';
    this._visible = true;
  }

  hide() {
    if (!this._visible) return;
    this.el.style.display = 'none';
    this._visible = false;
  }

  dispose() {
    this.el.remove();
  }
}
