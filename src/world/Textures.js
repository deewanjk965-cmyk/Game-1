/**
 * Textures.js
 * -----------
 * Procedurally-drawn canvas textures so the world looks like a real city
 * without shipping a single image file (stays CSP-safe on Pages/Vercel).
 * Everything is generated once and shared, so the memory cost is tiny.
 */

import * as THREE from 'three';

function canvas(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

let _cache = null;

/** Lazily build + cache the shared texture set. */
export function getTextures() {
  if (_cache) return _cache;

  _cache = {
    buildingColor: makeBuildingColor(),
    buildingEmissive: makeBuildingEmissive(),
    asphaltH: makeRoad(false),
    asphaltV: makeRoad(true),
    ground: makeGround(),
  };
  return _cache;
}

// Shared facade grid so the daytime + night textures line up exactly.
const FSIZE = 512;
const FCOLS = 5;
const FROWS = 9;
const FMX = 14; // horizontal margin/gap
const FMY = 10; // vertical gap (spandrel between floors)
const FCW = (FSIZE - FMX * (FCOLS + 1)) / FCOLS;
const FCH = (FSIZE - FMY * (FROWS + 1)) / FROWS;
function facadeCell(cx, r) {
  return { x: FMX + cx * (FCW + FMX), y: FMY + r * (FCH + FMY) };
}

// A detailed glass-and-concrete facade (daytime albedo).
function makeBuildingColor() {
  const c = canvas(FSIZE);
  const g = c.getContext('2d');

  // Concrete base with a subtle vertical gradient (darker toward the ground).
  const base = g.createLinearGradient(0, 0, 0, FSIZE);
  base.addColorStop(0, '#aab2bb');
  base.addColorStop(1, '#828a94');
  g.fillStyle = base;
  g.fillRect(0, 0, FSIZE, FSIZE);
  // Fine concrete grain.
  for (let i = 0; i < 4000; i++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * 0.04})`;
    g.fillRect(Math.random() * FSIZE, Math.random() * FSIZE, 2, 2);
  }
  // Floor separator bands (spandrels) for a layered, high-rise feel.
  g.fillStyle = 'rgba(60,66,74,0.5)';
  for (let r = 0; r <= FROWS; r++) {
    const y = FMY + r * (FCH + FMY) - FMY;
    g.fillRect(0, y, FSIZE, 4);
  }

  for (let r = 0; r < FROWS; r++) {
    for (let cx = 0; cx < FCOLS; cx++) {
      const { x, y } = facadeCell(cx, r);
      // Glass with a vertical gradient (sky reflection at top → dark below).
      const gl = g.createLinearGradient(0, y, 0, y + FCH);
      const tint = 20 + Math.random() * 25;
      gl.addColorStop(0, `rgb(${120 + tint},${150 + tint},${180 + tint})`);
      gl.addColorStop(0.5, `rgb(${60 + tint},${80 + tint},${110 + tint})`);
      gl.addColorStop(1, `rgb(${30 + tint},${42 + tint},${60 + tint})`);
      g.fillStyle = gl;
      g.fillRect(x, y, FCW, FCH);
      // A bright diagonal glint on some panels.
      if (Math.random() > 0.6) {
        g.strokeStyle = 'rgba(255,255,255,0.18)';
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(x, y + FCH * 0.7);
        g.lineTo(x + FCW * 0.6, y);
        g.stroke();
      }
      // Mullion frame + a horizontal transom bar.
      g.strokeStyle = 'rgba(24,28,34,0.95)';
      g.lineWidth = 3;
      g.strokeRect(x, y, FCW, FCH);
      g.beginPath();
      g.moveTo(x, y + FCH / 2);
      g.lineTo(x + FCW, y + FCH / 2);
      g.stroke();
    }
  }

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.repeat.set(2, 4);
  return t;
}

// Lit windows for night (emissive map), aligned to the same grid.
function makeBuildingEmissive() {
  const c = canvas(FSIZE);
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, FSIZE, FSIZE);
  for (let r = 0; r < FROWS; r++) {
    for (let cx = 0; cx < FCOLS; cx++) {
      if (Math.random() > 0.5) continue; // only some rooms are lit
      const { x, y } = facadeCell(cx, r);
      const warm = Math.random() > 0.35;
      // Soft glow: a slightly larger dim halo under a bright core.
      g.fillStyle = warm ? 'rgba(255,210,130,0.5)' : 'rgba(200,225,255,0.5)';
      g.fillRect(x - 2, y - 2, FCW + 4, FCH + 4);
      g.fillStyle = warm ? '#ffd98a' : '#cfe4ff';
      g.fillRect(x + 2, y + 2, FCW - 4, FCH - 4);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 4);
  return t;
}

// Asphalt with a dashed centre line; `vertical` runs the line along Z.
function makeRoad(vertical) {
  const c = canvas(128);
  const g = c.getContext('2d');
  g.fillStyle = '#2b2f36';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(255,255,255,${Math.random() * 0.03})`;
    g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  // Dashed yellow centre line.
  g.fillStyle = '#d9b84a';
  if (vertical) {
    for (let y = 8; y < 128; y += 34) g.fillRect(61, y, 6, 18);
  } else {
    for (let x = 8; x < 128; x += 34) g.fillRect(x, 61, 18, 6);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(vertical ? 1 : 4, vertical ? 4 : 1);
  return t;
}

// Lush grass with clumps, dirt patches and darker blades for depth.
function makeGround() {
  const c = canvas(256);
  const g = c.getContext('2d');
  // Base grass gradient.
  const base = g.createLinearGradient(0, 0, 256, 256);
  base.addColorStop(0, '#4a7038');
  base.addColorStop(1, '#3c5e30');
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  // Soft dirt patches.
  for (let i = 0; i < 10; i++) {
    const x = Math.random() * 256, y = Math.random() * 256, r = 12 + Math.random() * 26;
    const grad = g.createRadialGradient(x, y, 2, x, y, r);
    grad.addColorStop(0, 'rgba(110,88,58,0.5)');
    grad.addColorStop(1, 'rgba(110,88,58,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  // Grass blade speckles (light + dark) for a textured, non-flat look.
  for (let i = 0; i < 6000; i++) {
    const light = Math.random() > 0.5;
    g.fillStyle = light
      ? `rgba(${90 + Math.random() * 50},${130 + Math.random() * 50},${60},0.35)`
      : `rgba(${20},${45 + Math.random() * 25},${18},0.4)`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.repeat.set(6, 6);
  return t;
}
