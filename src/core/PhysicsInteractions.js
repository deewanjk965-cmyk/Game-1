/**
 * PhysicsInteractions.js
 * ----------------------
 * Cheap circle-based interactions between *moving* things: car↔car crashes,
 * cars running over pedestrians, and the on-foot player bumping into cars.
 * (Static building collision lives in CollisionSystem.js.)
 *
 * Everything here is circle vs circle — a few multiplies per pair — so even
 * with ~20 cars and ~20 pedestrians it stays comfortably cheap on mobile.
 *
 * Cars are passed in as a normalized descriptor so this module doesn't care
 * whether a car is the player's arcade Vehicle, an ambient TrafficCar or a
 * PoliceCar:
 *   { ref, pos:Vector3, r:number, speed:number, isPlayer:boolean,
 *     onImpact(nx, nz, otherSpeed) }
 */

// Speed (m/s) above which a car hit kills a pedestrian outright; between the
// graze threshold and this, the pedestrian is only injured.
const KILL_SPEED = 5.0;
const GRAZE_SPEED = 1.5;

/** Resolve car-vs-car overlaps: separate them and fire each car's onImpact. */
export function resolveCarCollisions(cars) {
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i];
      const b = cars[j];
      const dx = b.pos.x - a.pos.x;
      const dz = b.pos.z - a.pos.z;
      const minDist = a.r + b.r;
      const distSq = dx * dx + dz * dz;
      if (distSq >= minDist * minDist || distSq < 1e-6) continue;

      const dist = Math.sqrt(distSq);
      const overlap = minDist - dist;
      const nx = dx / dist;
      const nz = dz / dist;

      // Push each car half of the overlap apart, then sync its visual group.
      a.pos.x -= nx * overlap * 0.5;
      a.pos.z -= nz * overlap * 0.5;
      b.pos.x += nx * overlap * 0.5;
      b.pos.z += nz * overlap * 0.5;
      if (a.ref.group) a.ref.group.position.copy(a.pos);
      if (b.ref.group) b.ref.group.position.copy(b.pos);

      // Each car reacts to being hit from the other's direction.
      a.onImpact(-nx, -nz, b.speed);
      b.onImpact(nx, nz, a.speed);
    }
  }
}

/**
 * Cars vs pedestrians: block overlap and apply speed-based damage.
 * @param {Array} cars Normalized car descriptors.
 * @param {Array<Pedestrian>} peds
 * @param {(result:'killed'|'injured', pedPos:{x,z}) => void} onPlayerHit
 *        Called when the *player's* car hits someone (for wanted/crime scoring).
 */
export function resolveCarsVsPedestrians(cars, peds, onPlayerHit) {
  for (const car of cars) {
    for (const ped of peds) {
      if (!ped.active || ped.isDead) continue;

      const dx = ped.position.x - car.pos.x;
      const dz = ped.position.z - car.pos.z;
      const minDist = car.r + ped.radius;
      const distSq = dx * dx + dz * dz;
      if (distSq >= minDist * minDist) continue;

      // Shove the pedestrian to the edge of the car so they don't sink in.
      const dist = Math.sqrt(distSq) || 0.001;
      const nx = dx / dist;
      const nz = dz / dist;
      ped.position.x = car.pos.x + nx * minDist;
      ped.position.z = car.pos.z + nz * minDist;

      // Damage scales with how fast the car was moving.
      let result = 'none';
      if (car.speed >= KILL_SPEED) {
        result = ped.hit(200, car.pos.x, car.pos.z); // fatal
      } else if (car.speed >= GRAZE_SPEED) {
        result = ped.hit(40, car.pos.x, car.pos.z); // injuring graze
      }

      if (car.isPlayer && (result === 'killed' || result === 'injured')) {
        onPlayerHit(result, ped.position);
      }
    }
  }
}

/** Push an on-foot circle (the player) out of any car it overlaps. */
export function pushCircleOutOfCars(pos, radius, cars) {
  for (const car of cars) {
    const dx = pos.x - car.pos.x;
    const dz = pos.z - car.pos.z;
    const minDist = radius + car.r;
    const distSq = dx * dx + dz * dz;
    if (distSq >= minDist * minDist || distSq < 1e-6) continue;
    const dist = Math.sqrt(distSq);
    const push = minDist - dist;
    pos.x += (dx / dist) * push;
    pos.z += (dz / dist) * push;
  }
}

export { KILL_SPEED, GRAZE_SPEED };
