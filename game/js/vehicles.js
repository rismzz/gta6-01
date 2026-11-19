// vehicles.js — builds every car mesh in Coral Bay, the arcade driving model the player
// uses, and the traffic system that keeps the streets moving on its own.

import * as THREE from 'three';
import { CAR_MODELS, CAR_COLORS, CITY, TUNING, clamp, lerp, makeRng, pickRandom, roadX, roadZ } from './config.js';
import { collideCircle } from './world.js';

const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 12);
const wheelMat = new THREE.MeshLambertMaterial({ color: 0x14161a });
const glassMat = new THREE.MeshPhongMaterial({ color: 0x1c2f3d, shininess: 90 });
const trimMat = new THREE.MeshLambertMaterial({ color: 0x22262b });
const headlightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
const taillightMat = new THREE.MeshBasicMaterial({ color: 0xff3524 });

// One car, built from boxes: lower body, cabin, wheels, lights. Police and taxi liveries
// are dressed versions of the same shapes. Length ~4.4 m, width ~1.9 m.
export function createCarMesh(modelIndex, colorHex, livery = 'civilian') {
  const g = new THREE.Group();
  const isVan = modelIndex === 4;
  const isBuggy = modelIndex === 6;
  const bodyMat = new THREE.MeshPhongMaterial({ color: colorHex, shininess: 60 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, isVan ? 1.15 : 0.62, 4.4), bodyMat);
  body.position.y = isVan ? 1.0 : 0.72;
  body.castShadow = true;
  g.add(body);
  if (!isVan) {
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.55, isBuggy ? 1.6 : 2.1), isBuggy ? trimMat : glassMat);
    cabin.position.set(0, 1.28, isBuggy ? -0.2 : -0.25);
    cabin.castShadow = true;
    g.add(cabin);
  } else {
    const cabGlass = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 0.5), glassMat);
    cabGlass.position.set(0, 1.45, 1.85);
    g.add(cabGlass);
  }
  const bumperF = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.3, 0.35), trimMat);
  bumperF.position.set(0, 0.42, 2.25); g.add(bumperF);
  const bumperB = bumperF.clone(); bumperB.position.z = -2.25; g.add(bumperB);
  const wheelPos = [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]];
  const wheels = [];
  for (const [wx, wz] of wheelPos) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.36, wz);
    g.add(w); wheels.push(w);
  }
  for (const sx of [-0.62, 0.62]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.06), headlightMat);
    hl.position.set(sx, 0.78, 2.21); g.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.06), taillightMat);
    tl.position.set(sx, 0.82, -2.21); g.add(tl);
  }
  if (livery === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.24, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xffd23e }));
    sign.position.set(0, 1.68, -0.25); g.add(sign);
    bodyMat.color.set(0xf2b13e);
  }
  if (livery === 'police') {
    bodyMat.color.set(0xf2f4f6);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.3, 4.42),
      new THREE.MeshLambertMaterial({ color: 0x2456c8 }));
    stripe.position.y = 0.78; g.add(stripe);
    const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 0.5), trimMat);
    barBase.position.set(0, 1.62, -0.25); g.add(barBase);
    const lightL = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.44),
      new THREE.MeshBasicMaterial({ color: 0xff3524 }));
    lightL.position.set(-0.31, 1.74, -0.25); g.add(lightL);
    const lightR = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.44),
      new THREE.MeshBasicMaterial({ color: 0x3e7ad8 }));
    lightR.position.set(0.31, 1.74, -0.25); g.add(lightR);
    g.userData.lightBar = [lightL, lightR];
  }
  g.userData.wheels = wheels;
  g.userData.bodyMat = bodyMat;
  return g;
}

// A vehicle in the world: transform, speed, damage, and who is driving it.
export class Vehicle {
  constructor(scene, modelIndex, colorHex, x, z, heading, livery = 'civilian') {
    this.model = CAR_MODELS[modelIndex];
    this.modelIndex = modelIndex;
    this.livery = livery;
    this.mesh = createCarMesh(modelIndex, colorHex, livery);
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
    scene.add(this.mesh);
    this.x = x; this.z = z; this.heading = heading;
    this.speed = 0;
    this.health = 100;
    this.steer = 0;
    this.driver = null;          // 'player' | 'traffic' | 'police' | null (parked)
    this.dead = false;           // engine wrecked
    this.smokeTimer = 0;
    this.honkTimer = 0;
  }

  get pos() { return this.mesh.position; }
  forwardX() { return Math.sin(this.heading); }
  forwardZ() { return Math.cos(this.heading); }

  syncMesh() {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    const spin = this.speed * 0.11;
    for (const w of this.mesh.userData.wheels) w.rotation.x += spin;
    const steerAngle = this.steer * 0.45;
    const wheels = this.mesh.userData.wheels;
    wheels[0].rotation.y = steerAngle; wheels[1].rotation.y = steerAngle;
  }

  damage(amount) {
    if (this.dead) return;
    this.health -= amount;
    if (this.health <= 35 && this.health > 0) this.mesh.userData.bodyMat.color.multiplyScalar(0.92);
    if (this.health <= 0) { this.health = 0; this.dead = true; }
  }
}

// The player's driving model: throttle, brake/reverse, speed-sensitive steering,
// handbrake slides, building collisions and a damage bill for hard hits.
// input = { throttle: -1..1, steer: -1..1, handbrake: bool }
// Returns the impact speed of any crash this step (0 when none) so callers can
// play sounds, shake the camera and charge wanted heat.
export function driveVehicle(vehicle, input, dt, colliders, audio) {
  const m = vehicle.model;
  let impact = 0;
  if (vehicle.dead) input = { throttle: 0, steer: 0, handbrake: true };
  const accel = input.throttle > 0 ? m.accel : m.accel * 0.62;
  if (input.throttle !== 0) {
    vehicle.speed += input.throttle * accel * dt * (vehicle.speed * input.throttle < 0 ? 2.1 : 1);
  } else {
    vehicle.speed -= vehicle.speed * 0.55 * dt;                    // engine braking
  }
  // aerodynamic drag, tuned per model so terminal velocity lands just under topSpeed
  const dragK = (m.accel * 0.85) / (m.topSpeed * m.topSpeed);
  vehicle.speed -= vehicle.speed * Math.abs(vehicle.speed) * dragK * dt;
  if (input.handbrake) vehicle.speed -= vehicle.speed * 2.4 * dt;
  vehicle.speed = clamp(vehicle.speed, -m.topSpeed * 0.42, m.topSpeed);
  if (Math.abs(vehicle.speed) < 0.04 && input.throttle === 0) vehicle.speed = 0;

  const steerTarget = input.steer * (input.handbrake ? 1.25 : 1);
  vehicle.steer = lerp(vehicle.steer, steerTarget, 1 - Math.pow(0.0001, dt));
  const speedFactor = clamp(Math.abs(vehicle.speed) / 9, 0, 1) * (1 - clamp(Math.abs(vehicle.speed) / (m.topSpeed * 2.4), 0, 0.55));
  vehicle.heading += vehicle.steer * 1.65 * speedFactor * dt * Math.sign(vehicle.speed) * (m.grip * 0.5 + 0.55);

  const nx = vehicle.x + vehicle.forwardX() * vehicle.speed * dt;
  const nz = vehicle.z + vehicle.forwardZ() * vehicle.speed * dt;
  const before = { x: vehicle.x, z: vehicle.z };
  const solved = collideCircle(colliders, nx, nz, 1.75);
  if (solved.hit) {
    impact = Math.abs(vehicle.speed);
    if (impact > 5) {
      vehicle.damage((impact - 4) * 1.5);
      if (audio) audio.crash(clamp(impact / 22, 0.2, 1));
    }
    vehicle.speed *= -0.18;
    vehicle.x = solved.x; vehicle.z = solved.z;
  } else {
    vehicle.x = nx; vehicle.z = nz;
  }
  // stay inside the island
  const limX = CITY.width / 2 + 66, limZ = CITY.depth / 2 + 46;
  vehicle.x = clamp(vehicle.x, -limX, limX);
  vehicle.z = clamp(vehicle.z, -CITY.depth / 2 - 40, limZ);
  if (vehicle.z > CITY.depth / 2 + 34 && Math.abs(vehicle.speed) > 0) vehicle.speed *= 0.92; // sand, then sea
  vehicle.syncMesh();
  return { impact, moved: Math.hypot(vehicle.x - before.x, vehicle.z - before.z) };
}

// Soft car-to-car resolution: overlapping circles push apart and trade a little speed.
export function resolveCarOverlap(a, b, audio) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const d = Math.hypot(dx, dz);
  const minD = 3.1;
  if (d === 0 || d >= minD) return 0;
  const push = (minD - d) / 2;
  const ux = dx / d, uz = dz / d;
  a.x -= ux * push; a.z -= uz * push;
  b.x += ux * push; b.z += uz * push;
  const rel = Math.abs(a.speed - b.speed);
  if (rel > 4) {
    a.damage(rel * 0.5); b.damage(rel * 0.5);
    if (audio) audio.crash(clamp(rel / 20, 0.2, 0.9));
  }
  const avg = (a.speed + b.speed) / 2;
  a.speed = lerp(a.speed, avg, 0.4);
  b.speed = lerp(b.speed, avg, 0.4);
  a.syncMesh(); b.syncMesh();
  return rel;
}

// ---------------------------------------------------------------------------
// Traffic. Cars follow the road grid in right-hand lanes, choose turns at
// junctions, brake for whatever is in front of them, and recycle themselves
// when the player leaves them behind.
// ---------------------------------------------------------------------------

const LANE = CITY.roadWidth / 4;   // 3.5 m from the centreline
const ROAD_XS = Array.from({ length: CITY.cols + 1 }, (_, i) => roadX(i));
const ROAD_ZS = Array.from({ length: CITY.rows + 1 }, (_, j) => roadZ(j));

function nextJunctionIndex(axis, dir, along) {
  const lines = axis === 'x' ? ROAD_XS : ROAD_ZS;
  if (dir > 0) {
    for (let i = 0; i < lines.length; i++) if (lines[i] > along + 1) return i;
    return lines.length - 1;
  }
  for (let i = lines.length - 1; i >= 0; i--) if (lines[i] < along - 1) return i;
  return 0;
}

export class TrafficSystem {
  constructor(scene, colliders, seed = 21) {
    this.scene = scene;
    this.colliders = colliders;
    this.rng = makeRng(seed * 331 + 7);
    this.cars = [];
    this.count = 16;
    for (let i = 0; i < this.count; i++) this.cars.push(this.spawnCar(null, true));
  }

  spawnCar(playerPos, anywhere = false) {
    const rng = this.rng;
    let x = 0, z = 0, axis = 'x', road = 0, dir = 1;
    for (let tries = 0; tries < 12; tries++) {
      axis = rng() < 0.5 ? 'x' : 'z';
      dir = rng() < 0.5 ? 1 : -1;
      if (axis === 'x') {
        road = Math.floor(rng() * (CITY.rows + 1));
        x = (rng() - 0.5) * CITY.width * 0.94;
        z = roadZ(road) + (dir > 0 ? LANE : -LANE);
      } else {
        road = Math.floor(rng() * (CITY.cols + 1));
        z = (rng() - 0.5) * CITY.depth * 0.94;
        x = roadX(road) + (dir > 0 ? -LANE : LANE);
      }
      if (!playerPos) break;
      const d = Math.hypot(x - playerPos.x, z - playerPos.z);
      if (anywhere ? d > 30 : (d > 110 && d < 190)) break;
    }
    const isTaxi = rng() < 0.22;
    const modelIndex = isTaxi ? 0 : Math.floor(rng() * (CAR_MODELS.length - 1));
    const color = isTaxi ? 0xf2b13e : pickRandom(CAR_COLORS, rng);
    const v = new Vehicle(this.scene, modelIndex, color, x, z, 0, isTaxi ? 'taxi' : 'civilian');
    v.driver = 'traffic';
    const heading = axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
    v.heading = heading;
    const state = {
      v, axis, road, dir,
      junction: nextJunctionIndex(axis, dir, axis === 'x' ? x : z),
      decision: null,
      cruise: 8.5 + rng() * 4.5,
      speed: 0,
    };
    v.syncMesh();
    return state;
  }

  guidePoint(s) {
    const v = s.v;
    const along = s.axis === 'x' ? v.x : v.z;
    const junctionCoord = s.axis === 'x' ? ROAD_XS[s.junction] : ROAD_ZS[s.junction];
    const distJ = (junctionCoord - along) * s.dir;
    if (s.decision && s.decision !== 'straight' && distJ < 12) {
      // aim into the lane we are turning onto, a little past the junction
      if (s.axis === 'x') {
        const zdir = s.decision === 'right' ? s.dir : -s.dir;
        return { x: roadX(s.junction) + (zdir > 0 ? -LANE : LANE), z: roadZ(s.road) + zdir * 11 };
      }
      const xdir = s.decision === 'right' ? -s.dir : s.dir;
      return { x: roadX(s.road) + xdir * 11, z: roadZ(s.junction) + (xdir > 0 ? LANE : -LANE) };
    }
    if (s.axis === 'x') return { x: v.x + s.dir * 12, z: roadZ(s.road) + (s.dir > 0 ? LANE : -LANE) };
    return { x: roadX(s.road) + (s.dir > 0 ? -LANE : LANE), z: v.z + s.dir * 12 };
  }

  commitJunction(s) {
    const v = s.v;
    if (s.decision === 'left' || s.decision === 'right') {
      if (s.axis === 'x') {
        const zdir = s.decision === 'right' ? s.dir : -s.dir;
        s.axis = 'z'; s.road = s.junction; s.dir = zdir;
      } else {
        const xdir = s.decision === 'right' ? -s.dir : s.dir;
        s.axis = 'x'; s.road = s.junction; s.dir = xdir;
      }
    }
    const along = s.axis === 'x' ? v.x : v.z;
    const next = nextJunctionIndex(s.axis, s.dir, along);
    if (next === s.junction && s.decision === 'straight') {
      s.dir = -s.dir;   // end of the island: turn around
    }
    s.junction = nextJunctionIndex(s.axis, s.dir, along);
    s.decision = null;
  }

  update(dt, playerPos, blockers) {
    const rng = this.rng;
    for (let i = 0; i < this.cars.length; i++) {
      const s = this.cars[i];
      const v = s.v;
      // recycle cars the player has left far behind (or that wrecked)
      const distPlayer = Math.hypot(v.x - playerPos.x, v.z - playerPos.z);
      if (distPlayer > 210 || v.dead) {
        this.scene.remove(v.mesh);
        this.cars[i] = this.spawnCar(playerPos);
        continue;
      }
      // decide at junctions
      const along = s.axis === 'x' ? v.x : v.z;
      const junctionCoord = s.axis === 'x' ? ROAD_XS[s.junction] : ROAD_ZS[s.junction];
      const distJ = (junctionCoord - along) * s.dir;
      if (s.decision === null && distJ < 15) {
        const r = rng();
        const atEdge = (s.dir > 0 && s.junction === (s.axis === 'x' ? CITY.cols : CITY.rows)) ||
                       (s.dir < 0 && s.junction === 0);
        s.decision = atEdge ? (r < 0.5 ? 'left' : 'right') : (r < 0.62 ? 'straight' : r < 0.81 ? 'left' : 'right');
      }
      if (distJ < 2.0) this.commitJunction(s);

      // steer toward the guide point
      const guide = this.guidePoint(s);
      const want = Math.atan2(guide.x - v.x, guide.z - v.z);
      let dh = want - v.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      const turning = Math.abs(dh) > 0.25;
      v.heading += clamp(dh, -1.9 * dt, 1.9 * dt);
      v.steer = clamp(dh * 1.6, -1, 1);

      // brake for anything ahead in the lane
      let target = turning ? s.cruise * 0.55 : s.cruise;
      const fx = v.forwardX(), fz = v.forwardZ();
      for (const b of blockers) {
        const dx = b.x - v.x, dz = b.z - v.z;
        const ahead = dx * fx + dz * fz;
        if (ahead < 0.5 || ahead > 10) continue;
        const lateral = Math.abs(dx * fz - dz * fx);
        if (lateral < 2.3) { target = Math.min(target, ahead < 5 ? 0 : s.cruise * 0.4); }
      }
      s.speed = lerp(s.speed, target, 1 - Math.pow(0.02, dt));
      v.speed = s.speed;
      v.x += fx * s.speed * dt;
      v.z += fz * s.speed * dt;
      const solved = collideCircle(this.colliders, v.x, v.z, 1.7);
      v.x = solved.x; v.z = solved.z;
      v.syncMesh();
    }
  }

  vehicles() { return this.cars.map(s => s.v); }

  // The player stole one of ours: stop driving it and forget it. Returns false
  // when the vehicle was never traffic's.
  release(vehicle) {
    const i = this.cars.findIndex(s => s.v === vehicle);
    if (i < 0) return false;
    this.cars.splice(i, 1);
    this.count--;
    return true;
  }
}


