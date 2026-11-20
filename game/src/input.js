// Keyboard and mouse state. Actions are named in BINDINGS so keys can be remapped in one place;
// held state drives the player, one-shot presses drive menus. Pointer lock is optional (press L):
// while locked, mouse motion steers a virtual cursor kept inside the window. F gets in and out of
// cars and Space is the handbrake while driving (it still confirms on menus).

export const BINDINGS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  run: ['ShiftLeft', 'ShiftRight'],
  reload: ['KeyR'],
  confirm: ['Enter', 'NumpadEnter', 'Space'],
  pause: ['Escape', 'KeyP'],
  restart: ['KeyR'],
  title: ['KeyT'],
  mute: ['KeyM'],
  lock: ['KeyL'],
  enter: ['KeyF'],
  handbrake: ['Space'],
};

const BLOCKED_DEFAULTS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

/** Track keys and the mouse on `canvas`. */
export function createInput(canvas) {
  const held = new Set();
  const pressed = new Set();
  const mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2, down: false, moved: false };
  let locked = false;

  window.addEventListener('keydown', (event) => {
    if (BLOCKED_DEFAULTS.has(event.code)) event.preventDefault();
    if (!event.repeat) pressed.add(event.code);
    held.add(event.code);
  });
  window.addEventListener('keyup', (event) => held.delete(event.code));
  window.addEventListener('blur', () => {
    held.clear();
    mouse.down = false;
  });
  canvas.addEventListener('mousemove', (event) => {
    if (locked) {
      mouse.x = Math.max(0, Math.min(window.innerWidth, mouse.x + event.movementX));
      mouse.y = Math.max(0, Math.min(window.innerHeight, mouse.y + event.movementY));
    } else {
      mouse.x = event.clientX;
      mouse.y = event.clientY;
    }
    mouse.moved = true;
  });
  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0) mouse.down = true;
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) mouse.down = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
  });

  const anyOf = (codes, set) => codes.some((code) => set.has(code));

  return {
    mouse,
    /** True while any key bound to `action` is held. */
    isDown: (action) => anyOf(BINDINGS[action], held),
    /** True once per key press of `action` (cleared by endFrame). */
    wasPressed: (action) => anyOf(BINDINGS[action], pressed),
    /** Forget this frame's one-shot presses. */
    endFrame: () => pressed.clear(),
    togglePointerLock() {
      if (locked) document.exitPointerLock?.();
      else canvas.requestPointerLock?.();
    },
    get pointerLocked() {
      return locked;
    },
  };
}

/** No input at all: the title screen and the idle world use it. */
export function idleControls() {
  return { moveX: 0, moveY: 0, run: false, fire: false, reload: false, handbrake: false, enter: false, aimX: null, aimY: null, lookX: null, lookY: null };
}

/**
 * Turn held keys and the mouse into this step's player controls; `toWorld` maps screen to world.
 * In a car W/S are throttle and brake, A/D steer and Space is the handbrake. `enter` (F) is a
 * one-shot the caller hands to exactly one step. The pointer is both the aim and the point the
 * camera leans toward (`look`).
 */
export function readControls(input, toWorld, enter = false) {
  let moveX = 0;
  let moveY = 0;
  if (input.isDown('left')) moveX -= 1;
  if (input.isDown('right')) moveX += 1;
  if (input.isDown('up')) moveY -= 1;
  if (input.isDown('down')) moveY += 1;
  const aim = toWorld(input.mouse.x, input.mouse.y);
  return {
    moveX,
    moveY,
    run: input.isDown('run'),
    fire: input.mouse.down,
    reload: input.isDown('reload'),
    handbrake: input.isDown('handbrake'),
    enter,
    aimX: aim.x,
    aimY: aim.y,
    lookX: aim.x,
    lookY: aim.y,
  };
}
