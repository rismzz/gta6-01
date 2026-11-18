// PORT MERIDIAN — every tuning number in one place.
// The city is a fixed 8x8 grid of blocks; the renderer scales nothing by screen size.
export const STEP = 1 / 60;
export const CITY = {
  blocks: 8,
  block: 40, // metres of building ground per block
  road: 12, // metres of asphalt between blocks
  pitch: 52, // block + road
  half: 214, // city spans -214..214 on x and z (8 blocks of 40 + 9 roads of 12)
  beach: 34, // sand strip south of the last road (z > half)
  harbour: 46, // dock strip east of the last road (x > half)
};

export const PLAYER = {
  radius: 0.55,
  walk: 4.2,
  run: 7.4,
  turn: 3.6, // rad/s while on foot
  backFactor: 0.45,
  health: 100,
  regen: 2.5, // hp/s while wanted is 0
  punchDamage: 25,
  punchRange: 2.2,
  punchCooldown: 0.45,
  pistolDamage: 34,
  pistolRange: 55,
  pistolCooldown: 0.28,
  pistolAmmo: 24,
  ammoPickup: 12,
};

export const CAR = {
  radius: 2.3,
  accel: 15,
  brake: 26,
  reverseAccel: 10,
  maxSpeed: 38, // ~137 km/h
  maxReverse: 10,
  steer: 0.62, // rad of front-wheel angle at full lock
  grip: 6.0, // lateral velocity damping
  drag: 0.35,
  ramDamage: 15,
  ramCooldown: 1.0,
};

export const TRAFFIC = {
  count: 12,
  speed: 9,
  minGap: 9,
  carColors: ['#c8c8c8', '#3a6ea5', '#a52a2a', '#d8b13c', '#2e7d5b', '#7a4a8f', '#c96a1e', '#4a4a4a'],
};

export const PEDS = {
  count: 22,
  walk: 1.4,
  flee: 4.6,
  fleeRadius: 9,
};

export const WANTED = {
  jackCar: 1,
  hitPed: 1,
  shoot: 1,
  punchCop: 1,
  decaySeconds: 25, // seconds without a crime before one star drops
  maxStars: 5,
  copSpeed: 5.6,
  copCount: (stars) => Math.min(2 + stars, 6),
  patrolSpeed: 34,
  patrolCount: (stars) => Math.min(Math.max(0, stars - 1), 4),
  bustSeconds: 2.5, // a cop glued to you this long busts you
  bustRange: 1.7,
};

export const MISSIONS = [
  { id: 'hot-wheels', title: 'Hot Wheels', reward: 300 },
  { id: 'runaround', title: 'The Runaround', reward: 400 },
  { id: 'big-score', title: 'The Big Score', reward: 800 },
  { id: 'heat-wave', title: 'Heat Wave', reward: 1000 },
];

export const PICKUPS = {
  stashCount: 8,
  stashValue: 50,
  healthCount: 4,
  healthValue: 40,
};

export const SAVE_KEY = 'port-meridian.best.v1';
export const MISSION_KEY = 'port-meridian.save.v1';

// Landmark blocks (i, j) on the 8x8 grid; block centres are derived in city.js.
export const LANDMARKS = {
  hideout: { block: [1, 6], label: 'Hideout' },
  bank: { block: [4, 3], label: 'Bank of Meridian' },
  casino: { block: [6, 2], label: 'Casino Royale' },
  hospital: { block: [2, 1], label: 'General Hospital' },
  stadium: { block: [6, 6], label: 'Meridian Stadium' },
  paint: { block: [1, 3], label: 'Spray & Pray' },
  police: { block: [3, 6], label: 'Police HQ' },
};

export const PALETTE = {
  skyTop: '#2f6fb2',
  skyMid: '#e8a35c',
  skyLow: '#ff9e57',
  fog: '#e8a56b',
  sea: '#1d6f92',
  sand: '#e0c48f',
  grass: '#7d9b5a',
  asphalt: '#33373d',
  sidewalk: '#9a938a',
  building: ['#d9a05b', '#b5654a', '#7d9bb5', '#c9b458', '#8f7fb5', '#5b8a6a', '#c98a7a', '#6a7d8f'],
  roof: '#4a3f38',
};
