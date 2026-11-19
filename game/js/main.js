// main.js — UNDERTOW's conductor: builds the renderer and Coral Bay, wires every system
// (traffic, pedestrians, police, combat, missions, side work, HUD, audio, saves), runs
// the frame loop, the day/night cycle, the camera, and every interaction prompt.
// It also implements the `game` facade that missions.js and the side hustles talk to.

import * as THREE from 'three';
import {
  CITY, PLACES, TUNING, clamp, lerp, makeRng, pickRandom, CAR_COLORS, districtAtWorld,
} from './config.js';
import { createWorld, updateWorld } from './world.js';
import { Vehicle, TrafficSystem, driveVehicle, resolveCarOverlap } from './vehicles.js';
import { PedestrianSystem } from './pedestrians.js';
import { Player } from './player.js';
import { PoliceSystem } from './police.js';
import { CombatSystem } from './combat.js';
import { MissionRunner, ObjectiveMarker, SideActivities, STORY_MISSIONS } from './missions.js';
import { Hud } from './hud.js';
import { AudioEngine } from './audio.js';
import { defaultSave, loadSave, storeSave, wipeSave, hasSave } from './save.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const DEMO = params.get('shot');           // screenshot scenes: vista | drive | chase | mission
const rng = makeRng(20261);

// ---------------------------------------------------------------- renderer / scene
const canvas = $('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fd4e8);
scene.fog = new THREE.Fog(0x9fd8e8, 120, 620);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1500);
camera.position.set(0, 30, 60);

const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x8a7a5a, 0.85);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe3b0, 1.6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -130; sun.shadow.camera.right = 130;
sun.shadow.camera.top = 130; sun.shadow.camera.bottom = -130;
sun.shadow.camera.far = 700;
sun.shadow.bias = -0.0006;
scene.add(sun);
scene.add(sun.target);
const moonGlow = new THREE.PointLight(0x8fb8ff, 0, 0);
scene.add(moonGlow);

// ---------------------------------------------------------------- world + cast
const world = createWorld(scene, 7);
const colliders = world.colliders;
const player = new Player(scene);
const traffic = new TrafficSystem(scene, colliders, 21);
const peds = new PedestrianSystem(scene, colliders, 33);
const audio = new AudioEngine();
const hud = new Hud();
const marker = new ObjectiveMarker(scene);

const parkedCars = [];
function spawnParkedCars() {
  const spots = [];
  for (let i = 0; i < 26; i++) {
    const vertical = rng() < 0.5;
    const roadIdx = Math.floor(rng() * (vertical ? CITY.cols + 1 : CITY.rows + 1));
    const along = (rng() - 0.5) * (vertical ? CITY.depth : CITY.width) * 0.92;
    const side = rng() < 0.5 ? -1 : 1;
    let x, z, heading;
    if (vertical) {
      x = (roadIdx * CITY.pitch - CITY.width / 2) + side * (CITY.roadWidth / 2 + 1.6);
      z = along;
      heading = side > 0 ? Math.PI : 0;
    } else {
      z = (roadIdx * CITY.pitch - CITY.depth / 2) + side * (CITY.roadWidth / 2 + 1.6);
      x = along;
      heading = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    }
    if (spots.some(s => Math.hypot(s.x - x, s.z - z) < 7)) continue;
    spots.push({ x, z });
    const modelIndex = Math.floor(rng() * 7);
    const v = new Vehicle(scene, modelIndex, pickRandom(CAR_COLORS, rng), x, z, heading);
    v.driver = null;
    parkedCars.push(v);
  }
}
spawnParkedCars();

function allVehicles() {
  return [...traffic.vehicles(), ...parkedCars, ...police.vehicles(), ...storyCars.map(s => s.v),
    ...(player.inCar ? [player.inCar] : [])];
}

// ---------------------------------------------------------------- game state
const state = {
  mode: 'menu',              // menu | playing | paused | wasted | busted | dialogue
  money: 60,
  day: 1,
  hour: TUNING.startHour,
  storyIndex: 0,
  storyDone: false,
  hasPistol: false,
  totalEarned: 0,
  missionsDone: 0,
  taxisDone: 0,
  racesWon: 0,
  elapsed: 0,
  cameraYaw: Math.PI,
  cameraPitch: 0.32,
  shake: 0,
  saveDirty: false,
};

const storyCars = [];        // [{ tag, v }]
const police = new PoliceSystem(scene, colliders, {
  onBusted: () => handleBusted(),
  onPlayerShot: (dmg) => { if (player.takeDamage(dmg)) handleWasted(); hud.damageFlash(0.55); },
});
const combat = new CombatSystem(scene, audio, {
  onCrime: (kind, x, z) => addCrime(kind, x, z),
  onExplosion: (x, z) => { addCrime('explosion', x, z); state.shake = Math.max(state.shake, 0.7); peds.startleAround(x, z, 24); },
});

// How much of a crime the world saw: full heat with a witness close by, a whisper without.
function witnessFactor(x, z) {
  if (police.nearestCopDistance(x, z) < 30) return 1;
  for (const p of peds.peds) if (Math.hypot(p.x - x, p.z - z) < 24) return 0.85;
  return 0.2;
}
function addCrime(kind, x, z) {
  const heat = TUNING.crimeHeat[kind] || 0.3;
  police.addHeat(heat, witnessFactor(x, z));
}

// ---------------------------------------------------------------- dialogue
let dialogueResolve = null;
function say(name, text) {
  return new Promise((resolve) => {
    hud.showDialogue(name, text);
    dialogueResolve = resolve;
    state.mode = 'dialogue';
  });
}
function advanceDialogue() {
  if (!dialogueResolve) return;
  hud.hideDialogue();
  const r = dialogueResolve;
  dialogueResolve = null;
  state.mode = 'playing';
  r();
}

// ---------------------------------------------------------------- the facade
const game = {
  player, audio,
  toast: (t) => hud.toast(t),
  banner: (t, s) => hud.banner(t, s),
  say,
  setObjective: (t, x, target) => hud.setObjective(t, x, target),
  setObjectiveDistance: (d) => hud.setObjectiveDistance(d),
  setTimer: (s) => hud.setTimer(s),
  pay(amount, label) {
    state.money += amount;
    state.totalEarned += amount;
    hud.toast(`${label}: +$${amount}`);
  },
  addHeat: (amount, witness) => police.addHeat(amount, witness),
  givePistol() {
    if (!state.hasPistol) {
      state.hasPistol = true;
      combat.ammo += 24;
      hud.toast('You got the PISTOL — Q to draw it, click to fire.');
    } else {
      combat.ammo += 24;
      hud.toast('+24 pistol rounds.');
    }
  },
  giveArmor() { player.armor = 100; hud.toast('Body armor fitted.'); },
  spawnStoryCar(model, color, x, z, heading, livery) {
    const v = new Vehicle(scene, model, color, x, z, heading, livery);
    v.driver = null;
    storyCars.push({ tag: null, v });
    return v;
  },
  tagCar(tag, v) {
    const rec = storyCars.find(s => s.v === v);
    if (rec) rec.tag = tag;
  },
  taggedCar(tag) {
    const rec = storyCars.find(s => s.tag === tag);
    return rec ? rec.v : null;
  },
  taggedCarsAlive(prefix) {
    return storyCars.filter(s => s.tag && s.tag.startsWith(prefix) && !s.v.dead).length;
  },
  destroyStoryCars() {
    for (const s of storyCars) {
      if (player.inCar === s.v) exitCar(true);
      scene.remove(s.v.mesh);
      const pi = parkedCars.indexOf(s.v);
      if (pi >= 0) parkedCars.splice(pi, 1);
    }
    storyCars.length = 0;
  },
  sidewalkSpotNear(x, z) { return peds.sidewalkSpot({ x, z }); },
  boardPassenger(x, z) {
    const ped = peds.nearest(x, z, 6);
    if (ped) { const far = peds.sidewalkSpot(player.pos); ped.placeAt(far.x, far.z); }
  },
  exitCarForChop() {
    const car = player.inCar;
    if (!car) return;
    exitCar(true);
    scene.remove(car.mesh);
    const ti = traffic.vehicles().indexOf(car);
    void ti;
    const pi = parkedCars.indexOf(car);
    if (pi >= 0) parkedCars.splice(pi, 1);
    const si = storyCars.findIndex(s => s.v === car);
    if (si >= 0) storyCars.splice(si, 1);
  },
  onMissionComplete(def) {
    state.missionsDone++;
    if (def.id === STORY_MISSIONS[state.storyIndex]?.id) {
      state.storyIndex++;
      if (state.storyIndex >= STORY_MISSIONS.length) {
        state.storyDone = true;
        hud.banner('STORY COMPLETE', 'Coral Bay is yours. The booths still ring for side work.');
      }
    }
    saveGame();
  },
  onTaxiComplete() { state.taxisDone++; },
  onRaceComplete() { state.racesWon++; },
};

const runner = new MissionRunner(game, marker);
const sides = new SideActivities(game, marker);

// ---------------------------------------------------------------- input
const keys = new Set();
let pointerLocked = false;
let mouseAttack = false;
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys.add(e.code);
  audio.start();
  if (state.mode === 'dialogue' && (e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter')) {
    e.preventDefault();
    advanceDialogue();
    return;
  }
  if (state.mode === 'playing') {
    if (e.code === 'KeyE') doInteract();
    if (e.code === 'KeyQ') hud.toast(`Weapon: ${combat.swapWeapon(state.hasPistol)}`);
    if (e.code === 'Space') { mouseAttack = true; e.preventDefault(); }
    if (e.code === 'KeyP' || e.code === 'Escape') openPause();
    if (e.code === 'KeyH') { $('menu-help').classList.remove('hidden'); state.mode = 'help'; }
    if (e.code === 'KeyM') hud.toast(audio.toggleMute() ? 'Sound off.' : 'Sound on.');
  } else if (state.mode === 'paused' && (e.code === 'KeyP' || e.code === 'Escape')) {
    closePause();
  } else if (state.mode === 'help' && (e.code === 'KeyH' || e.code === 'Escape')) {
    $('menu-help').classList.add('hidden');
    state.mode = helpReturnMode;
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
canvas.addEventListener('click', () => {
  audio.start();
  if (state.mode === 'playing' && !pointerLocked) canvas.requestPointerLock();
  else if (state.mode === 'playing' && pointerLocked) mouseAttack = true;
  else if (state.mode === 'dialogue') advanceDialogue();
});
document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === canvas;
});
document.addEventListener('mousemove', (e) => {
  if (!pointerLocked || state.mode !== 'playing') return;
  state.cameraYaw -= e.movementX * 0.0026;
  state.cameraPitch = clamp(state.cameraPitch + e.movementY * 0.0022, -0.08, 1.05);
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function moveInput() {
  let x = 0, z = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) z += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) z -= 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
  return { x, z };
}

// ---------------------------------------------------------------- cars: in and out
function nearestVehicle(x, z, maxDist) {
  let best = null, bestD = maxDist;
  for (const v of allVehicles()) {
    const d = Math.hypot(v.x - x, v.z - z);
    if (d < bestD) { bestD = d; best = v; }
  }
  return best;
}

function enterCar(v) {
  const wasTraffic = traffic.release(v);
  const copIdx = police.cops.findIndex(c => c.v === v);
  if (copIdx >= 0) police.cops.splice(copIdx, 1);
  const isStory = storyCars.some(s => s.v === v);
  if (wasTraffic || (!isStory && v.driver === null && !v.playerOwned)) {
    addCrime('carTheft', v.x, v.z);
    if (wasTraffic) peds.startleAround(v.x, v.z, 10);
  }
  v.driver = 'player';
  v.playerOwned = true;
  player.inCar = v;
  player.syncMesh();
  audio.door();
  if (v.livery === 'taxi') setTimeout(() => { if (player.inCar === v) sides.startTaxiFare(); }, 900);
}

function exitCar(silent = false) {
  const v = player.inCar;
  if (!v) return;
  const rx = Math.cos(v.heading), rz = -Math.sin(v.heading);
  player.inCar = null;
  v.driver = null;
  if (!parkedCars.includes(v) && !storyCars.some(s => s.v === v)) parkedCars.push(v);
  player.placeAt(v.x + rx * 2.4, v.z + rz * 2.4, v.heading);
  if (!silent) audio.door();
}

// ---------------------------------------------------------------- interactions
const STORE = { x: 213, z: 155 };   // Sirena Sporting Goods, Coral Beach (world coords)
function computeInteraction() {
  const p = player;
  if (p.inCar) {
    for (const spray of [PLACES.paySprayNorth, PLACES.paySpraySouth]) {
      if (Math.hypot(p.x - spray.x, p.z - spray.z) < 8) {
        return { text: `E — Respray & repair $${TUNING.resprayCost} (cools the police)`, action: doRespray };
      }
    }
    if (Math.hypot(p.x - PLACES.harborGate.x, p.z - PLACES.harborGate.z) < 9 && !runner.busy) {
      return { text: 'E — Sell this car to the chop shop', action: () => sides.tryChopShop() };
    }
    if (Math.hypot(p.x - (PLACES.marisolClub.x - 14), p.z - (PLACES.marisolClub.z + 16)) < 8 && !sides.busy && !runner.busy) {
      return { text: 'E — Street race (5 lights, $300)', action: () => sides.startRace() };
    }
    return null;
  }
  const car = nearestVehicle(p.x, p.z, 3.4);
  if (car) return { text: `E — Enter the ${car.model.name}`, action: () => enterCar(car) };
  for (const boothPos of PLACES.phoneBooths) {
    if (Math.hypot(p.x - boothPos.x, p.z - boothPos.z) < 3.2) {
      if (runner.busy) return { text: 'The line is busy — finish the job you have.', action: null };
      if (state.storyIndex < STORY_MISSIONS.length) {
        const def = STORY_MISSIONS[state.storyIndex];
        return { text: `E — Answer the phone (${def.title})`, action: () => runner.start(def) };
      }
      if (!sides.busy) return { text: 'E — Take a courier run ($120+)', action: () => sides.startCourier() };
      return null;
    }
  }
  if (Math.hypot(p.x - STORE.x, p.z - STORE.z) < 4) {
    if (!state.hasPistol) return { text: `E — Buy a pistol $${TUNING.pistolPrice} (Sirena Sporting)`, action: () => buy('pistol') };
    if (player.armor < 100) return { text: `E — Buy body armor $${TUNING.armorPrice}`, action: () => buy('armor') };
    if (combat.ammo < 60) return { text: `E — Buy pistol ammo $${TUNING.pistolAmmoPrice}`, action: () => buy('ammo') };
    return { text: 'Sirena Sporting — you own it all already.', action: null };
  }
  if (Math.hypot(p.x - PLACES.hospital.x, p.z - PLACES.hospital.z) < 6 && player.health < 100) {
    return { text: 'E — Get patched up $50', action: doHeal };
  }
  return null;
}

function doInteract() {
  const it = computeInteraction();
  if (it && it.action) { it.action(); return; }
  if (player.inCar) exitCar();      // E with nothing else to do = get out
}

function buy(kind) {
  if (kind === 'pistol') {
    if (state.money < TUNING.pistolPrice) return hud.toast('Not enough cash for the pistol.');
    state.money -= TUNING.pistolPrice;
    game.givePistol();
  } else if (kind === 'armor') {
    if (state.money < TUNING.armorPrice) return hud.toast('Not enough cash for armor.');
    state.money -= TUNING.armorPrice;
    player.armor = 100;
    hud.toast('Armor fitted.');
    audio.pickup();
  } else {
    if (state.money < TUNING.pistolAmmoPrice) return hud.toast('Not enough cash for ammo.');
    state.money -= TUNING.pistolAmmoPrice;
    combat.ammo += 24;
    hud.toast('+24 pistol rounds.');
    audio.pickup();
  }
}

function doRespray() {
  if (state.money < TUNING.resprayCost) return hud.toast('The respray costs $150 — you are short.');
  state.money -= TUNING.resprayCost;
  const v = player.inCar;
  v.health = Math.min(100, v.health + 70);
  v.mesh.userData.bodyMat.color.setHex(pickRandom(CAR_COLORS, rng));
  police.coolOff();
  hud.toast('Fresh paint. The CBPD loses interest.');
  audio.pickup();
}

function doHeal() {
  if (state.money < 50) return hud.toast('St. Siren needs $50 up front.');
  state.money -= 50;
  player.heal(100);
  hud.toast('Patched up. Try not to bleed on the seats.');
  audio.pickup();
}

// ---------------------------------------------------------------- endings
function fadeTo(fn) {
  const fade = $('fade');
  fade.classList.add('on');
  setTimeout(() => { fn(); fade.classList.remove('on'); }, 480);
}

function handleWasted() {
  if (state.mode === 'wasted') return;
  state.mode = 'wasted';
  runner.abort(); sides.cancel(true);
  const cut = Math.floor(state.money * TUNING.hospitalCut);
  state.money -= cut;
  $('screen-wasted').classList.remove('hidden');
  hud.toast(`St. Siren kept $${cut} for the stitches.`);
}

function handleBusted() {
  if (state.mode === 'busted') return;
  state.mode = 'busted';
  runner.abort(); sides.cancel(true);
  const fine = Math.floor(state.money * TUNING.bustFine);
  state.money -= fine;
  $('screen-busted').classList.remove('hidden');
  hud.toast(`The CBPD fined you $${fine}.`);
}

function respawnAt(place, heading) {
  fadeTo(() => {
    if (player.inCar) exitCar(true);
    police.clearAll();
    police.coolOff();
    player.dead = false;
    player.health = 100;
    player.placeAt(place.x, place.z, heading);
    state.hour = Math.min(state.hour + 1, 23.5);
    $('screen-wasted').classList.add('hidden');
    $('screen-busted').classList.add('hidden');
    state.mode = 'playing';
  });
}

// ---------------------------------------------------------------- saves and menus
function saveGame() {
  const data = {
    ...defaultSave(),
    money: state.money, day: state.day, storyIndex: state.storyIndex, storyDone: state.storyDone,
    hasPistol: state.hasPistol, ammo: combat.ammo, armor: Math.round(player.armor),
    totalEarned: state.totalEarned, missionsDone: state.missionsDone,
    taxisDone: state.taxisDone, racesWon: state.racesWon,
    player: { x: player.x, z: player.z, heading: player.heading },
  };
  if (storeSave(data)) hud.toast('Game saved.');
}

function applySave(data) {
  state.money = data.money; state.day = data.day;
  state.storyIndex = data.storyIndex; state.storyDone = data.storyDone;
  state.hasPistol = data.hasPistol;
  state.totalEarned = data.totalEarned; state.missionsDone = data.missionsDone;
  state.taxisDone = data.taxisDone; state.racesWon = data.racesWon;
  combat.ammo = data.ammo;
  player.armor = data.armor;
  if (data.player) player.placeAt(data.player.x, data.player.z, data.player.heading);
}

let helpReturnMode = 'menu';
function openPause() {
  state.mode = 'paused';
  document.exitPointerLock?.();
  $('pause-stats').textContent =
    `Cash $${state.money} · Day ${state.day}\nStory jobs done: ${state.missionsDone}/6 · Taxis: ${state.taxisDone} · Races won: ${state.racesWon}\nTotal earned: $${state.totalEarned}`;
  $('menu-pause').classList.remove('hidden');
}
function closePause() {
  $('menu-pause').classList.add('hidden');
  state.mode = 'playing';
}

function startPlaying(fresh) {
  $('menu-main').classList.add('hidden');
  $('loading').classList.add('hidden');
  hud.show();
  state.mode = 'playing';
  if (fresh) {
    player.placeAt(PLACES.startCorner.x, PLACES.startCorner.z, Math.PI);
    state.cameraYaw = Math.PI;
    (async () => {
      await say('DANNY', 'Coral Bay. New city, empty pockets, one name in my pocket: Paco. There\'s a phone booth with my future in it.');
      hud.setObjective('FRESH OFF THE BUS', 'Answer the ringing phone booth.', { x: PLACES.phoneBooths[0].x, z: PLACES.phoneBooths[0].z });
      marker.show(PLACES.phoneBooths[0].x, PLACES.phoneBooths[0].z, 0xffb347);
    })();
  }
}

$('btn-new').addEventListener('click', () => {
  audio.start();
  wipeSave();
  Object.assign(state, {
    money: 60, day: 1, storyIndex: 0, storyDone: false, hasPistol: false,
    totalEarned: 0, missionsDone: 0, taxisDone: 0, racesWon: 0, hour: TUNING.startHour,
  });
  combat.ammo = 0; combat.weapon = 'fists';
  player.armor = 0; player.health = 100;
  startPlaying(true);
});
$('btn-continue').addEventListener('click', () => {
  audio.start();
  const data = loadSave();
  if (data) applySave(data);
  startPlaying(false);
  hud.toast(`Welcome back to Coral Bay, day ${state.day}.`);
});
$('btn-help').addEventListener('click', () => { helpReturnMode = 'menu'; $('menu-help').classList.remove('hidden'); });
$('btn-help-back').addEventListener('click', () => {
  $('menu-help').classList.add('hidden');
  if (state.mode === 'help') state.mode = helpReturnMode;
});
$('btn-resume').addEventListener('click', closePause);
$('btn-save').addEventListener('click', () => { saveGame(); });
$('btn-restart').addEventListener('click', () => {
  $('menu-pause').classList.add('hidden');
  state.mode = 'playing';
  respawnAt(PLACES.hospital, 0);
  hud.toast('A new morning, the same debts.');
});
$('btn-quit').addEventListener('click', () => {
  $('menu-pause').classList.add('hidden');
  hud.hide();
  $('menu-main').classList.remove('hidden');
  $('btn-continue').classList.toggle('hidden', !hasSave());
  state.mode = 'menu';
});
$('btn-wasted').addEventListener('click', () => respawnAt(PLACES.hospital, 0.6));
$('btn-busted').addEventListener('click', () => respawnAt(PLACES.policeStation, -0.6));
if (hasSave()) {
  const data = loadSave();
  $('btn-continue').classList.remove('hidden');
  if (data) $('continue-day').textContent = String(data.day);
}

// The sporting-goods store gets a sign the world builder didn't know about.
{
  const signTex = (() => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 96;
    const g = c.getContext('2d');
    g.fillStyle = '#14202b'; g.fillRect(0, 0, 512, 96);
    g.fillStyle = '#ffd23e'; g.font = 'bold 44px Verdana'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('SIRENA SPORTING', 256, 50);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const sign = new THREE.Mesh(new THREE.BoxGeometry(7, 1.4, 0.4),
    new THREE.MeshBasicMaterial({ map: signTex }));
  sign.position.set(STORE.x, 3.4, STORE.z);
  scene.add(sign);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 3.4, 6),
    new THREE.MeshLambertMaterial({ color: 0x2c3136 }));
  post.position.set(STORE.x, 1.7, STORE.z);
  scene.add(post);
  colliders.push({ x0: STORE.x - 0.3, z0: STORE.z - 0.3, x1: STORE.x + 0.3, z1: STORE.z + 0.3, h: 3 });
}

// ---------------------------------------------------------------- day and night
const SKY_STOPS = [
  { h: 0.0, sky: new THREE.Color(0x0c1a2e), sun: 0.22, sunCol: new THREE.Color(0x8fb8ff), hemi: 0.32, night: 1 },
  { h: 5.0, sky: new THREE.Color(0x0c1a2e), sun: 0.22, sunCol: new THREE.Color(0x8fb8ff), hemi: 0.32, night: 1 },
  { h: 7.0, sky: new THREE.Color(0xe8a06a), sun: 0.9, sunCol: new THREE.Color(0xffc98a), hemi: 0.55, night: 0.25 },
  { h: 10.0, sky: new THREE.Color(0x8fd4e8), sun: 1.6, sunCol: new THREE.Color(0xfff0d0), hemi: 0.85, night: 0 },
  { h: 16.0, sky: new THREE.Color(0x93d2e8), sun: 1.55, sunCol: new THREE.Color(0xffeec4), hemi: 0.82, night: 0 },
  { h: 18.5, sky: new THREE.Color(0xffb877), sun: 1.0, sunCol: new THREE.Color(0xffab57), hemi: 0.6, night: 0.2 },
  { h: 20.0, sky: new THREE.Color(0x2c2a55), sun: 0.3, sunCol: new THREE.Color(0xb08aff), hemi: 0.38, night: 0.85 },
  { h: 22.0, sky: new THREE.Color(0x0c1a2e), sun: 0.22, sunCol: new THREE.Color(0x8fb8ff), hemi: 0.32, night: 1 },
  { h: 24.0, sky: new THREE.Color(0x0c1a2e), sun: 0.22, sunCol: new THREE.Color(0x8fb8ff), hemi: 0.32, night: 1 },
];
let nightFactor = 0;

function applySky(hour) {
  let a = SKY_STOPS[0], b = SKY_STOPS[SKY_STOPS.length - 1];
  for (let i = 0; i < SKY_STOPS.length - 1; i++) {
    if (hour >= SKY_STOPS[i].h && hour <= SKY_STOPS[i + 1].h) { a = SKY_STOPS[i]; b = SKY_STOPS[i + 1]; break; }
  }
  const t = b.h === a.h ? 0 : (hour - a.h) / (b.h - a.h);
  scene.background.copy(a.sky).lerp(b.sky, t);
  scene.fog.color.copy(scene.background);
  sun.intensity = lerp(a.sun, b.sun, t);
  sun.color.copy(a.sunCol).lerp(b.sunCol, t);
  hemi.intensity = lerp(a.hemi, b.hemi, t);
  nightFactor = lerp(a.night, b.night, t);
  const sunAngle = ((hour - 6) / 12) * Math.PI;
  const elev = Math.sin(sunAngle);
  const px = player.x, pz = player.z;
  if (elev > -0.08) {
    sun.position.set(px + Math.cos(sunAngle) * 180, 60 + elev * 220, pz + 90);
  } else {
    sun.position.set(px - 80, 190, pz - 60);   // the moon stands in
  }
  sun.target.position.set(px, 0, pz);
}

// ---------------------------------------------------------------- camera
function updateCamera(dt) {
  const target = player.inCar || player;
  const tx = target.x, tz = target.z;
  if (player.inCar) {
    let dh = player.inCar.heading - state.cameraYaw;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    if (Math.abs(player.inCar.speed) > 2) state.cameraYaw += dh * (1 - Math.pow(0.02, dt));
    state.cameraPitch = lerp(state.cameraPitch, Math.max(state.cameraPitch, 0.16), dt);
  }
  const dist = player.inCar ? 10.5 : 7.6;
  const yaw = state.cameraYaw, pitch = state.cameraPitch;
  const cx = tx - Math.sin(yaw) * Math.cos(pitch) * dist;
  const cz = tz - Math.cos(yaw) * Math.cos(pitch) * dist;
  let cy = 1.7 + Math.sin(pitch) * dist;
  // keep the camera out of buildings: if the spot is inside one, ride over its roof
  for (const b of colliders) {
    if (cx > b.x0 - 0.4 && cx < b.x1 + 0.4 && cz > b.z0 - 0.4 && cz < b.z1 + 0.4) {
      cy = Math.max(cy, (b.h || 8) + 1.2);
    }
  }
  const shakeAmp = state.shake * 0.35;
  camera.position.set(
    cx + (Math.random() - 0.5) * shakeAmp,
    Math.max(0.7, cy) + (Math.random() - 0.5) * shakeAmp,
    cz + (Math.random() - 0.5) * shakeAmp,
  );
  camera.lookAt(tx, 1.55, tz);
  state.shake = Math.max(0, state.shake - dt * 1.7);
}

// ---------------------------------------------------------------- the frame
let lastTime = performance.now();
let damageGlow = 0;
let smokeTimer = 0;
let framesRendered = 0;

function stepGame(dt) {
  state.elapsed += dt;
  if (DEMO) {
    // Screenshot staging: the world breathes (traffic, walkers, the marker) but the
    // staged player, police and story stand still so the scene the maker set is the
    // scene that gets captured.
    traffic.update(dt, player, allVehicles());
    peds.update(dt, player, [], null);
    marker.update(dt);
    combat.update(dt);
    if (player.inCar) player.inCar.syncMesh();
    for (const c of police.cops) {
      const bar = c.v.mesh.userData.lightBar;
      if (bar) {
        const phase = Math.floor(state.elapsed * 5) % 2;
        bar[0].material.color.setHex(phase ? 0xff3524 : 0x5c130c);
        bar[1].material.color.setHex(phase ? 0x12294d : 0x3e7ad8);
      }
    }
    return;
  }
  if (!DEMO) {
    state.hour += (dt / TUNING.dayLengthSeconds) * 24;
    if (state.hour >= 24) {
      state.hour -= 24;
      state.day++;
      hud.toast(`Day ${state.day} breaks over Coral Bay.`);
      saveGame();
    }
  }
  const input = moveInput();
  const inDialogue = state.mode === 'dialogue';

  if (player.inCar && !inDialogue) {
    const car = player.inCar;
    const driveInput = {
      throttle: (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) + (keys.has('KeyS') || keys.has('ArrowDown') ? -1 : 0),
      steer: (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + (keys.has('KeyD') || keys.has('ArrowRight') ? -1 : 0),
      handbrake: keys.has('ShiftLeft') || keys.has('ShiftRight'),
    };
    const result = driveVehicle(car, driveInput, dt, colliders, audio);
    if (result.impact > 9) state.shake = Math.max(state.shake, 0.45);
    // car-to-car contact: trade paint, and heat when it is hard or it is a cruiser
    for (const other of allVehicles()) {
      if (other === car) continue;
      const rel = resolveCarOverlap(car, other, audio);
      if (rel > 7) {
        state.shake = Math.max(state.shake, 0.5);
        addCrime(other.livery === 'police' ? 'policeCarHit' : 'hitCar', car.x, car.z);
      }
    }
    player.syncMesh();
  } else if (!inDialogue) {
    const yaw = state.cameraYaw;
    const fwd = { x: Math.sin(yaw), z: Math.cos(yaw) };
    const right = { x: -Math.cos(yaw), z: Math.sin(yaw) };
    const mx = fwd.x * input.z + right.x * input.x;
    const mz = fwd.z * input.z + right.z * input.x;
    player.update(dt, mx, mz, keys.has('ShiftLeft') || keys.has('ShiftRight'), colliders);
    if (mouseAttack || keys.has('Space')) {
      player.heading = yaw;
      combat.attack(0, player, peds, allVehicles());
    }
  }
  mouseAttack = false;
  combat.cooldown = Math.max(0, (combat.cooldown || 0) - dt);

  const vehiclesNow = allVehicles();
  traffic.update(dt, player, vehiclesNow);
  peds.update(dt, player, vehiclesNow, (ped, vehicle) => {
    if (vehicle.driver === 'player') {
      addCrime('hitPedestrian', ped.x, ped.z);
      state.shake = Math.max(state.shake, 0.4);
      audio.crash(0.5);
    }
  });
  police.update(dt, player, audio);
  hud.setTimer(null);   // a timed step re-sets it below; otherwise last job's clock would linger
  runner.update(dt, { player, stars: police.stars });
  sides.update(dt, { player });
  marker.update(dt);
  combat.update(dt);

  // wrecked and hurting cars smoke
  smokeTimer -= dt;
  if (smokeTimer <= 0) {
    smokeTimer = 0.14;
    for (const v of vehiclesNow) {
      if (v.health < 38 && Math.hypot(v.x - player.x, v.z - player.z) < 60) {
        combat.spawnSparks(v.x + v.forwardX() * 1.6, v.z + v.forwardZ() * 1.6, 1.1, v.health < 15 ? 0xff7a2e : 0x3a3f45, 1);
      }
    }
  }

  // the contextual prompt (and the exit hint while driving)
  if (!inDialogue) {
    const it = computeInteraction();
    if (it) hud.setPrompt(it.text);
    else if (player.inCar) hud.setPrompt('E — Get out');
    else hud.setPrompt(null);
  }

  audio.setEngine(player.inCar ? player.inCar.speed / player.inCar.model.topSpeed : 0, !!player.inCar);
  audio.updateMusic(dt, police.stars > 0 ? 1 : 0.35);
  damageGlow = Math.max(0, damageGlow - dt * 1.4);
  if (player.health < 35) damageGlow = Math.max(damageGlow, 0.35);
  hud.damageFlash(damageGlow);
}

function render() {
  applySky(state.hour);
  updateWorld(world, 0.016, state.elapsed, nightFactor);
  if (state.mode === 'menu') {
    // a slow establishing orbit over the bay while the title is up
    const t = state.elapsed * 0.03;
    camera.position.set(Math.sin(t) * 300, 120, Math.cos(t) * 300);
    camera.lookAt(0, 0, 40);
  } else if (!DEMO) {
    updateCamera(0.016);
  }
  hud.update(0.016, {
    player, money: state.money, stars: police.stars, bustMeter: police.bustMeter,
    weapon: combat.weapon, ammo: combat.ammo, hour: state.hour, day: state.day,
    cameraHeading: state.cameraYaw, cops: police.vehicles(),
    markedCars: storyCars.map(s => s.v), time: state.elapsed,
  });
  renderer.render(scene, camera);
  framesRendered++;
  if (DEMO && framesRendered === 40) window.__undertowReady = true;
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  if (state.mode === 'playing' || state.mode === 'dialogue') stepGame(dt);
  else if (state.mode === 'menu') {
    state.elapsed += dt;
    traffic.update(dt, { x: 0, z: 0 }, allVehicles());
    peds.update(dt, { x: 0, z: 0 }, [], null);
  }
  render();
}

// ---------------------------------------------------------------- demo scenes
// ?shot=<name> builds a fixed, real gameplay scene for the entry's screenshots:
// the same systems, the same HUD — just staged starting positions, then frozen time.
function setupDemo(name) {
  $('menu-main').classList.add('hidden');
  $('loading').classList.add('hidden');
  hud.show();
  state.mode = 'playing';
  if (name === 'vista') {
    state.hour = 17.7;
    player.placeAt(PLACES.beachPier.x + 2, PLACES.beachPier.z - 20, Math.PI);
    const car = new Vehicle(scene, 5, 0xd84f3e, PLACES.beachPier.x - 8, PLACES.beachPier.z - 24, 2.6);
    parkedCars.push(car);
    camera.position.set(PLACES.beachPier.x + 16, 15, PLACES.beachPier.z + 6);
    camera.lookAt(-40, 6, -160);
    state.cameraYaw = Math.PI;
  } else if (name === 'drive') {
    state.hour = 14.6;
    // on the eastbound lane of the Neon Mile's north road (z = -29), mid-block
    const car = new Vehicle(scene, 5, 0xf2b13e, 118, -25.5, Math.PI / 2);
    car.speed = 15;
    parkedCars.push(car);
    enterCarSilent(car);
    hud.setObjective('BAY RUN', 'Checkpoint 3 — north Meridian.', { x: -52, z: -203 });
    hud.setObjectiveDistance(212);
    marker.show(-52, -160, 0xffd23e);
    state.cameraYaw = Math.PI / 2;
    camera.position.set(106, 4.3, -25.5);
    camera.lookAt(140, 1.3, -25.5);
  } else if (name === 'chase') {
    state.hour = 19.3;
    state.money = 2450;
    // northbound lane of the Meridian Center avenue (x = -29), dusk, four stars
    const car = new Vehicle(scene, 1, 0x3e7ad8, -25.5, 58, Math.PI);
    car.speed = 18;
    parkedCars.push(car);
    enterCarSilent(car);
    police.addHeat(4.4, 1);
    const copA = police.spawnCop(player, 'chase');
    copA.v.x = -25.5; copA.v.z = 66; copA.v.heading = Math.PI; copA.v.speed = 17; copA.v.syncMesh();
    const copB = police.spawnCop(player, 'chase');
    copB.v.x = -33; copB.v.z = 72; copB.v.heading = Math.PI; copB.v.speed = 17; copB.v.syncMesh();
    hud.setObjective('UNDERTOW', 'Lose the police — every star.', null);
    state.cameraYaw = Math.PI;
    camera.position.set(-27, 7.2, 84);
    camera.lookAt(-26, 1.2, 36);
  } else if (name === 'mission') {
    state.hour = 9.4;
    state.money = 410;
    state.hasPistol = true;
    combat.ammo = 18;
    player.armor = 60;
    player.placeAt(PLACES.phoneBooths[0].x + 2.5, PLACES.phoneBooths[0].z + 2, -2.2);
    hud.setObjective('THE WHEELMAN', 'Get the Turismo to the harbor chop shop.', { x: PLACES.harborGate.x, z: PLACES.harborGate.z });
    hud.setObjectiveDistance(388);
    marker.show(PLACES.harborGate.x, PLACES.harborGate.z, 0xffd23e);
    hud.showDialogue('PACO (PHONE)', 'A Turismo GT sleeps in Palm Heights, owned by a man who owes the family. Tonight it changes hands.');
    document.body.classList.remove('cinematic');   // keep the clock and cash visible in the shot
    state.cameraYaw = -2.2;
    camera.position.set(PLACES.phoneBooths[0].x + 7.5, 3.1, PLACES.phoneBooths[0].z + 6.5);
    camera.lookAt(PLACES.phoneBooths[0].x, 1.4, PLACES.phoneBooths[0].z);
  }
}

function enterCarSilent(v) {
  v.driver = 'player';
  v.playerOwned = true;
  player.inCar = v;
  player.syncMesh();
}

// ---------------------------------------------------------------- boot
player.placeAt(PLACES.startCorner.x, PLACES.startCorner.z, Math.PI);
if (DEMO) setupDemo(DEMO);
else $('loading').classList.add('hidden');
requestAnimationFrame(frame);






