// Keyboard + mouse input. Held keys give movement and driving; one-shot presses
// (enter car, pause, shoot, confirm) are queued as bit flags and taken once by
// the loop, so a press between two frames is never lost or counted twice.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER_CAR = 4;
export const ACTION_SHOOT = 8;
export const ACTION_MUTE = 16;

const FORWARD = new Set(['ArrowUp', 'KeyW']);
const BACK = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const RUN = new Set(['ShiftLeft', 'ShiftRight']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const ENTER_CAR = new Set(['KeyE']);
const MUTE = new Set(['KeyM']);

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  let mouseDown = false;

  window.addEventListener('keydown', (event) => {
    if (FORWARD.has(event.code) || BACK.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code) || RUN.has(event.code)) {
      held.add(event.code);
      event.preventDefault();
    } else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
      event.preventDefault();
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
      event.preventDefault();
    } else if (ENTER_CAR.has(event.code)) {
      if (!event.repeat) actions |= ACTION_ENTER_CAR;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    }
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  window.addEventListener('blur', () => {
    held.clear();
    mouseDown = false;
  });
  canvas.addEventListener('pointerdown', (event) => {
    if (event.button === 0) {
      mouseDown = true;
      actions |= ACTION_SHOOT;
    }
  });
  window.addEventListener('pointerup', () => { mouseDown = false; });

  function has(set) {
    for (const code of set) if (held.has(code)) return true;
    return false;
  }

  return {
    forward() { return has(FORWARD) ? 1 : 0; },
    back() { return has(BACK) ? 1 : 0; },
    left() { return has(LEFT) ? 1 : 0; },
    right() { return has(RIGHT) ? 1 : 0; },
    run() { return has(RUN); },
    /** -1 left, +1 right, 0 neither or both. */
    steer() { return (has(RIGHT) ? 1 : 0) - (has(LEFT) ? 1 : 0); },
    /** -1 back, +1 forward, 0 neither or both. */
    throttle() { return (has(FORWARD) ? 1 : 0) - (has(BACK) ? 1 : 0); },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
