// missions.js — the work of Coral Bay: a six-job story chain for the Marisol family and the
// repeatable side hustles (taxi fares, courier drops, checkpoint races, chop-shop deliveries).
// Missions are step scripts run by a small coroutine runner; the runner talks to the rest of
// the game through the `game` facade main hands it, so this file owns story, not plumbing.

import * as THREE from 'three';
import { PLACES, TUNING, clamp, roadX, roadZ } from './config.js';

// A glowing pillar of light over the current objective, visible across the city,
// with a pulsing ring at its base. One marker, moved from step to step.
export class ObjectiveMarker {
  constructor(scene) {
    this.group = new THREE.Group();
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xffd23e, transparent: true, opacity: 0.34, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide,
    });
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 46, 18, 1, true), beamMat);
    this.beam.position.y = 23;
    this.group.add(this.beam);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffd23e, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false,
    });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.9, 28), ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.12;
    this.group.add(this.ring);
    this.group.visible = false;
    scene.add(this.group);
    this.time = 0;
  }

  show(x, z, color = 0xffd23e) {
    this.group.position.set(x, 0, z);
    this.group.visible = true;
    this.beam.material.color.setHex(color);
    this.ring.material.color.setHex(color);
  }

  hide() { this.group.visible = false; }

  update(dt) {
    this.time += dt;
    this.ring.scale.setScalar(1 + Math.sin(this.time * 3.2) * 0.1);
    this.beam.material.opacity = 0.28 + Math.sin(this.time * 2.1) * 0.08;
  }
}

// The runner: executes a mission's steps one at a time. Steps that wait on the world
// (goto, escape, timer) park a promise that update() resolves or fails.
export class MissionRunner {
  constructor(game, marker) {
    this.game = game;
    this.marker = marker;
    this.active = null;          // { def, resolve, reject, step, timer }
    this.pendingWait = null;
    this.aborted = false;
  }

  get busy() { return this.active !== null; }

  async start(def) {
    if (this.busy) return false;
    this.aborted = false;
    const state = { def, step: null };
    this.active = state;
    this.game.banner(def.title.toUpperCase(), def.subtitle || '');
    this.game.audio.objective();
    try {
      for (const step of def.steps) {
        if (this.aborted) throw new Error('aborted');
        state.step = step;
        await this.execStep(step, def);
      }
      this.finish(def, true);
      return true;
    } catch (err) {
      if (!this.aborted && err && err.message !== 'aborted') this.finish(def, false, err.message);
      else this.cleanup();
      return false;
    }
  }

  abort() {
    this.aborted = true;
    if (this.pendingWait) { this.pendingWait.fail(new Error('aborted')); this.pendingWait = null; }
    this.cleanup();
  }

  cleanup() {
    this.active = null;
    this.marker.hide();
    this.game.setObjective('FREE ROAM', 'Explore Coral Bay. Find a phone booth to work.', null);
    this.game.destroyStoryCars();
  }

  finish(def, ok, reason = '') {
    this.active = null;
    this.marker.hide();
    this.game.destroyStoryCars();
    if (ok) {
      this.game.pay(def.pay, def.title);
      this.game.banner('JOB DONE', `${def.title} — $${def.pay}`);
      this.game.audio.cash();
      this.game.onMissionComplete(def);
    } else {
      this.game.banner('JOB FAILED', reason || def.failText || 'It fell apart.');
      this.game.audio.fail();
      this.game.setObjective('FREE ROAM', 'That job is gone. The booths still ring.', null);
    }
  }

  execStep(step, def) {
    const g = this.game;
    switch (step.type) {
      case 'say':
        return g.say(step.name, step.text);
      case 'note':
        g.toast(step.text);
        return Promise.resolve();
      case 'heat':
        g.addHeat(step.amount, 1);
        return Promise.resolve();
      case 'give':
        if (step.item === 'pistol') g.givePistol();
        if (step.item === 'armor') g.giveArmor();
        return Promise.resolve();
      case 'spawnCar': {
        const v = g.spawnStoryCar(step.model, step.color, step.x, step.z, step.heading || 0, step.livery || 'civilian');
        if (step.tag) g.tagCar(step.tag, v);
        return Promise.resolve();
      }
      case 'goto':
      case 'deliver':
      case 'escape':
      case 'wreck':
        return new Promise((resolve, reject) => {
          this.pendingWait = { step, resolve, reject, fail: reject, timer: step.time || 0 };
          if (step.type === 'goto' || step.type === 'deliver') {
            this.marker.show(step.x, step.z, step.color || 0xffd23e);
            g.setObjective(def.title, step.label, { x: step.x, z: step.z });
          } else if (step.type === 'escape') {
            this.marker.hide();
            g.setObjective(def.title, step.label || 'Lose the police.', null);
          } else if (step.type === 'wreck') {
            g.setObjective(def.title, step.label, null);
          }
        });
      default:
        return Promise.resolve();
    }
  }

  // Called every frame by main with the world snapshot the waits test against.
  update(dt, snap) {
    const w = this.pendingWait;
    if (!w || !this.active) return;
    const g = this.game;
    if (w.timer > 0) {
      w.timer -= dt;
      g.setTimer(w.timer);
      if (w.timer <= 0) {
        this.pendingWait = null;
        this.marker.hide();
        w.fail(new Error('Out of time.'));
        return;
      }
    }
    const p = snap.player;
    if (w.step.type === 'goto') {
      const d = Math.hypot(p.x - w.step.x, p.z - w.step.z);
      g.setObjectiveDistance(d);
      const needCar = w.step.inCar;
      if (d < (w.step.radius || 4) && (!needCar || p.inCar)) {
        this.pendingWait = null;
        this.marker.hide();
        g.audio.checkpoint();
        w.resolve();
      }
    } else if (w.step.type === 'deliver') {
      const car = g.taggedCar(w.step.tag);
      const d = car ? Math.hypot(car.x - w.step.x, car.z - w.step.z) : Infinity;
      g.setObjectiveDistance(d);
      if (car && d < (w.step.radius || 6) && p.inCar === car) {
        this.pendingWait = null;
        this.marker.hide();
        g.audio.checkpoint();
        w.resolve();
      }
    } else if (w.step.type === 'escape') {
      if (snap.stars === 0) {
        this.pendingWait = null;
        w.resolve();
      }
    } else if (w.step.type === 'wreck') {
      const left = g.taggedCarsAlive(w.step.tagPrefix);
      g.setObjective(this.active.def.title, `${w.step.label} (${w.step.count - left}/${w.step.count})`, null);
      if (left === 0) {
        this.pendingWait = null;
        w.resolve();
      }
    }
  }
}

// ---------------------------------------------------------------------------
// The story: six jobs for fixer Paco and the Marisol family.
// ---------------------------------------------------------------------------

const booth = PLACES.phoneBooths[0];
const club = PLACES.marisolClub;
const harbor = PLACES.harborGate;

export const STORY_MISSIONS = [
  {
    id: 'fresh-off-the-bus', title: 'Fresh Off The Bus', pay: 150,
    subtitle: 'a voice on the phone',
    steps: [
      { type: 'say', name: 'PACO (PHONE)', text: 'Danny Vale? Word travels. You drive, I hear. I got work for people who drive and don\'t talk.' },
      { type: 'say', name: 'DANNY', text: 'I just got into town. I don\'t even have wheels.' },
      { type: 'say', name: 'PACO (PHONE)', text: 'Blue Solace by the booth. Keys in it. Bring it to Club Marisol on the Neon Mile — and Danny? Don\'t scratch it.' },
      { type: 'spawnCar', model: 0, color: 0x3e7ad8, x: booth.x + 4, z: booth.z + 3, heading: 1.2, tag: 'job-car' },
      { type: 'deliver', tag: 'job-car', x: club.x, z: club.z + 10, radius: 7, label: 'Take the blue Solace to Club Marisol.' },
      { type: 'say', name: 'PACO', text: 'Clean paint, full tank. You\'re hired. The family pays on time, Danny. Remember who feeds you.' },
    ],
  },
  {
    id: 'package-for-paco', title: 'Package For Paco', pay: 250,
    subtitle: 'harbor business',
    steps: [
      { type: 'say', name: 'PACO (PHONE)', text: 'A crate came in at Harbor Gate 9 with no paperwork and no patience. Fetch it. Clock\'s running — the tide, and other things.' },
      { type: 'goto', x: harbor.x, z: harbor.z, radius: 5, label: 'Pick up the crate at Harbor Gate 9.', time: 170 },
      { type: 'say', name: 'DOCKHAND', text: 'No signature, no questions. Whatever\'s ticking in there, it ain\'t a clock. Drive gentle.' },
      { type: 'goto', x: roadX(7) - 6, z: roadZ(2) + 8, radius: 5, label: 'Deliver the crate to the Neon Mile garage.', time: 150 },
      { type: 'say', name: 'PACO (PHONE)', text: 'Received and already forgotten. That\'s the job, Danny — everything moves, nothing happened.' },
    ],
  },
  {
    id: 'the-wheelman', title: 'The Wheelman', pay: 400,
    subtitle: 'a Turismo with your name on it',
    steps: [
      { type: 'say', name: 'PACO (PHONE)', text: 'A Turismo GT sleeps in Palm Heights, owned by a man who owes the family. Tonight it changes hands. The alarm disagrees. So will the police.' },
      { type: 'spawnCar', model: 5, color: 0xd84f3e, x: roadX(1) + 6, z: roadZ(1) - 6, heading: -0.6, tag: 'turismo' },
      { type: 'goto', x: roadX(1) + 6, z: roadZ(1) - 6, radius: 6, label: 'Find the red Turismo GT in Palm Heights.' },
      { type: 'deliver', tag: 'turismo', x: harbor.x + 6, z: harbor.z - 4, radius: 8, label: 'Get the Turismo to the harbor chop shop. Lose the heat or outrun it.' },
      { type: 'say', name: 'PACO (PHONE)', text: 'Plates already changed. You\'re a natural, wheelman. Marisol wants to meet the man himself soon.' },
    ],
  },
  {
    id: 'hot-metal', title: 'Hot Metal', pay: 450,
    subtitle: 'the Ferro crew sends regards',
    steps: [
      { type: 'say', name: 'MARISOL (PHONE)', text: 'Danny. The Ferro crew parked three of their cars in the Flats like they own the street. They don\'t. Wreck all three. Loud is fine.' },
      { type: 'give', item: 'pistol' },
      { type: 'say', name: 'MARISOL (PHONE)', text: 'A gift, in the glovebox of your life now. Check Q to draw it. Don\'t be precious with it.' },
      { type: 'spawnCar', model: 1, color: 0x22262b, x: roadX(6) + 5, z: roadZ(0) + 6, heading: 0.4, tag: 'ferro-1' },
      { type: 'spawnCar', model: 3, color: 0x3a3f45, x: roadX(8) - 5, z: roadZ(1) - 6, heading: 2.4, tag: 'ferro-2' },
      { type: 'spawnCar', model: 2, color: 0x1f5f6e, x: roadX(5) + 5, z: roadZ(1) + 6, heading: -1.1, tag: 'ferro-3' },
      { type: 'wreck', tagPrefix: 'ferro-', count: 3, label: 'Wreck the Ferro crew cars in the Flats.' },
      { type: 'escape', label: 'Now lose the police.' },
      { type: 'say', name: 'MARISOL (PHONE)', text: 'Scrap and silence. The Flats remember who keeps them tidy. Come by the club when you\'re clean.' },
    ],
  },
  {
    id: 'bay-run', title: 'Bay Run', pay: 500,
    subtitle: 'six lights across the city',
    steps: [
      { type: 'say', name: 'PACO (PHONE)', text: 'Rich kids race the bay at night for pink slips and pride. The family holds the book. Run the six lights clean and the book looks honest.' },
      { type: 'spawnCar', model: 1, color: 0xf2b13e, x: club.x - 4, z: club.z + 12, heading: 2.8, tag: 'racer' },
      { type: 'goto', x: roadX(8), z: roadZ(4), radius: 8, inCar: true, label: 'Checkpoint 1 — east Neon Mile.', time: 200 },
      { type: 'goto', x: roadX(8), z: roadZ(0) + 4, radius: 8, inCar: true, label: 'Checkpoint 2 — the Flats corner.' },
      { type: 'goto', x: roadX(4), z: roadZ(0) + 4, radius: 8, inCar: true, label: 'Checkpoint 3 — north Meridian.' },
      { type: 'goto', x: roadX(0) + 4, z: roadZ(2), radius: 8, inCar: true, label: 'Checkpoint 4 — Palm Heights west.' },
      { type: 'goto', x: roadX(1), z: roadZ(6), radius: 8, inCar: true, label: 'Checkpoint 5 — Old Harbor south.' },
      { type: 'goto', x: PLACES.beachPier.x, z: PLACES.beachPier.z - 16, radius: 9, inCar: true, label: 'Final light — Coral Pier. Bring it home.' },
      { type: 'say', name: 'PACO (PHONE)', text: 'The book is honest and the kids are furious. Beautiful. One more job, Danny — the big one. Rest up.' },
    ],
  },
  {
    id: 'undertow', title: 'Undertow', pay: 1200,
    subtitle: 'the family, in person',
    steps: [
      { type: 'say', name: 'MARISOL', text: 'Danny Vale. Sit. Tonight the Ferros sign their docks over to me — or they swim. You drive me to the pier. Every badge in the bay will object.' },
      { type: 'say', name: 'DANNY', text: 'And if they object with roadblocks?' },
      { type: 'say', name: 'MARISOL', text: 'Then you earn the name I\'ve been saving for you. Undertow. Nothing on the surface, everything underneath. Go.' },
      { type: 'goto', x: PLACES.beachPier.x, z: PLACES.beachPier.z - 14, radius: 9, inCar: true, label: 'Drive Marisol to Coral Pier.', time: 240 },
      { type: 'heat', amount: 4.2 },
      { type: 'say', name: 'MARISOL', text: 'Signed, sealed — now make us ghosts, Undertow. Lose them. All of them.' },
      { type: 'escape', label: 'Lose the police — every star.' },
      { type: 'goto', x: club.x, z: club.z + 10, radius: 8, label: 'Bring Marisol home to the club.' },
      { type: 'say', name: 'MARISOL', text: 'The docks are mine, the bay is quiet, and you — you are family now. Coral Bay is yours to take, Danny. Take it politely.' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Side hustles: endlessly repeatable, smaller than story jobs, paid in cash.
// ---------------------------------------------------------------------------

export class SideActivities {
  constructor(game, marker) {
    this.game = game;
    this.marker = marker;
    this.mode = null;            // null | 'taxi-pickup' | 'taxi-dropoff' | 'courier' | 'race'
    this.data = {};
    this.rng = Math.random;
  }

  get busy() { return this.mode !== null; }

  cancel(silent = false) {
    if (!this.busy) return;
    this.mode = null;
    this.marker.hide();
    if (!silent) this.game.toast('Side job dropped.');
    this.game.setObjective('FREE ROAM', 'Explore Coral Bay. Find a phone booth to work.', null);
  }

  // --- taxi: starts automatically when the player gets into a cab -------------
  startTaxiFare() {
    if (this.busy) return;
    const g = this.game;
    const near = g.sidewalkSpotNear(g.player.x, g.player.z);
    this.mode = 'taxi-pickup';
    this.data = { pickup: near };
    this.marker.show(near.x, near.z, 0x39d0c4);
    g.setObjective('TAXI', 'Pick up the fare waving at the curb.', { x: near.x, z: near.z });
    g.toast('A fare is hailing you nearby.');
  }

  // --- courier: taken at a phone booth -----------------------------------------
  startCourier() {
    if (this.busy) return false;
    const g = this.game;
    const spots = [
      { x: roadX(2) + 8, z: roadZ(4) + 6 }, { x: roadX(7) - 8, z: roadZ(5) - 6 },
      { x: roadX(4) + 8, z: roadZ(1) - 6 }, { x: roadX(8) - 8, z: roadZ(3) + 6 },
    ];
    const from = spots[Math.floor(this.rng() * spots.length)];
    const to = spots[Math.floor(this.rng() * spots.length)];
    this.mode = 'courier';
    this.data = { from, to, phase: 'pickup', timer: 150 };
    this.marker.show(from.x, from.z, 0x39d0c4);
    g.setObjective('COURIER', 'Collect the package.', { x: from.x, z: from.z });
    g.audio.phone();
    return true;
  }

  // --- street race: taken at the Neon Mile start light ---------------------------
  startRace() {
    if (this.busy) return false;
    const g = this.game;
    this.mode = 'race';
    this.data = {
      points: [
        { x: roadX(8), z: roadZ(1) }, { x: roadX(5), z: roadZ(0) + 4 },
        { x: roadX(1), z: roadZ(2) }, { x: roadX(3), z: roadZ(5) },
        { x: PLACES.beachPier.x, z: PLACES.beachPier.z - 16 },
      ],
      index: 0, timer: 165,
    };
    const p = this.data.points[0];
    this.marker.show(p.x, p.z, 0xff5ca8);
    g.setObjective('STREET RACE', 'Hit every light before the clock dies.', { x: p.x, z: p.z });
    g.banner('STREET RACE', 'five lights — go');
    return true;
  }

  // --- chop shop: any car the player drives in can be sold -----------------------
  tryChopShop() {
    const g = this.game;
    const car = g.player.inCar;
    if (!car) return false;
    const pay = Math.round(TUNING.chopPay * (car.model.topSpeed / 33));
    g.exitCarForChop();
    g.pay(pay, 'Chop shop');
    g.toast(`The harbor crew takes the ${car.model.name} off your hands. +$${pay}`);
    g.addHeat(0.35, 0.4);
    return true;
  }

  update(dt, snap) {
    if (!this.busy) return;
    const g = this.game;
    const p = snap.player;
    const d = this.data;
    const arrive = (x, z, r) => Math.hypot(p.x - x, p.z - z) < r;

    if (this.mode === 'taxi-pickup') {
      g.setObjectiveDistance(Math.hypot(p.x - d.pickup.x, p.z - d.pickup.z));
      if (arrive(d.pickup.x, d.pickup.z, 5) && p.inCar) {
        g.boardPassenger(d.pickup.x, d.pickup.z);
        const dest = g.sidewalkSpotNear(d.pickup.x + 190, d.pickup.z - 150);
        d.dropoff = dest;
        d.fareDistance = Math.hypot(dest.x - d.pickup.x, dest.z - d.pickup.z);
        this.mode = 'taxi-dropoff';
        this.marker.show(dest.x, dest.z, 0x39d0c4);
        g.setObjective('TAXI', 'Take your fare across town.', { x: dest.x, z: dest.z });
        g.audio.pickup();
      }
    } else if (this.mode === 'taxi-dropoff') {
      g.setObjectiveDistance(Math.hypot(p.x - d.dropoff.x, p.z - d.dropoff.z));
      if (arrive(d.dropoff.x, d.dropoff.z, 5)) {
        const fare = Math.round(TUNING.taxiFareBase + d.fareDistance * TUNING.taxiFarePerMetre);
        g.pay(fare, 'Taxi fare');
        g.toast(`Fare paid $${fare}. The cab light is on again.`);
        g.onTaxiComplete();
        this.mode = null;
        this.marker.hide();
        g.setObjective('FREE ROAM', 'Stay in the cab and another fare will hail you.', null);
        g.audio.cash();
      }
    } else if (this.mode === 'courier') {
      d.timer -= dt;
      g.setTimer(d.timer);
      if (d.timer <= 0) { this.cancel(); g.toast('The package went cold.'); return; }
      const target = d.phase === 'pickup' ? d.from : d.to;
      g.setObjectiveDistance(Math.hypot(p.x - target.x, p.z - target.z));
      if (arrive(target.x, target.z, 5)) {
        if (d.phase === 'pickup') {
          d.phase = 'dropoff';
          d.timer = 140;
          this.marker.show(d.to.x, d.to.z, 0x39d0c4);
          g.setObjective('COURIER', 'Now run it across town — clock is live.', { x: d.to.x, z: d.to.z });
          g.audio.pickup();
        } else {
          const bonus = Math.round(d.timer * 0.4);
          g.pay(TUNING.courierPay + bonus, 'Courier');
          g.toast(`Delivered. $${TUNING.courierPay} + $${bonus} speed bonus.`);
          this.mode = null;
          this.marker.hide();
          g.setObjective('FREE ROAM', 'Explore Coral Bay. Find a phone booth to work.', null);
          g.audio.cash();
        }
      }
    } else if (this.mode === 'race') {
      d.timer -= dt;
      g.setTimer(d.timer);
      if (d.timer <= 0) { this.cancel(); g.toast('The other crews stopped waiting.'); return; }
      const point = d.points[d.index];
      g.setObjectiveDistance(Math.hypot(p.x - point.x, p.z - point.z));
      if (arrive(point.x, point.z, 9) && p.inCar) {
        d.index++;
        g.audio.checkpoint();
        if (d.index >= d.points.length) {
          g.pay(TUNING.racePay, 'Street race');
          g.banner('RACE WON', `+$${TUNING.racePay} — the bay is watching`);
          g.onRaceComplete();
          this.mode = null;
          this.marker.hide();
          g.setObjective('FREE ROAM', 'Explore Coral Bay. Find a phone booth to work.', null);
        } else {
          const next = d.points[d.index];
          this.marker.show(next.x, next.z, 0xff5ca8);
          g.setObjective('STREET RACE', `Light ${d.index + 1} of ${d.points.length}.`, { x: next.x, z: next.z });
        }
      }
    }
  }
}

export { clamp };


