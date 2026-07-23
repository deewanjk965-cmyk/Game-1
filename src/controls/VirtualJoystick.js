/**
 * VirtualJoystick.js
 * ------------------
 * A self-contained on-screen joystick for the LEFT half of the screen.
 *
 * It's built from two DOM elements (a base ring + a draggable knob) rather than
 * drawn in WebGL, which keeps it crisp at any DPI and costs the GPU nothing.
 * The joystick is "floating": it appears wherever the player first touches the
 * left half, which is the ergonomic pattern used by most mobile action games.
 *
 * Output: `this.value` = { x, y }, each component in [-1, 1].
 *   x > 0  => right,   y > 0 => down/back  (screen-space, y is inverted by
 *   the Player so pushing up moves forward).
 */

export class VirtualJoystick {
  /**
   * @param {number} maxRadius Knob travel radius in pixels.
   */
  constructor(maxRadius = 60) {
    this.maxRadius = maxRadius;
    this.value = { x: 0, y: 0 };
    this.pointerId = null; // which touch owns the joystick
    this.origin = { x: 0, y: 0 };

    this._buildDom();
  }

  _buildDom() {
    // Container that we move+show/hide as one unit.
    this.base = document.createElement('div');
    Object.assign(this.base.style, {
      position: 'fixed',
      width: `${this.maxRadius * 2}px`,
      height: `${this.maxRadius * 2}px`,
      borderRadius: '50%',
      border: '2px solid rgba(255,255,255,0.35)',
      background: 'rgba(255,255,255,0.08)',
      pointerEvents: 'none',
      zIndex: '20',
      display: 'none',
      transform: 'translate(-50%, -50%)',
      touchAction: 'none',
    });

    this.knob = document.createElement('div');
    Object.assign(this.knob.style, {
      position: 'absolute',
      left: '50%',
      top: '50%',
      width: `${this.maxRadius}px`,
      height: `${this.maxRadius}px`,
      borderRadius: '50%',
      background: 'rgba(255,255,255,0.55)',
      transform: 'translate(-50%, -50%)',
      pointerEvents: 'none',
    });

    this.base.appendChild(this.knob);
    document.body.appendChild(this.base);
  }

  /** Begin a joystick drag at screen position (x, y). */
  start(pointerId, x, y) {
    this.pointerId = pointerId;
    this.origin.x = x;
    this.origin.y = y;
    this.base.style.left = `${x}px`;
    this.base.style.top = `${y}px`;
    this.base.style.display = 'block';
    this._updateKnob(0, 0);
  }

  /** Update the drag; recomputes the normalised output vector. */
  move(x, y) {
    let dx = x - this.origin.x;
    let dy = y - this.origin.y;

    // Clamp knob travel to the base radius.
    const dist = Math.hypot(dx, dy);
    if (dist > this.maxRadius) {
      const s = this.maxRadius / dist;
      dx *= s;
      dy *= s;
    }

    this._updateKnob(dx, dy);
    // Normalise to [-1, 1].
    this.value.x = dx / this.maxRadius;
    this.value.y = dy / this.maxRadius;
  }

  /** End the drag and recentre. */
  end() {
    this.pointerId = null;
    this.value.x = 0;
    this.value.y = 0;
    this.base.style.display = 'none';
    this._updateKnob(0, 0);
  }

  _updateKnob(dx, dy) {
    this.knob.style.left = `calc(50% + ${dx}px)`;
    this.knob.style.top = `calc(50% + ${dy}px)`;
  }
}
