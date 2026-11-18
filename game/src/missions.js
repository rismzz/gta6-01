// Vex's four jobs, in order. Each mission names a target the beacon marks and a
// line the HUD shows; completing one pays cash (the score) and starts the next.
// The last one ends the story: reach the yacht with five stars on your tail.
import { MISSIONS } from './config.js';

const VAULT_HOLD = 5; // seconds of holding E at the bank vault
const RUNAROUND_TIME = 90;

export function createMissions(city) {
  const lm = city.landmarks;
  return {
    index: 0,
    stage: 'steal',
    timer: 0,
    hold: 0,
    checkpoint: 0,
    checkpoints: [
      { x: lm.casino.x, z: lm.casino.z + 24, label: 'Casino' },
      { x: lm.hospital.x, z: lm.hospital.z + 24, label: 'Hospital' },
      { x: lm.stadium.x, z: lm.stadium.z - 24, label: 'Stadium' },
    ],
    vault: { x: lm.bank.x, z: lm.bank.z + 14, label: 'Bank vault' },
    done: false,
    completed: [],
  };
}

function pay(state, mission) {
  state.player.cash += mission.reward;
  state.missions.completed.push(mission.id);
  state.events.push('mission');
}

export function currentTarget(state) {
  const m = state.missions;
  const lm = state.city.landmarks;
  if (m.done) return null;
  switch (m.index) {
    case 0:
      return m.stage === 'steal' ? null : { x: lm.paint.x, z: lm.paint.z + 12, label: 'Spray & Pray' };
    case 1:
      return m.checkpoints[m.checkpoint] ?? null;
    case 2:
      return m.stage === 'bank' ? m.vault : { x: lm.hideout.x, z: lm.hideout.z + 12, label: 'Hideout' };
    case 3:
      return { x: lm.dock.x, z: lm.dock.z, label: 'Yacht' };
    default:
      return null;
  }
}

export function objectiveText(state) {
  const m = state.missions;
  if (m.done) return 'All jobs done — free roam. Enjoy Port Meridian.';
  switch (m.index) {
    case 0:
      return m.stage === 'steal'
        ? 'Vex: Steal a car — walk up to one and press E.'
        : 'Vex: Deliver it to Spray & Pray, the paint shop.';
    case 1:
      return `Vex: Hit the checkpoints in order — ${m.checkpoint + 1} of 3. ${Math.ceil(m.timer)}s left.`;
    case 2:
      return m.stage === 'bank'
        ? 'Vex: Get to the bank vault and hold E to crack it.'
        : 'Vex: The vault is open — get back to the hideout, fast.';
    case 3:
      return 'Vex: Five stars, one way out — reach the yacht at the harbour.';
    default:
      return '';
  }
}

export function stepMissions(state, input, dt) {
  const m = state.missions;
  const { player } = state;
  if (m.done) return;
  const near = (x, z, r) => Math.hypot(player.x - x, player.z - z) < r;

  if (m.index === 0) {
    if (m.stage === 'steal') {
      if (!player.onFoot && player.car) {
        m.stage = 'deliver';
        state.events.push('objective');
      }
    } else {
      const lm = state.city.landmarks.paint;
      if (!player.onFoot && near(lm.x, lm.z + 12, 7)) {
        pay(state, MISSIONS[0]);
        m.index = 1;
        m.stage = 'drive';
        m.timer = RUNAROUND_TIME;
        m.checkpoint = 0;
        state.events.push('objective');
      }
    }
    return;
  }

  if (m.index === 1) {
    m.timer -= dt;
    if (m.timer <= 0) {
      // Out of time: Vex gives you another shot, same checkpoints.
      m.timer = RUNAROUND_TIME;
      m.checkpoint = 0;
      state.events.push('objective');
      return;
    }
    const cp = m.checkpoints[m.checkpoint];
    if (cp && near(cp.x, cp.z, 9)) {
      m.checkpoint += 1;
      state.events.push('objective');
      if (m.checkpoint >= m.checkpoints.length) {
        pay(state, MISSIONS[1]);
        m.index = 2;
        m.stage = 'bank';
        state.events.push('objective');
      }
    }
    return;
  }

  if (m.index === 2) {
    if (m.stage === 'bank') {
      if (near(m.vault.x, m.vault.z, 4) && input.interactHeld()) {
        m.hold += dt;
        if (m.hold >= VAULT_HOLD) {
          state.wanted.stars = 3;
          state.wanted.sinceCrime = 0;
          state.wanted.lastAdd = state.time;
          m.stage = 'stash';
          state.events.push('objective');
        }
      } else {
        m.hold = Math.max(0, m.hold - dt * 2);
      }
    } else {
      const lm = state.city.landmarks.hideout;
      if (near(lm.x, lm.z + 12, 8)) {
        pay(state, MISSIONS[2]);
        m.index = 3;
        state.wanted.stars = 5;
        state.wanted.sinceCrime = 0;
        state.wanted.lastAdd = state.time;
        state.events.push('objective');
      }
    }
    return;
  }

  if (m.index === 3) {
    const lm = state.city.landmarks.dock;
    if (near(lm.x, lm.z, 8)) {
      pay(state, MISSIONS[3]);
      m.done = true;
      state.complete = true;
      state.events.push('complete');
    }
  }
}
