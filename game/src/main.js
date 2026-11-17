// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps, and the renderer paints what is there. The game moves
// between four screens: title, play, paused and busted. Progress (cash and
// jobs done) saves to localStorage.
//
// ?seed=N fixes the city. ?shot=start|play|chase|end (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_BUSTED, EVENT_CRASH, EVENT_MISSION_DONE, EVENT_MISSION_FAIL, EVENT_MISSION_STEP, EVENT_PICKUP, EVENT_SHOT } from './world.js';
import { ACTION_CONFIRM, ACTION_ENTER_CAR, ACTION_MUTE, ACTION_PAUSE, ACTION_SHOOT, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const hud = {
  hud: document.getElementById('hud'),
  cash: document.getElementById('cash'),
  healthFill: document.getElementById('healthFill'),
  stars: document.getElementById('stars'),
  objective: document.getElementById('objective'),
  speed: document.getElementById('speed'),
  speedLabel: document.getElementById('speedLabel'),
  hint: document.getElementById('hint'),
  best: document.getElementById('best'),
  minimap: document.getElementById('minimap'),
};
const overlays = {
  title: document.getElementById('titleScreen'),
  pause: document.getElementById('pauseScreen'),
  over: document.getElementById('overScreen'),
  toast: document.getElementById('toast'),
  overTitle: document.getElementById('overTitle'),
  overText: document.getElementById('overText'),
};

const random = createRandom(seed);
const renderer = createRenderer(canvas, hud, random);
const world = createWorld(random, renderer.scene, renderer.city);
const audio = createAudio();

function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return { money: 0, best: 0, missionsDone: 0 };
    const save = JSON.parse(raw);
    return {
      money: Number(save.money) || 0,
      best: Number(save.best) || 0,
      missionsDone: Number(save.missionsDone) || 0,
    };
  } catch {
    return { money: 0, best: 0, missionsDone: 0 };
  }
}

function writeSave(save) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // Storage can be off (private windows): progress then lasts this visit only.
  }
}

let toastTimer = 0;
function toast(message, ms) {
  overlays.toast.textContent = message;
  overlays.toast.style.display = 'block';
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { overlays.toast.style.display = 'none'; }, ms || 3500);
}

function showOnly(name) {
  overlays.title.style.display = name === 'title' ? 'flex' : 'none';
  overlays.pause.style.display = name === 'pause' ? 'flex' : 'none';
  overlays.over.style.display = name === 'over' ? 'flex' : 'none';
}

function runShot(name) {
  const scene = stageShot(name, world);
  // The chase reads better from a three-quarter rear angle: the cruisers
  // closing in behind the player stay in frame.
  renderer.setCamYawOffset(name === 'chase' ? 0.6 : 0);
  const wp = world.missions.waypoint();
  renderer.city.setWaypoint(wp ? wp.x : 0, wp ? wp.z : 0, !!wp);
  const save = loadSave();
  if (scene.screen === SCREEN_TITLE) showOnly('title');
  else showOnly(null);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, world.missions, scene.screen, save, true);
    painted += 1;
    if (painted < 3) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  const save = loadSave();
  let screen = SCREEN_TITLE;
  let accumulator = 0;
  let last = performance.now();

  // Resume saved progress: cash carries over, finished jobs stay finished.
  world.state.money = save.money;
  if (save.missionsDone > 0 && save.missionsDone < 4) {
    world.missions.state.index = save.missionsDone;
    world.missions.state.step = 0;
    world.missions.startStep();
  }

  function announce(message) {
    status.textContent = message;
  }

  function persist() {
    save.money = world.state.money;
    save.best = Math.max(save.best, world.state.money);
    save.missionsDone = world.missions.missionsDone;
    writeSave(save);
  }

  function startGame() {
    world.reset();
    world.state.money = save.money;
    if (save.missionsDone > 0 && save.missionsDone < 4) {
      world.missions.state.index = save.missionsDone;
      world.missions.state.step = 0;
      world.missions.startStep();
    }
    audio.init();
    accumulator = 0;
    screen = SCREEN_PLAY;
    showOnly(null);
    announce('Playing in Port Meridian. Follow the gold marker.');
    toast(world.missions.objectiveText(), 4500);
  }

  function endGame(busted) {
    screen = SCREEN_OVER;
    persist();
    audio.busted();
    audio.siren(false);
    overlays.overTitle.textContent = busted ? 'BUSTED' : 'Game over';
    overlays.overText.textContent = busted
      ? `The Meridian PD caught you. You lost $100 — but Port Meridian is still yours. Cash $${world.state.money.toLocaleString('en-US')}.`
      : `Cash $${world.state.money.toLocaleString('en-US')}.`;
    showOnly('over');
    announce('Busted. Press Space or click to play again.');
  }

  function handleEvents(events) {
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_SHOT) audio.shot();
    if (events & EVENT_CRASH) audio.crash();
    if (events & EVENT_MISSION_STEP) {
      audio.mission();
      toast('Objective complete — ' + world.missions.objectiveText(), 4000);
    }
    if (events & EVENT_MISSION_DONE) {
      audio.mission();
      const done = world.state.lastCompleted;
      world.state.lastCompleted = null;
      toast(done ? `Job complete: ${done.name} — paid $${done.payout}!` : 'Job complete!', 5000);
      persist();
    }
    if (events & EVENT_MISSION_FAIL) {
      toast('Out of time — the job resets. Try again!', 4000);
    }
    if (events & EVENT_BUSTED) endGame(true);
  }

  function handleActions(actions) {
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      toast(muted ? 'Sound off (M to turn on)' : 'Sound on', 1500);
    }
    if ((actions & (ACTION_CONFIRM | ACTION_SHOOT)) && (screen === SCREEN_TITLE || screen === SCREEN_OVER)) {
      audio.init();
      audio.click();
      startGame();
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      showOnly('pause');
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      showOnly(null);
      announce('Playing.');
    }
  }

  function step(actions) {
    const events = world.step(STEP, input, actions);
    handleEvents(events);
    const wp = world.missions.waypoint();
    renderer.city.setWaypoint(wp ? wp.x : 0, wp ? wp.z : 0, !!wp);
    const inCar = !!world.state.car;
    audio.engine(inCar ? Math.min(1, Math.abs(world.state.player.speed) / 42) : 0, inCar);
    audio.siren(world.state.wanted > 0);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = input.takeActions();
    handleActions(actions);
    if (screen === SCREEN_PLAY) {
      let firstStep = true;
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        step(firstStep ? actions : 0);
        firstStep = false;
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, world.missions, screen, save);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      showOnly('pause');
      announce('Paused.');
    }
  });
  document.getElementById('startBtn').addEventListener('click', () => { audio.init(); startGame(); });
  document.getElementById('resumeBtn').addEventListener('click', () => {
    screen = SCREEN_PLAY;
    showOnly(null);
  });
  document.getElementById('restartBtn').addEventListener('click', () => { startGame(); });
  document.getElementById('quitBtn').addEventListener('click', () => {
    persist();
    screen = SCREEN_TITLE;
    showOnly('title');
  });

  announce('Port Meridian. Press Space or click Start to play.');
  showOnly('title');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
