// Every tuning number and name in one place. The game is "PORT MERIDIAN", an
// original sun-soaked coastal city: its own streets, cars, people and story.
// Nothing here names, copies or references any commercial game.

export const CITY = {
  // Roads run along both axes at multiples of PITCH; blocks fill the gaps.
  pitch: 62,
  roads: [-3, -2, -1, 0, 1, 2, 3],
  roadWidth: 14,
  blockSize: 48,
  // Half-extent of the playable city, in world units.
  half: 210,
};

export const STEP = 1 / 60;
export const SAVE_KEY = 'port-meridian.save.v1';

export const PLAYER = {
  walkSpeed: 9,
  runSpeed: 14,
  radius: 0.9,
  health: 100,
};

export const CAR = {
  accel: 26,
  brake: 42,
  reverseAccel: 14,
  maxSpeed: 42,
  maxReverse: 12,
  steer: 1.9,
  grip: 6,
  length: 4.4,
  width: 2,
};

export const TRAFFIC_COUNT = 16;
export const PED_COUNT = 26;
export const PICKUP_COUNT = 10;

export const WANTED = {
  decaySeconds: 22,
  maxStars: 5,
  // How many police cars hunt the player at each wanted level.
  policeForStars: [0, 1, 1, 2, 3, 4],
};

export const PALETTE = {
  sky: 0x8ec3e8,
  fog: 0xa8c8e0,
  sun: 0xfff1cf,
  ground: 0x3d3a35,
  road: 0x2c2c30,
  roadLine: 0xf5d76e,
  sidewalk: 0x8f8a80,
  building: [0xd8c9a3, 0xb8c4cc, 0xe0a58a, 0x9fb8a8, 0xc9b8d8, 0xe8dcc8, 0xa8b8c8, 0xd8b8a0],
  car: [0xc23b2e, 0x2e6fc2, 0xe8c832, 0x3aa655, 0xe8e8e8, 0x222222, 0x7a4a9e, 0xe07b2e],
  police: 0x1c2a44,
  taxi: 0xe8b820,
  pedShirt: [0x2e8f8f, 0x2e6fc2, 0x3aa655, 0xe8c832, 0x7a4a9e, 0xe07b2e, 0xe8e8e8, 0x444444],
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

// Mission definitions: name, briefing, payout and ordered steps.
// Step types: steal (get in any car), goto (reach a marker), drive (reach a
// marker while driving), collect (pick up the cash), escape (stay alive with
// the wanted level until the timer runs out), wait (survive N seconds).
export const MISSIONS = [
  {
    id: 'first-wheels',
    name: 'First Wheels',
    briefing: 'Rico needs wheels. Steal any car on Meridian Ave and bring it to the garage on Coral Row.',
    payout: 250,
    steps: [
      { type: 'steal', text: 'Steal a car — walk up to one and press E' },
      { type: 'drive', target: { x: 124, z: 62 }, radius: 9, text: 'Drive to the garage on Coral Row' },
    ],
  },
  {
    id: 'courier-run',
    name: 'Courier Run',
    briefing: 'Mara has three drops across town. Hit every marker before the timer runs out.',
    payout: 450,
    steps: [
      { type: 'drive', target: { x: -124, z: -62 }, radius: 9, time: 75, text: 'Drop 1/3 — Harbor Gate' },
      { type: 'drive', target: { x: 62, z: -124 }, radius: 9, text: 'Drop 2/3 — Palm Plaza' },
      { type: 'drive', target: { x: -62, z: 124 }, radius: 9, text: 'Drop 3/3 — Sunset Pier' },
    ],
  },
  {
    id: 'heat',
    name: 'Heat',
    briefing: 'The Meridian PD is on your tail. Lose the cops — stay out of their reach until the heat dies down.',
    payout: 600,
    steps: [
      { type: 'escape', seconds: 30, text: 'Lose the cops — survive 30 seconds' },
    ],
  },
  {
    id: 'meridian-job',
    name: 'The Meridian Job',
    briefing: 'One last score: grab the cash at Meridian Trust, then lose a 4-star wanted level and reach the hideout.',
    payout: 1200,
    steps: [
      { type: 'drive', target: { x: 0, z: -186 }, radius: 10, text: 'Reach Meridian Trust bank' },
      { type: 'collect', target: { x: 0, z: -186 }, radius: 6, text: 'Grab the cash — walk over the money bag' },
      { type: 'escape', seconds: 25, text: 'Lose the 4-star heat — survive 25 seconds' },
      { type: 'drive', target: { x: -186, z: 186 }, radius: 10, text: 'Reach the hideout on Driftwood Lane' },
    ],
  },
];
