// Cars: building them from boxes, traffic that cruises the road grid, police
// cars that chase the player, and the arcade driving model for the car the
// player is in. A car is { mesh, x, z, heading, speed, colour, police, ... }.
import { CAR, CITY, PALETTE, TRAFFIC_COUNT } from './config.js';
import { pick, range } from './random.js';

function buildCarMesh(colour, police) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: colour });
  const body = new THREE.Mesh(new THREE.BoxGeometry(CAR.width, 0.85, CAR.length), bodyMat);
  body.position.y = 0.65;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(CAR.width - 0.35, 0.7, CAR.length * 0.45),
    new THREE.MeshLambertMaterial({ color: 0x1c2733 }),
  );
  cabin.position.set(0, 1.35, -0.25);
  cabin.castShadow = true;
  group.add(cabin);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10);
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.42, wz);
    group.add(wheel);
  }
  // Headlights.
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6c8 });
  for (const wx of [-0.65, 0.65]) {
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.1), lightMat);
    light.position.set(wx, 0.7, CAR.length / 2 + 0.02);
    group.add(light);
  }
  if (police) {
    const barMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.18, 0.4), barMat);
    bar.position.set(0, 1.85, -0.25);
    group.add(bar);
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(CAR.width + 0.02, 0.3, CAR.length + 0.02),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    stripe.position.y = 0.65;
    group.add(stripe);
  }
  return group;
}

/** A fresh car object at a road position, not yet added to a scene. */
export function makeCar(random, opts) {
  const police = !!opts.police;
  const colour = police ? PALETTE.police : (opts.colour ?? pick(random, PALETTE.car));
  const mesh = buildCarMesh(colour, police);
  return {
    mesh, x: opts.x ?? 0, z: opts.z ?? 0, heading: opts.heading ?? 0,
    speed: 0, colour, police, traffic: !!opts.traffic, taxi: !!opts.taxi,
    // Traffic state: which road axis it follows and which way.
    axis: opts.axis ?? 'x', dir: opts.dir ?? 1, cruise: opts.cruise ?? range(random, 9, 14),
    steer: 0, alive: true, driver: null, ramCooldown: 0,
  };
}

/** Place a car mesh from its state. */
export function syncCarMesh(car) {
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
}

/** Spawn traffic cars spread over the road grid. */
export function createTraffic(random, scene) {
  const cars = [];
  for (let i = 0; i < TRAFFIC_COUNT; i += 1) {
    const road = pick(random, CITY.roads) * CITY.pitch;
    const axis = random() < 0.5 ? 'x' : 'z';
    const lane = (random() < 0.5 ? -3.5 : 3.5);
    const along = range(random, -CITY.half, CITY.half);
    const car = makeCar(random, {
      traffic: true,
      taxi: random() < 0.15,
      axis, dir: random() < 0.5 ? 1 : -1,
      x: axis === 'x' ? along : road + lane,
      z: axis === 'x' ? road + lane : along,
      heading: axis === 'x' ? (0) : Math.PI / 2,
      colour: random() < 0.15 ? PALETTE.taxi : undefined,
    });
    car.heading = axis === 'x' ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (car.dir > 0 ? 0 : Math.PI);
    car.speed = car.cruise;
    syncCarMesh(car);
    scene.add(car.mesh);
    cars.push(car);
  }
  return cars;
}

/** Move traffic along its road; wrap around the city edge. */
export function stepTraffic(cars, dt) {
  for (const car of cars) {
    if (!car.alive) continue;
    // Heading encodes the direction: move along the heading vector.
    car.x += Math.sin(car.heading) * car.speed * dt;
    car.z += Math.cos(car.heading) * car.speed * dt;
    if (car.x > CITY.half + 20) car.x = -CITY.half - 20;
    if (car.x < -CITY.half - 20) car.x = CITY.half + 20;
    if (car.z > CITY.half + 20) car.z = -CITY.half - 20;
    if (car.z < -CITY.half - 20) car.z = CITY.half + 20;
    syncCarMesh(car);
  }
}

/**
 * Arcade driving for the player's car. `throttle` -1..1, `steer` -1..1.
 * Returns true when the car hit something hard (for sound/shake).
 */
export function driveCar(car, throttle, steer, dt, collide) {
  const forward = throttle > 0 ? CAR.accel * throttle : (throttle < 0 ? -CAR.brake : 0);
  const reversing = car.speed < 0.5 && throttle < 0;
  if (reversing) car.speed -= CAR.reverseAccel * dt;
  else {
    car.speed += forward * dt;
    if (throttle === 0) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 8 * dt);
  }
  car.speed = Math.max(-CAR.maxReverse, Math.min(CAR.maxSpeed, car.speed));
  const steerAmount = steer * CAR.steer * Math.min(1, Math.abs(car.speed) / 8) * (car.speed < 0 ? -1 : 1);
  car.heading += steerAmount * dt * (Math.abs(car.speed) > 0.5 ? 1 : 0);
  const nx = car.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.z + Math.cos(car.heading) * car.speed * dt;
  const hit = collide(nx, nz, CAR.length / 2 + 0.4);
  if (hit) {
    car.speed *= -0.25;
    return true;
  }
  car.x = nx;
  car.z = nz;
  syncCarMesh(car);
  return false;
}

/** Steer a police car toward the player and ram. Returns true on a hard hit. */
export function chasePlayer(car, px, pz, dt, collide) {
  const dx = px - car.x;
  const dz = pz - car.z;
  const dist = Math.hypot(dx, dz) || 1;
  const want = Math.atan2(dx, dz);
  let diff = want - car.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  car.heading += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
  car.speed = Math.min(car.speed + 22 * dt, 38);
  const nx = car.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.z + Math.cos(car.heading) * car.speed * dt;
  if (collide(nx, nz, CAR.length / 2 + 0.4)) {
    car.speed *= -0.2;
    return true;
  }
  car.x = nx;
  car.z = nz;
  syncCarMesh(car);
  return dist < 3.2;
}
