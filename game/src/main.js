// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what is there. The game moves between five screens: title, play,
// paused, game over and complete.
//
// ?seed=N fixes the city. ?shot=start|drive|chase|mission (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { STEP, SAVE_KEY } from './config.js';
import { createWorld, stepWorld, resetWorld } from './world.js';
import { ACTION_CONFIRM, ACTION_PAUSE, ACTION_MUTE, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer } from './render.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const state = createWorld(seed);
// Debug handle for local playtesting (harmless in production).
window.__pm = state;
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(SAVE_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(SAVE_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, state);
  let painted = 0;
  function paint() {
    renderer.draw(state, scene.screen, scene.best, STEP);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  // The title screen's attract mode steps the world without touching the player.
  const neutralInput = {
    throttle: () => 0,
    steer: () => 0,
    running: () => false,
    interactHeld: () => false,
    takeActions: () => 0,
    takeGameActions: () => 0,
    takeOrbit: () => ({ dx: 0, dy: 0 }),
  };
  let screen = 'title';
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();

  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    resetWorld(state);
    accumulator = 0;
    screen = 'play';
    audio.unlock();
    announce('Playing. Vex has work for you — steal a car.');
  }

  function endGame() {
    screen = 'over';
    if (state.player.cash > best) {
      best = state.player.cash;
      saveBest(best);
    }
    audio.siren(false);
    audio.engine(0, false);
    announce(`Game over. Cash $${Math.floor(state.player.cash)}. Best $${Math.floor(best)}.`);
  }

  function completeGame() {
    screen = 'complete';
    if (state.player.cash > best) {
      best = state.player.cash;
      saveBest(best);
    }
    audio.siren(false);
    audio.engine(0, false);
    announce(`Port Meridian complete. Cash $${Math.floor(state.player.cash)}.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      audio.toggleMute();
    }
    if (actions & ACTION_CONFIRM && (screen === 'title' || screen === 'over' || screen === 'complete')) {
      audio.unlock();
      startGame();
    } else if (actions & ACTION_PAUSE && screen === 'play') {
      screen = 'paused';
      audio.siren(false);
      audio.engine(0, false);
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === 'paused') {
      screen = 'play';
      announce('Playing.');
    }
  }

  function step() {
    const result = stepWorld(state, input);
    const events = state.events;
    for (const event of events) {
      if (event === 'mission') {
        audio.mission();
        renderer.toast('Job done — Vex paid you.');
      } else if (event === 'complete') {
        audio.mission();
      } else if (event === 'pickup') {
        audio.pickup();
      } else if (event === 'shoot') {
        audio.shoot();
      } else if (event === 'punch') {
        audio.punch();
      } else if (event === 'crash' || event === 'ram') {
        audio.crash();
      } else if (event === 'busted') {
        audio.busted();
        renderer.toast('Busted — Vex bailed you out. Half your cash is gone.');
      } else if (event === 'objective') {
        renderer.toast('New objective — check the map.');
      }
    }
    audio.siren(state.wanted.stars >= 2 && screen === 'play');
    audio.engine(state.player.onFoot ? 0 : Math.abs(state.player.speed) / 38, screen === 'play' && !state.player.onFoot);
    if (result === 'dead') endGame();
    else if (result === 'complete') completeGame();
    else if (result === 'busted') announce('Busted. Vex bailed you out.');
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    const orbit = input.takeOrbit();
    if (orbit.dx !== 0) {
      state.player.orbitOffset += orbit.dx * 0.005;
      state.player.orbitOffset = Math.max(-1.2, Math.min(1.2, state.player.orbitOffset));
    }
    if (screen === 'play') {
      while (accumulator >= STEP) {
        step();
        accumulator -= STEP;
        if (screen !== 'play') break;
      }
    } else if (screen === 'title') {
      // The city lives behind the title: traffic rolls on. The player stays put:
      // the title steps with a neutral input, never the real keys.
      while (accumulator >= STEP) {
        stepWorld(state, neutralInput);
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(state, screen, best, STEP);
  }

  // Leaving the tab pauses a running game rather than letting the cops catch you unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === 'play') {
      screen = 'paused';
      announce('Paused.');
    }
  });
  window.addEventListener('resize', () => renderer.resize());

  announce('Port Meridian. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
