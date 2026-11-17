// The screenshot scenes behind ?shot=start|play|chase|end. Each one plays the
// real rules forward from a fresh world for a fixed number of steps, steered
// by a simple driving autopilot, so the frame is what a short game really
// looks like and the same seed always gives the same frame.
import { CITY, STEP } from './config.js';
import { ACTION_ENTER_CAR } from './input.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 14;
const CHASE_SECONDS = 10;
const END_SECONDS = 6;

function zeroInput() {
  return { throttle: () => 0, steer: () => 0, run: () => false };
}

/**
 * Road-following navigation: waypoints sit on intersections, so the car
 * drives along the road grid (Manhattan path) instead of cutting through
 * buildings. Returns the intermediate target the car should steer toward.
 */
function navTarget(px, pz, wx, wz) {
  const roads = CITY.roads.map((r) => r * CITY.pitch);
  const nearest = (v) => roads.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
  const rx = nearest(px);
  const rz = nearest(pz);
  const onXRoad = Math.abs(pz - rz) < 6;
  const onZRoad = Math.abs(px - rx) < 6;
  if (onXRoad && Math.abs(wx - px) > 8) return { x: wx, z: rz };
  if (onZRoad && Math.abs(wz - pz) > 8) return { x: rx, z: wz };
  if (onXRoad || onZRoad) return { x: wx, z: wz };
  // Off the road grid: head for the nearest road line first.
  return Math.abs(px - rx) < Math.abs(pz - rz) ? { x: rx, z: pz } : { x: px, z: rz };
}

function autopilotInput(world) {
  const state = world.state;
  const wp = world.missions.waypoint();
  const dest = wp || { x: 124, z: 62 };
  const target = navTarget(state.player.x, state.player.z, dest.x, dest.z);
  const dx = target.x - state.player.x;
  const dz = target.z - state.player.z;
  const want = Math.atan2(dx, dz);
  let diff = want - state.player.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, diff * 2.2));
  const speed = Math.abs(state.player.speed);
  // Brake hard into sharp turns so the car makes the corner.
  const throttle = Math.abs(diff) > 0.9 && speed > 12 ? -1 : (Math.abs(diff) > 1.2 ? 0.3 : 1);
  return {
    throttle: () => throttle,
    steer: () => steer,
    run: () => false,
  };
}

/** Put the player in the nearest parked car, deterministically. */
function putPlayerInCar(world) {
  const state = world.state;
  let best = null;
  let bestDist = Infinity;
  for (const car of state.parked) {
    const d = Math.hypot(car.x - state.player.x, car.z - state.player.z);
    if (d < bestDist) { bestDist = d; best = car; }
  }
  if (!best) return;
  state.player.x = best.x + 2;
  state.player.z = best.z;
  world.step(STEP, zeroInput(), ACTION_ENTER_CAR);
}

/**
 * Set `world` to the named scene (start, play, chase or end; any other name
 * is start) and return the screen to draw over it.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'chase' && name !== 'end') {
    for (let i = 0; i < START_SECONDS / STEP; i += 1) world.step(STEP, zeroInput(), 0);
    return { screen: SCREEN_TITLE };
  }
  if (name === 'play') {
    putPlayerInCar(world);
    for (let i = 0; i < PLAY_SECONDS / STEP; i += 1) world.step(STEP, autopilotInput(world), 0);
    return { screen: SCREEN_PLAY };
  }
  if (name === 'chase') {
    // Jump to the "Heat" mission with a 3-star wanted level and police on tail.
    world.missions.state.index = 2;
    world.missions.state.step = 0;
    world.missions.startStep();
    world.addWanted(3);
    putPlayerInCar(world);
    for (let i = 0; i < CHASE_SECONDS / STEP; i += 1) world.step(STEP, autopilotInput(world), 0);
    return { screen: SCREEN_PLAY };
  }
  // end: every job done, rich, cruising to the hideout at sunset pace.
  world.missions.state.index = 4;
  world.missions.state.step = 0;
  world.missions.state.done = 4;
  world.state.money = 2450;
  world.state.player.x = -150;
  world.state.player.z = 150;
  world.state.player.heading = Math.PI * 0.75;
  putPlayerInCar(world);
  for (let i = 0; i < END_SECONDS / STEP; i += 1) world.step(STEP, autopilotInput(world), 0);
  return { screen: SCREEN_PLAY };
}
