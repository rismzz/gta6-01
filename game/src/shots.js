// The screenshot scenes behind ?shot=start|drive|chase|mission. Each one plays the
// real rules forward from a fresh world for a fixed time, steered by a simple
// autopilot, so the frame is what real play looks like and the same seed always
// gives the same frame.
import { STEP } from './config.js';
import { stepWorld } from './world.js';

const START_SECONDS = 5;
const DRIVE_SECONDS = 4;
const CHASE_SECONDS = 15;
const MISSION_SECONDS = 10;

function synthInput() {
  const held = { throttle: 0, steer: 0 };
  return {
    set(throttle, steer) {
      held.throttle = throttle;
      held.steer = steer;
    },
    throttle: () => held.throttle,
    steer: () => held.steer,
    running: () => false,
    interactHeld: () => false,
    takeActions: () => 0,
    takeGameActions: () => 0,
    takeOrbit: () => ({ dx: 0, dy: 0 }),
  };
}

function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function pickNextWaypoint(city, random, from) {
  const ix = city.roadX.indexOf(from.x);
  const iz = city.roadZ.indexOf(from.z);
  const options = [];
  if (ix > 0) options.push({ x: city.roadX[ix - 1], z: from.z });
  if (ix < city.roadX.length - 1) options.push({ x: city.roadX[ix + 1], z: from.z });
  if (iz > 0) options.push({ x: from.x, z: city.roadZ[iz - 1] });
  if (iz < city.roadZ.length - 1) options.push({ x: from.x, z: city.roadZ[iz + 1] });
  return options[random.int(0, options.length - 1)];
}

function driveAutopilot(state, input, waypoint) {
  const car = state.player.car;
  if (!car) return waypoint;
  const dx = waypoint.x - car.x;
  const dz = waypoint.z - car.z;
  if (Math.hypot(dx, dz) < 4) {
    const from = { x: waypoint.x, z: waypoint.z };
    return pickNextWaypoint(state.city, state.random, from);
  }
  const want = Math.atan2(dx, dz);
  const diff = angleDiff(car.heading, want);
  // Brake for turns: a 90-degree corner on a 12 m road needs ~6 m/s, not 38.
  const desired = Math.abs(diff) > 0.7 ? 6 : Math.abs(diff) > 0.3 ? 14 : 34;
  const speed = Math.abs(car.speed);
  let throttle = speed < desired ? 1 : speed > desired + 4 ? -1 : 0;
  let steer = Math.max(-1, Math.min(1, diff * 1.6));
  // Stuck against a wall (rammed by a patrol car, bad corner): reverse out.
  if (speed < 1 && throttle === 1) car.stuckT = (car.stuckT ?? 0) + STEP;
  else car.stuckT = 0;
  if ((car.stuckT ?? 0) > 1.5) {
    car.stuckT = 0;
    car.reverseT = 1;
  }
  if ((car.reverseT ?? 0) > 0) {
    car.reverseT -= STEP;
    throttle = -1;
    steer = -steer;
  }
  input.set(throttle, steer);
  return waypoint;
}

function walkAutopilot(state, input, target) {
  const player = state.player;
  const dx = target.x - player.x;
  const dz = target.z - player.z;
  const want = Math.atan2(dx, dz);
  const diff = angleDiff(player.heading, want);
  input.set(Math.hypot(dx, dz) > 1 ? 1 : 0, Math.max(-1, Math.min(1, diff * 2)));
}

function putPlayerInCar(state, x, z, heading) {
  // Take the nearest traffic car, park it at the staging point, hand it over.
  let best = null;
  let bestD = Infinity;
  for (const car of state.cars) {
    if (car.isPolice) continue;
    const d = Math.hypot(car.x - x, car.z - z);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  best.x = x;
  best.z = z;
  best.heading = heading;
  best.speed = 0;
  best.isPlayer = true;
  best.owned = true;
  state.player.car = best;
  state.player.onFoot = false;
  state.player.x = x;
  state.player.z = z;
  state.player.heading = heading;
  state.player.speed = 0;
  return best;
}

/**
 * Set `state` to the named scene (start, drive, chase, mission; any other name
 * is start) and return the screen to draw over it and the best score to show.
 */
export function stageShot(name, state) {
  const input = synthInput();
  if (name !== 'drive' && name !== 'chase' && name !== 'mission') {
    for (let i = 0; i < START_SECONDS / STEP; i += 1) stepWorld(state, input);
    return { screen: 'title', best: 0 };
  }
  if (name === 'drive' || name === 'chase') {
    if (name === 'drive') {
      // A clean straight run down the central avenue at speed: no turns, the
      // car mid-avenue with the city ahead.
      putPlayerInCar(state, 0, -104, Math.PI);
      let waypoint = { x: 0, z: -208 };
      for (let i = 0; i < DRIVE_SECONDS / STEP; i += 1) {
        waypoint = driveAutopilot(state, input, waypoint);
        stepWorld(state, input);
        if (state.player.dead) break;
      }
      return { screen: 'play', best: state.player.cash };
    }
    putPlayerInCar(state, 0, -156, Math.PI); // on the central avenue, facing north
    state.wanted.stars = 3;
    state.wanted.sinceCrime = 0;
    let waypoint = { x: 0, z: -208 };
    for (let i = 0; i < CHASE_SECONDS / STEP; i += 1) {
      waypoint = driveAutopilot(state, input, waypoint);
      stepWorld(state, input);
      if (state.player.dead) break;
    }
    return { screen: 'play', best: state.player.cash };
  }
  // mission: Vex's bank job, on foot at the vault. The player approaches from
  // the east along the street, so the shot shows the street, the bank and the
  // beacon — not a wall filling the frame.
  state.missions.index = 2;
  state.missions.stage = 'bank';
  const vault = state.missions.vault;
  state.player.x = vault.x + 26;
  state.player.z = vault.z;
  state.player.heading = -Math.PI / 2;
  for (let i = 0; i < MISSION_SECONDS / STEP; i += 1) {
    walkAutopilot(state, input, vault);
    stepWorld(state, input);
    if (state.player.dead) break;
  }
  return { screen: 'play', best: state.player.cash };
}
