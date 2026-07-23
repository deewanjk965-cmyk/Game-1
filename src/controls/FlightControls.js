/**
 * FlightControls.js
 * -----------------
 * On-screen controls shown while piloting the helicopter:
 *   - LEFT half : a floating joystick — push up/down to fly forward/back,
 *                 left/right to yaw (turn).
 *   - RIGHT     : ASCEND / DESCEND (hold) to climb or drop, and EXIT.
 *
 * Output each frame via `update()`:
 *   { forward: -1..1, yaw: -1..1, collective: -1..1 }
 */

import { VirtualJoystick } from './VirtualJoystick.js';

export class FlightControls {
  constructor() {
    this.input = { forward: 0, yaw: 0, collective: 0 };
    this.onExit = null;
    this._ascend = false;
    this._descend = false;
    this.joystick = new VirtualJoystick();
    this._activePointer = null;

    this._build();
    this.hide();
  }

  _build() {
    const safeB = 'calc(env(safe-area-inset-bottom, 0px) + 24px)';
    const safeR = 'calc(env(safe-area-inset-right, 0px) + 24px)';

    // Left-half capture zone for the flight joystick.
    this.zone = document.createElement('div');
    Object.assign(this.zone.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      width: '50%',
      height: '100%',
      zIndex: '20',
      touchAction: 'none',
    });
    this.zone.addEventListener('pointerdown', (e) => {
      if (this._activePointer !== null) return;
      e.preventDefault();
      this._activePointer = e.pointerId;
      this.joystick.start(e.pointerId, e.clientX, e.clientY);
    });
    this.zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this._activePointer) return;
      e.preventDefault();
      this.joystick.move(e.clientX, e.clientY);
    });
    const end = (e) => {
      if (e.pointerId !== this._activePointer) return;
      this._activePointer = null;
      this.joystick.end();
    };
    this.zone.addEventListener('pointerup', end);
    this.zone.addEventListener('pointercancel', end);
    document.body.appendChild(this.zone);

    // Right-side buttons.
    this.root = document.createElement('div');
    Object.assign(this.root.style, { position: 'fixed', inset: '0', zIndex: '21', pointerEvents: 'none' });
    document.body.appendChild(this.root);

    this.btnUp = this._button('▲ UP', { right: safeR, bottom: `calc(${safeB} + 96px)` }, 96, '#2f8fbf');
    this.btnDown = this._button('▼ DN', { right: safeR, bottom: safeB }, 96, '#8a5a2f');
    this.btnExit = this._button('EXIT', { right: safeR, top: '30%' }, 76, '#c0392b');

    this._hold(this.btnUp, () => (this._ascend = true), () => (this._ascend = false));
    this._hold(this.btnDown, () => (this._descend = true), () => (this._descend = false));
    this.btnExit.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.onExit) this.onExit();
    });
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
      fontSize: size > 80 ? '15px' : '13px',
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

  _hold(el, onPress, onRelease) {
    const press = (e) => {
      e.preventDefault();
      el.setPointerCapture?.(e.pointerId);
      el.style.filter = 'brightness(1.3)';
      onPress();
    };
    const release = (e) => {
      e.preventDefault();
      el.style.filter = '';
      onRelease();
    };
    el.addEventListener('pointerdown', press);
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('pointerleave', release);
  }

  update() {
    this.input.forward = -this.joystick.value.y; // push up = fly forward
    this.input.yaw = this.joystick.value.x;
    this.input.collective = (this._ascend ? 1 : 0) - (this._descend ? 1 : 0);
    return this.input;
  }

  show() {
    this.zone.style.display = 'block';
    this.root.style.display = 'block';
  }

  hide() {
    this.zone.style.display = 'none';
    this.root.style.display = 'none';
    this.joystick.end();
    this._activePointer = null;
    this._ascend = this._descend = false;
    this.input.forward = this.input.yaw = this.input.collective = 0;
  }

  dispose() {
    this.zone.remove();
    this.root.remove();
  }
}
