// combat.js — how Danny fights: fists up close, a hitscan pistol with tracers and muzzle
// flash once he owns one, hit sparks on metal, and explosions that chain through traffic.
// Every violent act reports itself through hooks so main can charge wanted heat for it.

import * as THREE from 'three';
import { clamp } from './config.js';

export class CombatSystem {
  constructor(scene, audio, hooks) {
    this.scene = scene;
    this.audio = audio;
    this.hooks = hooks;        // { onCrime(kind, x, z), onExplosion(x, z) }
    this.weapon = 'fists';      // 'fists' | 'pistol'
    this.ammo = 0;
    this.cooldown = 0;
    this.tracers = [];
    this.flashes = [];
    this.particles = [];
    this.particlePool = [];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
    this.tracerGeo = geo;
  }

  swapWeapon(hasPistol) {
    if (this.weapon === 'fists' && hasPistol) { this.weapon = 'pistol'; return 'pistol'; }
    this.weapon = 'fists';
    return 'fists';
  }

  // attack from the player's position toward aimHeading (radians). Targets are tested
  // in main's world: peds (PedestrianSystem), vehicles (array), and it returns a tag.
  attack(dt, player, peds, vehicles) {
    this.cooldown -= dt;
    if (this.cooldown > 0) return null;
    if (this.weapon === 'pistol' && this.ammo > 0) {
      this.cooldown = 0.24;
      this.ammo--;
      this.audio.gunshot();
      this.hooks.onCrime('gunshot', player.x, player.z);
      return this.fireHitscan(player, peds, vehicles);
    }
    if (this.weapon === 'pistol' && this.ammo <= 0) {
      this.cooldown = 0.3;
      this.audio.dryFire();
      return null;
    }
    this.cooldown = 0.34;
    player.punch();
    this.audio.punch();
    return this.swingFists(player, peds, vehicles);
  }

  swingFists(player, peds, vehicles) {
    const fx = Math.sin(player.heading), fz = Math.cos(player.heading);
    const ped = peds.nearest(player.x + fx * 1.2, player.z + fz * 1.2, 1.7);
    if (ped) {
      ped.knockDown();
      this.hooks.onCrime('punch', player.x, player.z);
      peds.startleAround(player.x, player.z, 9);
      return 'ped';
    }
    for (const v of vehicles) {
      if (Math.hypot(v.x - player.x, v.z - player.z) < 3.1) {
        v.damage(4);
        this.spawnSparks(v.x, player.z + 0, 1.1, 0xffc37a, 5);
        this.hooks.onCrime('hitCar', player.x, player.z);
        return 'car';
      }
    }
    return null;
  }

  fireHitscan(player, peds, vehicles) {
    const fx = Math.sin(player.heading), fz = Math.cos(player.heading);
    const ox = player.x + fx * 0.5, oz = player.z + fz * 0.5;
    let bestT = 60, bestKind = null, bestObj = null;
    const testPoint = (x, z, radius, kind, obj) => {
      const dx = x - ox, dz = z - oz;
      const t = dx * fx + dz * fz;
      if (t < 0.5 || t > bestT) return;
      const lateral = Math.abs(dx * fz - dz * fx);
      if (lateral < radius) { bestT = t; bestKind = kind; bestObj = obj; }
    };
    const ped = peds.nearest(player.x + fx * 6, player.z + fz * 6, 8);
    if (ped) testPoint(ped.x, ped.z, 0.75, 'ped', ped);
    for (const v of vehicles) testPoint(v.x, v.z, 2.3, 'car', v);
    const ex = ox + fx * bestT, ez = oz + fz * bestT;
    this.spawnTracer(ox, 1.45, oz, ex, 1.1, ez);
    this.spawnFlash(player.x + fx * 0.7, 1.45, player.z + fz * 0.7);
    if (bestKind === 'ped') {
      bestObj.knockDown();
      this.spawnSparks(bestObj.x, bestObj.z, 1.2, 0xff6b5e, 7);
      peds.startleAround(player.x, player.z, 13);
      return 'ped';
    }
    if (bestKind === 'car') {
      bestObj.damage(14);
      this.spawnSparks(ex, ez, 0.9, 0xffc37a, 8);
      if (bestObj.dead && !bestObj.exploded) {
        bestObj.exploded = true;
        this.explode(bestObj.x, bestObj.z, vehicles, player, peds);
      }
      return 'car';
    }
    return 'miss';
  }

  // A wrecked car goes up: a fireball, a light flash, a shockwave of damage, and a
  // great deal of police attention. Neighbouring wrecks can chain.
  explode(x, z, vehicles, player, peds) {
    this.audio.crash(1);
    this.audio.noise(0.7, 0.6, 300, 'lowpass');
    const light = new THREE.PointLight(0xff8a3e, 60, 30, 1.6);
    light.position.set(x, 2.5, z);
    this.scene.add(light);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10),
      new THREE.MeshBasicMaterial({ color: 0xffa03e, transparent: true, opacity: 0.95 }));
    ball.position.set(x, 1.2, z);
    this.scene.add(ball);
    this.flashes.push({ light, ball, t: 0, dur: 0.55 });
    this.spawnSparks(x, z, 1.5, 0xff8a3e, 26);
    this.hooks.onExplosion(x, z);
    for (const v of vehicles) {
      const d = Math.hypot(v.x - x, v.z - z);
      if (d > 0.5 && d < 8) {
        v.damage(70 - d * 6);
        if (v.dead && !v.exploded) {
          v.exploded = true;   // a neighbouring wreck cooks off a beat later, exactly once
          this.queueChain(v.x, v.z, vehicles, player, peds, 240 + Math.random() * 220);
        }
      }
    }
    if (player && !player.inCar) {
      const d = Math.hypot(player.x - x, player.z - z);
      if (d < 6.5) player.takeDamage((6.5 - d) * 9);
    }
    if (peds) peds.startleAround(x, z, 20);
  }

  spawnTracer(x0, y0, z0, x1, y1, z1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([x0, y0, z0, x1, y1, z1]), 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: 0xffe9a8, transparent: true, opacity: 0.9,
    }));
    this.scene.add(line);
    this.tracers.push({ line, t: 0, dur: 0.07 });
  }

  spawnFlash(x, y, z) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 1 }));
    m.position.set(x, y, z);
    this.scene.add(m);
    this.tracers.push({ line: m, t: 0, dur: 0.05 });
  }

  spawnSparks(x, z, y, color, count) {
    for (let i = 0; i < count; i++) {
      let p = this.particlePool.pop();
      if (!p) {
        p = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.09),
          new THREE.MeshBasicMaterial({ color }));
        this.scene.add(p);
      }
      p.material.color.setHex(color);
      p.position.set(x, y, z);
      p.visible = true;
      const a = Math.random() * Math.PI * 2;
      this.particles.push({
        mesh: p, t: 0, dur: 0.4 + Math.random() * 0.3,
        vx: Math.cos(a) * (1 + Math.random() * 3), vy: 1.5 + Math.random() * 2.5, vz: Math.sin(a) * (1 + Math.random() * 3),
      });
    }
  }

  update(dt) {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.t += dt;
      if (t.t >= t.dur) {
        this.scene.remove(t.line);
        this.tracers.splice(i, 1);
      }
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.t += dt;
      const k = f.t / f.dur;
      if (k >= 1) {
        this.scene.remove(f.light); this.scene.remove(f.ball);
        this.flashes.splice(i, 1);
      } else {
        f.ball.scale.setScalar(1 + k * 6);
        f.ball.material.opacity = 0.95 * (1 - k);
        f.light.intensity = 60 * (1 - k);
      }
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.t += dt;
      if (p.t >= p.dur) {
        p.mesh.visible = false;
        this.particlePool.push(p.mesh);
        this.particles.splice(i, 1);
        continue;
      }
      p.vy -= 6 * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y = Math.max(0.06, p.mesh.position.y + p.vy * dt);
      p.mesh.position.z += p.vz * dt;
    }
    // chained explosions from wrecks cooked off by a neighbour's fireball
    const now = performance.now();
    if (this.pendingChains) {
      for (let i = this.pendingChains.length - 1; i >= 0; i--) {
        const c = this.pendingChains[i];
        if (now >= c.at) {
          this.pendingChains.splice(i, 1);
          this.explode(c.x, c.z, c.vehicles, c.player, c.peds);
        }
      }
    }
  }

  queueChain(x, z, vehicles, player, peds, delayMs = 260) {
    if (!this.pendingChains) this.pendingChains = [];
    this.pendingChains.push({ x, z, vehicles, player, peds, at: performance.now() + delayMs });
  }
}

