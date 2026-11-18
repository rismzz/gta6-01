// Keyboard and pointer input. Held keys are read every step; one-shot presses
// (confirm, pause, interact, punch, shoot) are queued as bit flags and taken once,
// so a press between two frames is never lost and never counted twice.
// The whole game is playable on the keyboard alone; the mouse only orbits the camera.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_INTERACT = 4;
export const ACTION_PUNCH = 8;
export const ACTION_SHOOT = 16;
export const ACTION_MUTE = 32;

const FORWARD = new Set(['KeyW', 'ArrowUp']);
const BACK = new Set(['KeyS', 'ArrowDown']);
const LEFT = new Set(['KeyA', 'ArrowLeft']);
const RIGHT = new Set(['KeyD', 'ArrowRight']);
const RUN = new Set(['ShiftLeft', 'ShiftRight']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const INTERACT = new Set(['KeyE']);
const PUNCH = new Set(['KeyF']);
const SHOOT = new Set(['KeyQ']);
const MUTE = new Set(['KeyM']);

export function createInput(target) {
  const held = new Set();
  // UI actions (confirm/pause/mute) and game actions (interact/punch/shoot) are
  // separate buckets: the frame handler takes the UI ones, the player takes the
  // game ones, and neither can eat the other's presses.
  let uiActions = 0;
  let gameActions = 0;
  let orbitDX = 0;
  let orbitDY = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  function press(code) {
    if (CONFIRM.has(code)) uiActions |= ACTION_CONFIRM;
    else if (PAUSE.has(code)) uiActions |= ACTION_PAUSE;
    else if (MUTE.has(code)) uiActions |= ACTION_MUTE;
    else if (INTERACT.has(code)) gameActions |= ACTION_INTERACT;
    else if (PUNCH.has(code)) gameActions |= ACTION_PUNCH;
    else if (SHOOT.has(code)) gameActions |= ACTION_SHOOT;
  }

  window.addEventListener('keydown', (event) => {
    if (FORWARD.has(event.code) || BACK.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code) || RUN.has(event.code) || CONFIRM.has(event.code) || PAUSE.has(event.code) || INTERACT.has(event.code) || PUNCH.has(event.code) || SHOOT.has(event.code) || MUTE.has(event.code)) {
      event.preventDefault();
    }
    if (event.repeat) return;
    held.add(event.code);
    press(event.code);
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  window.addEventListener('blur', () => {
    held.clear();
  });

  target.addEventListener('pointerdown', (event) => {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    uiActions |= ACTION_CONFIRM;
  });
  window.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    orbitDX += event.clientX - lastX;
    orbitDY += event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
  });
  window.addEventListener('pointerup', () => {
    dragging = false;
  });

  const has = (set) => {
    for (const code of set) if (held.has(code)) return true;
    return false;
  };

  return {
    /** -1 back, 1 forward. */
    throttle() {
      return (has(FORWARD) ? 1 : 0) - (has(BACK) ? 1 : 0);
    },
    /** -1 left, 1 right. */
    steer() {
      return (has(RIGHT) ? 1 : 0) - (has(LEFT) ? 1 : 0);
    },
    running() {
      return has(RUN);
    },
    /** True while E is held down (vault cracking). */
    interactHeld() {
      return held.has('KeyE');
    },
    /** Mouse orbit since the last call, in pixels. */
    takeOrbit() {
      const out = { dx: orbitDX, dy: orbitDY };
      orbitDX = 0;
      orbitDY = 0;
      return out;
    },
    /** The one-shot UI presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = uiActions;
      uiActions = 0;
      return taken;
    },
    /** The one-shot game presses since the last call, as ACTION_* flags. */
    takeGameActions() {
      const taken = gameActions;
      gameActions = 0;
      return taken;
    },
  };
}
