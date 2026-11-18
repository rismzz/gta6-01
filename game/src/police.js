// The heat: wanted stars, foot cops who chase and bust, patrol cars that ram.
// Stars rise with crime (paced so one spree cannot jump straight to five) and
// fall after a quiet spell. Cops spawn near the player and give up when the heat dies.
import { WANTED } from './config.js';
import { resolveCircle } from './city.js';

export function createWanted() {
  return { stars: 0, sinceCrime: 0, lastAdd: -99 };
}

/** Add stars, at most one new star per 4 seconds from any cause. */
export function addWanted(state, n, cause) {
  const w = state.wanted;
  if (state.time - w.lastAdd < 4) return;
  w.lastAdd = state.time;
  w.sinceCrime = 0;
  const before = w.stars;
  w.stars = Math.min(WANTED.maxStars, w.stars + n);
  if (w.stars > before) state.events.push('crime');
}

export function createCops() {
  return [];
}

export function stepPolice(state, random, dt) {
  const { city, player, wanted } = state;
  wanted.sinceCrime += dt;
  if (wanted.stars > 0 && wanted.sinceCrime > WANTED.decaySeconds) {
    wanted.stars -= 1;
    wanted.sinceCrime = 0;
    state.events.push('cooldown');
  }

  // Keep the right number of foot cops for the heat.
  const wantCops = wanted.stars > 0 ? WANTED.copCount(wanted.stars) : 0;
  while (state.cops.length < wantCops) {
    const a = random.next() * Math.PI * 2;
    const r = 26 + random.next() * 14;
    const x = player.x + Math.cos(a) * r;
    const z = player.z + Math.sin(a) * r;
    const fixed = resolveCircle(city, x, z, 0.6);
    state.cops.push({ x: fixed.x, z: fixed.z, heading: 0, hp: 50, down: false, downTimer: 0, speed: WANTED.copSpeed });
  }
  // Keep the right number of patrol cars.
  const wantPatrols = WANTED.patrolCount(wanted.stars);
  let patrols = state.cars.filter((c) => c.isPolice);
  while (patrols.length < wantPatrols) {
    const a = random.next() * Math.PI * 2;
    const r = 40 + random.next() * 20;
    const x = player.x + Math.cos(a) * r;
    const z = player.z + Math.sin(a) * r;
    const fixed = resolveCircle(city, x, z, 2.4);
    const car = {
      id: 1000 + state.cars.length,
      x: fixed.x,
      z: fixed.z,
      heading: 0,
      speed: 0,
      axis: 'x',
      dir: 1,
      target: { x: fixed.x, z: fixed.z },
      color: '#1c1c22',
      isPolice: true,
      isPlayer: false,
      hp: 80,
      disabled: false,
      disabledTimer: 0,
      ramCd: 0,
    };
    state.cars.push(car);
    patrols.push(car);
  }

  // Foot cops: chase, punch on contact, bust a slow player who stays close.
  let busted = false;
  for (const cop of state.cops) {
    if (cop.down) {
      cop.downTimer -= dt;
      if (cop.downTimer <= 0) {
        cop.hp = 50;
        cop.down = false;
      }
      continue;
    }
    const dx = player.x - cop.x;
    const dz = player.z - cop.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.01) {
      cop.heading = Math.atan2(dx, dz);
      const step = Math.min(d, cop.speed * dt);
      const nx = cop.x + (dx / d) * step;
      const nz = cop.z + (dz / d) * step;
      const fixed = resolveCircle(city, nx, nz, 0.6);
      cop.x = fixed.x;
      cop.z = fixed.z;
    }
    if (d < 1.3 && player.onFoot) {
      player.health -= 10 * dt;
      state.events.push('hit');
    }
    if (d < WANTED.bustRange && player.onFoot && Math.abs(player.speed) < 2) {
      player.bustedTimer += dt;
      if (player.bustedTimer > WANTED.bustSeconds) busted = true;
    } else {
      player.bustedTimer = Math.max(0, player.bustedTimer - dt * 2);
    }
  }
  // Cops give up when the heat dies: walk away and fade out of the list.
  if (wanted.stars === 0) {
    state.cops = state.cops.filter((cop) => {
      if (cop.down) return false;
      return Math.hypot(cop.x - player.x, cop.z - player.z) < 60;
    });
  }
  if (busted) {
    state.events.push('busted');
    return 'busted';
  }

  // Patrol cars: steer straight at the player and ram.
  for (const car of patrols) {
    car.ramCd = Math.max(0, car.ramCd - dt);
    if (car.disabled) {
      car.disabledTimer -= dt;
      if (car.disabledTimer <= 0) {
        car.disabled = false;
        car.hp = 80;
      }
      continue;
    }
    const dx = player.x - car.x;
    const dz = player.z - car.z;
    const d = Math.hypot(dx, dz);
    const wantHeading = Math.atan2(dx, dz);
    let diff = wantHeading - car.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    car.heading += Math.max(-1.6 * dt, Math.min(1.6 * dt, diff));
    const targetSpeed = Math.min(WANTED.patrolSpeed, 8 + d * 0.55);
    car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 0.8);
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    const nx = car.x + fx * car.speed * dt;
    const nz = car.z + fz * car.speed * dt;
    const fixed = resolveCircle(city, nx, nz, 2.3);
    if (fixed.x !== nx || fixed.z !== nz) car.speed *= 0.4;
    car.x = fixed.x;
    car.z = fixed.z;
    if (d < 4.6 && car.ramCd <= 0) {
      car.ramCd = WANTED.ramCooldown;
      player.health -= WANTED.ramDamage;
      state.events.push('ram');
      if (!player.onFoot && player.car) {
        player.car.speed *= 0.5;
      }
    }
  }
  // Patrol cars leave when the heat dies.
  if (wanted.stars === 0) {
    state.cars = state.cars.filter((c) => !c.isPolice || Math.hypot(c.x - player.x, c.z - player.z) < 80);
  }
  if (player.health <= 0) {
    player.health = 0;
    player.dead = true;
    state.events.push('dead');
    return 'dead';
  }
  return null;
}
