// The simulation core: one fixed step advances the player, traffic, pedestrians,
// police and missions, then collects the step's events for the renderer and audio.
// Everything here is deterministic from the seed: same seed, same city, same play.
import { STEP, PLAYER, PICKUPS } from './config.js';
import { createRandom } from './random.js';
import { createCity, resolveCircle } from './city.js';
import { createTraffic, stepTraffic, createPeds, stepPeds } from './traffic.js';
import { createPlayer, stepPlayer } from './player.js';
import { createWanted, addWanted, createCops, stepPolice } from './police.js';
import { createMissions, stepMissions } from './missions.js';

export function createWorld(seed) {
  const random = createRandom(seed);
  const city = createCity(random);
  const state = {
    seed,
    time: 0,
    random,
    city,
    player: createPlayer(city),
    cars: createTraffic(city, random),
    peds: createPeds(city, random),
    cops: createCops(),
    wanted: createWanted(),
    missions: createMissions(city),
    pickups: createPickups(city, random),
    events: [],
    tracer: null,
    complete: false,
    stats: { crimes: 0, pickups: 0, missions: 0 },
  };
  state.addWanted = (n, cause) => addWanted(state, n, cause);
  return state;
}

function createPickups(city, random) {
  const pickups = [];
  for (const s of city.stashSpots) {
    pickups.push({ x: s.x, z: s.z, kind: 'stash', taken: false });
  }
  for (let n = 0; n < PICKUPS.healthCount; n += 1) {
    pickups.push({ x: random.range(-190, 190), z: random.range(-190, 190), kind: 'health', taken: false });
  }
  for (let n = 0; n < 4; n += 1) {
    pickups.push({ x: random.range(-190, 190), z: random.range(-190, 190), kind: 'ammo', taken: false });
  }
  return pickups;
}

export function resetWorld(state) {
  const fresh = createWorld(state.seed);
  for (const key of Object.keys(fresh)) {
    if (key !== 'addWanted') state[key] = fresh[key];
  }
  state.addWanted = (n, cause) => addWanted(state, n, cause);
}

/** Advance one fixed step. Returns 'dead' | 'busted' | 'complete' | null. */
export function stepWorld(state, input, dt = STEP) {
  state.events = [];
  if (state.tracer) {
    state.tracer.ttl -= dt;
    if (state.tracer.ttl <= 0) state.tracer = null;
  }
  state.time += dt;
  stepPlayer(state, input, dt);
  stepTraffic(state.city, state.cars, state.random, dt);
  stepPeds(state.city, state.peds, state.player, state.wanted.stars, dt, state.random);
  stepMissions(state, input, dt);
  stepPickups(state);
  stepPedHits(state);
  const policeResult = stepPolice(state, state.random, dt);
  for (const event of state.events) {
    if (event === 'crime') state.stats.crimes += 1;
    if (event === 'mission') state.stats.missions += 1;
    if (event === 'pickup') state.stats.pickups += 1;
  }
  if (policeResult === 'busted') {
    applyBusted(state);
    return 'busted';
  }
  if (policeResult === 'dead') return 'dead';
  if (state.complete) return 'complete';
  return null;
}

function stepPickups(state) {
  const { player } = state;
  for (const p of state.pickups) {
    if (p.taken) continue;
    if (Math.hypot(p.x - player.x, p.z - player.z) > 2.6) continue;
    p.taken = true;
    if (p.kind === 'stash') player.cash += PICKUPS.stashValue;
    else if (p.kind === 'health') player.health = Math.min(PLAYER.health, player.health + PICKUPS.healthValue);
    else if (p.kind === 'ammo') player.ammo = Math.min(48, player.ammo + PLAYER.ammoPickup);
    state.events.push('pickup');
  }
}

function stepPedHits(state) {
  const { player, peds } = state;
  const fast = player.onFoot ? Math.abs(player.speed) > 5 : Math.abs(player.speed) > 6;
  if (!fast) return;
  for (const ped of peds) {
    if (ped.down) continue;
    const d = Math.hypot(ped.x - player.x, ped.z - player.z);
    if (d < 2.6) {
      ped.down = true;
      ped.downTimer = 8;
      state.addWanted(1, 'hit-ped');
    }
  }
}

function applyBusted(state) {
  const { player, city } = state;
  player.cash = Math.floor(player.cash / 2);
  player.health = PLAYER.health;
  state.wanted.stars = 0;
  state.wanted.sinceCrime = 0;
  state.cops = [];
  if (player.car) {
    player.car.isPlayer = true; // it stays your car, parked where you left it
    player.car.speed = 0;
    player.car = null;
  }
  player.onFoot = true;
  player.speed = 0;
  const start = city.landmarks.hideout;
  const fixed = resolveCircle(city, start.x, start.z + 8, PLAYER.radius);
  player.x = fixed.x;
  player.z = fixed.z;
  player.heading = Math.PI / 2;
  player.bustedTimer = 0;
}
