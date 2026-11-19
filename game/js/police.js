// police.js — the Coral Bay PD: a heat meter behind the stars, pursuit cars that hunt the
// player across the grid, roadblocks at four stars, and the bust meter that ends a chase
// when a cruiser pins you down.

import * as THREE from 'three';
import { TUNING, clamp, lerp, makeRng, roadX, roadZ, CITY } from './config.js';
import { Vehicle } from './vehicles.js';
import { collideCircle } from './world.js';

export class PoliceSystem {
  constructor(scene, colliders, hooks) {
    this.scene = scene;
    this.colliders = colliders;
    this.hooks = hooks;              // { onBusted(), onPlayerShot(dmg) }
    this.rng = makeRng(4242);
    this.heat = 0;
    this.cops = [];                  // [{ v: Vehicle, role: 'chase'|'block' }]
    this.bustMeter = 0;
    this.shootTimer = 0;
    this.time = 0;
  }

  get stars() { return clamp(Math.floor(this.heat), 0, 5); }

  // Crimes add heat. A witness factor (0..1) scales it: crimes nobody saw still count,
  // just less. Heat is capped a whisper above five stars.
  addHeat(amount, witness = 1) {
    this.heat = clamp(this.heat + amount * (0.35 + 0.65 * witness), 0, 5.6);
  }

  coolOff() { this.heat = 0; this.bustMeter = 0; }

  desiredCops() { return this.stars; }   // one cruiser per star, plus roadblocks at 4+

  spawnCop(playerPos, role) {
    const rng = this.rng;
    let x = 0, z = 0;
    for (let tries = 0; tries < 14; tries++) {
      const vertical = rng() < 0.5;
      if (vertical) {
        const i = Math.floor(rng() * (CITY.cols + 1));
        x = roadX(i); z = playerPos.z + (rng() < 0.5 ? -1 : 1) * (60 + rng() * 40);
      } else {
        const j = Math.floor(rng() * (CITY.rows + 1));
        z = roadZ(j); x = playerPos.x + (rng() < 0.5 ? -1 : 1) * (60 + rng() * 40);
      }
      x = clamp(x, -CITY.width / 2 - 4, CITY.width / 2 + 4);
      z = clamp(z, -CITY.depth / 2 - 4, CITY.depth / 2 + 30);
      if (Math.hypot(x - playerPos.x, z - playerPos.z) > 48) break;
    }
    const v = new Vehicle(this.scene, 0, 0xf2f4f6, x, z, rng() * Math.PI * 2, 'police');
    v.driver = 'police';
    v.health = 160;
    const cop = { v, role };
    this.cops.push(cop);
    return cop;
  }

  clearAll() {
    for (const c of this.cops) this.scene.remove(c.v.mesh);
    this.cops = [];
    this.bustMeter = 0;
  }

  nearestCopDistance(x, z) {
    let best = Infinity;
    for (const c of this.cops) best = Math.min(best, Math.hypot(c.v.x - x, c.v.z - z));
    return best;
  }

  update(dt, player, audio) {
    this.time += dt;
    const px = player.x, pz = player.z;
    // heat cools when the player keeps their head down
    this.heat = Math.max(0, this.heat - TUNING.heatDecayPerSecond * dt * (this.cops.length ? 0.55 : 1));
    const stars = this.stars;

    // keep the fleet at the size the stars demand
    const chaseWanted = this.desiredCops();
    let chaseCount = this.cops.filter(c => c.role === 'chase').length;
    if (stars === 0) {
      if (this.cops.length) this.clearAll();
    } else {
      while (chaseCount < chaseWanted) { this.spawnCop(player, 'chase'); chaseCount++; }
      if (stars >= 4 && !this.cops.some(c => c.role === 'block')) this.placeRoadblock(player);
    }
    // recycle distant cruisers
    for (let i = this.cops.length - 1; i >= 0; i--) {
      const c = this.cops[i];
      if (Math.hypot(c.v.x - px, c.v.z - pz) > 240 || c.v.dead) {
        this.scene.remove(c.v.mesh);
        this.cops.splice(i, 1);
      }
    }

    let bustPressure = false;
    for (const c of this.cops) {
      const v = c.v;
      // flash the light bar
      const bar = v.mesh.userData.lightBar;
      if (bar) {
        const phase = Math.floor(this.time * 5) % 2;
        bar[0].material.color.setHex(phase ? 0xff3524 : 0x5c130c);
        bar[1].material.color.setHex(phase ? 0x12294d : 0x3e7ad8);
      }
      if (c.role === 'block') { v.speed = 0; v.syncMesh(); continue; }

      // pursuit: aim at where the player will be a moment from now
      const pvx = player.inCar ? player.inCar.forwardX() * player.inCar.speed : player.vx;
      const pvz = player.inCar ? player.inCar.forwardZ() * player.inCar.speed : player.vz;
      const dist = Math.hypot(px - v.x, pz - v.z);
      const lead = clamp(dist / 30, 0, 0.8);
      const tx = px + pvx * lead, tz = pz + pvz * lead;
      const want = Math.atan2(tx - v.x, tz - v.z);
      let dh = want - v.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      v.heading += clamp(dh, -2.1 * dt, 2.1 * dt);
      v.steer = clamp(dh * 1.7, -1, 1);
      const topSpeed = 34 + stars * 2.6;
      let target = dist > 7 ? topSpeed : topSpeed * 0.45;
      if (dist < 3.4) target = 0;
      v.speed = lerp(v.speed, target, 1 - Math.pow(0.01, dt));
      v.x += v.forwardX() * v.speed * dt;
      v.z += v.forwardZ() * v.speed * dt;
      const solved = collideCircle(this.colliders, v.x, v.z, 1.75);
      v.x = solved.x; v.z = solved.z;
      v.syncMesh();

      // bust pressure: a cruiser right on top of a slow or on-foot player
      if (!player.inCar && dist < TUNING.bustRadius) bustPressure = true;
      if (player.inCar && Math.abs(player.inCar.speed) < 1.2 && dist < 5.2) bustPressure = true;
    }

    if (bustPressure && stars > 0) {
      this.bustMeter += dt / TUNING.bustSeconds;
      if (this.bustMeter >= 1) {
        this.bustMeter = 0;
        this.hooks.onBusted();
      }
    } else {
      this.bustMeter = Math.max(0, this.bustMeter - dt * 0.7);
    }

    // at three stars and up, officers fire on an on-foot player who stays in the open
    this.shootTimer -= dt;
    if (stars >= 3 && !player.inCar && !player.dead && this.shootTimer <= 0) {
      const d = this.nearestCopDistance(px, pz);
      if (d < 21) {
        this.shootTimer = 0.55;
        if (audio) audio.gunshot();
        this.hooks.onPlayerShot(2.5 + stars * 0.9);
      } else {
        this.shootTimer = 0.3;
      }
    }
    if (audio) audio.setSiren(this.nearestCopDistance(px, pz), this.time);
  }

  // Two cruisers parked across the road ahead of the player's direction of travel.
  placeRoadblock(player) {
    const rng = this.rng;
    const heading = player.inCar ? player.inCar.heading : player.heading;
    const fx = Math.sin(heading), fz = Math.cos(heading);
    const bx = player.x + fx * 55, bz = player.z + fz * 55;
    // snap to the nearest road centreline
    let rx = bx, rz = bz;
    if (Math.abs(fx) > Math.abs(fz)) {
      let best = Infinity;
      for (let j = 0; j <= CITY.rows; j++) { const d = Math.abs(roadZ(j) - bz); if (d < best) { best = d; rz = roadZ(j); } }
    } else {
      let best = Infinity;
      for (let i = 0; i <= CITY.cols; i++) { const d = Math.abs(roadX(i) - bx); if (d < best) { best = d; rx = roadX(i); } }
    }
    for (const off of [-2.6, 2.6]) {
      const v = new Vehicle(this.scene, 0, 0xf2f4f6,
        rx + (Math.abs(fx) > Math.abs(fz) ? 0 : off),
        rz + (Math.abs(fx) > Math.abs(fz) ? off : 0),
        heading + Math.PI / 2 + (rng() - 0.5) * 0.2, 'police');
      v.driver = 'police';
      v.health = 200;
      this.cops.push({ v, role: 'block' });
    }
  }

  vehicles() { return this.cops.map(c => c.v); }
}

