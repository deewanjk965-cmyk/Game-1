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
// One shared material for every building in every chunk; per-building tint is
// supplied through the InstancedMesh's instanceColor buffer.
const BUILDING_MATERIAL = new THREE.MeshLambertMaterial({ color: 0xffffff });
const BUILDING_COLORS = [0x9aa3ad, 0xb08d57, 0x7d8ca3, 0xc4a484].map(
  (c) => new THREE.Color(c)
);

// Shared unit geometries, scaled per-instance via the mesh transform. Reusing
// one box/plane geometry for everything keeps buffer memory tiny.
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);

// Scratch objects reused while building instanced chunks (no per-chunk GC).
const _mat4 = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scl = new THREE.Vector3();

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

    // World-space axis-aligned building boxes for collision, filled in build().
    // Each is { minX, maxX, minZ, maxZ } in world coordinates.
    this.colliders = [];

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

    // --- Buildings (one InstancedMesh per chunk = one draw call) ------------
    // Deterministic layout so each chunk always looks the same on revisit.
    const rand = seededRandom(this.cx, this.cz);
    const buildingCount = 3 + Math.floor(rand() * 4); // 3..6 buildings
    const half = this.size / 2;
    const margin = roadWidth; // keep buildings off the roads

    const buildings = new THREE.InstancedMesh(
      UNIT_BOX,
      BUILDING_MATERIAL,
      buildingCount
    );
    buildings.castShadow = shadows;
    buildings.receiveShadow = shadows;

    for (let i = 0; i < buildingCount; i++) {
      const w = 5 + rand() * 8;
      const d = 5 + rand() * 8;
      const h = 6 + rand() * 22;

      // Place in one of the four quadrants, away from the central roads.
      const quadX = rand() < 0.5 ? -1 : 1;
      const quadZ = rand() < 0.5 ? -1 : 1;
      const x = quadX * (margin + rand() * (half - margin - w));
      const z = quadZ * (margin + rand() * (half - margin - d));

      // Compose this instance's transform (scale to size, sit on the ground).
      _pos.set(x, h / 2, z);
      _scl.set(w, h, d);
      _mat4.compose(_pos, _quat, _scl);
      buildings.setMatrixAt(i, _mat4);
      buildings.setColorAt(i, BUILDING_COLORS[i % BUILDING_COLORS.length]);

      // Record the world-space footprint for collision (chunk group is offset
      // by (cx*size, 0, cz*size)).
      const worldX = this.cx * this.size + x;
      const worldZ = this.cz * this.size + z;
      this.colliders.push({
        minX: worldX - w / 2,
        maxX: worldX + w / 2,
        minZ: worldZ - d / 2,
        maxZ: worldZ + d / 2,
      });
    }
    buildings.instanceMatrix.needsUpdate = true;
    if (buildings.instanceColor) buildings.instanceColor.needsUpdate = true;
    this.group.add(buildings);

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
      // InstancedMesh.dispose() frees the per-instance matrix/colour buffers
      // without touching the shared geometry/material.
      if (obj.isInstancedMesh) {
        obj.dispose();
        return;
      }
      const geo = obj.geometry;
      // Never dispose the shared unit geometry.
      if (geo && geo !== UNIT_BOX) geo.dispose();
    });
    this.group.clear();
    this.colliders.length = 0;
    this._built = false;
  }
}
