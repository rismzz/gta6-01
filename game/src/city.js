// The city of Port Meridian: ground, road grid, buildings with lit windows,
// street lamps, palm trees and the mission waypoint beacon. Returns the
// building footprints as AABBs so the world can collide against them.
import { CITY, PALETTE } from './config.js';
import { pick, range } from './random.js';

/** A shared canvas texture of windows, tinted per building by material colour. */
function makeWindowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 64, 128);
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      const lit = Math.random() < 0.45;
      g.fillStyle = lit ? '#ffd98a' : '#2c3a4a';
      g.fillRect(6 + col * 14, 8 + row * 15, 9, 10);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createCity(random) {
  const group = new THREE.Group();
  const buildings = [];
  const windowTex = makeWindowTexture();

  // Ground: one big sidewalk-coloured slab for the whole city.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.half * 2 + 80, CITY.half * 2 + 80),
    new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // Roads: dark strips along every grid line, both directions.
  const roadMat = new THREE.MeshLambertMaterial({ color: PALETTE.road });
  const lineMat = new THREE.MeshBasicMaterial({ color: PALETTE.roadLine });
  const span = CITY.half * 2 + 60;
  for (const line of CITY.roads) {
    const along = new THREE.Mesh(new THREE.PlaneGeometry(span, CITY.roadWidth), roadMat);
    along.rotation.x = -Math.PI / 2;
    along.position.set(0, 0.02, line * CITY.pitch);
    along.receiveShadow = true;
    group.add(along);
    const across = new THREE.Mesh(new THREE.PlaneGeometry(CITY.roadWidth, span), roadMat);
    across.rotation.x = -Math.PI / 2;
    across.position.set(line * CITY.pitch, 0.02, 0);
    across.receiveShadow = true;
    group.add(across);
    // Dashed centre lines.
    for (let d = -CITY.half; d <= CITY.half; d += 9) {
      const dash = new THREE.Mesh(new THREE.BoxGeometry(3, 0.05, 0.5), lineMat);
      dash.position.set(d, 0.05, line * CITY.pitch);
      group.add(dash);
      const dash2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 3), lineMat);
      dash2.position.set(line * CITY.pitch, 0.05, d);
      group.add(dash2);
    }
  }

  // Buildings: 2x2 per block, varied heights and pastel facades.
  const blockCentres = [];
  for (let i = 0; i < CITY.roads.length - 1; i += 1) {
    blockCentres.push(((CITY.roads[i] + CITY.roads[i + 1]) / 2) * CITY.pitch);
  }
  for (const bx of blockCentres) {
    for (const bz of blockCentres) {
      for (const ox of [-11, 11]) {
        for (const oz of [-11, 11]) {
          if (random() < 0.12) continue; // occasional plaza gap
          const w = range(random, 14, 19);
          const d = range(random, 14, 19);
          const h = range(random, 8, 38);
          const colour = pick(random, PALETTE.building);
          const mat = new THREE.MeshLambertMaterial({ color: colour, map: windowTex });
          const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
          const x = bx + ox;
          const z = bz + oz;
          mesh.position.set(x, h / 2, z);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          group.add(mesh);
          // Flat roof cap.
          const roof = new THREE.Mesh(
            new THREE.BoxGeometry(w + 0.6, 0.6, d + 0.6),
            new THREE.MeshLambertMaterial({ color: 0x5a564e }),
          );
          roof.position.set(x, h + 0.3, z);
          group.add(roof);
          buildings.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
        }
      }
    }
  }

  // Street lamps at intersections.
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (const rx of CITY.roads) {
    for (const rz of CITY.roads) {
      if ((rx + rz) % 2 !== 0) continue;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 7, 6), poleMat);
      pole.position.set(rx * CITY.pitch + 8, 3.5, rz * CITY.pitch + 8);
      group.add(pole);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), lampMat);
      head.position.set(rx * CITY.pitch + 8, 7.1, rz * CITY.pitch + 8);
      group.add(head);
    }
  }

  // Palm trees along the sidewalks.
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2e7d4f });
  for (let i = 0; i < 60; i += 1) {
    const road = pick(random, CITY.roads) * CITY.pitch;
    const along = range(random, -CITY.half, CITY.half);
    const onXRoad = random() < 0.5;
    const side = random() < 0.5 ? -10 : 10;
    const x = onXRoad ? along : road + side;
    const z = onXRoad ? road + side : along;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 6, 6), trunkMat);
    trunk.position.set(x, 3, z);
    group.add(trunk);
    const top = new THREE.Mesh(new THREE.IcosahedronGeometry(2.2, 0), leafMat);
    top.position.set(x, 7, z);
    group.add(top);
  }

  // Mission waypoint beacon: a glowing pillar the player drives toward.
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.35 });
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 60, 12, 1, true), beaconMat);
  beacon.position.y = 30;
  beacon.visible = false;
  group.add(beacon);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd23e });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(4, 0.3, 8, 32), ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.3;
  ring.visible = false;
  group.add(ring);

  function setWaypoint(x, z, visible) {
    beacon.visible = visible;
    ring.visible = visible;
    if (visible) {
      beacon.position.x = x;
      beacon.position.z = z;
      ring.position.x = x;
      ring.position.z = z;
    }
  }

  return { group, buildings, setWaypoint };
}
