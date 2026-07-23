/**
 * carMesh.js
 * ----------
 * Builds a shared, good-looking low-poly car: a metallic-paint body with a
 * tapered cabin, tinted glass, chrome-ish bumpers, emissive head/tail lights,
 * and wheels with rims. Used by the player's Vehicle and by AI TrafficCar /
 * PoliceCar so every car in the world looks consistent and real.
 *
 * Returns references the caller animates: the front-wheel holders (steering),
 * the tail-light material (brake glow) and the paint material (police repaint).
 */

import * as THREE from 'three';

// Shared geometries (one set for every car in the game).
const TIRE_GEO = new THREE.CylinderGeometry(0.42, 0.42, 0.34, 16);
const RIM_GEO = new THREE.CylinderGeometry(0.2, 0.2, 0.36, 10);
const LIGHT_GEO = new THREE.BoxGeometry(0.35, 0.2, 0.12);

// Shared non-paint materials.
const GLASS = new THREE.MeshStandardMaterial({ color: 0x141c26, metalness: 0.1, roughness: 0.15 });
const TIRE = new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.85 });
const RIM = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, metalness: 0.95, roughness: 0.3 });
const CHROME = new THREE.MeshStandardMaterial({ color: 0xb8bcc4, metalness: 1, roughness: 0.25 });

function makeWheel(x, z, shadows) {
  const holder = new THREE.Group();
  holder.position.set(x, 0.42, z);
  const tire = new THREE.Mesh(TIRE_GEO, TIRE);
  tire.rotation.z = Math.PI / 2;
  tire.castShadow = shadows;
  const rim = new THREE.Mesh(RIM_GEO, RIM);
  rim.rotation.z = Math.PI / 2;
  holder.add(tire, rim);
  return holder;
}

/**
 * @param {object} config Game config (for shadow flags).
 * @param {number} color Body paint colour.
 * @returns {{group, frontWheels, taillightMat, paintMat}}
 */
export function buildCarMesh(config, color) {
  const shadows = config.shadows;
  const group = new THREE.Group();

  // Automotive clear-coat paint: a metallic base under a glossy clear layer,
  // so it reflects the environment like real car paint.
  const paintMat = new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0.7,
    roughness: 0.32,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
    envMapIntensity: 1.2,
  });

  // Lower body + a slightly narrower mid to fake curved flanks.
  const lower = new THREE.Mesh(new THREE.BoxGeometry(2, 0.5, 4.3), paintMat);
  lower.position.y = 0.55;
  lower.castShadow = shadows;
  lower.receiveShadow = shadows;
  group.add(lower);

  const mid = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.35, 3.4), paintMat);
  mid.position.y = 0.92;
  mid.castShadow = shadows;
  group.add(mid);

  // Cabin (tinted glass greenhouse), set back a touch.
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 2), GLASS);
  cabin.position.set(0, 1.28, -0.2);
  cabin.castShadow = shadows;
  group.add(cabin);
  // A thin painted roof cap so it isn't all glass.
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.12, 1.4), paintMat);
  roof.position.set(0, 1.58, -0.25);
  group.add(roof);

  // Bumpers.
  for (const z of [2.05, -2.05]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.28, 0.25), CHROME);
    b.position.set(0, 0.5, z);
    group.add(b);
  }

  // Head + tail lights (emissive).
  const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2c0, emissiveIntensity: 1.2 });
  const taillightMat = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2020, emissiveIntensity: 0.6 });
  for (const x of [-0.6, 0.6]) {
    const h = new THREE.Mesh(LIGHT_GEO, headMat);
    h.position.set(x, 0.62, 2.16);
    group.add(h);
    const t = new THREE.Mesh(LIGHT_GEO, taillightMat);
    t.position.set(x, 0.66, -2.16);
    group.add(t);
  }

  // Wheels — fronts in holders so they can steer.
  const fl = makeWheel(-1.0, 1.35, shadows);
  const fr = makeWheel(1.0, 1.35, shadows);
  group.add(fl, fr);
  group.add(makeWheel(-1.0, -1.35, shadows));
  group.add(makeWheel(1.0, -1.35, shadows));

  return { group, frontWheels: [fl, fr], taillightMat, paintMat };
}
