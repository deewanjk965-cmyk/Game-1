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

// A grid of windows drawn onto a concrete facade (the daytime albedo).
function makeBuildingColor() {
  const c = canvas(256);
  const g = c.getContext('2d');
  g.fillStyle = '#8b939c';
  g.fillRect(0, 0, 256, 256);
  // Subtle concrete noise.
  for (let i = 0; i < 1200; i++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  const cols = 4, rows = 6;
  const mx = 10, my = 8;
  const cw = (256 - mx * (cols + 1)) / cols;
  const ch = (256 - my * (rows + 1)) / rows;
  for (let r = 0; r < rows; r++) {
    for (let cx = 0; cx < cols; cx++) {
      const x = mx + cx * (cw + mx);
      const y = my + r * (ch + my);
      // Glass — cool bluish, slight per-window variation.
      const b = 40 + Math.random() * 40;
      g.fillStyle = `rgb(${b * 0.7},${b * 0.85},${b + 20})`;
      g.fillRect(x, y, cw, ch);
      // Frame.
      g.strokeStyle = 'rgba(20,24,30,0.9)';
      g.lineWidth = 2;
      g.strokeRect(x, y, cw, ch);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 4);
  return t;
}

// Which windows are "lit" at night — bright warm cells on black (emissive map).
function makeBuildingEmissive() {
  const c = canvas(256);
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, 256, 256);
  const cols = 4, rows = 6;
  const mx = 10, my = 8;
  const cw = (256 - mx * (cols + 1)) / cols;
  const ch = (256 - my * (rows + 1)) / rows;
  for (let r = 0; r < rows; r++) {
    for (let cx = 0; cx < cols; cx++) {
      if (Math.random() > 0.55) continue; // only some windows are lit
      const x = mx + cx * (cw + mx);
      const y = my + r * (ch + my);
      const warm = Math.random() > 0.3;
      g.fillStyle = warm ? '#ffd98a' : '#cfe4ff';
      g.fillRect(x, y, cw, ch);
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

// Grass / dirt ground with mild variation.
function makeGround() {
  const c = canvas(128);
  const g = c.getContext('2d');
  g.fillStyle = '#3f5f33';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 2500; i++) {
    const shade = Math.random();
    g.fillStyle = `rgba(${30 + shade * 40},${60 + shade * 50},${20 + shade * 30},0.5)`;
    g.fillRect(Math.random() * 128, Math.random() * 128, 3, 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 4);
  return t;
}
