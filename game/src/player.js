// The player, on foot and behind the wheel. Movement is arcade-simple: the car
// has a speed along its heading, the walker turns with A/D and walks with W/S.
// All crime is reported through addWanted (police.js) so stars pace themselves.
import { CAR, PLAYER } from './config.js';
import { resolveCircle } from './city.js';

export function createPlayer(city) {
  const start = city.landmarks.hideout;
  return {
    x: start.x,
    z: start.z + 8,
    heading: Math.PI / 2, // facing east along the hideout's front sidewalk
    speed: 0,
    onFoot: true,
    car: null,
    health: PLAYER.health,
    cash: 0,
    ammo: PLAYER.pistolAmmo,
    punchCd: 0,
    shootCd: 0,
    walkPhase: 0,
    orbitOffset: 0,
    bustedTimer: 0,
    dead: false,
  };
}

export function stepPlayer(state, input, dt) {
  const { city, player } = state;
  const actions = input.takeGameActions();
  player.punchCd = Math.max(0, player.punchCd - dt);
  player.shootCd = Math.max(0, player.shootCd - dt);
  if (player.dead) return;

  if (actions & 4) {
    // E: enter or leave a car.
    if (player.onFoot) tryEnterCar(state);
    else exitCar(state);
  }
  if (player.onFoot) {
    stepOnFoot(state, input, dt);
    if (actions & 8) doPunch(state);
    if (actions & 16) doShoot(state);
  } else {
    stepDriving(state, input, dt);
  }
  // Health comes back slowly when the heat is off.
  if (state.wanted.stars === 0 && player.health < PLAYER.health) {
    player.health = Math.min(PLAYER.health, player.health + PLAYER.regen * dt);
  }
}

function stepOnFoot(state, input, dt) {
  const { city, player } = state;
  player.heading += input.steer() * PLAYER.turn * dt;
  const target = (input.running() ? PLAYER.run : PLAYER.walk) * input.throttle();
  player.speed += (target - player.speed) * Math.min(1, dt * 10);
  const fx = Math.sin(player.heading);
  const fz = Math.cos(player.heading);
  let nx = player.x + fx * player.speed * dt;
  let nz = player.z + fz * player.speed * dt;
  const fixed = resolveCircle(city, nx, nz, PLAYER.radius);
  nx = fixed.x;
  nz = fixed.z;
  // Bumping a wall stops you instead of sliding through it.
  if (Math.abs(fixed.x - (player.x + fx * player.speed * dt)) > 0.01) player.speed *= 0.5;
  player.x = nx;
  player.z = nz;
  player.walkPhase += Math.abs(player.speed) * dt * 1.6;
  player.orbitOffset *= Math.max(0, 1 - dt * 0.4);
}

function stepDriving(state, input, dt) {
  const { city, player, cars } = state;
  const car = player.car;
  if (!car) {
    player.onFoot = true;
    return;
  }
  const throttle = input.throttle();
  const steer = input.steer();
  if (throttle > 0) car.speed += CAR.accel * dt;
  else if (throttle < 0) {
    car.speed -= (car.speed > 0.5 ? CAR.brake : CAR.reverseAccel) * dt;
  } else {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), CAR.drag * 2 * dt + 2 * dt);
  }
  car.speed = Math.max(-CAR.maxReverse, Math.min(CAR.maxSpeed, car.speed));
  const steerAuthority = Math.min(1, Math.abs(car.speed) / 8);
  car.heading += steer * CAR.steer * steerAuthority * Math.sign(car.speed || 1) * dt * 2.2;
  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  let nx = car.x + fx * car.speed * dt;
  let nz = car.z + fz * car.speed * dt;
  const fixed = resolveCircle(city, nx, nz, CAR.radius);
  if (fixed.x !== nx || fixed.z !== nz) {
    if (Math.abs(car.speed) > 8) state.events.push('crash');
    car.speed *= 0.35;
    nx = fixed.x;
    nz = fixed.z;
  }
  car.x = nx;
  car.z = nz;
  // Nudge traffic cars aside instead of driving through them.
  for (const other of cars) {
    if (other === car || other.isPlayer) continue;
    const dx = other.x - car.x;
    const dz = other.z - car.z;
    const d = Math.hypot(dx, dz);
    if (d < 4.4 && d > 0.01) {
      const push = (4.4 - d) / 2;
      other.x += (dx / d) * push;
      other.z += (dz / d) * push;
      car.speed *= 0.92;
    }
  }
  player.x = car.x;
  player.z = car.z;
  player.heading = car.heading;
  player.speed = car.speed;
  player.orbitOffset *= Math.max(0, 1 - dt * 0.4);
}

function tryEnterCar(state) {
  const { player, cars } = state;
  let best = null;
  let bestD = 4.5;
  for (const car of cars) {
    if (car.isPolice) continue;
    const d = Math.hypot(car.x - player.x, car.z - player.z);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  if (!best) return;
  player.car = best;
  player.onFoot = false;
  player.speed = 0;
  best.isPlayer = true;
  best.speed = 0;
  if (!best.owned) {
    best.owned = true;
    state.addWanted(1, 'jack');
    state.events.push('jack');
  }
}

function exitCar(state) {
  const { player } = state;
  const car = player.car;
  if (!car) return;
  const side = Math.PI / 2;
  const sx = car.x + Math.sin(car.heading + side) * 3;
  const sz = car.z + Math.cos(car.heading + side) * 3;
  const fixed = resolveCircle(state.city, sx, sz, PLAYER.radius);
  player.x = fixed.x;
  player.z = fixed.z;
  player.heading = car.heading;
  player.onFoot = true;
  player.speed = 0;
  player.car = null;
}

function doPunch(state) {
  const { player, cops, peds } = state;
  if (player.punchCd > 0 || !player.onFoot) return;
  player.punchCd = PLAYER.punchCooldown;
  state.events.push('punch');
  const fx = Math.sin(player.heading);
  const fz = Math.cos(player.heading);
  const hit = (tx, tz, range) => {
    const dx = tx - player.x;
    const dz = tz - player.z;
    const d = Math.hypot(dx, dz);
    if (d > range) return false;
    const dot = (dx * fx + dz * fz) / Math.max(0.001, d);
    return dot > 0.3;
  };
  for (const cop of cops) {
    if (cop.down) continue;
    if (hit(cop.x, cop.z, PLAYER.punchRange)) {
      cop.hp -= PLAYER.punchDamage;
      state.addWanted(1, 'punch-cop');
      if (cop.hp <= 0) {
        cop.down = true;
        cop.downTimer = 10;
      }
      return;
    }
  }
  for (const ped of peds) {
    if (ped.down) continue;
    if (hit(ped.x, ped.z, PLAYER.punchRange)) {
      ped.down = true;
      ped.downTimer = 8;
      state.addWanted(1, 'hit-ped');
      return;
    }
  }
}

function doShoot(state) {
  const { player, cops, cars, peds } = state;
  if (player.shootCd > 0 || player.ammo <= 0 || !player.onFoot) return;
  player.shootCd = PLAYER.pistolCooldown;
  player.ammo -= 1;
  state.events.push('shoot');
  const fx = Math.sin(player.heading);
  const fz = Math.cos(player.heading);
  const ox = player.x;
  const oz = player.z;
  let best = null;
  let bestD = PLAYER.pistolRange;
  let bestKind = null;
  const consider = (tx, tz, kind, obj) => {
    const dx = tx - ox;
    const dz = tz - oz;
    const d = Math.hypot(dx, dz);
    if (d > bestD) return;
    const dot = (dx * fx + dz * fz) / Math.max(0.001, d);
    if (dot < 0.985) return; // ~10 degrees of aim
    bestD = d;
    best = obj;
    bestKind = kind;
  };
  for (const cop of cops) if (!cop.down) consider(cop.x, cop.z, 'cop', cop);
  for (const car of cars) {
    if (car.isPlayer) continue;
    consider(car.x, car.z, car.isPolice ? 'patrol' : 'car', car);
  }
  for (const ped of peds) if (!ped.down) consider(ped.x, ped.z, 'ped', ped);
  state.tracer = { x0: ox, z0: oz, x1: ox + fx * bestD, z1: oz + fz * bestD, ttl: 0.09 };
  if (!best) return;
  state.addWanted(1, 'shoot');
  if (bestKind === 'cop') {
    best.hp -= PLAYER.pistolDamage;
    if (best.hp <= 0) {
      best.down = true;
      best.downTimer = 10;
    }
  } else if (bestKind === 'patrol') {
    best.hp -= PLAYER.pistolDamage;
    if (best.hp <= 0) {
      best.disabled = true;
      best.disabledTimer = 12;
      best.speed = 0;
    }
  } else if (bestKind === 'ped') {
    best.down = true;
    best.downTimer = 8;
  }
}
