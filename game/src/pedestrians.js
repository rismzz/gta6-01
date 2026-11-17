// Pedestrians: simple people who stroll the sidewalks, turn at intersections
// and scatter when a car comes at them. A pedestrian is { mesh, x, z, heading,
// speed, alive, panicked }.
import { CITY, PALETTE, PED_COUNT } from './config.js';
import { pick, range } from './random.js';

function buildPedMesh(shirtColour) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.38, 1.1, 8),
    new THREE.MeshLambertMaterial({ color: shirtColour }),
  );
  body.position.y = 1.05;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0xe8b88a }),
  );
  head.position.y = 1.85;
  head.castShadow = true;
  group.add(head);
  const legs = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.55, 0.3),
    new THREE.MeshLambertMaterial({ color: 0x2a2a33 }),
  );
  legs.position.y = 0.28;
  group.add(legs);
  return group;
}

export function createPedestrians(random, scene) {
  const peds = [];
  for (let i = 0; i < PED_COUNT; i += 1) {
    const road = pick(random, CITY.roads) * CITY.pitch;
    const along = range(random, -CITY.half, CITY.half);
    const onXRoad = random() < 0.5;
    const x = onXRoad ? along : road + (random() < 0.5 ? -9 : 9);
    const z = onXRoad ? road + (random() < 0.5 ? -9 : 9) : along;
    const mesh = buildPedMesh(pick(random, PALETTE.pedShirt));
    const ped = {
      mesh, x, z,
      heading: pick(random, [0, Math.PI / 2, Math.PI, -Math.PI / 2]),
      speed: range(random, 1.2, 2.4),
      alive: true, panicked: 0, bob: random() * 6,
    };
    mesh.position.set(x, 0, z);
    mesh.rotation.y = ped.heading;
    scene.add(mesh);
    peds.push(ped);
  }
  return peds;
}

/** Walk along the sidewalk; at a road line, sometimes turn. Panicked peds run. */
export function stepPedestrians(peds, dt, threat) {
  for (const ped of peds) {
    if (!ped.alive) continue;
    let speed = ped.speed;
    if (ped.panicked > 0) {
      ped.panicked -= dt;
      speed = 5;
    } else if (threat && Math.hypot(threat.x - ped.x, threat.z - ped.z) < 9) {
      ped.panicked = 1.5;
      // Flee away from the threat.
      ped.heading = Math.atan2(ped.x - threat.x, ped.z - threat.z);
    }
    ped.x += Math.sin(ped.heading) * speed * dt;
    ped.z += Math.cos(ped.heading) * speed * dt;
    if (Math.abs(ped.x) > CITY.half + 10 || Math.abs(ped.z) > CITY.half + 10) {
      ped.heading += Math.PI;
    }
    // Turn at intersections sometimes.
    const nearRoad = CITY.roads.some((r) => Math.abs(ped.x - r * CITY.pitch) < 1.2 || Math.abs(ped.z - r * CITY.pitch) < 1.2);
    if (nearRoad && Math.random() < 0.002) ped.heading += (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
    ped.bob += dt * (speed * 3);
    ped.mesh.position.set(ped.x, Math.abs(Math.sin(ped.bob)) * 0.08, ped.z);
    ped.mesh.rotation.y = ped.heading;
  }
}

/** Knock a pedestrian down: they fall over and drop cash. */
export function knockDown(ped, scene) {
  ped.alive = false;
  ped.mesh.rotation.z = Math.PI / 2;
  ped.mesh.position.y = 0.3;
  return ped;
}
