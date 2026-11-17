// The game's rules and state: the player on foot or in a car, stealing cars,
// traffic and pedestrians, the wanted level and the police who answer it,
// combat, cash pickups, health and missions. No drawing and no DOM here:
// step() advances one fixed step and returns what happened as bit flags.
import { CAR, CITY, PICKUP_COUNT, PLAYER, STEP, WANTED } from './config.js';
import { createMissions } from './missions.js';
import { createTraffic, chasePlayer, driveCar, makeCar, stepTraffic, syncCarMesh } from './vehicles.js';
import { createPedestrians, knockDown, stepPedestrians } from './pedestrians.js';
import { pick, range } from './random.js';
import { ACTION_ENTER_CAR, ACTION_SHOOT } from './input.js';

export const EVENT_PICKUP = 1;
export const EVENT_CRASH = 2;
export const EVENT_SHOT = 4;
export const EVENT_MISSION_STEP = 8;
export const EVENT_MISSION_DONE = 16;
export const EVENT_MISSION_FAIL = 32;
export const EVENT_BUSTED = 64;
export const EVENT_CRIME = 128;

function buildPlayerMesh() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.4, 1.05, 8),
    new THREE.MeshLambertMaterial({ color: 0xc23b2e }),
  );
  body.position.y = 1.05;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0xe8b88a }),
  );
  head.position.y = 1.85;
  head.castShadow = true;
  group.add(head);
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.3, 0.12, 10),
    new THREE.MeshLambertMaterial({ color: 0x222222 }),
  );
  cap.position.y = 2.08;
  group.add(cap);
  const legs = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.55, 0.3),
    new THREE.MeshLambertMaterial({ color: 0x2a3550 }),
  );
  legs.position.y = 0.28;
  group.add(legs);
  return group;
}

function buildPickupMesh(gold) {
  const group = new THREE.Group();
  const bag = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.6, 0.9),
    new THREE.MeshLambertMaterial({ color: gold ? 0xffd23e : 0x2fae5f, emissive: gold ? 0x664400 : 0x0a3a1a }),
  );
  bag.position.y = 0.5;
  group.add(bag);
  return group;
}

export function createWorld(random, scene, city) {
  const missions = createMissions();
  const playerMesh = buildPlayerMesh();
  scene.add(playerMesh);

  const state = {
    player: { x: 0, z: 24, heading: 0, speed: 0, health: PLAYER.health },
    car: null, // the car the player is driving, or null on foot
    money: 0, wanted: 0, wantedTimer: 0, bustedTimer: 0,
    traffic: [], peds: [], police: [], parked: [], pickups: [],
    specialPickup: null, elapsed: 0, damageCooldown: 0,
    walkBob: 0, lastCompleted: null,
  };

  /** Circle vs building AABBs and the city edge; true when blocked. */
  function collide(x, z, r) {
    if (Math.abs(x) > CITY.half + 15 || Math.abs(z) > CITY.half + 15) return true;
    for (const b of city.buildings) {
      if (x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ) return true;
    }
    return false;
  }

  function nearestCar(x, z, maxDist, list) {
    let best = null;
    let bestDist = maxDist;
    for (const car of list) {
      if (!car.alive) continue;
      const d = Math.hypot(car.x - x, car.z - z);
      if (d < bestDist) { bestDist = d; best = car; }
    }
    return best;
  }

  function spawnPickups() {
    for (const p of state.pickups) scene.remove(p.mesh);
    state.pickups = [];
    const geo = new THREE.BoxGeometry(0.9, 0.6, 0.9);
    for (let i = 0; i < PICKUP_COUNT; i += 1) {
      const road = pick(random, CITY.roads) * CITY.pitch;
      const along = range(random, -CITY.half, CITY.half);
      const onX = random() < 0.5;
      const x = onX ? along : road + (random() < 0.5 ? -9 : 9);
      const z = onX ? road + (random() < 0.5 ? -9 : 9) : along;
      const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x2fae5f, emissive: 0x0a3a1a }));
      mesh.position.set(x, 0.5, z);
      scene.add(mesh);
      state.pickups.push({ mesh, x, z, active: true, value: 50 });
    }
  }

  function spawnParked() {
    for (const c of state.parked) scene.remove(c.mesh);
    state.parked = [];
    for (let i = 0; i < 7; i += 1) {
      const road = pick(random, CITY.roads) * CITY.pitch;
      const along = range(random, -CITY.half + 20, CITY.half - 20);
      const onX = random() < 0.5;
      const car = makeCar(random, {
        x: onX ? along : road + 5.5,
        z: onX ? road + 5.5 : along,
        heading: onX ? (random() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (random() < 0.5 ? 0 : Math.PI),
      });
      syncCarMesh(car);
      scene.add(car.mesh);
      state.parked.push(car);
    }
  }

  function spawnPoliceCar() {
    const angle = random() * Math.PI * 2;
    const dist = 55;
    let x = state.player.x + Math.cos(angle) * dist;
    let z = state.player.z + Math.sin(angle) * dist;
    x = Math.max(-CITY.half, Math.min(CITY.half, x));
    z = Math.max(-CITY.half, Math.min(CITY.half, z));
    const car = makeCar(random, { police: true, x, z, heading: Math.atan2(state.player.x - x, state.player.z - z) });
    car.speed = 20;
    syncCarMesh(car);
    scene.add(car.mesh);
    state.police.push(car);
    return car;
  }

  function removePoliceCar(car) {
    scene.remove(car.mesh);
    state.police = state.police.filter((c) => c !== car);
  }

  function addWanted(n) {
    state.wanted = Math.max(0, Math.min(WANTED.maxStars, state.wanted + n));
    state.wantedTimer = 0;
  }

  function setSpecialPickup(target) {
    if (state.specialPickup) scene.remove(state.specialPickup.mesh);
    if (!target) { state.specialPickup = null; return; }
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.7, 1.1),
      new THREE.MeshLambertMaterial({ color: 0xffd23e, emissive: 0x664400 }),
    );
    mesh.position.set(target.x, 0.55, target.z);
    scene.add(mesh);
    state.specialPickup = { mesh, x: target.x, z: target.z, active: true, value: 500 };
  }

  function reset() {
    for (const c of state.traffic) scene.remove(c.mesh);
    for (const p of state.peds) scene.remove(p.mesh);
    for (const c of state.police) scene.remove(c.mesh);
    if (state.car) { scene.remove(state.car.mesh); state.car = null; }
    state.traffic = createTraffic(random, scene);
    state.peds = createPedestrians(random, scene);
    state.police = [];
    state.player.x = 0;
    state.player.z = 24;
    state.player.heading = 0;
    state.player.speed = 0;
    state.player.health = PLAYER.health;
    state.money = 0;
    state.wanted = 0;
    state.wantedTimer = 0;
    state.elapsed = 0;
    missions.reset();
    spawnParked();
    spawnPickups();
    setSpecialPickup(null);
  }

  function enterCar() {
    const p = state.player;
    const car = nearestCar(p.x, p.z, 5.5, [...state.parked, ...state.traffic]);
    if (!car) return false;
    // Take the car out of traffic / parked lists.
    state.traffic = state.traffic.filter((c) => c !== car);
    state.parked = state.parked.filter((c) => c !== car);
    car.traffic = false;
    state.car = car;
    car.speed = 0;
    return true;
  }

  function exitCar() {
    const car = state.car;
    if (!car) return;
    const p = state.player;
    p.x = car.x + Math.sin(car.heading + Math.PI / 2) * 2.5;
    p.z = car.z + Math.cos(car.heading + Math.PI / 2) * 2.5;
    p.heading = car.heading;
    car.speed = 0;
    state.parked.push(car);
    state.car = null;
  }

  function shoot() {
    const p = state.player;
    const fx = Math.sin(p.heading);
    const fz = Math.cos(p.heading);
    let best = null;
    let bestScore = Infinity;
    for (const ped of state.peds) {
      if (!ped.alive) continue;
      const dx = ped.x - p.x;
      const dz = ped.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > 30 || d < 0.5) continue;
      const dot = (dx * fx + dz * fz) / d;
      if (dot < 0.82) continue;
      const score = d + (1 - dot) * 20;
      if (score < bestScore) { bestScore = score; best = { kind: 'ped', target: ped }; }
    }
    for (const car of state.police) {
      const dx = car.x - p.x;
      const dz = car.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > 30 || d < 0.5) continue;
      const dot = (dx * fx + dz * fz) / d;
      if (dot < 0.82) continue;
      const score = d + (1 - dot) * 20;
      if (score < bestScore) { bestScore = score; best = { kind: 'police', target: car }; }
    }
    if (best && best.kind === 'ped') {
      knockDown(best.target, scene);
      state.money += 25;
      addWanted(1);
      return EVENT_SHOT | EVENT_CRIME;
    }
    if (best && best.kind === 'police') {
      addWanted(1);
      return EVENT_SHOT | EVENT_CRIME;
    }
    return EVENT_SHOT;
  }

  /**
   * One fixed step. `input` is the input state, `actions` the one-shot flags.
   * Returns event bit flags for sound and screen effects.
   */
  function step(dt, input, actions) {
    let events = 0;
    state.elapsed += dt;
    if (state.damageCooldown > 0) state.damageCooldown -= dt;
    const p = state.player;
    const inCar = !!state.car;

    if (actions & ACTION_ENTER_CAR) {
      if (inCar) exitCar();
      else if (enterCar()) { addWanted(1); events |= EVENT_CRIME; }
    }
    if (actions & ACTION_SHOOT) events |= shoot();

    if (inCar) {
      const car = state.car;
      const preSpeed = car.speed;
      const hit = driveCar(car, input.throttle(), input.steer(), dt, collide);
      p.x = car.x;
      p.z = car.z;
      p.heading = car.heading;
      p.speed = car.speed;
      if (hit) {
        events |= EVENT_CRASH;
        // Only a hard impact hurts: nudging a wall at parking speed does not.
        if (Math.abs(preSpeed) > 10 && state.damageCooldown <= 0) {
          p.health -= 6;
          state.damageCooldown = 1;
        }
      }
      // Running over pedestrians is a crime.
      for (const ped of state.peds) {
        if (!ped.alive) continue;
        if (Math.hypot(ped.x - car.x, ped.z - car.z) < 2.2 && Math.abs(car.speed) > 4) {
          knockDown(ped, scene);
          state.money += 25;
          addWanted(1);
          events |= EVENT_CRIME | EVENT_CRASH;
        }
      }
      // Bumping traffic cars.
      for (const t of state.traffic) {
        if (Math.hypot(t.x - car.x, t.z - car.z) < 3.4 && Math.abs(car.speed) > 6) {
          car.speed *= 0.4;
          events |= EVENT_CRASH;
        }
      }
    } else {
      // On foot: move relative to the camera-facing heading.
      const fwd = input.throttle();
      const strafe = input.steer();
      const speed = input.run() ? PLAYER.runSpeed : PLAYER.walkSpeed;
      const mx = Math.sin(p.heading) * fwd + Math.sin(p.heading + Math.PI / 2) * strafe;
      const mz = Math.cos(p.heading) * fwd + Math.cos(p.heading + Math.PI / 2) * strafe;
      const len = Math.hypot(mx, mz);
      p.speed = 0;
      if (len > 0) {
        const nx = p.x + (mx / len) * speed * dt;
        const nz = p.z + (mz / len) * speed * dt;
        if (!collide(nx, p.z, PLAYER.radius)) p.x = nx;
        if (!collide(p.x, nz, PLAYER.radius)) p.z = nz;
        p.heading = Math.atan2(mx, mz);
        p.speed = speed;
        state.walkBob += dt * speed * 1.6;
      }
      playerMesh.position.set(p.x, Math.abs(Math.sin(state.walkBob)) * 0.06, p.z);
      playerMesh.rotation.y = p.heading;
      playerMesh.visible = true;
    }
    if (inCar) playerMesh.visible = false;

    // Traffic and pedestrians keep moving.
    stepTraffic(state.traffic, dt);
    const threat = inCar ? { x: p.x, z: p.z } : null;
    stepPedestrians(state.peds, dt, threat);

    // Wanted level: police chase; heat decays when quiet and unseen.
    const stepInfo = missions.currentStep();
    const escapeActive = stepInfo && stepInfo.type === 'escape';
    const wantPolice = WANTED.policeForStars[state.wanted] || 0;
    while (state.police.length < wantPolice) spawnPoliceCar();
    while (state.police.length > wantPolice) removePoliceCar(state.police[state.police.length - 1]);
    let policeNear = false;
    for (const cop of [...state.police]) {
      if (cop.ramCooldown > 0) cop.ramCooldown -= dt;
      const touching = chasePlayer(cop, p.x, p.z, dt, collide);
      const d = Math.hypot(cop.x - p.x, cop.z - p.z);
      if (d < 45) policeNear = true;
      if (touching) {
        events |= EVENT_CRASH;
        // A ram hurts, then that cruiser falls back for a few seconds so the
        // player can escape instead of being stun-locked to a bust.
        if (cop.ramCooldown <= 0 && state.damageCooldown <= 0) {
          p.health -= 5;
          state.damageCooldown = 1;
          cop.ramCooldown = 4;
          cop.speed = 8;
        }
      }
      if (d > 160) removePoliceCar(cop);
    }
    if (state.wanted > 0 && !escapeActive) {
      state.wantedTimer += dt;
      if (state.wantedTimer > WANTED.decaySeconds && !policeNear) {
        state.wanted -= 1;
        state.wantedTimer = 0;
      }
    } else {
      state.wantedTimer = 0;
    }
    // Catch your breath when no cruiser is close: slow health recovery.
    if (!policeNear && p.health > 0 && p.health < PLAYER.health) {
      p.health = Math.min(PLAYER.health, p.health + 3 * dt);
    }

    // Cash pickups.
    const collectR = inCar ? 3.6 : 2.4;
    for (const pk of state.pickups) {
      if (!pk.active) continue;
      if (Math.hypot(pk.x - p.x, pk.z - p.z) < collectR) {
        pk.active = false;
        pk.mesh.visible = false;
        state.money += pk.value;
        events |= EVENT_PICKUP;
      }
    }
    let collectedSpecial = false;
    if (state.specialPickup && state.specialPickup.active) {
      if (Math.hypot(state.specialPickup.x - p.x, state.specialPickup.z - p.z) < 4) {
        state.specialPickup.active = false;
        state.specialPickup.mesh.visible = false;
        state.money += state.specialPickup.value;
        collectedSpecial = true;
        events |= EVENT_PICKUP;
      }
    }

    // Mission progress.
    const wp = missions.waypoint();
    const atTarget = !!wp && Math.hypot(wp.x - p.x, wp.z - p.z) < (stepInfo?.radius ?? 9);
    // The Meridian Job raises the heat when the cash is grabbed.
    if (stepInfo && stepInfo.type === 'collect' && !state.specialPickup) {
      setSpecialPickup(stepInfo.target);
    }
    if (stepInfo && stepInfo.type === 'collect' && state.specialPickup && !state.specialPickup.active && !collectedSpecial) {
      // Bag already taken by an earlier pass; treat as collected.
    }
    const ev = missions.update(dt, { inCar, atTarget, collected: collectedSpecial });
    if (ev === 'step') events |= EVENT_MISSION_STEP;
    else if (ev === 'mission') events |= EVENT_MISSION_DONE;
    else if (ev === 'failed') events |= EVENT_MISSION_FAIL;
    const done = missions.takeCompleted();
    if (done) {
      state.money += done.payout;
      state.lastCompleted = done;
    }
    // Entering the bank step of the Meridian Job arms the cash bag + heat.
    const cur = missions.currentStep();
    if (cur && cur.type === 'collect' && !state.specialPickup) setSpecialPickup(cur.target);
    if (collectedSpecial && missions.current() && missions.current().id === 'meridian-job') {
      state.wanted = Math.max(state.wanted, 4);
    }

    // Busted: no health left.
    if (p.health <= 0) {
      events |= EVENT_BUSTED;
      p.health = PLAYER.health;
      state.money = Math.max(0, state.money - 100);
      state.wanted = 0;
      for (const cop of [...state.police]) removePoliceCar(cop);
      p.x = 0;
      p.z = 186;
      p.heading = Math.PI;
      if (state.car) {
        scene.remove(state.car.mesh);
        state.car = null;
      }
    }

    return events;
  }

  reset();
  return {
    state, missions, reset, step, addWanted, setSpecialPickup,
    get inCar() { return !!state.car; },
  };
}
