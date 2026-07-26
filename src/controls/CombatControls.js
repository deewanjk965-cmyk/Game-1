/**
 * CombatControls.js
 * -----------------
 * On-foot combat buttons (shown only in character mode): a big ATTACK/SHOOT
 * button and a weapon-switch button. Multi-touch friendly so you can move with
 * the left thumb and shoot with the right at the same time.
 *
 * Exposes:
 *   attackHeld       — true while the fire button is pressed (for auto weapons)
 *   onAttackPress    — callback fired once per tap (for melee / semi weapons)
 *   onSwitchWeapon   — callback fired when the switch button is tapped
 */

export class CombatControls {
  constructor() {
    this.attackHeld = false;
    this.onAttackPress = null;
    this.onSwitchWeapon = null;
    this.onJump = null;

    this._build();
    this.hide();
  }

  _build() {
    const safeB = 'calc(env(safe-area-inset-bottom, 0px) + 24px)';
    const safeR = 'calc(env(safe-area-inset-right, 0px) + 24px)';

    this.root = document.createElement('div');
    Object.assign(this.root.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '20',
      pointerEvents: 'none',
    });
    document.body.appendChild(this.root);

    // ATTACK / SHOOT (bottom-right).
    this.attackBtn = this._button('FIRE', { right: safeR, bottom: `calc(${safeB} + 20px)` }, 96, '#d23b3b');
    this._bindHold(
      this.attackBtn,
      () => {
        this.attackHeld = true;
        if (this.onAttackPress) this.onAttackPress();
      },
      () => {
        this.attackHeld = false;
      }
    );

    // WEAPON SWITCH (above the fire button).
    this.switchBtn = this._button(
      'WPN',
      { right: safeR, bottom: `calc(${safeB} + 128px)` },
      64,
      '#3a6ea5'
    );
    this._bindTap(this.switchBtn, () => this.onSwitchWeapon && this.onSwitchWeapon());

    // JUMP (to the left of the fire button).
    this.jumpBtn = this._button(
      'JUMP',
      { right: `calc(${safeR} + 110px)`, bottom: `calc(${safeB} + 30px)` },
      76,
      '#2f8f5a'
    );
    this._bindTap(this.jumpBtn, () => this.onJump && this.onJump());
  }

  _button(label, pos, size, tint) {
    const el = document.createElement('div');
    el.textContent = label;
    Object.assign(el.style, {
      position: 'fixed',
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: '50%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff',
      fontSize: size > 80 ? '16px' : '13px',
      fontWeight: '800',
      background: tint,
      border: '2px solid rgba(255,255,255,0.5)',
      boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
      userSelect: 'none',
      touchAction: 'none',
      pointerEvents: 'auto',
      ...pos,
    });
    this.root.appendChild(el);
    return el;
  }

  _bindHold(el, onPress, onRelease) {
    const press = (e) => {
      e.preventDefault();
      el.setPointerCapture?.(e.pointerId);
      el.style.transform = 'scale(0.92)';
      el.style.filter = 'brightness(1.3)';
      onPress();
    };
    const release = (e) => {
      e.preventDefault();
      el.style.transform = '';
      el.style.filter = '';
      onRelease();
    };
    el.addEventListener('pointerdown', press);
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('pointerleave', release);
  }

  _bindTap(el, onTap) {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.style.transform = 'scale(0.92)';
      el.style.filter = 'brightness(1.3)';
      onTap();
    });
    const reset = () => {
      el.style.transform = '';
      el.style.filter = '';
    };
    el.addEventListener('pointerup', reset);
    el.addEventListener('pointercancel', reset);
    el.addEventListener('pointerleave', reset);
  }

  show() {
    this.root.style.display = 'block';
  }

  hide() {
    this.root.style.display = 'none';
    this.attackHeld = false;
  }

  dispose() {
    this.root.remove();
  }
}
