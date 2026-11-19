// config.js — Coral Bay's fixed facts: city grid, districts, tuning numbers, name pools.
// Everything else reads from here so the city layout has exactly one source of truth.

export const CITY = {
  cols: 9,              // building blocks across (west to east)
  rows: 7,              // building blocks deep (north to south)
  pitch: 58,            // metres from one block corner to the next
  roadWidth: 14,        // metres of asphalt between blocks
  get width() { return this.cols * this.pitch; },
  get depth() { return this.rows * this.pitch; },
  get blockSize() { return this.pitch - this.roadWidth; },
};

// World coordinates are centred on the city: block (0,0) is the north-west corner.
export function blockCenter(col, row) {
  return {
    x: (col + 0.5) * CITY.pitch - CITY.width / 2,
    z: (row + 0.5) * CITY.pitch - CITY.depth / 2,
  };
}

// Road centrelines sit on the grid lines: vertical roads at x = i*pitch - width/2.
export function roadX(i) { return i * CITY.pitch - CITY.width / 2; }
export function roadZ(j) { return j * CITY.pitch - CITY.depth / 2; }

// The five districts. Each paints its blocks with its own palette and height range.
export const DISTRICTS = [
  {
    id: 'palm-heights', name: 'PALM HEIGHTS', cols: [0, 2], rows: [0, 2],
    wallColors: [0xf2e3c6, 0xe8d3ae, 0xdcc7a0, 0xf5ead2], roofColor: 0xb56b4a,
    minH: 10, maxH: 22, neon: 0x7de8e0, density: 0.85,
  },
  {
    id: 'the-flats', name: 'THE FLATS', cols: [3, 8], rows: [0, 1],
    wallColors: [0xc9b8a3, 0xbfae97, 0xd4c2ab, 0xb3a58f], roofColor: 0x6e6257,
    minH: 6, maxH: 13, neon: 0xffb347, density: 0.9,
  },
  {
    id: 'meridian-center', name: 'MERIDIAN CENTER', cols: [3, 5], rows: [2, 4],
    wallColors: [0x9fb6c9, 0x87a5bd, 0xb9c9d6, 0x7490a8], roofColor: 0x44586a,
    minH: 34, maxH: 88, neon: 0x9fd8ff, density: 0.95,
  },
  {
    id: 'neon-mile', name: 'NEON MILE', cols: [6, 8], rows: [2, 4],
    wallColors: [0xe8b7d4, 0xc9a7e8, 0xa7d8e8, 0xf2c6a0], roofColor: 0x54456a,
    minH: 14, maxH: 34, neon: 0xff5ca8, density: 0.95,
  },
  {
    id: 'old-harbor', name: 'OLD HARBOR', cols: [0, 2], rows: [3, 6],
    wallColors: [0xa89a80, 0x978a70, 0xb5a78c, 0x8a7d63], roofColor: 0x59503f,
    minH: 7, maxH: 15, neon: 0xffd23e, density: 0.8,
  },
  {
    id: 'coral-beach', name: 'CORAL BEACH', cols: [3, 8], rows: [5, 6],
    wallColors: [0xfff3da, 0xffe3ec, 0xd8f2ff, 0xfff0c0], roofColor: 0xe08a5a,
    minH: 9, maxH: 26, neon: 0x39d0c4, density: 0.85,
  },
];

export function districtAt(col, row) {
  for (const d of DISTRICTS) {
    if (col >= d.cols[0] && col <= d.cols[1] && row >= d.rows[0] && row <= d.rows[1]) return d;
  }
  return DISTRICTS[0];
}

export function districtAtWorld(x, z) {
  const col = Math.floor((x + CITY.width / 2) / CITY.pitch);
  const row = Math.floor((z + CITY.depth / 2) / CITY.pitch);
  if (col < 0 || row < 0 || col >= CITY.cols || row >= CITY.rows) {
    return z > CITY.depth / 2 ? DISTRICTS[5] : DISTRICTS[0];
  }
  return districtAt(col, row);
}

// Key places the story and side work revolve around, in world coordinates.
// (Computed from the grid so they always sit on real streets and sidewalks.)
export const PLACES = {
  hospital: { name: 'St. Siren Hospital', x: roadX(3) + 12, z: roadZ(5) + 10 },
  policeStation: { name: 'CBPD Central', x: roadX(5) - 12, z: roadZ(2) + 10 },
  paySprayNorth: { name: 'Shine City Respray', x: roadX(2) + 11, z: roadZ(1) - 9 },
  paySpraySouth: { name: 'Shine City Respray', x: roadX(7) - 11, z: roadZ(6) + 9 },
  phoneBooths: [
    { x: roadX(1) + 10, z: roadZ(3) + 10 },
    { x: roadX(6) - 10, z: roadZ(3) - 10 },
    { x: roadX(4) + 10, z: roadZ(6) - 10 },
  ],
  marisolClub: { name: 'Club Marisol', x: roadX(7) + 10, z: roadZ(3) + 12 },
  harborGate: { name: 'Harbor Gate 9', x: roadX(0) + 12, z: roadZ(6) - 8 },
  beachPier: { name: 'Coral Pier', x: roadX(5), z: CITY.depth / 2 + 26 },
  startCorner: { x: roadX(4) + 10, z: roadZ(6) + 8 },
};

// Tuning: wanted heat, economy and damage numbers in one place.
export const TUNING = {
  dayLengthSeconds: 360,          // one full in-game day
  startHour: 8,
  crimeHeat: {
    carTheft: 0.55, hitPedestrian: 1.15, hitCar: 0.3, gunshot: 0.7,
    punch: 0.35, policeCarHit: 1.4, explosion: 1.6,
  },
  heatDecayPerSecond: 0.028,      // cooling while no new crime is seen
  heatPerStar: 1.0,               // stars = floor(heat), capped at 5
  bustRadius: 3.2,                // metres: a cop on foot this close starts a bust
  bustSeconds: 2.4,               // standing in the radius this long = busted
  resprayCost: 150,
  hospitalCut: 0.08,              // fraction of cash the hospital takes
  bustFine: 0.12,                 // fraction of cash the police fine
  taxiFareBase: 25, taxiFarePerMetre: 0.11,
  courierPay: 120, racePay: 300, chopPay: 220,
  armorPrice: 100, pistolPrice: 250, pistolAmmoPrice: 40,
};

export const CAR_MODELS = [
  { name: 'Solace Sedan', topSpeed: 33, accel: 11, grip: 0.92, mass: 1.0, price: 0 },
  { name: 'Vireo Coupe', topSpeed: 41, accel: 15, grip: 0.95, mass: 0.95, price: 0 },
  { name: 'Cascada Hatch', topSpeed: 30, accel: 10, grip: 0.9, mass: 0.9, price: 0 },
  { name: 'Bison Pickup', topSpeed: 31, accel: 10.5, grip: 0.88, mass: 1.3, price: 0 },
  { name: 'Harbor Van', topSpeed: 27, accel: 8.5, grip: 0.86, mass: 1.4, price: 0 },
  { name: 'Turismo GT', topSpeed: 52, accel: 19, grip: 0.97, mass: 1.0, price: 0 },
  { name: 'Dune Buggy', topSpeed: 36, accel: 14, grip: 0.8, mass: 0.7, price: 0 },
];

export const CAR_COLORS = [
  0xd84f3e, 0x3e7ad8, 0xf2f2f2, 0x22262b, 0xf2b13e, 0x3ed87a, 0xd83ea8,
  0x7a4fd8, 0xbfc7cc, 0x8a2f23, 0x1f5f6e, 0xe87e3e, 0x5a626b, 0xffe9a8,
];

export const PED_NAMES = [
  'Alba', 'Rico', 'Sana', 'Milo', 'Petra', 'Hugo', 'Lena', 'Omar', 'Iris', 'Tomas',
  'Nadia', 'Felix', 'Rosa', 'Emil', 'Cleo', 'Dario', 'Mina', 'Santi', 'Vera', 'Lio',
];

export const PED_SHIRTS = [
  0xff6b5e, 0x5ec8ff, 0xffd23e, 0x7dff8a, 0xff8ad4, 0xf2f2f2, 0x3e4fd8,
  0xff9a3e, 0x3ed8c8, 0xb48aff, 0x8a5a3b, 0x2b2b33,
];

export function pickRandom(list, rng) { return list[Math.floor(rng() * list.length)]; }

// A small deterministic RNG so a seeded city always grows the same way.
export function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return function rng() {
    s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function distance2d(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return Math.hypot(dx, dz); }

