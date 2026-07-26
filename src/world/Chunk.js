/**
 * Chunk.js
 * --------
 * A single square tile of the city: textured ground, a cross-road with lane
 * markings, instanced buildings with lit-at-night windows, and instanced street
 * props (lamps + trees). Buildings/lamps/trees each render as ONE InstancedMesh
 * per chunk, so a whole block costs only a handful of draw calls.
 *
 *   build()   -> create meshes and add them to the scene
 *   dispose() -> remove meshes and free their GPU memory (symmetrical!)
 */

import * as THREE from 'three';
import { getCityMaterials } from './CityMaterials.js';

// Deterministic pseudo-random generator keyed on chunk coords, so each block
// always looks the same on revisit without storing anything.
function seededRandom(x, z) {
  let seed = (x * 73856093) ^ (z * 19349663);
  return function next() {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return ((seed >>> 0) % 100000) / 100000;
  };
}

// Shared geometries (scaled per-instance via transforms) — tiny memory cost.
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const LAMP_POST_GEO = new THREE.CylinderGeometry(0.12, 0.16, 5, 6);
const LAMP_HEAD_GEO = new THREE.BoxGeometry(0.7, 0.3, 0.7);
const TRUNK_GEO = new THREE.CylinderGeometry(0.22, 0.3, 2.2, 6);
const FOLIAGE_GEO = new THREE.IcosahedronGeometry(1.6, 0);
const STRIPE_GEO = new THREE.BoxGeometry(0.7, 0.04, 3.2); // crosswalk stripe
const HYDRANT_GEO = new THREE.CylinderGeometry(0.16, 0.18, 0.7, 8);
const STRIPE_MAT = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.9 });
const HYDRANT_MAT = new THREE.MeshStandardMaterial({ color: 0xcc2f2f, roughness: 0.6, metalness: 0.3 });

const BUILDING_TINTS = [0xb9c0c8, 0xd8c39a, 0xa7b3c4, 0xe0cbb0, 0x9fb0a6].map(
  (c) => new THREE.Color(c)
);

// Scratch objects reused while building (no per-chunk GC churn).
const _mat4 = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scl = new THREE.Vector3();
const _one = new THREE.Vector3(1, 1, 1);
const _upAxis = new THREE.Vector3(0, 1, 0);

export class Chunk {
  constructor(cx, cz, size) {
    this.cx = cx;
    this.cz = cz;
    this.size = size;
    this.key = Chunk.keyFor(cx, cz);

    this.group = new THREE.Group();
    this.group.name = `chunk_${this.key}`;
    this.group.position.set(cx * size, 0, cz * size);

    // World-space AABBs for collision, filled during build().
    this.colliders = [];
    this._built = false;
  }

  static keyFor(cx, cz) {
    return `${cx},${cz}`;
  }

  build(shadows) {
    if (this._built) return;
    const M = getCityMaterials();
    const rand = seededRandom(this.cx, this.cz);
    const roadWidth = this.size * 0.16;
    const half = this.size / 2;

    // --- Ground -------------------------------------------------------------
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(this.size, this.size), M.ground);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = shadows;
    this.group.add(ground);

    // --- Cross road + sidewalks --------------------------------------------
    const roadH = new THREE.Mesh(new THREE.PlaneGeometry(this.size, roadWidth), M.roadH);
    roadH.rotation.x = -Math.PI / 2;
    roadH.position.y = 0.02;
    roadH.receiveShadow = shadows;
    this.group.add(roadH);

    const roadV = new THREE.Mesh(new THREE.PlaneGeometry(roadWidth, this.size), M.roadV);
    roadV.rotation.x = -Math.PI / 2;
    roadV.position.y = 0.02;
    roadV.receiveShadow = shadows;
    this.group.add(roadV);

    // Raised sidewalk strips flanking each road.
    const swW = roadWidth * 0.28;
    const swOff = roadWidth / 2 + swW / 2;
    for (const off of [-swOff, swOff]) {
      const sh = new THREE.Mesh(new THREE.BoxGeometry(this.size, 0.12, swW), M.sidewalk);
      sh.position.set(0, 0.06, off);
      sh.receiveShadow = shadows;
      this.group.add(sh);
      const sv = new THREE.Mesh(new THREE.BoxGeometry(swW, 0.12, this.size), M.sidewalk);
      sv.position.set(off, 0.06, 0);
      sv.receiveShadow = shadows;
      this.group.add(sv);
    }

    // --- Buildings (instanced) ---------------------------------------------
    const buildingCount = 3 + Math.floor(rand() * 4);
    const margin = roadWidth;
    const buildings = new THREE.InstancedMesh(UNIT_BOX, M.building, buildingCount);
    buildings.castShadow = shadows;
    buildings.receiveShadow = shadows;

    for (let i = 0; i < buildingCount; i++) {
      const w = 6 + rand() * 9;
      const d = 6 + rand() * 9;
      const h = 8 + rand() * 34; // taller, more skyline variety
      const quadX = rand() < 0.5 ? -1 : 1;
      const quadZ = rand() < 0.5 ? -1 : 1;
      const x = quadX * (margin + rand() * (half - margin - w));
      const z = quadZ * (margin + rand() * (half - margin - d));

      _pos.set(x, h / 2, z);
      _scl.set(w, h, d);
      _mat4.compose(_pos, _quat, _scl);
      buildings.setMatrixAt(i, _mat4);
      buildings.setColorAt(i, BUILDING_TINTS[i % BUILDING_TINTS.length]);

      const wx = this.cx * this.size + x;
      const wz = this.cz * this.size + z;
      this.colliders.push({ minX: wx - w / 2, maxX: wx + w / 2, minZ: wz - d / 2, maxZ: wz + d / 2 });
    }
    buildings.instanceMatrix.needsUpdate = true;
    if (buildings.instanceColor) buildings.instanceColor.needsUpdate = true;
    this.group.add(buildings);

    // --- Street lamps + trees (instanced props) ----------------------------
    this._buildProps(shadows, roadWidth, half, rand, M);

    this._built = true;
  }

  /** Four corner lamps + a few sidewalk trees, all instanced. */
  _buildProps(shadows, roadWidth, half, rand, M) {
    const lampOff = roadWidth / 2 + 1.4;
    const corners = [
      [lampOff, lampOff], [-lampOff, lampOff],
      [lampOff, -lampOff], [-lampOff, -lampOff],
    ];

    const posts = new THREE.InstancedMesh(LAMP_POST_GEO, M.lampPost, corners.length);
    const heads = new THREE.InstancedMesh(LAMP_HEAD_GEO, M.lampHead, corners.length);
    posts.castShadow = shadows;
    corners.forEach(([x, z], i) => {
      _pos.set(x, 2.5, z);
      _mat4.compose(_pos, _quat, _one);
      posts.setMatrixAt(i, _mat4);
      _pos.set(x, 5, z);
      _mat4.compose(_pos, _quat, _one);
      heads.setMatrixAt(i, _mat4);
    });
    posts.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
    this.group.add(posts, heads);

    // A couple of trees on the sidewalks (deterministic spots).
    const treeCount = 2 + Math.floor(rand() * 3);
    const trunks = new THREE.InstancedMesh(TRUNK_GEO, M.trunk, treeCount);
    const foliage = new THREE.InstancedMesh(FOLIAGE_GEO, M.foliage, treeCount);
    trunks.castShadow = shadows;
    foliage.castShadow = shadows;
    const swLine = roadWidth / 2 + 2.4;
    for (let i = 0; i < treeCount; i++) {
      const along = (rand() - 0.5) * (half - 6) * 2;
      const onX = rand() < 0.5;
      const side = rand() < 0.5 ? 1 : -1;
      const x = onX ? along : side * swLine;
      const z = onX ? side * swLine : along;
      _pos.set(x, 1.1, z);
      _mat4.compose(_pos, _quat, _one);
      trunks.setMatrixAt(i, _mat4);
      _pos.set(x, 2.8, z);
      _mat4.compose(_pos, _quat, _one);
      foliage.setMatrixAt(i, _mat4);
    }
    trunks.instanceMatrix.needsUpdate = true;
    foliage.instanceMatrix.needsUpdate = true;
    this.group.add(trunks, foliage);

    // --- Crosswalk stripes at the intersection (4 approaches, instanced) -----
    const roadHalf = roadWidth / 2;
    const cwDist = roadHalf + 1.6; // just past the crossing
    const stripes = new THREE.InstancedMesh(STRIPE_GEO, STRIPE_MAT, 4 * 5);
    let si = 0;
    for (const [ox, oz, vert] of [
      [0, cwDist, false], [0, -cwDist, false], [cwDist, 0, true], [-cwDist, 0, true],
    ]) {
      for (let k = -2; k <= 2; k++) {
        if (vert) {
          _pos.set(ox, 0.06, oz + k * 1.0);
          _quat.setFromAxisAngle(_upAxis, Math.PI / 2);
        } else {
          _pos.set(ox + k * 1.0, 0.06, oz);
          _quat.identity();
        }
        _mat4.compose(_pos, _quat, _one);
        stripes.setMatrixAt(si++, _mat4);
      }
    }
    _quat.identity();
    stripes.instanceMatrix.needsUpdate = true;
    this.group.add(stripes);

    // --- Fire hydrants on a couple of corners (instanced) -------------------
    const hy = new THREE.InstancedMesh(HYDRANT_GEO, HYDRANT_MAT, 2);
    const ho = roadWidth / 2 + 2;
    [[ho, ho], [-ho, -ho]].forEach(([x, z], i) => {
      _pos.set(x, 0.35, z);
      _mat4.compose(_pos, _quat, _one);
      hy.setMatrixAt(i, _mat4);
    });
    hy.instanceMatrix.needsUpdate = true;
    this.group.add(hy);
  }

  dispose() {
    this.group.traverse((obj) => {
      if (!obj.isMesh) return;
      if (obj.isInstancedMesh) {
        obj.dispose();
        return;
      }
      const geo = obj.geometry;
      // Dispose only per-chunk geometries (planes/boxes we newed here); never
      // the shared unit/prop geometries.
      if (
        geo &&
        geo !== UNIT_BOX &&
        geo !== LAMP_POST_GEO &&
        geo !== LAMP_HEAD_GEO &&
        geo !== TRUNK_GEO &&
        geo !== FOLIAGE_GEO
      ) {
        geo.dispose();
      }
    });
    this.group.clear();
    this.colliders.length = 0;
    this._built = false;
  }
}
