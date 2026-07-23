/**
 * Chunk.js
 * --------
 * A single square tile of the world. In Part 1 a chunk is a flat ground plane
 * plus a few placeholder "buildings" so we can visually confirm streaming
 * works. Later parts will replace the placeholder content with real geometry,
 * roads, props and collision — but the streaming contract stays the same:
 *
 *   build()   -> create meshes and add them to the scene
 *   dispose() -> remove meshes and free their GPU memory
 *
 * Keeping build/dispose symmetrical is what makes low-memory streaming safe.
 */

import * as THREE from 'three';

// Deterministic pseudo-random generator. Given the same chunk coordinates it
// always produces the same layout, so the world looks stable as you revisit
// chunks — without storing anything. Classic hash -> [0,1) approach.
function seededRandom(x, z) {
  let seed = (x * 73856093) ^ (z * 19349663);
  return function next() {
    // xorshift32
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    // Map to [0, 1).
    return ((seed >>> 0) % 100000) / 100000;
  };
}

// Shared materials — created once and reused by every chunk. Sharing is a big
// mobile win: fewer GPU state changes and far less memory than per-chunk mats.
const GROUND_MATERIAL = new THREE.MeshLambertMaterial({ color: 0x4f7a3a });
const ROAD_MATERIAL = new THREE.MeshLambertMaterial({ color: 0x333840 });
const BUILDING_MATERIALS = [
  new THREE.MeshLambertMaterial({ color: 0x9aa3ad }),
  new THREE.MeshLambertMaterial({ color: 0xb08d57 }),
  new THREE.MeshLambertMaterial({ color: 0x7d8ca3 }),
  new THREE.MeshLambertMaterial({ color: 0xc4a484 }),
];

// Shared unit geometries, scaled per-instance via the mesh transform. Reusing
// one box/plane geometry for everything keeps buffer memory tiny.
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);

export class Chunk {
  /**
   * @param {number} cx Chunk grid X coordinate (integer).
   * @param {number} cz Chunk grid Z coordinate (integer).
   * @param {number} size World size of the chunk in metres.
   */
  constructor(cx, cz, size) {
    this.cx = cx;
    this.cz = cz;
    this.size = size;
    this.key = Chunk.keyFor(cx, cz);

    // A Group lets us add/remove the whole chunk in one scene operation.
    this.group = new THREE.Group();
    this.group.name = `chunk_${this.key}`;
    // World-space origin of this chunk (its centre).
    this.group.position.set(cx * size, 0, cz * size);

    this._built = false;
  }

  /** Stable string key for map lookups. */
  static keyFor(cx, cz) {
    return `${cx},${cz}`;
  }

  /**
   * Build the chunk's geometry. Called when the chunk enters view distance.
   * Everything created here must be freed again in dispose().
   * @param {boolean} shadows Whether meshes should receive shadows.
   */
  build(shadows) {
    if (this._built) return;

    // --- Ground plane -------------------------------------------------------
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(this.size, this.size),
      GROUND_MATERIAL
    );
    ground.rotation.x = -Math.PI / 2; // lay flat
    ground.receiveShadow = shadows;
    this.group.add(ground);

    // --- A simple cross road through the chunk ------------------------------
    // Gives the world a readable street grid to navigate in later parts.
    const roadWidth = this.size * 0.16;
    const roadH = new THREE.Mesh(
      new THREE.PlaneGeometry(this.size, roadWidth),
      ROAD_MATERIAL
    );
    roadH.rotation.x = -Math.PI / 2;
    roadH.position.y = 0.02; // avoid z-fighting with ground
    this.group.add(roadH);

    const roadV = new THREE.Mesh(
      new THREE.PlaneGeometry(roadWidth, this.size),
      ROAD_MATERIAL
    );
    roadV.rotation.x = -Math.PI / 2;
    roadV.position.y = 0.02;
    this.group.add(roadV);

    // --- Placeholder buildings ----------------------------------------------
    // Deterministic layout so each chunk always looks the same on revisit.
    const rand = seededRandom(this.cx, this.cz);
    const buildingCount = 3 + Math.floor(rand() * 4); // 3..6 buildings
    const half = this.size / 2;
    const margin = roadWidth; // keep buildings off the roads

    for (let i = 0; i < buildingCount; i++) {
      const w = 5 + rand() * 8;
      const d = 5 + rand() * 8;
      const h = 6 + rand() * 22;

      // Place in one of the four quadrants, away from the central roads.
      const quadX = rand() < 0.5 ? -1 : 1;
      const quadZ = rand() < 0.5 ? -1 : 1;
      const x = quadX * (margin + rand() * (half - margin - w));
      const z = quadZ * (margin + rand() * (half - margin - d));

      const mat = BUILDING_MATERIALS[i % BUILDING_MATERIALS.length];
      const building = new THREE.Mesh(UNIT_BOX, mat);
      building.scale.set(w, h, d);
      building.position.set(x, h / 2, z);
      building.castShadow = shadows;
      building.receiveShadow = shadows;
      this.group.add(building);
    }

    this._built = true;
  }

  /**
   * Free every mesh in this chunk. We dispose only the *geometries we created
   * per-instance* (ground + roads); the shared UNIT_BOX and shared materials
   * are intentionally left alive because other chunks still use them.
   */
  dispose() {
    this.group.traverse((obj) => {
      if (!obj.isMesh) return;
      const geo = obj.geometry;
      // Never dispose the shared unit geometry.
      if (geo && geo !== UNIT_BOX) geo.dispose();
    });
    this.group.clear();
    this._built = false;
  }
}
