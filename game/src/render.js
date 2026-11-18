// Rendering: the three.js scene, the HUD DOM and the minimap. The scene is built
// once from the seeded city; every frame only moves the meshes that moved.
// Ground markings, windows and the sky are canvas textures, so the game needs
// no image files at all. Nothing here touches the simulation except to read it.
import * as THREE from '../vendor/three.module.min.js';
import { CITY, PALETTE, PLAYER } from './config.js';
import { currentTarget, objectiveText } from './missions.js';

const WORLD_MIN = -260;
const WORLD_SPAN = 520;

function mapX(x, size) {
  return ((x - WORLD_MIN) / WORLD_SPAN) * size;
}
function mapZ(z, size) {
  return ((z - WORLD_MIN) / WORLD_SPAN) * size;
}

/** Merge coloured boxes into one BufferGeometry (one mesh per car/person). */
function mergedBoxes(parts) {
  const positions = [];
  const normals = [];
  const colors = [];
  const indices = [];
  let base = 0;
  const color = new THREE.Color();
  for (const part of parts) {
    const geo = new THREE.BoxGeometry(part.w, part.h, part.d);
    geo.translate(part.x ?? 0, part.y ?? 0, part.z ?? 0);
    color.set(part.color);
    const pos = geo.attributes.position;
    const nor = geo.attributes.normal;
    for (let i = 0; i < pos.count; i += 1) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      normals.push(nor.getX(i), nor.getY(i), nor.getZ(i));
      colors.push(color.r, color.g, color.b);
    }
    const idx = geo.index;
    for (let i = 0; i < idx.count; i += 1) indices.push(idx.getX(i) + base);
    base += pos.count;
    geo.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  out.setIndex(indices);
  return out;
}

function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, PALETTE.skyTop);
  grad.addColorStop(0.55, PALETTE.skyMid);
  grad.addColorStop(1, PALETTE.skyLow);
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function windowTexture() {
  // One tile = one 3 m window cell: near-white wall, one dark window.
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#f2ede2';
  g.fillRect(0, 0, 32, 32);
  g.fillStyle = '#232a36';
  g.fillRect(8, 8, 16, 16);
  g.fillStyle = '#3d5a78';
  g.fillRect(10, 10, 12, 6);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function groundTexture(city) {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d');
  const X = (x) => mapX(x, S);
  const Z = (z) => mapZ(z, S);
  const W = (m) => (m / WORLD_SPAN) * S;
  g.fillStyle = PALETTE.grass;
  g.fillRect(0, 0, S, S);
  // Sea and beach (south), harbour concrete (east).
  g.fillStyle = PALETTE.sea;
  g.fillRect(0, Z(240), S, S - Z(240));
  g.fillStyle = PALETTE.sand;
  g.fillRect(0, Z(214), S, Z(240) - Z(214));
  g.fillStyle = '#8a8580';
  g.fillRect(X(214), 0, S - X(214), S);
  // City asphalt, then sidewalks around every block.
  g.fillStyle = PALETTE.asphalt;
  g.fillRect(X(-214), Z(-214), W(428), W(428));
  for (const block of city.blocks) {
    g.fillStyle = PALETTE.sidewalk;
    g.fillRect(X(block.x - 23), Z(block.z - 23), W(46), W(46));
    g.fillStyle = '#8a8378';
    g.fillRect(X(block.x - 20), Z(block.z - 20), W(40), W(40));
  }
  // Stadium gets a green field.
  const st = city.landmarks.stadium;
  g.fillStyle = '#4a7a3a';
  g.fillRect(X(st.x - 17), Z(st.z - 15), W(34), W(30));
  // Crosswalks and centre dashes at every intersection.
  g.fillStyle = '#d8d8d8';
  for (const rx of city.roadX) {
    for (const rz of city.roadZ) {
      for (let s = -2; s <= 2; s += 1) {
        g.fillRect(X(rx + s * 2.2 - 0.9), Z(rz - 7), W(1.8), W(14));
        g.fillRect(X(rx - 7), Z(rz + s * 2.2 - 0.9), W(14), W(1.8));
      }
    }
  }
  g.fillStyle = '#d8b13c';
  for (const rx of city.roadX) {
    for (let z = -210; z < 210; z += 12) g.fillRect(X(rx - 0.5), Z(z), W(1), W(6));
  }
  for (const rz of city.roadZ) {
    for (let x = -210; x < 210; x += 12) g.fillRect(X(x), Z(rz - 0.5), W(6), W(1));
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 1;
  return tex;
}

/** Box geometry with window UVs baked in metres (one window per 3 m). */
function buildingGeometry(w, h, d) {
  const geo = new THREE.BoxGeometry(w, h, d);
  geo.translate(0, h / 2, 0);
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i += 1) {
    const nx = nor.getX(i);
    const ny = nor.getY(i);
    const nz = nor.getZ(i);
    if (Math.abs(ny) > 0.5) {
      uv.setXY(i, 0.02, 0.02); // roof: plain wall colour
    } else if (Math.abs(nx) > 0.5) {
      uv.setXY(i, pos.getZ(i) / 3, pos.getY(i) / 3);
    } else {
      uv.setXY(i, pos.getX(i) / 3, pos.getY(i) / 3);
    }
  }
  return geo;
}

function carGeometry(color, isPolice) {
  const parts = [
    { w: 2.0, h: 0.62, d: 4.4, x: 0, y: 0.55, z: 0, color },
    { w: 1.7, h: 0.55, d: 2.2, x: 0, y: 1.1, z: -0.3, color: '#1e2836' },
    { w: 0.34, h: 0.62, d: 0.62, x: -0.85, y: 0.31, z: 1.45, color: '#141414' },
    { w: 0.34, h: 0.62, d: 0.62, x: 0.85, y: 0.31, z: 1.45, color: '#141414' },
    { w: 0.34, h: 0.62, d: 0.62, x: -0.85, y: 0.31, z: -1.45, color: '#141414' },
    { w: 0.34, h: 0.62, d: 0.62, x: 0.85, y: 0.31, z: -1.45, color: '#141414' },
    { w: 1.7, h: 0.16, d: 0.3, x: 0, y: 0.72, z: 2.21, color: '#fff2b0' },
    { w: 1.7, h: 0.16, d: 0.3, x: 0, y: 0.72, z: -2.21, color: '#c02020' },
  ];
  if (isPolice) {
    parts.push({ w: 1.2, h: 0.22, d: 0.6, x: 0, y: 1.5, z: -0.3, color: '#2040c0' });
    parts.push({ w: 1.2, h: 0.22, d: 0.6, x: 0, y: 1.5, z: 0.3, color: '#c02020' });
  }
  return mergedBoxes(parts);
}

function personGeometry(shirt, pants, skin) {
  return mergedBoxes([
    { w: 0.42, h: 0.62, d: 0.24, x: 0, y: 1.05, z: 0, color: shirt },
    { w: 0.16, h: 0.72, d: 0.2, x: -0.12, y: 0.36, z: 0, color: pants },
    { w: 0.16, h: 0.72, d: 0.2, x: 0.12, y: 0.36, z: 0, color: pants },
    { w: 0.34, h: 0.34, d: 0.32, x: 0, y: 1.55, z: 0, color: skin },
    { w: 0.14, h: 0.5, d: 0.14, x: -0.3, y: 1.05, z: 0, color: shirt },
    { w: 0.14, h: 0.5, d: 0.14, x: 0.3, y: 1.05, z: 0, color: shirt },
  ]);
}

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xe8a56b, 200, 700);
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1200);
  const hemi = new THREE.HemisphereLight(0xffd9a0, 0x3a2f2f, 1.0);
  const sun = new THREE.DirectionalLight(0xffe0b0, 1.6);
  sun.position.set(-120, 180, -80);
  scene.add(hemi);
  scene.add(sun);
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(800, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false }),
  );
  scene.add(sky);

  const hud = {
    cash: document.getElementById('hud-cash'),
    stars: document.getElementById('hud-stars'),
    health: document.getElementById('hud-health'),
    objective: document.getElementById('hud-objective'),
    prompt: document.getElementById('hud-prompt'),
    speed: document.getElementById('hud-speed'),
    minimap: document.getElementById('minimap'),
    vignette: document.getElementById('vignette'),
    title: document.getElementById('screen-title'),
    paused: document.getElementById('screen-paused'),
    over: document.getElementById('screen-over'),
    complete: document.getElementById('screen-complete'),
    overStats: document.getElementById('over-stats'),
    completeStats: document.getElementById('complete-stats'),
    toast: document.getElementById('toast'),
    bestTitle: document.getElementById('title-best'),
  };
  const mapCtx = hud.minimap ? hud.minimap.getContext('2d') : null;

  let built = null; // { city, meshes... } rebuilt when the city changes
  let camPos = new THREE.Vector3(0, 60, 140);
  let toastTimer = 0;
  let lastToast = '';

  function build(state) {
    const city = state.city;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD_SPAN, WORLD_SPAN),
      new THREE.MeshLambertMaterial({ map: groundTexture(city) }),
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(520, 40),
      new THREE.MeshLambertMaterial({ color: 0x1d6f92, transparent: true, opacity: 0.55 }),
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, 0.06, 252);
    scene.add(sea);

    // Buildings in three height classes, one InstancedMesh each.
    const winTex = windowTexture();
    const winMat = new THREE.MeshLambertMaterial({ map: winTex });
    const classes = [
      { max: 14, geo: buildingGeometry(16, 11, 16) },
      { max: 26, geo: buildingGeometry(18, 20, 18) },
      { max: 999, geo: buildingGeometry(20, 32, 20) },
    ];
    const byClass = [[], [], []];
    for (const b of city.buildings) {
      byClass[b.h <= 14 ? 0 : b.h <= 26 ? 1 : 2].push(b);
    }
    const buildingMeshes = [];
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const col = new THREE.Color();
    classes.forEach((cls, ci) => {
      const list = byClass[ci];
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(cls.geo, winMat, list.length);
      list.forEach((b, i) => {
        const rep = cls.max === 14 ? { w: 16, h: 11, d: 16 } : cls.max === 26 ? { w: 18, h: 20, d: 18 } : { w: 20, h: 32, d: 20 };
        m4.compose(
          new THREE.Vector3(b.x, 0, b.z),
          q,
          new THREE.Vector3(b.w / rep.w, b.h / rep.h, b.d / rep.d),
        );
        mesh.setMatrixAt(i, m4);
        mesh.setColorAt(i, col.set(b.color));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      scene.add(mesh);
      buildingMeshes.push(mesh);
    });
    // Roof caps.
    const roofGeo = new THREE.BoxGeometry(1, 0.5, 1);
    roofGeo.translate(0, 0.25, 0);
    const roofMesh = new THREE.InstancedMesh(roofGeo, new THREE.MeshLambertMaterial({ color: 0x4a3f38 }), city.buildings.length);
    city.buildings.forEach((b, i) => {
      m4.compose(new THREE.Vector3(b.x, b.h, b.z), q, new THREE.Vector3(b.w + 0.6, 1, b.d + 0.6));
      roofMesh.setMatrixAt(i, m4);
    });
    roofMesh.instanceMatrix.needsUpdate = true;
    scene.add(roofMesh);

    // Palms: trunks and canopies, instanced.
    const trunkGeo = new THREE.CylinderGeometry(0.16, 0.24, 4.4, 6);
    trunkGeo.translate(0, 2.2, 0);
    const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x7a5a38 }), city.palms.length);
    const canopyGeo = new THREE.ConeGeometry(2.4, 2.6, 7);
    canopyGeo.translate(0, 5.4, 0);
    const canopies = new THREE.InstancedMesh(canopyGeo, new THREE.MeshLambertMaterial({ color: 0x3f7a3a }), city.palms.length);
    city.palms.forEach((p, i) => {
      m4.compose(new THREE.Vector3(p.x, 0, p.z), q, new THREE.Vector3(p.s, p.s, p.s));
      trunks.setMatrixAt(i, m4);
      canopies.setMatrixAt(i, m4);
    });
    trunks.instanceMatrix.needsUpdate = true;
    canopies.instanceMatrix.needsUpdate = true;
    scene.add(trunks);
    scene.add(canopies);

    // The yacht: hull + cabin + mast.
    const yacht = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(10, 3, 26), new THREE.MeshLambertMaterial({ color: 0xf0ead8 }));
    hull.position.y = 1.2;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(6, 2.4, 12), new THREE.MeshLambertMaterial({ color: 0xd8d2c4 }));
    cabin.position.y = 3.8;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 12, 6), new THREE.MeshLambertMaterial({ color: 0x888888 }));
    mast.position.y = 9;
    yacht.add(hull, cabin, mast);
    yacht.position.set(239, 0, 60);
    scene.add(yacht);

    // The mission beacon: a column of light and a ground ring.
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffd23c, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false });
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 70, 12, 1, true), beaconMat);
    beacon.position.y = 35;
    beacon.visible = false;
    scene.add(beacon);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.4, 3.4, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd23c, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.08;
    ring.visible = false;
    scene.add(ring);

    // The tracer line for pistol shots.
    const tracerGeo = new THREE.BufferGeometry();
    tracerGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
    const tracer = new THREE.Line(tracerGeo, new THREE.LineBasicMaterial({ color: 0xffe9a0 }));
    tracer.visible = false;
    scene.add(tracer);

    built = {
      city,
      buildingMeshes,
      roofMesh,
      trunks,
      canopies,
      yacht,
      beacon,
      ring,
      tracer,
      carMeshes: new Map(),
      playerMesh: new THREE.Mesh(personGeometry('#c0392b', '#2c3e50', '#e8b98a'), new THREE.MeshLambertMaterial({ vertexColors: true })),
      pedMesh: null,
      copMesh: null,
      pickupMesh: null,
    };
    scene.add(built.playerMesh);
    // Pedestrians and cops share one person shape, instanced, tinted per instance.
    const pedGeo = personGeometry('#ffffff', '#3a3a3a', '#e8b98a');
    const pedMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    built.pedMesh = new THREE.InstancedMesh(pedGeo, pedMat, 24);
    built.pedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(built.pedMesh);
    built.copMesh = new THREE.InstancedMesh(pedGeo, new THREE.MeshLambertMaterial({ color: 0x1e3a5f }), 8);
    built.copMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(built.copMesh);
    // Pickups: glowing octahedra, gold / green / orange.
    const pickGeo = new THREE.OctahedronGeometry(0.9);
    built.pickupMesh = new THREE.InstancedMesh(pickGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), 20);
    built.pickupMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(built.pickupMesh);
  }

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const tmpV = new THREE.Vector3();
  const tmpC = new THREE.Color();
  const pedColors = ['#d8d8d8', '#a52a2a', '#3a6ea5', '#2e7d5b', '#d8b13c', '#7a4a8f'];

  function syncCars(state) {
    const seen = new Set();
    for (const car of state.cars) {
      seen.add(car.id);
      let mesh = built.carMeshes.get(car.id);
      if (!mesh) {
        mesh = new THREE.Mesh(carGeometry(car.color, car.isPolice), new THREE.MeshLambertMaterial({ vertexColors: true }));
        scene.add(mesh);
        built.carMeshes.set(car.id, mesh);
      }
      mesh.visible = true;
      mesh.position.set(car.x, 0, car.z);
      mesh.rotation.y = car.heading;
      if (car.isPolice && !car.disabled) {
        // Flashing light bar: alternate the cabin tint by time.
        mesh.material.emissive = mesh.material.emissive || new THREE.Color();
        mesh.material.emissive.setHex(Math.floor(state.time * 2) % 2 === 0 ? 0x201040 : 0x401020);
      }
    }
    for (const [id, mesh] of built.carMeshes) {
      if (!seen.has(id)) mesh.visible = false;
    }
  }

  function drawMinimap(state) {
    if (!mapCtx || !hud.minimap) return;
    const S = hud.minimap.width;
    const g = mapCtx;
    g.clearRect(0, 0, S, S);
    g.fillStyle = '#20242c';
    g.fillRect(0, 0, S, S);
    g.fillStyle = '#1d6f92';
    g.fillRect(0, mapZ(240, S), S, S - mapZ(240, S));
    g.fillStyle = '#e0c48f';
    g.fillRect(0, mapZ(214, S), S, mapZ(240, S) - mapZ(214, S));
    g.fillStyle = '#8a8580';
    g.fillRect(mapX(214, S), 0, S - mapX(214, S), S);
    g.fillStyle = '#3a3f46';
    g.fillRect(mapX(-214, S), mapZ(-214, S), mapX(214, S) - mapX(-214, S), mapZ(214, S) - mapZ(-214, S));
    g.fillStyle = '#565b63';
    for (const block of state.city.blocks) {
      g.fillRect(mapX(block.x - 20, S), mapZ(block.z - 20, S), (40 / WORLD_SPAN) * S, (40 / WORLD_SPAN) * S);
    }
    const dot = (x, z, r, color) => {
      g.fillStyle = color;
      g.beginPath();
      g.arc(mapX(x, S), mapZ(z, S), r, 0, Math.PI * 2);
      g.fill();
    };
    for (const p of state.pickups) if (!p.taken) dot(p.x, p.z, 2, p.kind === 'stash' ? '#ffd23c' : p.kind === 'health' ? '#37d67a' : '#ff8c42');
    for (const car of state.cars) dot(car.x, car.z, car.isPolice ? 3 : 2, car.isPolice ? '#ff4040' : '#9aa0aa');
    for (const cop of state.cops) if (!cop.down) dot(cop.x, cop.z, 2.5, '#ff4040');
    const target = currentTarget(state);
    if (target) {
      const pulse = 3 + Math.sin(state.time * 5) * 1.5;
      dot(target.x, target.z, pulse, '#ffd23c');
      g.strokeStyle = '#ffd23c';
      g.beginPath();
      g.arc(mapX(target.x, S), mapZ(target.z, S), pulse + 4, 0, Math.PI * 2);
      g.stroke();
    }
    // The player: a white arrow pointing along the heading.
    const px = mapX(state.player.x, S);
    const pz = mapZ(state.player.z, S);
    const h = state.player.heading;
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(px + Math.sin(h) * 7, pz + Math.cos(h) * 7);
    g.lineTo(px + Math.sin(h + 2.5) * 5, pz + Math.cos(h + 2.5) * 5);
    g.lineTo(px + Math.sin(h - 2.5) * 5, pz + Math.cos(h - 2.5) * 5);
    g.closePath();
    g.fill();
  }

  function setScreen(id) {
    if (hud.title) hud.title.style.display = id === 'title' ? 'flex' : 'none';
    if (hud.paused) hud.paused.style.display = id === 'paused' ? 'flex' : 'none';
    if (hud.over) hud.over.style.display = id === 'over' ? 'flex' : 'none';
    if (hud.complete) hud.complete.style.display = id === 'complete' ? 'flex' : 'none';
  }

  function toast(message) {
    if (!hud.toast) return;
    if (message === lastToast && toastTimer > 0) return;
    lastToast = message;
    toastTimer = 2.6;
    hud.toast.textContent = message;
    hud.toast.style.opacity = '1';
  }

  return {
    draw(state, screen, best, dt) {
      if (!built || built.city !== state.city) {
        if (built) {
          // A fresh city (restart) rebuilds the static scene.
          scene.clear();
          scene.add(hemi);
          scene.add(sun);
          scene.add(sky);
          built.carMeshes.clear();
        }
        build(state);
      }
      const w = canvas.clientWidth || 1280;
      const h = canvas.clientHeight || 720;
      if (renderer.getSize(tmpV).x !== w || renderer.getSize(tmpV).y !== h) {
        renderer.setSize(w, h, false);
      }
      camera.aspect = w / h;
      camera.updateProjectionMatrix();

      // Camera: title orbits the city; play follows the player from behind.
      const player = state.player;
      if (screen === 'title') {
        const a = state.time * 0.05;
        tmpV.set(Math.sin(a) * 150, 70, Math.cos(a) * 150);
        camPos.lerp(tmpV, Math.min(1, dt * 1.5));
        camera.position.copy(camPos);
        camera.lookAt(0, 10, 0);
      } else {
        const yaw = player.heading + Math.PI + player.orbitOffset;
        const dist = player.onFoot ? 10 : 13;
        const height = player.onFoot ? 6.5 : 8;
        tmpV.set(
          player.x + Math.sin(yaw) * dist,
          height,
          player.z + Math.cos(yaw) * dist,
        );
        // Snap when the target jumps (teleports, staged shots) instead of
        // gliding across the city for seconds.
        if (camPos.distanceTo(tmpV) > 40) camPos.copy(tmpV);
        else camPos.lerp(tmpV, Math.min(1, dt * 6));
        camera.position.copy(camPos);
        camera.lookAt(player.x + Math.sin(player.heading) * 6, 2, player.z + Math.cos(player.heading) * 6);
      }

      syncCars(state);
      // The player on foot (hidden while driving).
      built.playerMesh.visible = player.onFoot && !player.dead;
      if (player.onFoot) {
        built.playerMesh.position.set(player.x, 0, player.z);
        built.playerMesh.rotation.y = player.heading;
        const bob = Math.abs(player.speed) > 0.5 ? Math.sin(player.walkPhase) * 0.12 : 0;
        built.playerMesh.position.y = Math.abs(bob);
      }
      // Pedestrians and cops, instanced.
      let pi = 0;
      for (const ped of state.peds) {
        if (pi >= 24) break;
        const s = ped.down ? 0.35 : 1;
        q.setFromAxisAngle(up, ped.heading);
        m4.compose(tmpV.set(ped.x, ped.down ? 0 : 0, ped.z), q, new THREE.Vector3(1, s, 1));
        built.pedMesh.setMatrixAt(pi, m4);
        built.pedMesh.setColorAt(pi, tmpC.set(pedColors[pi % pedColors.length]));
        pi += 1;
      }
      built.pedMesh.count = pi;
      built.pedMesh.instanceMatrix.needsUpdate = true;
      if (built.pedMesh.instanceColor) built.pedMesh.instanceColor.needsUpdate = true;
      let ci = 0;
      for (const cop of state.cops) {
        if (ci >= 8) break;
        q.setFromAxisAngle(up, cop.heading);
        m4.compose(tmpV.set(cop.x, 0, cop.z), q, new THREE.Vector3(1, cop.down ? 0.4 : 1, 1));
        built.copMesh.setMatrixAt(ci, m4);
        ci += 1;
      }
      built.copMesh.count = ci;
      built.copMesh.instanceMatrix.needsUpdate = true;
      // Pickups bob and spin.
      let ki = 0;
      for (const p of state.pickups) {
        if (p.taken || ki >= 20) continue;
        q.setFromAxisAngle(up, state.time * 2 + ki);
        m4.compose(tmpV.set(p.x, 1.1 + Math.sin(state.time * 3 + ki) * 0.25, p.z), q, new THREE.Vector3(1, 1, 1));
        built.pickupMesh.setMatrixAt(ki, m4);
        built.pickupMesh.setColorAt(ki, tmpC.set(p.kind === 'stash' ? '#ffd23c' : p.kind === 'health' ? '#37d67a' : '#ff8c42'));
        ki += 1;
      }
      built.pickupMesh.count = ki;
      built.pickupMesh.instanceMatrix.needsUpdate = true;
      if (built.pickupMesh.instanceColor) built.pickupMesh.instanceColor.needsUpdate = true;

      // Mission beacon.
      const target = currentTarget(state);
      const showBeacon = screen === 'play' && target;
      built.beacon.visible = !!showBeacon;
      built.ring.visible = !!showBeacon;
      if (showBeacon) {
        built.beacon.position.set(target.x, 35, target.z);
        built.beacon.material.opacity = 0.22 + Math.sin(state.time * 4) * 0.08;
        built.ring.position.set(target.x, 0.08, target.z);
        const pulse = 1 + Math.sin(state.time * 4) * 0.15;
        built.ring.scale.set(pulse, pulse, 1);
      }
      // Pistol tracer.
      if (state.tracer) {
        const pos = built.tracer.geometry.attributes.position;
        pos.setXYZ(0, state.tracer.x0, 1.4, state.tracer.z0);
        pos.setXYZ(1, state.tracer.x1, 1.4, state.tracer.z1);
        pos.needsUpdate = true;
        built.tracer.visible = true;
      } else {
        built.tracer.visible = false;
      }

      renderer.render(scene, camera);
      drawMinimap(state);

      // HUD text.
      if (hud.cash) hud.cash.textContent = `$${Math.floor(player.cash)}`;
      if (hud.stars) {
        hud.stars.textContent = '★'.repeat(state.wanted.stars) + '☆'.repeat(5 - state.wanted.stars);
        hud.stars.style.color = state.wanted.stars > 0 ? '#ff5040' : '#ffffff';
      }
      if (hud.health) {
        hud.health.style.width = `${Math.max(0, player.health)}%`;
        hud.health.style.background = player.health > 50 ? '#37d67a' : player.health > 25 ? '#ffae2e' : '#ff5040';
      }
      if (hud.objective) hud.objective.textContent = objectiveText(state);
      if (hud.speed) {
        hud.speed.textContent = player.onFoot ? '' : `${Math.round(Math.abs(player.speed) * 3.6)} km/h`;
      }
      if (hud.prompt) {
        let prompt = '';
        if (screen === 'play') {
          if (player.onFoot) {
            let bestCar = null;
            let bestD = 4.5;
            for (const car of state.cars) {
              if (car.isPolice) continue;
              const d = Math.hypot(car.x - player.x, car.z - player.z);
              if (d < bestD) {
                bestD = d;
                bestCar = car;
              }
            }
            if (bestCar) prompt = 'Press E to enter the car';
            else if (state.missions.index === 2 && state.missions.stage === 'bank') {
              const v = state.missions.vault;
              if (Math.hypot(player.x - v.x, player.z - v.z) < 4) prompt = state.missions.hold > 0 ? 'Cracking the vault…' : 'Hold E to crack the vault';
            }
          } else {
            prompt = 'Press E to leave the car · F punch · Q shoot';
          }
        }
        hud.prompt.textContent = prompt;
      }
      if (hud.vignette) {
        hud.vignette.style.opacity = player.health < 30 ? String(0.55 - player.health * 0.012) : '0';
      }
      if (toastTimer > 0) {
        toastTimer -= dt;
        if (toastTimer <= 0 && hud.toast) hud.toast.style.opacity = '0';
      }
      setScreen(screen === 'complete' ? 'complete' : screen);
      if (hud.bestTitle) hud.bestTitle.textContent = best > 0 ? `Best cash: $${Math.floor(best)}` : '';
      if (screen === 'over' && hud.overStats) {
        hud.overStats.textContent = `Cash $${Math.floor(player.cash)} · Missions ${state.stats.missions}/4 · Crimes ${state.stats.crimes} · Stashes ${state.stats.pickups}`;
      }
      if (screen === 'complete' && hud.completeStats) {
        hud.completeStats.textContent = `Cash $${Math.floor(player.cash)} · Missions 4/4 · Crimes ${state.stats.crimes} · Stashes ${state.stats.pickups}`;
      }
    },
    toast,
    resize() {
      const w = canvas.clientWidth || 1280;
      const h = canvas.clientHeight || 720;
      renderer.setSize(w, h, false);
    },
  };
}
