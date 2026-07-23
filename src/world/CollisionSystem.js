/**
 * CollisionSystem.js
 * ------------------
 * Cheap, mobile-friendly collision against the city's buildings.
 *
 * Buildings are axis-aligned boxes, and moving things (the player, the car,
 * pedestrians) are treated as circles on the ground plane. Resolving a circle
 * against an AABB is a handful of comparisons — far cheaper than a physics
 * engine, and plenty for "don't walk/drive through walls".
 *
 * Colliders are bucketed per chunk (the same keys the streaming system uses),
 * so a resolve only ever tests the buildings in the entity's own chunk plus
 * its 8 neighbours — never the whole city.
 */

export class CollisionSystem {
  /** @param {number} chunkSize World size of one chunk (metres). */
  constructor(chunkSize) {
    this.chunkSize = chunkSize;
    // chunkKey ("cx,cz") -> array of world AABBs {minX,maxX,minZ,maxZ}.
    this.byChunk = new Map();
  }

  /** Register (or replace) the building boxes for a chunk. */
  setChunkColliders(key, aabbs) {
    this.byChunk.set(key, aabbs);
  }

  /** Forget a chunk's colliders when it unloads. */
  removeChunk(key) {
    this.byChunk.delete(key);
  }

  _chunkIndex(v) {
    return Math.floor((v + this.chunkSize / 2) / this.chunkSize);
  }

  /**
   * Push a circle (centre `pos`, given `radius`) out of any building it
   * overlaps. Mutates `pos.x` / `pos.z` in place.
   *
   * @param {{x:number, z:number}} pos Entity centre (mutated).
   * @param {number} radius Circle radius.
   * @returns {{x:number, z:number}|null} Unit push-out normal if a collision
   *          was resolved (accumulated over all hits), else null.
   */
  resolveCircle(pos, radius) {
    const cx = this._chunkIndex(pos.x);
    const cz = this._chunkIndex(pos.z);

    let hit = false;
    let nx = 0;
    let nz = 0;

    // Test this chunk and its 8 neighbours (buildings can straddle borders).
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const arr = this.byChunk.get(`${cx + dx},${cz + dz}`);
        if (!arr) continue;

        for (let i = 0; i < arr.length; i++) {
          const b = arr[i];

          // Closest point on the AABB to the circle centre.
          const closestX = Math.max(b.minX, Math.min(pos.x, b.maxX));
          const closestZ = Math.max(b.minZ, Math.min(pos.z, b.maxZ));

          let ddx = pos.x - closestX;
          let ddz = pos.z - closestZ;
          let distSq = ddx * ddx + ddz * ddz;

          if (distSq >= radius * radius) continue; // no overlap

          if (distSq > 1e-6) {
            // Circle centre is outside the box: push straight out.
            const dist = Math.sqrt(distSq);
            const push = radius - dist;
            const ux = ddx / dist;
            const uz = ddz / dist;
            pos.x += ux * push;
            pos.z += uz * push;
            nx += ux;
            nz += uz;
          } else {
            // Centre is *inside* the box: eject along the shallowest face.
            const toLeft = pos.x - b.minX;
            const toRight = b.maxX - pos.x;
            const toBack = pos.z - b.minZ;
            const toFront = b.maxZ - pos.z;
            const minPen = Math.min(toLeft, toRight, toBack, toFront);
            if (minPen === toLeft) {
              pos.x = b.minX - radius;
              nx -= 1;
            } else if (minPen === toRight) {
              pos.x = b.maxX + radius;
              nx += 1;
            } else if (minPen === toBack) {
              pos.z = b.minZ - radius;
              nz -= 1;
            } else {
              pos.z = b.maxZ + radius;
              nz += 1;
            }
          }
          hit = true;
        }
      }
    }

    if (!hit) return null;
    // Normalise the accumulated normal.
    const len = Math.hypot(nx, nz) || 1;
    return { x: nx / len, z: nz / len };
  }

  dispose() {
    this.byChunk.clear();
  }
}
