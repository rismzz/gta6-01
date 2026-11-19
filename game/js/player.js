// player.js — Danny Vale on foot: a distinct figure (teal shirt, cap), camera-relative
// movement with sprint, limb-swing animation, health and armor, and the damage rules
// (armor soaks two thirds until it is gone).

import * as THREE from 'three';
import { clamp, lerp } from './config.js';
import { collideCircle } from './world.js';

function createPlayerMesh() {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: 0x18b8a6 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
  const jeans = new THREE.MeshLambertMaterial({ color: 0x2b3a67 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.7, 0.32), shirt);
  torso.position.y = 1.14; torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.35, 0.31), skin);
  head.position.y = 1.69;
  g.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.09, 0.34),
    new THREE.MeshLambertMaterial({ color: 0xff5147 }));
  cap.position.y = 1.9;
  g.add(cap);
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.04, 0.22),
    new THREE.MeshLambertMaterial({ color: 0xff5147 }));
  brim.position.set(0, 1.86, 0.26);
  g.add(brim);
  const limbs = {};
  for (const side of [-1, 1]) {
    const legPivot = new THREE.Group();
    legPivot.position.set(side * 0.15, 0.84, 0);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.82, 0.21), jeans);
    leg.position.y = -0.41;
    legPivot.add(leg);
    g.add(legPivot);
    const armPivot = new THREE.Group();
    armPivot.position.set(side * 0.36, 1.42, 0);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.64, 0.16), shirt);
    arm.position.y = -0.29;
    armPivot.add(arm);
    g.add(armPivot);
    limbs[side < 0 ? 'legL' : 'legR'] = legPivot;
    limbs[side < 0 ? 'armL' : 'armR'] = armPivot;
  }
  g.userData.limbs = limbs;
  return g;
}

export class Player {
  constructor(scene) {
    this.mesh = createPlayerMesh();
    scene.add(this.mesh);
    this.x = 0; this.z = 0; this.heading = 0;
    this.vx = 0; this.vz = 0;
    this.phase = 0;
    this.health = 100;
    this.armor = 0;
    this.inCar = null;
    this.dead = false;
    this.punchTimer = 0;
    this.regenTimer = 0;
  }

  get pos() { return { x: this.x, z: this.z }; }

  placeAt(x, z, heading = 0) {
    this.x = x; this.z = z; this.heading = heading;
    this.vx = 0; this.vz = 0;
    this.syncMesh();
  }

  syncMesh() {
    if (this.inCar) {
      this.mesh.visible = false;
      this.x = this.inCar.x; this.z = this.inCar.z;
      return;
    }
    this.mesh.visible = true;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
  }

  // moveX/moveZ: desired direction in world space (already camera-relative), length 0..1.
  update(dt, moveX, moveZ, sprint, colliders) {
    if (this.inCar || this.dead) { this.syncMesh(); return; }
    const len = Math.hypot(moveX, moveZ);
    const maxSpeed = sprint ? 7.2 : 4.3;
    let tx = 0, tz = 0;
    if (len > 0.05) {
      tx = (moveX / len) * maxSpeed * Math.min(1, len);
      tz = (moveZ / len) * maxSpeed * Math.min(1, len);
      const want = Math.atan2(moveX, moveZ);
      let dh = want - this.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      this.heading += clamp(dh, -10 * dt, 10 * dt);
    }
    const blend = 1 - Math.pow(0.00005, dt);
    this.vx = lerp(this.vx, tx, blend);
    this.vz = lerp(this.vz, tz, blend);
    const nx = this.x + this.vx * dt;
    const nz = this.z + this.vz * dt;
    const solved = collideCircle(colliders, nx, nz, 0.45);
    this.x = solved.x; this.z = solved.z;
    const speed = Math.hypot(this.vx, this.vz);
    this.phase += dt * speed * 1.9;
    const swing = Math.sin(this.phase) * 0.6 * clamp(speed / 4.3, 0, 1.5);
    const L = this.mesh.userData.limbs;
    if (this.punchTimer > 0) {
      this.punchTimer -= dt;
      L.armR.rotation.x = -2.1 * Math.sin((this.punchTimer / 0.28) * Math.PI);
      L.armL.rotation.x = -swing * 0.7;
      L.legL.rotation.x = swing; L.legR.rotation.x = -swing;
    } else {
      L.legL.rotation.x = swing; L.legR.rotation.x = -swing;
      L.armL.rotation.x = -swing * 0.75; L.armR.rotation.x = swing * 0.75;
    }
    // slow health regen up to 55 after 6 quiet seconds — the bay is forgiving, a little
    this.regenTimer += dt;
    if (this.regenTimer > 6 && this.health > 0 && this.health < 55) {
      this.health = Math.min(55, this.health + 3.5 * dt);
    }
    this.syncMesh();
  }

  punch() { this.punchTimer = 0.28; }

  // Armor absorbs two thirds while it lasts. Returns true when this hit kills.
  takeDamage(amount) {
    if (this.dead) return false;
    this.regenTimer = 0;
    if (this.armor > 0) {
      const soaked = Math.min(this.armor, amount * 0.66);
      this.armor -= soaked;
      amount -= soaked;
    }
    this.health -= amount;
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      return true;
    }
    return false;
  }

  heal(amount) { this.health = clamp(this.health + amount, 0, 100); }

  // Current ground speed in m/s (the car's speed while driving) — the HUD speedo reads it.
  speedNow() {
    if (this.inCar) return Math.abs(this.inCar.speed);
    return Math.hypot(this.vx, this.vz);
  }
}
