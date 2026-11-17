// Drawing only: the three.js scene, the chase camera, the HUD and the
// minimap. The world's state in, pixels out. No rules live here.
import { CITY, PALETTE } from './config.js';
import { createCity } from './city.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

export function createRenderer(canvas, hud, random) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.fog, 120, 420);

  const sun = new THREE.DirectionalLight(PALETTE.sun, 2.1);
  sun.position.set(120, 180, 60);
  sun.castShadow = true;
  sun.shadow.camera.left = -160;
  sun.shadow.camera.right = 160;
  sun.shadow.camera.top = 160;
  sun.shadow.camera.bottom = -160;
  sun.shadow.mapSize.set(2048, 2048);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbdd8f0, 0x5a4a3a, 1.15));

  const city = createCity(random);
  scene.add(city.group);

  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 900);
  let camYaw = 0;
  let camYawOffset = 0;
  let camPos = new THREE.Vector3(0, 8, 40);
  let dragging = false;
  let lastPointerX = 0;

  canvas.addEventListener('pointerdown', (event) => {
    dragging = true;
    lastPointerX = event.clientX;
  });
  window.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    camYawOffset += (event.clientX - lastPointerX) * 0.005;
    lastPointerX = event.clientX;
  });
  window.addEventListener('pointerup', () => { dragging = false; });

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  const minimap = hud.minimap.getContext('2d');
  const MAP = 180;
  const mapScale = MAP / (CITY.half * 2 + 40);

  function drawMinimap(state, waypoint) {
    const g = minimap;
    g.clearRect(0, 0, MAP, MAP);
    g.fillStyle = 'rgba(10, 14, 20, 0.82)';
    g.fillRect(0, 0, MAP, MAP);
    const toMap = (x, z) => [(x + CITY.half + 20) * mapScale, (z + CITY.half + 20) * mapScale];
    // Roads.
    g.strokeStyle = '#5a5a66';
    g.lineWidth = 3;
    for (const line of CITY.roads) {
      const [x1, y1] = toMap(line * CITY.pitch, -CITY.half - 20);
      const [x2, y2] = toMap(line * CITY.pitch, CITY.half + 20);
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      const [x3, y3] = toMap(-CITY.half - 20, line * CITY.pitch);
      const [x4, y4] = toMap(CITY.half + 20, line * CITY.pitch);
      g.beginPath(); g.moveTo(x3, y3); g.lineTo(x4, y4); g.stroke();
    }
    // Buildings.
    g.fillStyle = '#3a3f4a';
    for (const b of city.buildings) {
      const [x, y] = toMap(b.minX, b.minZ);
      g.fillRect(x, y, (b.maxX - b.minX) * mapScale, (b.maxZ - b.minZ) * mapScale);
    }
    // Waypoint.
    if (waypoint) {
      const [x, y] = toMap(waypoint.x, waypoint.z);
      g.fillStyle = '#ffd23e';
      g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#ffd23e';
      g.beginPath(); g.arc(x, y, 10, 0, Math.PI * 2); g.stroke();
    }
    // Traffic.
    g.fillStyle = '#e8c832';
    for (const t of state.traffic) {
      const [x, y] = toMap(t.x, t.z);
      g.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    // Police.
    g.fillStyle = '#ff4444';
    for (const cop of state.police) {
      const [x, y] = toMap(cop.x, cop.z);
      g.beginPath(); g.arc(x, y, 3.5, 0, Math.PI * 2); g.fill();
    }
    // Player arrow.
    const [px, py] = toMap(state.player.x, state.player.z);
    g.save();
    g.translate(px, py);
    g.rotate(Math.PI - state.player.heading);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(0, -7); g.lineTo(5, 6); g.lineTo(-5, 6); g.closePath(); g.fill();
    g.restore();
    // North label.
    g.fillStyle = '#cfd6de';
    g.font = 'bold 11px system-ui, sans-serif';
    g.fillText('N', 6, 14);
  }

  function updateHud(state, missions, save) {
    hud.cash.textContent = `$${state.money.toLocaleString('en-US')}`;
    hud.healthFill.style.width = `${Math.max(0, state.player.health)}%`;
    hud.healthFill.style.background = state.player.health > 40 ? '#3aa655' : '#c23b2e';
    let stars = '';
    for (let i = 0; i < 5; i += 1) stars += i < state.wanted ? '★' : '☆';
    hud.stars.textContent = stars;
    hud.stars.style.color = state.wanted > 0 ? '#ffd23e' : 'rgba(255,255,255,0.55)';
    hud.objective.textContent = missions.objectiveText();
    const inCar = !!state.car;
    hud.speed.textContent = inCar ? `${Math.round(Math.abs(state.player.speed) * 3.6)} km/h` : '';
    hud.speedLabel.style.display = inCar ? 'block' : 'none';
    hud.hint.textContent = inCar
      ? 'W/S drive · A/D steer · E exit car · Click shoot · P pause'
      : 'WASD move · Shift run · E steal car · Click shoot · P pause';
    if (save) hud.best.textContent = `Best cash $${(save.best || 0).toLocaleString('en-US')} · Jobs done ${missions.missionsDone}/4`;
  }

  /** Pull the chase camera in when a building stands between it and the player. */
  function cameraClear(px, pz, want) {
    const steps = 12;
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      const x = px + (want.x - px) * t;
      const z = pz + (want.z - pz) * t;
      let inside = false;
      for (const b of city.buildings) {
        if (x > b.minX - 1 && x < b.maxX + 1 && z > b.minZ - 1 && z < b.maxZ + 1) { inside = true; break; }
      }
      if (inside) {
        const safe = Math.max(0.12, (i - 1) / steps);
        return new THREE.Vector3(
          px + (want.x - px) * safe,
          want.y + (1 - safe) * 3,
          pz + (want.z - pz) * safe,
        );
      }
    }
    return want;
  }

  /** Follow the player with a chase camera and render one frame. `snap`
   *  puts the camera straight behind the player (used for screenshots). */
  function draw(state, missions, screen, save, snap) {
    const p = state.player;
    const inCar = !!state.car;
    if (screen === SCREEN_TITLE) {
      // Slow cinematic orbit over the city for the title screen.
      const angle = (Date.now() / 1000) * 0.03;
      camera.position.set(Math.sin(angle) * 110, 62, Math.cos(angle) * 110);
      camera.lookAt(0, 0, 0);
      camera.fov = 55;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      hud.hud.style.display = 'none';
      return;
    }
    const targetYaw = p.heading + camYawOffset;
    let dy = targetYaw - camYaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    if (snap) camYaw = targetYaw;
    else camYaw += dy * 0.08;
    const dist = inCar ? 13 : 10;
    const height = inCar ? 6.5 : 5.5;
    const want = cameraClear(
      p.x, p.z,
      new THREE.Vector3(
        p.x - Math.sin(camYaw) * dist,
        height,
        p.z - Math.cos(camYaw) * dist,
      ),
    );
    if (snap) camPos.copy(want);
    else camPos.lerp(want, 0.12);
    camera.position.copy(camPos);
    camera.lookAt(p.x + Math.sin(p.heading) * 4, 2, p.z + Math.cos(p.heading) * 4);
    camera.fov = 62 + (inCar ? Math.min(12, Math.abs(p.speed) * 0.25) : 0);
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);

    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) {
      hud.hud.style.display = 'block';
      updateHud(state, missions, save);
      drawMinimap(state, missions.waypoint());
    } else {
      hud.hud.style.display = 'none';
    }
  }

  return { scene, city, camera, draw, resize, setCamYawOffset(value) { camYawOffset = value; } };
}
