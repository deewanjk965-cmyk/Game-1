/**
 * DrivingControls.js
 * ------------------
 * The on-screen driving HUD, shown only while the player is in a vehicle.
 *
 * Layout (thumb-friendly, GTA-mobile style):
 *   Bottom-LEFT   : ◀ / ▶ steering buttons
 *   Bottom-RIGHT  : GAS (top) and BRAKE / REVERSE (bottom)
 *   Top-RIGHT     : HORN and EXIT buttons
 *
 * Every control is a plain DOM element (crisp at any DPI, no GPU cost). Each
 * button tracks its own pointer so genuine multi-touch works — you can hold
 * gas + steer + horn at the same time, exactly like a console pad.
 *
 * Output each frame via `this.input`:
 *   { throttle: 0..1, brake: 0..1, steer: -1..1 }
 * plus callbacks: `onExit` and `onHorn`.
 */

export class DrivingControls {
  constructor() {
    this.input = { throttle: 0, brake: 0, steer: 0 };
    this.onExit = null;
    this.onHorn = null;

    // Steering can come from two buttons; track each independently.
    this._steerLeft = false;
    this._steerRight = false;

    this._buildDom();
    this.hide();
  }

  // ---- DOM construction -----------------------------------------------------

  _buildDom() {
    // Root overlay that we show/hide as a unit. pointerEvents:none so only the
    // buttons themselves are interactive (the gaps let camera stay untouched).
    this.root = document.createElement('div');
    Object.assign(this.root.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '30',
      pointerEvents: 'none',
    });
    document.body.appendChild(this.root);

    const safeB = 'calc(env(safe-area-inset-bottom, 0px) + 24px)';
    const safeR = 'calc(env(safe-area-inset-right, 0px) + 24px)';
    const safeL = 'calc(env(safe-area-inset-left, 0px) + 24px)';
    const safeT = 'calc(env(safe-area-inset-top, 0px) + 16px)';

    // --- Steering (bottom-left) ---------------------------------------------
    this.btnLeft = this._makeButton('◀', { left: safeL, bottom: safeB }, 84);
    this.btnRight = this._makeButton(
      '▶',
      { left: `calc(${safeL} + 96px)`, bottom: safeB },
      84
    );
    this._bindHold(
      this.btnLeft,
      () => (this._steerLeft = true),
      () => (this._steerLeft = false)
    );
    this._bindHold(
      this.btnRight,
      () => (this._steerRight = true),
      () => (this._steerRight = false)
    );

    // --- Gas + Brake (bottom-right) -----------------------------------------
    this.btnGas = this._makeButton(
      'GAS',
      { right: safeR, bottom: `calc(${safeB} + 96px)` },
      96,
      '#2fbf4f'
    );
    this.btnBrake = this._makeButton(
      'BRAKE',
      { right: safeR, bottom: safeB },
      96,
      '#d23b3b'
    );
    this._bindHold(
      this.btnGas,
      () => (this.input.throttle = 1),
      () => (this.input.throttle = 0)
    );
    this._bindHold(
      this.btnBrake,
      () => (this.input.brake = 1),
      () => (this.input.brake = 0)
    );

    // --- Exit + Horn (mid-right, clear of the top HUD) ----------------------
    // EXIT lives on the right edge, vertically centred, so it's never hidden
    // behind the health/cash HUD in the top-right corner.
    this.btnExit = this._makeButton(
      'EXIT',
      { right: safeR, top: '34%' },
      76,
      '#c0392b'
    );
    this.btnHorn = this._makeButton(
      'HORN',
      { right: safeR, top: 'calc(34% + 88px)' },
      64,
      '#3a6ea5'
    );
    // Exit: tap to leave the car. Horn: tap to honk.
    this._bindTap(this.btnExit, () => this.onExit && this.onExit());
    this._bindTap(this.btnHorn, () => this.onHorn && this.onHorn());
  }

  /** Create a round button element with a label and position. */
  _makeButton(label, pos, size, tint = 'rgba(255,255,255,0.14)') {
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
      fontWeight: '700',
      letterSpacing: '0.5px',
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

  // ---- Interaction helpers --------------------------------------------------

  /** Hold-style button: onPress while held, onRelease when let go. */
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

  /** Tap-style button: fires once on press. */
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

  // ---- Per-frame + visibility ----------------------------------------------

  /** Resolve the two steer buttons into a single -1..1 value. */
  update() {
    let steer = 0;
    if (this._steerLeft) steer -= 1;
    if (this._steerRight) steer += 1;
    this.input.steer = steer;
    return this.input;
  }

  show() {
    this.root.style.display = 'block';
  }

  hide() {
    this.root.style.display = 'none';
    // Release any held inputs so the car doesn't keep driving after exit.
    this.input.throttle = 0;
    this.input.brake = 0;
    this.input.steer = 0;
    this._steerLeft = this._steerRight = false;
  }

  dispose() {
    this.root.remove();
  }
}
