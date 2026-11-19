// hud.js — everything drawn over the 3D view: bars, stars, cash, the clock, objective
// banners and toasts, dialogue boxes, and the circular minimap (a pre-rendered city
// plan rotated under a fixed player arrow, with blips for work and trouble).

import { CITY, DISTRICTS, districtAtWorld, roadX, roadZ } from './config.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.root = $('hud');
    this.healthFill = $('health-fill');
    this.armorFill = $('armor-fill');
    this.vehicleFill = $('vehicle-fill');
    this.vehicleRow = $('vehicle-row');
    this.moneyEl = $('money');
    this.starsEl = $('stars');
    this.weaponName = $('weapon-name');
    this.weaponAmmo = $('weapon-ammo');
    this.clockEl = $('clock');
    this.dayEl = $('day-label');
    this.districtEl = $('district-label');
    this.objectiveTitle = $('objective-title');
    this.objectiveText = $('objective-text');
    this.objectiveDistance = $('objective-distance');
    this.speedo = $('speedo');
    this.speedValue = $('speed-value');
    this.bannerEl = $('banner');
    this.bannerTitle = $('banner-title');
    this.bannerSub = $('banner-sub');
    this.toastBox = $('toast-box');
    this.dialogueEl = $('dialogue');
    this.dialogueName = $('dialogue-name');
    this.dialogueText = $('dialogue-text');
    this.promptEl = $('prompt');
    this.vignette = $('damage-vignette');
    this.bannerTimer = 0;
    this.timerText = '';
    this.mapCanvas = this.buildCityMap();
    this.minimapCtx = $('minimap').getContext('2d');
    this.lastMoney = -1;
  }

  show() { this.root.classList.remove('hidden'); }
  hide() { this.root.classList.add('hidden'); }

  setObjective(title, text, target) {
    this.objectiveTitle.textContent = title;
    this.objectiveText.textContent = text;
    this.objectiveTarget = target || null;
    if (!target) this.objectiveDistance.textContent = '';
  }

  setObjectiveDistance(d) {
    if (this.timerText) return;
    this.objectiveDistance.textContent = this.objectiveTarget ? `${Math.round(d)} m` : '';
  }

  setTimer(seconds) {
    if (seconds === null || seconds === undefined) {
      this.timerText = '';
      return;
    }
    const s = Math.max(0, Math.ceil(seconds));
    this.timerText = `⏱ ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    this.objectiveDistance.textContent = this.timerText;
  }

  banner(title, sub = '') {
    this.bannerTitle.textContent = title;
    this.bannerSub.textContent = sub;
    this.bannerEl.classList.remove('hidden');
    this.bannerTimer = 2.6;
  }

  toast(text) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    this.toastBox.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .4s'; }, 3400);
    setTimeout(() => el.remove(), 3900);
    while (this.toastBox.children.length > 3) this.toastBox.firstChild.remove();
  }

  showDialogue(name, text) {
    this.dialogueName.textContent = name;
    this.dialogueText.textContent = text;
    this.dialogueEl.classList.remove('hidden');
    document.body.classList.add('cinematic');
  }

  hideDialogue() {
    this.dialogueEl.classList.add('hidden');
    document.body.classList.remove('cinematic');
  }

  setPrompt(text) {
    if (!text) { this.promptEl.classList.add('hidden'); return; }
    this.promptEl.textContent = text;
    this.promptEl.classList.remove('hidden');
  }

  damageFlash(strength) {
    this.vignette.style.opacity = String(Math.min(0.9, strength));
  }

  // state: everything the frame knows, gathered by main each tick.
  update(dt, state) {
    const p = state.player;
    this.healthFill.style.width = `${Math.max(0, p.health)}%`;
    this.armorFill.style.width = `${Math.max(0, p.armor)}%`;
    if (p.inCar) {
      this.vehicleRow.style.display = '';
      this.vehicleFill.style.width = `${Math.max(0, p.inCar.health)}%`;
      this.speedo.classList.remove('hidden');
      this.speedValue.textContent = String(Math.round(Math.abs(p.inCar.speed) * 2.24));
    } else {
      this.vehicleRow.style.display = 'none';
      this.speedo.classList.add('hidden');
    }
    if (state.money !== this.lastMoney) {
      this.moneyEl.textContent = `$${state.money.toLocaleString('en-US')}`;
      this.lastMoney = state.money;
    }
    const starEls = this.starsEl.children;
    for (let i = 0; i < 5; i++) starEls[i].classList.toggle('on', i < state.stars);
    this.starsEl.classList.toggle('flash', state.bustMeter > 0.05);
    this.weaponName.textContent = state.weapon === 'pistol' ? 'PISTOL' : 'FISTS';
    this.weaponAmmo.textContent = state.weapon === 'pistol' ? `${state.ammo}` : '';
    const hh = Math.floor(state.hour);
    const mm = Math.floor((state.hour - hh) * 60);
    this.clockEl.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    this.dayEl.textContent = `DAY ${state.day}`;
    this.districtEl.textContent = districtAtWorld(p.x, p.z).name;
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.bannerEl.classList.add('hidden');
    }
    this.drawMinimap(state);
  }

  // The static city plan, painted once: water, sand, blocks by district, the road grid.
  buildCityMap() {
    const S = 640, span = 720;
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const g = c.getContext('2d');
    const mx = (x) => (x + span / 2) * (S / span);
    const mz = (z) => (z + span / 2) * (S / span);
    g.fillStyle = '#175d6b'; g.fillRect(0, 0, S, S);                        // sea
    g.fillStyle = '#3f7a4d'; g.fillRect(0, 0, S, mz(-CITY.depth / 2 - 40));  // north green
    g.fillStyle = '#2c3138';
    g.fillRect(mx(-CITY.width / 2 - 10), mz(-CITY.depth / 2 - 10),
      CITY.width * (S / span) + 20, CITY.depth * (S / span) + 20);          // asphalt field
    g.fillStyle = '#e3cd9c';
    g.fillRect(0, mz(CITY.depth / 2 + 8), S, mz(CITY.depth / 2 + 62) - mz(CITY.depth / 2 + 8)); // beach
    for (const d of DISTRICTS) {
      g.fillStyle = `#${d.wallColors[0].toString(16).padStart(6, '0')}`;
      const x0 = (d.cols[0]) * CITY.pitch - CITY.width / 2, x1 = (d.cols[1] + 1) * CITY.pitch - CITY.width / 2;
      const z0 = (d.rows[0]) * CITY.pitch - CITY.depth / 2, z1 = (d.rows[1] + 1) * CITY.pitch - CITY.depth / 2;
      g.fillRect(mx(x0) + 2, mz(z0) + 2, (x1 - x0) * (S / span) - 4, (z1 - z0) * (S / span) - 4);
    }
    g.strokeStyle = '#565e66'; g.lineWidth = 5;
    for (let i = 0; i <= CITY.cols; i++) {
      g.beginPath(); g.moveTo(mx(roadX(i)), mz(-CITY.depth / 2)); g.lineTo(mx(roadX(i)), mz(CITY.depth / 2 + 8)); g.stroke();
    }
    for (let j = 0; j <= CITY.rows; j++) {
      g.beginPath(); g.moveTo(mx(-CITY.width / 2), mz(roadZ(j))); g.lineTo(mx(CITY.width / 2), mz(roadZ(j))); g.stroke();
    }
    c.userData = { span, size: S };
    return c;
  }

  drawMinimap(state) {
    const ctx = this.minimapCtx;
    const W = 220, C = W / 2;
    const span = this.mapCanvas.userData.span, S = this.mapCanvas.userData.size;
    const pxPerM = S / span;
    const view = 165;                       // metres across the visible circle
    const scale = W / view;
    const p = state.player;
    const heading = state.cameraHeading;
    ctx.clearRect(0, 0, W, W);
    ctx.save();
    ctx.beginPath(); ctx.arc(C, C, C - 2, 0, Math.PI * 2); ctx.clip();
    ctx.translate(C, C);
    ctx.rotate(-heading);
    ctx.scale(scale / pxPerM, scale / pxPerM);
    const pmx = (p.x + span / 2) * pxPerM, pmz = (p.z + span / 2) * pxPerM;
    ctx.drawImage(this.mapCanvas, -pmx, -pmz);
    // blips, drawn in map space
    const blip = (x, z, color, r = 5) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc((x + span / 2) * pxPerM, (z + span / 2) * pxPerM, r / scale * pxPerM, 0, Math.PI * 2);
      ctx.fill();
    };
    if (this.objectiveTarget) blip(this.objectiveTarget.x, this.objectiveTarget.z, '#ffd23e', 6);
    for (const cop of state.cops) blip(cop.x, cop.z, (Math.floor(state.time * 4) % 2) ? '#ff5147' : '#3e9bff', 4.5);
    for (const car of state.markedCars) blip(car.x, car.z, '#ff5ca8', 5);
    ctx.restore();
    // the player arrow always points up, at the centre
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#12303c'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(C, C - 9); ctx.lineTo(C - 6, C + 7); ctx.lineTo(C, C + 3); ctx.lineTo(C + 6, C + 7);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // north tick
    ctx.fillStyle = '#ffd9a0';
    ctx.font = 'bold 11px Verdana';
    const nx = C + Math.sin(-heading) * (C - 12), ny = C - Math.cos(-heading) * (C - 12);
    ctx.fillText('N', nx - 3.5, ny + 3.5);
  }
}

