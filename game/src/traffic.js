// Traffic cars and pedestrians. Cars drive the road grid axis-aligned, right-hand
// lanes, braking for the car ahead; pedestrians stroll the sidewalks and flee a
// wanted player. All movement is deterministic from the seeded city.
import { CITY, TRAFFIC, PEDS } from './config.js';
import { randomIntersection, resolveCircle } from './city.js';

const LANE = 2.8;

export function createTraffic(city, random) {
  const cars = [];
  for (let n = 0; n < TRAFFIC.count; n += 1) {
    const inter = randomIntersection(city, random);
    const axis = random.chance(0.5) ? 'x' : 'z';
    const dir = random.chance(0.5) ? 1 : -1;
    cars.push({
      id: n,
      x: inter.x,
      z: inter.z,
      heading: axis === 'x' ? (dir > 0 ? 0 : Math.PI) : dir > 0 ? Math.PI / 2 : -Math.PI / 2,
      speed: TRAFFIC.speed * random.range(0.85, 1.1),
      axis,
      dir,
      target: pickNextTarget(city, random, inter, axis, dir),
      color: random.pick(TRAFFIC.carColors),
      isPolice: false,
      isPlayer: false,
      stopped: false,
      wait: 0,
    });
  }
  return cars;
}

function pickNextTarget(city, random, from, axis, dir) {
  // Neighbours of the intersection: one step along either road through it.
  const ix = city.roadX.indexOf(from.x);
  const iz = city.roadZ.indexOf(from.z);
  const options = [];
  if (ix > 0) options.push({ x: city.roadX[ix - 1], z: from.z });
  if (ix < city.roadX.length - 1) options.push({ x: city.roadX[ix + 1], z: from.z });
  if (iz > 0) options.push({ x: from.x, z: city.roadZ[iz - 1] });
  if (iz < city.roadZ.length - 1) options.push({ x: from.x, z: city.roadZ[iz + 1] });
  // Keep going straight most of the time; a turn is rarer.
  const straight = options.find((o) => (axis === 'x' ? o.z === from.z && Math.sign(o.x - from.x) === dir : o.x === from.x && Math.sign(o.z - from.z) === dir));
  if (straight && random.chance(0.65)) return straight;
  return options[random.int(0, options.length - 1)];
}

export function stepTraffic(city, cars, random, dt) {
  for (const car of cars) {
    if (car.isPlayer) continue;
    // Drive toward the target intersection; on arrival, wait at the stop sign
    // (a stopped car is one the player can jack) before picking a new route.
    let dx = car.target.x - car.x;
    let dz = car.target.z - car.z;
    if (car.wait > 0) {
      car.wait -= dt;
      if (car.wait > 0) continue;
      const from = { x: car.target.x, z: car.target.z };
      car.target = pickNextTarget(city, random, from, car.axis, car.dir);
      dx = car.target.x - car.x;
      dz = car.target.z - car.z;
    }
    if (Math.abs(dx) >= Math.abs(dz)) {
      car.axis = 'x';
      car.dir = Math.sign(dx) || 1;
    } else {
      car.axis = 'z';
      car.dir = Math.sign(dz) || 1;
    }
    car.heading = car.axis === 'x' ? (car.dir > 0 ? 0 : Math.PI) : car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    // Right-hand lanes: opposite directions pass each other on opposite sides.
    const lane = car.axis === 'x' ? (car.dir > 0 ? LANE : -LANE) : car.dir > 0 ? -LANE : LANE;
    // The car aims for its lane through the intersection, not the centreline:
    // arriving means reaching the lane point, or it would overshoot forever.
    const destX = car.axis === 'x' ? car.target.x : car.target.x + lane;
    const destZ = car.axis === 'x' ? car.target.z + lane : car.target.z;
    if (Math.abs(car.x - destX) < 1 && Math.abs(car.z - destZ) < 1) {
      car.wait = 1 + random.next() * 1.4;
      continue;
    }
    // Brake for the car ahead in the same lane (traffic or the player's car).
    let blocked = false;
    for (const other of cars) {
      if (other === car) continue;
      if (car.axis === 'x') {
        if (car.dir * (other.x - car.x) > 0 && car.dir * (other.x - car.x) < TRAFFIC.minGap && Math.abs(other.z - car.z) < 3.5) {
          blocked = true;
          break;
        }
      } else if (car.dir * (other.z - car.z) > 0 && car.dir * (other.z - car.z) < TRAFFIC.minGap && Math.abs(other.x - car.x) < 3.5) {
        blocked = true;
        break;
      }
    }
    if (!blocked) {
      if (car.axis === 'x') {
        car.x += car.dir * car.speed * dt;
        car.z += (destZ - car.z) * Math.min(1, dt * 3);
      } else {
        car.z += car.dir * car.speed * dt;
        car.x += (destX - car.x) * Math.min(1, dt * 3);
      }
    }
  }
}

export function createPeds(city, random) {
  const peds = [];
  for (let n = 0; n < PEDS.count; n += 1) {
    const axis = random.chance(0.5) ? 'x' : 'z';
    const k = random.int(0, city.roadX.length - 1);
    const along = random.range(-200, 200);
    const side = random.chance(0.5) ? -8 : 8;
    peds.push({
      x: axis === 'x' ? along : city.roadX[k] + side,
      z: axis === 'x' ? city.roadZ[k] + side : along,
      heading: axis === 'x' ? (random.chance(0.5) ? 0 : Math.PI) : random.chance(0.5) ? Math.PI / 2 : -Math.PI / 2,
      axis,
      dir: random.chance(0.5) ? 1 : -1,
      speed: PEDS.walk * random.range(0.8, 1.2),
      down: false,
      downTimer: 0,
      turnTimer: random.range(4, 14),
    });
  }
  return peds;
}

export function stepPeds(city, peds, player, wantedStars, dt, random) {
  const px = player.x;
  const pz = player.z;
  const playerFast = player.onFoot ? player.speed > 5 : Math.abs(player.speed) > 6;
  for (const ped of peds) {
    if (ped.down) {
      ped.downTimer -= dt;
      if (ped.downTimer <= 0) {
        ped.down = false;
        const spot = randomIntersection(city, random);
        ped.x = spot.x + 8;
        ped.z = spot.z + 8;
      }
      continue;
    }
    const dx = ped.x - px;
    const dz = ped.z - pz;
    const dist = Math.hypot(dx, dz);
    const fleeing = dist < PEDS.fleeRadius && (wantedStars > 0 || playerFast);
    if (fleeing) {
      const len = Math.max(0.001, dist);
      ped.x += (dx / len) * PEDS.flee * dt;
      ped.z += (dz / len) * PEDS.flee * dt;
      ped.heading = Math.atan2(dx, dz);
    } else {
      ped.turnTimer -= dt;
      if (ped.turnTimer <= 0) {
        ped.turnTimer = random.range(6, 16);
        // Turn onto a crossing sidewalk at the nearest intersection.
        const rx = nearestRoad(city.roadX, ped.x);
        const rz = nearestRoad(city.roadZ, ped.z);
        if (ped.axis === 'x') {
          ped.axis = 'z';
          ped.x = rx;
          ped.dir = random.chance(0.5) ? 1 : -1;
        } else {
          ped.axis = 'x';
          ped.z = rz;
          ped.dir = random.chance(0.5) ? 1 : -1;
        }
      }
      if (ped.axis === 'x') {
        ped.x += ped.dir * ped.speed * dt;
        ped.heading = ped.dir > 0 ? 0 : Math.PI;
        if (ped.x > 208) ped.dir = -1;
        if (ped.x < -208) ped.dir = 1;
      } else {
        ped.z += ped.dir * ped.speed * dt;
        ped.heading = ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        if (ped.z > 208) ped.dir = -1;
        if (ped.z < -208) ped.dir = 1;
      }
    }
    const fixed = resolveCircle(city, ped.x, ped.z, 0.5);
    ped.x = fixed.x;
    ped.z = fixed.z;
  }
}

function nearestRoad(roads, v) {
  let best = roads[0];
  let bestD = Math.abs(v - best);
  for (const r of roads) {
    const d = Math.abs(v - r);
    if (d < bestD) {
      bestD = d;
      best = r;
    }
  }
  return best;
}
