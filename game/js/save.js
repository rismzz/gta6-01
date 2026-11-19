// save.js — the save game lives in the browser's localStorage: cash, story progress, owned
// gear, position and the day counter. Nothing leaves the machine; there is no server.

const SAVE_KEY = 'undertow-coral-bay-save-v1';

export function defaultSave() {
  return {
    version: 1,
    money: 60,
    day: 1,
    storyIndex: 0,          // next story mission to offer
    storyDone: false,
    hasPistol: false,
    ammo: 0,
    armor: 0,
    totalEarned: 0,
    missionsDone: 0,
    taxisDone: 0,
    racesWon: 0,
    player: null,           // {x, z, heading} written on save
  };
}

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    return Object.assign(defaultSave(), data);
  } catch (err) {
    return null;            // a corrupt save is just a fresh start
  }
}

export function storeSave(state) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    return false;
  }
}

export function wipeSave() {
  try { window.localStorage.removeItem(SAVE_KEY); } catch (err) { /* private mode */ }
}

export function hasSave() {
  try { return window.localStorage.getItem(SAVE_KEY) !== null; } catch (err) { return false; }
}
