/**
 * RoadNetwork.js
 * --------------
 * A lightweight, *implicit* road graph for the ambient AI.
 *
 * Our city is a regular grid: every chunk has a cross-road through its centre,
 * so roads run along every line x = k·chunkSize and z = k·chunkSize, and they
 * meet at intersections (k·size, m·size). Because the grid is perfectly
 * regular we don't need to store any nodes/edges — we can compute a node's
 * neighbours and lane positions on the fly. That's ideal for an infinite,
 * streamed world: zero memory, works anywhere the player roams.
 *
 * Nodes are addressed by integer indices [ix, iz]; world position is just
 * ix·size, iz·size. Traffic drives node→node; pedestrians walk the sidewalks
 * that run alongside each road.
 */

// The 4 grid directions (unit steps in node space).
const DIRS = [
  { x: 1, z: 0 },
  { x: -1, z: 0 },
  { x: 0, z: 1 },
  { x: 0, z: -1 },
];

export class RoadNetwork {
  /** @param {number} chunkSize World size of one chunk (= intersection spacing). */
  constructor(chunkSize) {
    this.size = chunkSize;
    const roadWidth = chunkSize * 0.16; // matches Chunk.js road geometry
    this.roadHalf = roadWidth / 2;
    // Right-hand driving lane centre offset from the road centreline.
    this.laneOffset = roadWidth * 0.25;
    // Sidewalks sit just outside the road edge.
    this.sidewalkOffset = this.roadHalf + 1.2;
  }

  /** Nearest intersection index for a world coordinate. */
  nodeIndex(worldValue) {
    return Math.round(worldValue / this.size);
  }

  /** World position (centre) of node [ix, iz], written into `out`. */
  nodeToWorld(ix, iz, out = { x: 0, z: 0 }) {
    out.x = ix * this.size;
    out.z = iz * this.size;
    return out;
  }

  /** The 4 grid directions (shared, do not mutate). */
  get directions() {
    return DIRS;
  }

  /**
   * Lane target point when driving from node A to node B, offset to the right
   * of travel so oncoming traffic passes on the correct side.
   * @returns {{x:number, z:number, heading:number}}
   */
  getLanePoint(fromIx, fromIz, toIx, toIz) {
    const ax = fromIx * this.size;
    const az = fromIz * this.size;
    const bx = toIx * this.size;
    const bz = toIz * this.size;

    // Travel direction (unit) and the "to its right" perpendicular.
    let dx = bx - ax;
    let dz = bz - az;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    // Right of forward in XZ (see CollisionSystem/Vehicle conventions).
    const rx = dz;
    const rz = -dx;

    return {
      x: bx + rx * this.laneOffset,
      z: bz + rz * this.laneOffset,
      heading: Math.atan2(dx, dz),
    };
  }

  /**
   * A random sidewalk point near `pos`, used as a pedestrian waypoint. Picks a
   * nearby road segment and a random spot along it, pushed out to the sidewalk.
   * @returns {{x:number, z:number}}
   */
  randomSidewalkPoint(pos) {
    const ix = this.nodeIndex(pos.x);
    const iz = this.nodeIndex(pos.z);
    const dir = DIRS[(Math.random() * 4) | 0];

    // Random fraction along the segment from this node to the neighbour.
    const t = 0.15 + Math.random() * 0.7;
    const cx = (ix + dir.x * t) * this.size;
    const cz = (iz + dir.z * t) * this.size;

    // Offset perpendicular to the road onto one of the two sidewalks.
    const side = Math.random() < 0.5 ? 1 : -1;
    // Perpendicular to travel direction.
    const px = dir.z * side;
    const pz = -dir.x * side;

    return {
      x: cx + px * this.sidewalkOffset,
      z: cz + pz * this.sidewalkOffset,
    };
  }

  /**
   * Pick a random node within a ring [minR, maxR] around a world position.
   * Used to seed traffic spawns on the road grid near the player.
   * @returns {{ix:number, iz:number, x:number, z:number}}
   */
  randomNodeInRing(pos, minR, maxR) {
    const angle = Math.random() * Math.PI * 2;
    const r = minR + Math.random() * (maxR - minR);
    const wx = pos.x + Math.cos(angle) * r;
    const wz = pos.z + Math.sin(angle) * r;
    const ix = this.nodeIndex(wx);
    const iz = this.nodeIndex(wz);
    return { ix, iz, x: ix * this.size, z: iz * this.size };
  }
}
