// world.js — grows Coral Bay out of the grid in config.js: painted ground, city blocks with
// procedurally-textured buildings, sidewalks, lamps, palms, the harbor, the beach and the sea.
// It also owns the collision boxes every mover in the game tests against.

import * as THREE from 'three';
import {
  CITY, DISTRICTS, PLACES, blockCenter, districtAt, makeRng, pickRandom,
} from './config.js';

const canvasTextureCache = new Map();

function canvasTexture(key, w, h, draw) {
  if (canvasTextureCache.has(key)) return canvasTextureCache.get(key);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  canvasTextureCache.set(key, tex);
  return tex;
}

// A building facade: painted wall colour, a grid of windows, and a matching emissive canvas in
// which only the "lit" windows glow — main turns the glow up after dark.
function facadeTextures(wallColor, seed, litRatio) {
  const key = `facade-${wallColor}-${seed}`;
  if (canvasTextureCache.has(key)) return canvasTextureCache.get(key);
  const rng = makeRng(seed);
  const w = 128, h = 256;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  const col = new THREE.Color(wallColor);
  g.fillStyle = `#${col.getHexString()}`;
  g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(0,0,0,0.12)';
  g.fillRect(0, h - 14, w, 14);                       // ground-floor shadow band
  const e = document.createElement('canvas'); e.width = w; e.height = h;
  const eg = e.getContext('2d');
  eg.fillStyle = '#000'; eg.fillRect(0, 0, w, h);
  const cols = 5, rows = 12;
  const ww = w / cols, hh = h / rows;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const x = i * ww + 3, y = j * hh + 3, wdw = ww - 6, hdw = hh - 6;
      const lit = rng() < litRatio;
      g.fillStyle = lit ? '#ffe9a8' : '#2c4256';
      g.fillRect(x, y, wdw, hdw);
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(x, y, wdw, 2);
      if (lit) { eg.fillStyle = '#ffb85c'; eg.fillRect(x, y, wdw, hdw); }
    }
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  const emissiveMap = new THREE.CanvasTexture(e);
  emissiveMap.colorSpace = THREE.SRGBColorSpace;
  const pair = { map, emissiveMap };
  canvasTextureCache.set(key, pair);
  return pair;
}

// The whole ground painted once on a 2048px canvas: asphalt, lane dashes, crosswalks,
// sidewalks, sand and grass, in the city's own coordinates.
function groundTexture() {
  return canvasTexture('ground', 2048, 2048, (g, W, H) => {
    const sx = W / (CITY.width + 160), sz = H / (CITY.depth + 220);
    const px = (x) => (x + CITY.width / 2 + 80) * sx;
    const pz = (z) => (z + CITY.depth / 2 + 60) * sz;
    g.fillStyle = '#3d4148'; g.fillRect(0, 0, W, H);                       // asphalt base
    g.fillStyle = '#4a7c59'; g.fillRect(0, 0, W, pz(-CITY.depth / 2 - 58)); // north grass strip
    const sandGrad = g.createLinearGradient(0, pz(CITY.depth / 2), 0, pz(CITY.depth / 2 + 60));
    sandGrad.addColorStop(0, '#e8cf9e'); sandGrad.addColorStop(1, '#dfc491');
    g.fillStyle = sandGrad;
    g.fillRect(0, pz(CITY.depth / 2), W, pz(CITY.depth / 2 + 60) - pz(CITY.depth / 2)); // beach
    // blocks: sidewalk slabs
    for (let col = 0; col < CITY.cols; col++) {
      for (let row = 0; row < CITY.rows; row++) {
        const c = blockCenter(col, row);
        g.fillStyle = '#9aa0a3';
        g.fillRect(px(c.x - CITY.blockSize / 2 - 2), pz(c.z - CITY.blockSize / 2 - 2),
          (CITY.blockSize + 4) * sx, (CITY.blockSize + 4) * sz);
        g.fillStyle = '#878d90';
        g.fillRect(px(c.x - CITY.blockSize / 2), pz(c.z - CITY.blockSize / 2),
          CITY.blockSize * sx, CITY.blockSize * sz);
      }
    }
    // lane dashes along every road centreline
    g.fillStyle = '#e8c85a';
    for (let i = 0; i <= CITY.cols; i++) {
      const x = i * CITY.pitch - CITY.width / 2;
      for (let z = -CITY.depth / 2; z < CITY.depth / 2; z += 9) {
        if (Math.abs(((z + CITY.depth / 2) % CITY.pitch)) < 10) continue;   // gap at junctions
        g.fillRect(px(x) - 1.5, pz(z), 3, 5 * sz);
      }
    }
    for (let j = 0; j <= CITY.rows; j++) {
      const z = j * CITY.pitch - CITY.depth / 2;
      for (let x = -CITY.width / 2; x < CITY.width / 2; x += 9) {
        if (Math.abs(((x + CITY.width / 2) % CITY.pitch)) < 10) continue;
        g.fillRect(px(x), pz(z) - 1.5, 5 * sx, 3);
      }
    }
    // crosswalks at junctions
    g.fillStyle = 'rgba(240,240,240,0.85)';
    for (let i = 0; i <= CITY.cols; i++) {
      for (let j = 0; j <= CITY.rows; j++) {
        const x = i * CITY.pitch - CITY.width / 2, z = j * CITY.pitch - CITY.depth / 2;
        for (let s = -2; s <= 2; s++) {
          g.fillRect(px(x - CITY.roadWidth / 2 - 3), pz(z + s * 2.4) - 1, 4 * sx, 1.6);
          g.fillRect(px(x + CITY.roadWidth / 2 - 1), pz(z + s * 2.4) - 1, 4 * sx, 1.6);
        }
      }
    }
  });
}

// Push a circle (a person or a car) out of every building box it overlaps.
// Returns the corrected position and whether anything was hit.
export function collideCircle(colliders, x, z, radius) {
  let hit = false;
  for (const b of colliders) {
    const nx = Math.max(b.x0, Math.min(x, b.x1));
    const nz = Math.max(b.z0, Math.min(z, b.z1));
    const dx = x - nx, dz = z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    hit = true;
    if (d2 > 1e-6) {
      const d = Math.sqrt(d2);
      x = nx + (dx / d) * radius;
      z = nz + (dz / d) * radius;
    } else {
      // centre inside the box: leave by the shallowest face
      const left = x - b.x0, right = b.x1 - x, top = z - b.z0, bottom = b.z1 - z;
      const m = Math.min(left, right, top, bottom);
      if (m === left) x = b.x0 - radius;
      else if (m === right) x = b.x1 + radius;
      else if (m === top) z = b.z0 - radius;
      else z = b.z1 + radius;
    }
  }
  return { x, z, hit };
}

function box(w, h, d, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

export function createWorld(scene, seed = 7) {
  const rng = makeRng(seed * 7919 + 13);
  const group = new THREE.Group();
  const colliders = [];
  const lampHeads = [];
  const neonMats = [];
  const facadeMats = [];
  scene.add(group);

  // ---- ground -------------------------------------------------------------
  const groundMat = new THREE.MeshLambertMaterial({ map: groundTexture() });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(CITY.width + 160, CITY.depth + 220), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 20);
  ground.receiveShadow = true;
  group.add(ground);

  // ---- the sea --------------------------------------------------------------
  const seaTex = canvasTexture('sea', 256, 256, (g, w, h) => {
    g.fillStyle = '#1b6f7d'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.20)'; g.lineWidth = 2;
    for (let i = 0; i < 26; i++) {
      const y = rng() * h;
      g.beginPath(); g.moveTo(rng() * w, y); g.lineTo(rng() * w, y + rng() * 4 - 2); g.stroke();
    }
  });
  seaTex.wrapS = seaTex.wrapT = THREE.RepeatWrapping;
  seaTex.repeat.set(30, 10);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.width + 700, 320),
    new THREE.MeshPhongMaterial({ map: seaTex, color: 0x9fd8e8, transparent: true, opacity: 0.94, shininess: 120 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -0.4, CITY.depth / 2 + 60 + 130);
  group.add(sea);

  // ---- landmark footprints are reserved before blocks are filled -----------
  const reserved = [];
  const reserve = (x, z, r) => reserved.push({ x0: x - r, z0: z - r, x1: x + r, z1: z + r });
  reserve(PLACES.hospital.x, PLACES.hospital.z, 13);
  reserve(PLACES.policeStation.x, PLACES.policeStation.z, 13);
  reserve(PLACES.paySprayNorth.x, PLACES.paySprayNorth.z, 11);
  reserve(PLACES.paySpraySouth.x, PLACES.paySpraySouth.z, 11);
  reserve(PLACES.marisolClub.x, PLACES.marisolClub.z, 12);
  for (const b of PLACES.phoneBooths) reserve(b.x, b.z, 4);
  const overlapsReserved = (x0, z0, x1, z1) => reserved.some(r => x0 < r.x1 && x1 > r.x0 && z0 < r.z1 && z1 > r.z0);

  // ---- buildings -------------------------------------------------------------
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x555f66 });
  for (let col = 0; col < CITY.cols; col++) {
    for (let row = 0; row < CITY.rows; row++) {
      const district = districtAt(col, row);
      const c = blockCenter(col, row);
      const perBlock = rng() < 0.4 ? 1 : 2;
      for (let k = 0; k < perBlock; k++) {
        if (rng() > district.density + 0.15) continue;
        const bw = perBlock === 1 ? CITY.blockSize - 6 : (CITY.blockSize - 8) / 2;
        const bd = CITY.blockSize - 8 - rng() * 8;
        const ox = perBlock === 1 ? 0 : (k === 0 ? -bw / 2 - 2 : bw / 2 + 2);
        const bx = c.x + ox, bz = c.z + (rng() - 0.5) * 4;
        const h = district.minH + rng() * (district.maxH - district.minH);
        if (overlapsReserved(bx - bw / 2, bz - bd / 2, bx + bw / 2, bz + bd / 2)) continue;
        const wall = pickRandom(district.wallColors, rng);
        const tex = facadeTextures(wall, Math.floor(rng() * 6) + (col * 7 + row) % 5, 0.28);
        const mat = new THREE.MeshLambertMaterial({ map: tex.map, emissive: 0xffb85c, emissiveMap: tex.emissiveMap, emissiveIntensity: 0 });
        facadeMats.push(mat);
        const b = box(bw, h, bd, mat);
        b.position.set(bx, h / 2, bz);
        group.add(b);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.4, 0.5, bd + 0.4),
          new THREE.MeshLambertMaterial({ color: district.roofColor }));
        roof.position.set(bx, h + 0.25, bz);
        group.add(roof);
        colliders.push({ x0: bx - bw / 2, z0: bz - bd / 2, x1: bx + bw / 2, z1: bz + bd / 2, h });
        // a neon sign for Neon Mile storefronts
        if (district.id === 'neon-mile' && rng() < 0.75) {
          const signMat = new THREE.MeshBasicMaterial({ color: district.neon });
          signMat.userData.base = new THREE.Color(district.neon);
          neonMats.push(signMat);
          const sign = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.7, 1.6, 0.3), signMat);
          sign.position.set(bx, 4.5 + rng() * 3, bz + bd / 2 + 0.2);
          group.add(sign);
        }
      }
    }
  }

  // ---- street lamps -----------------------------------------------------------
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2c3136 });
  const lampHeadMat = new THREE.MeshBasicMaterial({ color: 0x554d33 });
  const lampGlowMat = new THREE.MeshBasicMaterial({
    color: 0xffc37a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  for (let i = 0; i <= CITY.cols; i++) {
    for (let j = 0; j <= CITY.rows; j++) {
      if ((i + j) % 2 !== 0) continue;
      const x = i * CITY.pitch - CITY.width / 2 + (i % 2 ? 8 : -8);
      const z = j * CITY.pitch - CITY.depth / 2 + (j % 2 ? 8 : -8);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 5.4, 6), poleMat);
      pole.position.set(x, 2.7, z);
      group.add(pole);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.5), lampHeadMat);
      head.position.set(x, 5.45, z);
      group.add(head);
      const glow = new THREE.Mesh(new THREE.CircleGeometry(4.6, 20), lampGlowMat);
      glow.rotation.x = -Math.PI / 2;
      glow.position.set(x, 0.06, z);
      group.add(glow);
      lampHeads.push(head);
    }
  }

  // ---- palm trees ---------------------------------------------------------------
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6a48 });
  const frondTex = canvasTexture('frond', 128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = '#2e7d46'; g.lineWidth = 5; g.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      g.beginPath(); g.moveTo(w / 2, h / 2);
      g.quadraticCurveTo(w / 2 + Math.cos(a) * 34, h / 2 + Math.sin(a) * 30 - 8,
        w / 2 + Math.cos(a) * 58, h / 2 + Math.sin(a) * 46 + 12);
      g.stroke();
    }
  });
  const frondMat = new THREE.MeshLambertMaterial({ map: frondTex, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
  function palm(x, z, s = 1) {
    const t = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * s, 0.26 * s, 6.4 * s, 6), trunkMat);
    trunk.position.y = 3.2 * s; trunk.rotation.z = 0.07;
    trunk.castShadow = true;
    t.add(trunk);
    for (let i = 0; i < 3; i++) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(6.4 * s, 6.4 * s), frondMat);
      f.position.y = 6.6 * s;
      f.rotation.set(-Math.PI / 2 + 0.35, 0, i * Math.PI / 3);
      t.add(f);
    }
    t.position.set(x, 0, z);
    group.add(t);
    colliders.push({ x0: x - 0.4, z0: z - 0.4, x1: x + 0.4, z1: z + 0.4, h: 6 });
  }
  for (let x = -CITY.width / 2 + 14; x < CITY.width / 2; x += 26) {
    palm(x + rng() * 6, CITY.depth / 2 + 12 + rng() * 16, 0.9 + rng() * 0.5);   // beach row
  }
  for (let i = 0; i < 26; i++) {
    const c = blockCenter(Math.floor(rng() * CITY.cols), Math.floor(rng() * CITY.rows));
    palm(c.x + (rng() - 0.5) * 34, c.z + (rng() - 0.5) * 34, 0.8 + rng() * 0.5);
  }

  // ---- the harbor: cranes and container stacks -----------------------------------
  if (true) {
    const craneMat = new THREE.MeshLambertMaterial({ color: 0xd8722c });
    for (const cx of [-CITY.width / 2 + 44, -CITY.width / 2 + 120]) {
      const crane = new THREE.Group();
      const legL = box(1.4, 26, 1.4, craneMat); legL.position.set(-7, 13, 0);
      const legR = box(1.4, 26, 1.4, craneMat); legR.position.set(7, 13, 0);
      const beam = box(30, 1.6, 1.6, craneMat); beam.position.set(0, 26.5, 0);
      const cab = box(3, 3, 3, new THREE.MeshLambertMaterial({ color: 0x33424e })); cab.position.set(4, 24, 0);
      crane.add(legL, legR, beam, cab);
      crane.position.set(cx, 0, CITY.depth / 2 - 30);
      group.add(crane);
      colliders.push({ x0: cx - 9, z0: CITY.depth / 2 - 32, x1: cx + 9, z1: CITY.depth / 2 - 28, h: 26 });
    }
    const containerColors = [0xc23b2e, 0x2e6ec2, 0x2ea35a, 0xd8a02e, 0x7a4fa3];
    for (let i = 0; i < 16; i++) {
      const cx = -CITY.width / 2 + 16 + rng() * 150;
      const cz = CITY.depth / 2 - 52 + rng() * 26;
      const levels = 1 + Math.floor(rng() * 3);
      for (let l = 0; l < levels; l++) {
        const cont = box(11, 2.6, 4.4, new THREE.MeshLambertMaterial({ color: pickRandom(containerColors, rng) }));
        cont.position.set(cx, 1.3 + l * 2.6, cz);
        if (l === 0) cont.rotation.y = (rng() - 0.5) * 0.2;
        group.add(cont);
      }
      colliders.push({ x0: cx - 5.5, z0: cz - 2.2, x1: cx + 5.5, z1: cz + 2.2, h: 8 });
    }
  }

  // ---- the pier ---------------------------------------------------------------------
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x9a7648 });
  const pier = box(8, 0.7, 52, pierMat);
  pier.position.set(PLACES.beachPier.x, 0.35, CITY.depth / 2 + 26);
  group.add(pier);
  for (let i = 0; i < 6; i++) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 2.4, 6), pierMat);
    post.position.set(PLACES.beachPier.x - 3.4, -0.6, CITY.depth / 2 + 6 + i * 9);
    group.add(post);
    const post2 = post.clone(); post2.position.x = PLACES.beachPier.x + 3.4;
    group.add(post2);
  }

  // ---- landmarks ----------------------------------------------------------------------
  function landmark(place, w, h, d, color, signColor, signText) {
    const g = new THREE.Group();
    const body = box(w, h, d, new THREE.MeshLambertMaterial({ color }));
    body.position.y = h / 2;
    g.add(body);
    const signTex = canvasTexture(`sign-${signText}`, 512, 96, (cg, cw, ch) => {
      cg.fillStyle = '#10161c'; cg.fillRect(0, 0, cw, ch);
      cg.fillStyle = signColor; cg.font = 'bold 52px Verdana'; cg.textAlign = 'center'; cg.textBaseline = 'middle';
      cg.fillText(signText, cw / 2, ch / 2 + 2);
    });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.92, 1.9),
      new THREE.MeshBasicMaterial({ map: signTex }));
    sign.position.set(0, h - 1.4, d / 2 + 0.06);
    g.add(sign);
    g.position.set(place.x, 0, place.z);
    group.add(g);
    colliders.push({ x0: place.x - w / 2, z0: place.z - d / 2, x1: place.x + w / 2, z1: place.z + d / 2, h });
    return g;
  }
  landmark(PLACES.hospital, 20, 13, 12, 0xf4f7f8, '#ff5147', 'ST. SIREN HOSPITAL');
  landmark(PLACES.policeStation, 20, 11, 12, 0xcfd8de, '#3e9bff', 'CBPD CENTRAL');
  landmark(PLACES.marisolClub, 18, 10, 12, 0x3a2b44, '#ff5ca8', 'CLUB MARISOL');
  // Pay & Spray garages: open-front boxes with a glowing teal sign (the respray trigger
  // radius lives in main; the building itself is kept out of the collider list so the
  // player can drive in).
  function paySpray(place) {
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: 0xd8dde2 });
    const back = box(14, 6, 0.6, mat); back.position.set(0, 3, -5);
    const left = box(0.6, 6, 10, mat); left.position.set(-7, 3, 0);
    const right = box(0.6, 6, 10, mat); right.position.set(7, 3, 0);
    const top = box(14.6, 0.6, 10.6, mat); top.position.set(0, 6.2, 0);
    const signTex = canvasTexture('sign-spray', 512, 96, (cg, cw, ch) => {
      cg.fillStyle = '#0c2b33'; cg.fillRect(0, 0, cw, ch);
      cg.fillStyle = '#39d0c4'; cg.font = 'bold 46px Verdana'; cg.textAlign = 'center'; cg.textBaseline = 'middle';
      cg.fillText('SHINE CITY RESPRAY', cw / 2, ch / 2 + 2);
    });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(12, 1.8), new THREE.MeshBasicMaterial({ map: signTex }));
    sign.position.set(0, 5.1, 5.36);
    g.add(back, left, right, top, sign);
    g.position.set(place.x, 0, place.z);
    group.add(g);
  }
  paySpray(PLACES.paySprayNorth);
  paySpray(PLACES.paySpraySouth);

  // Phone booths: small glass kiosks with a warm glowing cap — the story starts at these.
  const boothMat = new THREE.MeshPhongMaterial({ color: 0x7de8e0, transparent: true, opacity: 0.4, shininess: 90 });
  const boothCapMat = new THREE.MeshBasicMaterial({ color: 0xffb347 });
  boothCapMat.userData.base = new THREE.Color(0xffb347);
  neonMats.push(boothCapMat);
  for (const b of PLACES.phoneBooths) {
    const booth = new THREE.Group();
    const glass = box(1.4, 2.6, 1.4, boothMat); glass.position.y = 1.3;
    const cap = box(1.6, 0.3, 1.6, boothCapMat); cap.position.y = 2.75;
    booth.add(glass, cap);
    booth.position.set(b.x, 0, b.z);
    group.add(booth);
    colliders.push({ x0: b.x - 0.7, z0: b.z - 0.7, x1: b.x + 0.7, z1: b.z + 0.7, h: 2.6 });
  }

  return { group, colliders, lampHeads, neonMats, facadeMats, seaTex, sea, lampHeadMat, lampGlowMat };
}

// Called every frame by main: animate the sea and set how "night" the dressing looks.
export function updateWorld(world, dt, elapsed, nightFactor) {
  world.seaTex.offset.x = (elapsed * 0.008) % 1;
  world.seaTex.offset.y = Math.sin(elapsed * 0.22) * 0.02;
  world.lampHeadMat.color.setRGB(0.33 + nightFactor * 0.67, 0.30 + nightFactor * 0.55, 0.20 + nightFactor * 0.18);
  world.lampGlowMat.opacity = nightFactor * 0.33;
  for (const m of world.facadeMats) m.emissiveIntensity = nightFactor * 0.85;
  const pulse = (0.35 + nightFactor * 0.65) * (0.85 + Math.sin(elapsed * 2.6) * 0.15);
  for (const m of world.neonMats) {
    if (m.userData.base) m.color.copy(m.userData.base).multiplyScalar(pulse);
  }
}


