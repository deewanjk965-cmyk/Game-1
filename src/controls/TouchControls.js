/**
 * TouchControls.js
 * ----------------
 * Central input router. It listens to Pointer Events (which unify touch, pen
 * and mouse) and splits the screen into two zones, GTA/console-mobile style:
 *
 *   LEFT  half  -> movement joystick  (VirtualJoystick)
 *   RIGHT half  -> camera orbit drag + pinch-to-zoom
 *
 * Using Pointer Events (not TouchEvents) means the exact same code works with
 * a mouse on desktop for quick testing, and multi-touch "just works" because
 * every finger has its own pointerId.
 */

import { VirtualJoystick } from './VirtualJoystick.js';

export class TouchControls {
  /**
   * @param {HTMLElement} domElement Element to attach listeners to (canvas).
   * @param {ThirdPersonCamera} camera Camera to drive with the right zone.
   */
  constructor(domElement, camera) {
    this.dom = domElement;
    this.camera = camera;

    this.joystick = new VirtualJoystick();

    // Camera-drag pointer tracking (right half of the screen).
    this.lookPointerId = null;
    this.lastLook = { x: 0, y: 0 };

    // Pinch-zoom tracking: remember the two active pointers' distance.
    this.activePointers = new Map(); // pointerId -> {x, y}
    this.lastPinchDist = null;

    // On-foot controls are disabled while driving (see setEnabled()).
    this.enabled = true;

    this._bind();
  }

  /** Move vector from the joystick, consumed by the Player each frame. */
  get moveInput() {
    return this.joystick.value;
  }

  /**
   * Enable/disable all on-foot input. When disabling (entering a vehicle) we
   * also cancel any in-progress joystick/look so nothing stays "stuck on".
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) {
      this.joystick.end();
      this.lookPointerId = null;
      this.activePointers.clear();
      this.lastPinchDist = null;
    }
  }

  _bind() {
    // Arrow functions keep `this` bound; store refs so we can detach later.
    this._onDown = this._onPointerDown.bind(this);
    this._onMove = this._onPointerMove.bind(this);
    this._onUp = this._onPointerUp.bind(this);

    this.dom.addEventListener('pointerdown', this._onDown, { passive: false });
    this.dom.addEventListener('pointermove', this._onMove, { passive: false });
    this.dom.addEventListener('pointerup', this._onUp, { passive: false });
    this.dom.addEventListener('pointercancel', this._onUp, { passive: false });
    // Prevent the browser's context menu on long-press.
    this.dom.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _isLeftHalf(x) {
    return x < window.innerWidth * 0.5;
  }

  _onPointerDown(e) {
    if (!this.enabled) return; // ignore on-foot input while driving
    e.preventDefault();
    this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this._isLeftHalf(e.clientX) && this.joystick.pointerId === null) {
      // Left zone, no joystick active yet -> spawn the floating joystick.
      this.joystick.start(e.pointerId, e.clientX, e.clientY);
    } else if (this.lookPointerId === null) {
      // Right zone -> this finger drives the camera orbit.
      this.lookPointerId = e.pointerId;
      this.lastLook.x = e.clientX;
      this.lastLook.y = e.clientY;
    }
  }

  _onPointerMove(e) {
    if (!this.enabled) return;
    if (!this.activePointers.has(e.pointerId)) return;
    e.preventDefault();
    this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Joystick drag.
    if (e.pointerId === this.joystick.pointerId) {
      this.joystick.move(e.clientX, e.clientY);
    }

    // Camera orbit drag.
    if (e.pointerId === this.lookPointerId) {
      const dx = e.clientX - this.lastLook.x;
      const dy = e.clientY - this.lastLook.y;
      this.lastLook.x = e.clientX;
      this.lastLook.y = e.clientY;
      this.camera.orbit(dx, dy);
    }

    // Pinch-to-zoom when exactly two pointers are down.
    this._handlePinch();
  }

  _onPointerUp(e) {
    this.activePointers.delete(e.pointerId);

    if (e.pointerId === this.joystick.pointerId) this.joystick.end();
    if (e.pointerId === this.lookPointerId) this.lookPointerId = null;

    // Reset pinch tracking when we drop below two fingers.
    if (this.activePointers.size < 2) this.lastPinchDist = null;
  }

  _handlePinch() {
    if (this.activePointers.size !== 2) return;
    const pts = [...this.activePointers.values()];
    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);

    if (this.lastPinchDist !== null) {
      // Fingers spreading apart (dist grows) -> zoom in (reduce distance).
      const delta = this.lastPinchDist - dist;
      this.camera.zoom(delta);
    }
    this.lastPinchDist = dist;
  }

  dispose() {
    this.dom.removeEventListener('pointerdown', this._onDown);
    this.dom.removeEventListener('pointermove', this._onMove);
    this.dom.removeEventListener('pointerup', this._onUp);
    this.dom.removeEventListener('pointercancel', this._onUp);
  }
}
