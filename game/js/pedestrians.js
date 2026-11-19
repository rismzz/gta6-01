// pedestrians.js — Coral Bay's walkers: simple articulated figures who stroll the sidewalks,
// flee from trouble, and fall when a car finds them. They keep to the pavements by walking
// block edges, and recycle around the player so the streets near you are never empty.

import * as THREE from 'three';
import { CITY, PED_SHIRTS, blockCenter, clamp, lerp, makeRng, pickRandom } from './config.js';
import { collideCircle } from './world.js';

const skinTones = [0xf2c49b, 0xd9a066, 0xa06a3b, 0x6e4525, 0xffdbac];
const legMat = new THREE.MeshLambertMaterial({ color: 0x2e3440 });
const legMat2 = new THREE.MeshLambertMaterial({ color: 0x5a4632 });

// One walker: swinging legs and arms around a torso, a head, flat-shaded and cheap.
export function createPedMesh(rng) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: pickRandom(PED_SHIRTS, rng) });
  const skin = new THREE.MeshLambertMaterial({ color: pickRandom(skinTones, rng) });
  const legs = rng() < 0.5 ? legMat : legMat2;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.68, 0.3), shirt);
  torso.position.y = 1.12; torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.34, 0.3), skin);
  head.position.y = 1.66;
  g.add(head);
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.32),
    new THREE.MeshLambertMaterial({ color: pickRandom([0x1c1410, 0x3a2a18, 0x777777, 0xb5893c], rng) }));
  hair.position.y = 1.85;
  g.add(hair);
  const limbs = {};
  for (const side of [-1, 1]) {
    const legPivot = new THREE.Group();
    legPivot.position.set(side * 0.14, 0.82, 0);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.8, 0.2), legs);
    leg.position.y = -0.4;
    legPivot.add(leg);
    g.add(legPivot);
    const armPivot = new THREE.Group();
    armPivot.position.set(side * 0.34, 1.4, 0);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.62, 0.15), shirt);
    arm.position.y = -0.28;
    armPivot.add(arm);
    g.add(armPivot);
    limbs[side < 0 ? 'legL' : 'legR'] = legPivot;
    limbs[side < 0 ? 'armL' : 'armR'] = armPivot;
  }
  g.userData.limbs = limbs;
  return g;
}

class Ped {
  constructor(scene, colliders, rng) {
    this.mesh = createPedMesh(rng);
    scene.add(this.mesh);
    this.colliders = colliders;
    this.rng = rng;
    this.x = 0; this.z = 0; this.heading = 0;
    this.speed = 0; this.phase = rng() * 6;
    this.state = 'walk';           // walk | flee | down
    this.target = null;
    this.fleeFrom = null;
    this.stateTimer = 0;
    this.downTimer = 0;
    this.walkSpeed = 1.1 + rng() * 0.7;
  }

  placeAt(x, z) {
    this.x = x; this.z = z;
    this.state = 'walk';
    this.mesh.rotation.set(0, this.heading, 0);
    this.mesh.position.set(x, 0, z);
    this.pickTarget();
  }

  // A new stroll goal: a point on some block's edge, so walkers trace the pavements.
  pickTarget() {
    const rng = this.rng;
    const col = Math.floor(rng() * CITY.cols);
    const row = Math.floor(rng() * CITY.rows);
    const c = blockCenter(col, row);
    const half = CITY.blockSize / 2 + 2.2;
    const side = Math.floor(rng() * 4);
    const t = (rng() - 0.5) * 2 * half;
    if (side === 0) this.target = { x: c.x + t, z: c.z - half };
    else if (side === 1) this.target = { x: c.x + t, z: c.z + half };
    else if (side === 2) this.target = { x: c.x - half, z: c.z + t };
    else this.target = { x: c.x + half, z: c.z + t };
  }

  knockDown() {
    if (this.state === 'down') return;
    this.state = 'down';
    this.downTimer = 7;
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = 0.25;
  }

  startle(fromX, fromZ) {
    if (this.state === 'down') return;
    this.state = 'flee';
    this.fleeFrom = { x: fromX, z: fromZ };
    this.stateTimer = 3 + this.rng() * 2;
  }

  update(dt) {
    if (this.state === 'down') {
      this.downTimer -= dt;
      return this.downTimer > 0;   // false asks the system to recycle this ped
    }
    let targetSpeed = this.walkSpeed;
    let goal = this.target;
    if (this.state === 'flee') {
      this.stateTimer -= dt;
      targetSpeed = 3.6;
      const dx = this.x - this.fleeFrom.x, dz = this.z - this.fleeFrom.z;
      const d = Math.hypot(dx, dz) || 1;
      goal = { x: this.x + (dx / d) * 14, z: this.z + (dz / d) * 14 };
      if (this.stateTimer <= 0) { this.state = 'walk'; this.pickTarget(); }
    } else if (!goal || Math.hypot(goal.x - this.x, goal.z - this.z) < 1.6) {
      this.pickTarget();
      goal = this.target;
    }
    const want = Math.atan2(goal.x - this.x, goal.z - this.z);
    let dh = want - this.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    this.heading += clamp(dh, -3.2 * dt, 3.2 * dt);
    this.speed = lerp(this.speed, targetSpeed, 1 - Math.pow(0.001, dt));
    const nx = this.x + Math.sin(this.heading) * this.speed * dt;
    const nz = this.z + Math.cos(this.heading) * this.speed * dt;
    const solved = collideCircle(this.colliders, nx, nz, 0.42);
    if (solved.hit && this.state === 'walk') this.pickTarget();
    this.x = solved.x; this.z = solved.z;
    this.phase += dt * this.speed * 3.4;
    const swing = Math.sin(this.phase) * 0.55 * clamp(this.speed / 1.6, 0, 1.6);
    const L = this.mesh.userData.limbs;
    L.legL.rotation.x = swing; L.legR.rotation.x = -swing;
    L.armL.rotation.x = -swing * 0.8; L.armR.rotation.x = swing * 0.8;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    return true;
  }
}

export class PedestrianSystem {
  constructor(scene, colliders, seed = 33) {
    this.scene = scene;
    this.colliders = colliders;
    this.rng = makeRng(seed * 977 + 5);
    this.peds = [];
    this.count = 42;
    for (let i = 0; i < this.count; i++) {
      const p = new Ped(scene, colliders, this.rng);
      const spot = this.sidewalkSpot(null);
      p.placeAt(spot.x, spot.z);
      this.peds.push(p);
    }
  }

  sidewalkSpot(near) {
    const rng = this.rng;
    for (let tries = 0; tries < 10; tries++) {
      const col = Math.floor(rng() * CITY.cols);
      const row = Math.floor(rng() * CITY.rows);
      const c = blockCenter(col, row);
      const half = CITY.blockSize / 2 + 2.2;
      const x = c.x + (rng() - 0.5) * 2 * half;
      const z = c.z + (rng() < 0.5 ? -half : half);
      if (!near || Math.hypot(x - near.x, z - near.z) > 45) return { x, z };
    }
    return { x: 0, z: 0 };
  }

  // vehicles: every Vehicle that might run someone over. onPedHit(ped, vehicle) reports crimes.
  update(dt, playerPos, vehicles, onPedHit) {
    for (const p of this.peds) {
      const distPlayer = Math.hypot(p.x - playerPos.x, p.z - playerPos.z);
      if (distPlayer > 170) {
        const spot = this.sidewalkSpot(playerPos);
        p.placeAt(spot.x, spot.z);
        continue;
      }
      if (!p.update(dt)) {
        const spot = this.sidewalkSpot(playerPos);
        p.placeAt(spot.x, spot.z);
        continue;
      }
      if (p.state !== 'down') {
        for (const v of vehicles) {
          if (Math.abs(v.speed) < 3.5) continue;
          const dx = p.x - v.x, dz = p.z - v.z;
          if (dx * dx + dz * dz < 2.1) {
            p.knockDown();
            if (onPedHit) onPedHit(p, v);
            break;
          }
        }
      }
    }
  }

  startleAround(x, z, radius) {
    for (const p of this.peds) {
      if (Math.hypot(p.x - x, p.z - z) < radius) p.startle(x, z);
    }
  }

  nearest(x, z, maxDist) {
    let best = null, bestD = maxDist;
    for (const p of this.peds) {
      if (p.state === 'down') continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }
}

