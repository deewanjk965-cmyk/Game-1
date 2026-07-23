/**
 * Minimap.js
 * ----------
 * A circular radar in the top-left corner drawn with the 2D canvas API (cheap,
 * crisp, no WebGL cost). It rotates so the player's forward always points up,
 * and shows the road grid, police blips (red/blue), mission waypoints (yellow)
 * and the player's own heading arrow.
 */

export class Minimap {
  /**
   * @param {number} size Diameter in CSS pixels.
   * @param {number} range World metres shown from centre to edge.
   * @param {number} chunkSize Road-grid spacing (world metres).
   */
  constructor(size = 132, range = 90, chunkSize = 64) {
    this.size = size;
    this.range = range;
    this.chunkSize = chunkSize;
    this.scale = size / 2 / range; // world-metre → map-pixel

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas = document.createElement('canvas');
    this.canvas.width = size * dpr;
    this.canvas.height = size * dpr;
    Object.assign(this.canvas.style, {
      position: 'fixed',
      top: 'calc(env(safe-area-inset-top, 0px) + 10px)',
      left: 'calc(env(safe-area-inset-left, 0px) + 10px)',
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: '50%',
      border: '2px solid rgba(255,255,255,0.5)',
      boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
      zIndex: '15',
      pointerEvents: 'none',
    });
    document.body.appendChild(this.canvas);

    this.ctx = this.canvas.getContext('2d');
    this.ctx.scale(dpr, dpr);
  }

  /**
   * @param {{x,z,yaw}} player
   * @param {Array<{x,z,color}>} blips Police (and any dynamic markers).
   * @param {Array<{x,z,color}>} waypoints Mission markers.
   */
  update(player, blips, waypoints) {
    const c = this.ctx;
    const r = this.size / 2;
    const cosY = Math.cos(player.yaw);
    const sinY = Math.sin(player.yaw);

    // Clip to the circular face + dark background.
    c.save();
    c.beginPath();
    c.arc(r, r, r - 1, 0, Math.PI * 2);
    c.clip();
    c.fillStyle = '#1a2430';
    c.fillRect(0, 0, this.size, this.size);

    // Map a world point to rotated map pixels (forward = up).
    const toMap = (wx, wz) => {
      const dx = wx - player.x;
      const dz = wz - player.z;
      const right = dx * cosY - dz * sinY; // world → screen X
      const up = dx * sinY + dz * cosY; // world → screen Y (forward)
      return [r + right * this.scale, r - up * this.scale];
    };

    // Road grid (nearby vertical + horizontal road lines).
    c.strokeStyle = 'rgba(120,140,160,0.55)';
    c.lineWidth = 3;
    const s = this.chunkSize;
    const reach = this.range + s;
    const kx0 = Math.floor((player.x - reach) / s);
    const kx1 = Math.ceil((player.x + reach) / s);
    for (let k = kx0; k <= kx1; k++) {
      const x = k * s;
      const [ax, ay] = toMap(x, player.z - reach);
      const [bx, by] = toMap(x, player.z + reach);
      c.beginPath();
      c.moveTo(ax, ay);
      c.lineTo(bx, by);
      c.stroke();
    }
    const kz0 = Math.floor((player.z - reach) / s);
    const kz1 = Math.ceil((player.z + reach) / s);
    for (let k = kz0; k <= kz1; k++) {
      const z = k * s;
      const [ax, ay] = toMap(player.x - reach, z);
      const [bx, by] = toMap(player.x + reach, z);
      c.beginPath();
      c.moveTo(ax, ay);
      c.lineTo(bx, by);
      c.stroke();
    }

    // Waypoints (mission) then blips (police) as coloured dots.
    const drawDot = (pt, color, radius) => {
      const [x, y] = toMap(pt.x, pt.z);
      c.fillStyle = color;
      c.beginPath();
      c.arc(x, y, radius, 0, Math.PI * 2);
      c.fill();
    };
    for (const w of waypoints) drawDot(w, w.color || '#ffd23f', 4);
    for (const b of blips) drawDot(b, b.color || '#ff3b3b', 3.5);

    c.restore();

    // Player arrow (always centred, pointing up).
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.moveTo(r, r - 7);
    c.lineTo(r - 5, r + 6);
    c.lineTo(r + 5, r + 6);
    c.closePath();
    c.fill();
  }

  dispose() {
    this.canvas.remove();
  }
}
