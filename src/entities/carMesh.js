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

// A wheel of arbitrary radius (for the different vehicle sizes).
function makeWheelR(x, z, r, shadows) {
  const holder = new THREE.Group();
  holder.position.set(x, r, z);
  const s = r / 0.42;
  const tire = new THREE.Mesh(TIRE_GEO, TIRE);
  tire.rotation.z = Math.PI / 2;
  tire.scale.set(s, 1, s);
  tire.castShadow = shadows;
  const rim = new THREE.Mesh(RIM_GEO, RIM);
  rim.rotation.z = Math.PI / 2;
  rim.scale.set(s, 1, s);
  holder.add(tire, rim);
  return holder;
}

/**
 * A parametric car built from a small set of dimensions, so we can make many
 * distinct vehicle shapes (sedan, SUV, pickup, van, bus, muscle, hatchback…)
 * from one function. Returns the same shape as buildCarMesh().
 * @param {object} config
 * @param {object} p Dimensions: { L,W,H, cabL,cabH,cabZ, wr, bed }
 * @param {number} color
 */
export function buildParametricCar(config, p, color) {
  const shadows = config.shadows;
  const group = new THREE.Group();
  const paintMat = new THREE.MeshPhysicalMaterial({
    color, metalness: 0.6, roughness: 0.38, clearcoat: 0.9, clearcoatRoughness: 0.15,
  });

  const bodyY = p.wr + p.H / 2;
  const body = new THREE.Mesh(new THREE.BoxGeometry(p.W, p.H, p.L), paintMat);
  body.position.y = bodyY;
  body.castShadow = shadows;
  body.receiveShadow = shadows;
  group.add(body);

  // Cabin / greenhouse (tinted glass).
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(p.W * 0.92, p.cabH, p.cabL), GLASS);
  cabin.position.set(0, bodyY + p.H / 2 + p.cabH / 2 - 0.04, p.cabZ);
  cabin.castShadow = shadows;
  group.add(cabin);
  // A painted roof cap so the greenhouse isn't all glass.
  const roof = new THREE.Mesh(new THREE.BoxGeometry(p.W * 0.94, 0.1, p.cabL * 0.7), paintMat);
  roof.position.set(0, bodyY + p.H / 2 + p.cabH - 0.05, p.cabZ);
  group.add(roof);

  // Optional pickup bed walls at the back.
  if (p.bed) {
    for (const x of [-p.W / 2 + 0.08, p.W / 2 - 0.08]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.12, p.H * 0.6, p.L * 0.34), paintMat);
      wall.position.set(x, bodyY + p.H * 0.4, -p.L * 0.28);
      group.add(wall);
    }
  }

  // Bumpers.
  for (const z of [p.L / 2 - 0.05, -p.L / 2 + 0.05]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(p.W * 0.98, 0.26, 0.22), CHROME);
    b.position.set(0, p.wr + 0.15, z);
    group.add(b);
  }

  // Lights.
  const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2c0, emissiveIntensity: 1.2 });
  const taillightMat = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2020, emissiveIntensity: 0.6 });
  for (const x of [-p.W * 0.3, p.W * 0.3]) {
    const h = new THREE.Mesh(LIGHT_GEO, headMat);
    h.position.set(x, bodyY, p.L / 2 + 0.02);
    group.add(h);
    const t = new THREE.Mesh(LIGHT_GEO, taillightMat);
    t.position.set(x, bodyY + 0.05, -p.L / 2 - 0.02);
    group.add(t);
  }

  // Wheels.
  const wx = p.W / 2 - 0.1;
  const wz = p.L / 2 - p.wr * 2.2;
  const fl = makeWheelR(-wx, wz, p.wr, shadows);
  const fr = makeWheelR(wx, wz, p.wr, shadows);
  group.add(fl, fr, makeWheelR(-wx, -wz, p.wr, shadows), makeWheelR(wx, -wz, p.wr, shadows));

  return { group, frontWheels: [fl, fr], taillightMat, paintMat };
}

// The vehicle catalogue: distinct shapes + performance (fast/slow). "Sports"
// uses the real Ferrari model; the rest are parametric bodies.
export const CAR_TYPES = [
  { name: 'Sports', kind: 'model', perf: { maxSpeed: 58, accel: 46, brake: 46 } },
  { name: 'Sedan', kind: 'proc', p: { L: 4.4, W: 1.9, H: 0.72, cabL: 2.0, cabH: 0.6, cabZ: -0.1, wr: 0.42 }, perf: { maxSpeed: 44, accel: 36, brake: 40 } },
  { name: 'Muscle', kind: 'proc', p: { L: 4.9, W: 2.0, H: 0.74, cabL: 1.6, cabH: 0.58, cabZ: -0.5, wr: 0.46 }, perf: { maxSpeed: 54, accel: 44, brake: 42 } },
  { name: 'SUV', kind: 'proc', p: { L: 4.7, W: 2.02, H: 1.0, cabL: 2.6, cabH: 0.9, cabZ: -0.1, wr: 0.5 }, perf: { maxSpeed: 40, accel: 32, brake: 40 } },
  { name: 'Pickup', kind: 'proc', p: { L: 5.3, W: 2.02, H: 0.82, cabL: 1.6, cabH: 0.8, cabZ: 0.7, wr: 0.5, bed: true }, perf: { maxSpeed: 38, accel: 30, brake: 38 } },
  { name: 'Van', kind: 'proc', p: { L: 5.0, W: 2.1, H: 1.5, cabL: 3.4, cabH: 1.25, cabZ: -0.1, wr: 0.46 }, perf: { maxSpeed: 34, accel: 28, brake: 38 } },
  { name: 'Bus', kind: 'proc', p: { L: 8.4, W: 2.5, H: 2.3, cabL: 7.2, cabH: 1.9, cabZ: 0, wr: 0.56 }, perf: { maxSpeed: 28, accel: 20, brake: 36 } },
  { name: 'Hatch', kind: 'proc', p: { L: 3.8, W: 1.82, H: 0.9, cabL: 1.8, cabH: 0.78, cabZ: -0.2, wr: 0.4 }, perf: { maxSpeed: 38, accel: 34, brake: 40 } },
];

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

/**
 * Add a car body to `group`: the real Ferrari model when available, else the
 * built-in low-poly car. Handles auto-scaling, sitting on the ground, and
 * orienting the model so its front points +Z (the game's "forward").
 *
 * @returns {{frontWheels:Array, taillightMat:(THREE.Material|null),
 *            paintMat:(THREE.Material|null), isModel:boolean, model:(THREE.Object3D|null)}}
 */
export function applyCarToGroup(group, config, models, color, typeName = null) {
  // Pick a vehicle type. If a specific one was requested use it, else random.
  let type = typeName ? CAR_TYPES.find((t) => t.name === typeName) : null;
  if (!type) type = CAR_TYPES[(Math.random() * CAR_TYPES.length) | 0];

  // "Sports" is the real Ferrari model; fall back to a Sedan if models missing.
  const wantModel = type.kind === 'model';
  const car = wantModel && models && models.cloneFerrari();

  if (!car && type.kind === 'proc') {
    const parts = buildParametricCar(config, type.p, color);
    group.add(parts.group);
    return {
      frontWheels: parts.frontWheels, taillightMat: parts.taillightMat,
      paintMat: parts.paintMat, isModel: false, model: null,
      perf: type.perf, typeName: type.name,
    };
  }

  if (car) {
    // Clone materials per car (the glTF shares them across clones) and repaint
    // the body so every car isn't the same colour.
    const bodyColor = new THREE.Color(color);
    car.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      o.material = o.material.clone();
      if (/body|paint|carpaint/i.test(o.material.name || '')) {
        o.material.color.copy(bodyColor);
      }
    });

    // Fit the model to a ~4.4 m car footprint (measure with matrices updated).
    car.updateWorldMatrix(true, true);
    let box = new THREE.Box3().setFromObject(car);
    const size = box.getSize(new THREE.Vector3());
    const scale = 4.4 / Math.max(size.x, size.z, 0.001);
    car.scale.setScalar(scale);

    // Orient front to +Z using the front/rear wheel positions.
    car.updateWorldMatrix(true, true);
    const fl = car.getObjectByName('wheel_fl');
    const rl = car.getObjectByName('wheel_rl');
    if (fl && rl) {
      const pf = fl.getWorldPosition(new THREE.Vector3());
      const pr = rl.getWorldPosition(new THREE.Vector3());
      if (pf.z < pr.z) car.rotation.y = Math.PI; // front was -Z → flip
    }

    // Drop onto the ground plane.
    car.updateWorldMatrix(true, true);
    box = new THREE.Box3().setFromObject(car);
    car.position.y -= box.min.y;

    car.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = config.shadows;
        o.receiveShadow = config.shadows;
      }
    });
    group.add(car);

    const frontWheels = [car.getObjectByName('wheel_fl'), car.getObjectByName('wheel_fr')].filter(Boolean);
    return {
      frontWheels, taillightMat: null, paintMat: null, isModel: true, model: car,
      perf: type.perf, typeName: 'Sports',
    };
  }

  // Fallback (no models): a parametric Sedan.
  const sedan = CAR_TYPES[1];
  const parts = buildParametricCar(config, sedan.p, color);
  group.add(parts.group);
  return {
    frontWheels: parts.frontWheels, taillightMat: parts.taillightMat,
    paintMat: parts.paintMat, isModel: false, model: null,
    perf: sedan.perf, typeName: sedan.name,
  };
}
