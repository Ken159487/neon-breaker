// Keyboard and pointer input. Held keys give a steering direction, the
// pointer gives an exact paddle target, and one-shot presses (start, restart,
// pause, mute) are queued as bit flags and taken once by the loop, so a press
// between two frames is never lost and never counted twice.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;
export const ACTION_RESTART = 8;

const LEFT_KEYS = new Set(['ArrowLeft', 'KeyA']);
const RIGHT_KEYS = new Set(['ArrowRight', 'KeyD']);
const CONFIRM_KEYS = new Set(['Space', 'Enter']);
const PAUSE_KEYS = new Set(['KeyP', 'Escape']);
const MUTE_KEYS = new Set(['KeyM']);
const RESTART_KEYS = new Set(['KeyR']);

export function createInput(canvas) {
  let leftHeld = false;
  let rightHeld = false;
  let actions = 0;
  let pointerX = null;
  let pointerSeen = false;

  window.addEventListener('keydown', (event) => {
    if (LEFT_KEYS.has(event.code)) leftHeld = true;
    else if (RIGHT_KEYS.has(event.code)) rightHeld = true;
    else if (CONFIRM_KEYS.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE_KEYS.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (MUTE_KEYS.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else if (RESTART_KEYS.has(event.code)) {
      if (!event.repeat) actions |= ACTION_RESTART;
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (LEFT_KEYS.has(event.code)) leftHeld = false;
    else if (RIGHT_KEYS.has(event.code)) rightHeld = false;
  });
  // A key released while the tab is hidden never sends keyup: let go on blur.
  window.addEventListener('blur', () => {
    leftHeld = false;
    rightHeld = false;
  });
  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    pointerX = event.clientX - rect.left;
    pointerSeen = true;
  });
  canvas.addEventListener('pointerdown', (event) => {
    const rect = canvas.getBoundingClientRect();
    pointerX = event.clientX - rect.left;
    pointerSeen = true;
    actions |= ACTION_CONFIRM;
  });

  return {
    /** -1 for left, 1 for right, 0 for neither or both. */
    direction() {
      return (rightHeld ? 1 : 0) - (leftHeld ? 1 : 0);
    },
    /** The pointer's x on the canvas, or null when the mouse never moved. */
    pointerTarget() {
      return pointerSeen ? pointerX : null;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
