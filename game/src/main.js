// Bootstrap for Velocity City: the canvas and its resize handling, the fixed-timestep loop, and
// the screens (title, play, paused, flatlined). The world advances in fixed 1/60 s steps (several
// in a slow frame, none in a fast one); the renderer and HUD paint whatever is there.
//
// ?seed=N fixes the city. ?shot=title|street|chase|waterfront (with &seed=N) builds that scene by
// running the real systems on a scripted input, freezes it, paints it and sets window.__shotReady.
import { DRIVE, MAX_STEPS_PER_FRAME, STEP } from './config.js';
import { createWorld, startPlaying, stepWorld } from './world.js';
import { createInput, idleControls, readControls } from './input.js';
import { screenToWorld } from './camera.js';
import { createRenderer } from './render.js';
import { drawHud } from './hud.js';
import { drawGameOverScreen, drawPauseScreen, drawTitleScreen, GAME_TITLE } from './screens.js';
import { respawnAtHospital } from './player.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam >>> 0 : 20261119;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const renderer = createRenderer(canvas);
window.addEventListener('resize', () => renderer.resize());

function announce(message) {
  if (status) status.textContent = message;
}

/** Paint one frame of a world on a screen (`hud` also shows the HUD under the title card). */
function paint(world, screen, hud = false) {
  renderer.draw(world);
  const { ctx, view } = renderer;
  if (screen === 'title') {
    if (hud) drawHud(ctx, world, view);
    drawTitleScreen(ctx, view, world.time);
  } else {
    drawHud(ctx, world, view);
    if (screen === 'paused') drawPauseScreen(ctx, view);
    else if (screen === 'dead') drawGameOverScreen(ctx, view, world);
  }
}

/**
 * Screenshot mode: stage the scene deterministically, then keep repainting the frozen world. The
 * virtual pointer sits at the centre of the screen for the whole staging, so the camera's look-ahead
 * settles with the player in the middle of the frame and the action around them.
 */
function runShot(name) {
  const world = createWorld(seed);
  const pointer = () => screenToWorld(world.camera, renderer.view, renderer.view.w / 2, renderer.view.h / 2);
  const scene = stageShot(name, world, pointer);
  let frames = 0;
  function frame() {
    paint(world, scene.screen, scene.hud);
    frames += 1;
    if (frames === 2) window.__shotReady = true;
    requestAnimationFrame(frame);
  }
  announce(`${GAME_TITLE}: ${name} scene.`);
  requestAnimationFrame(frame);
}

function runGame() {
  const input = createInput(canvas);
  const audio = createAudio();
  let world = createWorld(seed);
  let screen = 'title';
  let accumulator = 0;
  let pendingEnter = false;
  let last = performance.now();
  const toWorld = (x, y) => screenToWorld(world.camera, renderer.view, x, y);

  function begin() {
    startPlaying(world);
    screen = 'play';
    accumulator = 0;
    announce('Playing. Head for the marker on the minimap.');
  }

  function restart() {
    world = createWorld(seed);
    begin();
  }

  function handleMenus() {
    if (input.wasPressed('confirm') || input.mouse.down) audio.unlock();
    if (input.wasPressed('mute')) announce(audio.toggleMute() ? 'Muted.' : 'Sound on.');
    if (input.wasPressed('lock') && screen === 'play') input.togglePointerLock();
    if (screen === 'title') {
      if (input.wasPressed('confirm')) begin();
    } else if (screen === 'play') {
      if (input.wasPressed('pause')) {
        screen = 'paused';
        announce('Paused.');
      } else if (!world.player.alive && world.player.deadTime > 1.2) {
        screen = 'dead';
        announce('Flatlined. Press Enter to wake up at St. Aurelia Medical Center.');
      }
    } else if (screen === 'paused') {
      if (input.wasPressed('pause') || input.wasPressed('confirm')) {
        screen = 'play';
        announce('Playing.');
      } else if (input.wasPressed('restart')) restart();
      else if (input.wasPressed('title')) {
        world = createWorld(seed);
        screen = 'title';
        announce('Velocity City. Press Enter to start.');
      }
    } else if (screen === 'dead' && world.player.deadTime > 2) {
      if (input.wasPressed('confirm')) {
        respawnAtHospital(world);
        screen = 'play';
        announce('Back on your feet outside St. Aurelia Medical Center.');
      } else if (input.wasPressed('restart')) restart();
    }
  }

  function playSounds() {
    const p = world.player;
    for (const s of world.sounds) audio.play(s.kind, s.x, s.y, p.x, p.y, s.power);
    world.sounds.length = 0;
    let nearest = Infinity;
    for (const car of world.cars) {
      if (car.police && car.active && car.pursuing) nearest = Math.min(nearest, Math.hypot(car.x - p.x, car.y - p.y));
    }
    audio.setLevels(screen === 'play' ? nearest : Infinity);
    const car = p.car;
    audio.setEngine(screen === 'play' && car ? { speed: Math.hypot(car.vx, car.vy) / DRIVE.topSpeed, throttle: car.throttle, slip: car.slip } : null);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleMenus();
    if (screen === 'paused') accumulator = 0;
    // F is a one-shot: it is held until exactly one simulation step has seen it.
    if (screen === 'play' && input.wasPressed('enter')) pendingEnter = true;
    else if (screen !== 'play') pendingEnter = false;
    let steps = 0;
    while (accumulator >= STEP && steps < MAX_STEPS_PER_FRAME) {
      const controls = screen === 'play' ? readControls(input, toWorld, pendingEnter) : idleControls();
      pendingEnter = false;
      stepWorld(world, controls, STEP);
      accumulator -= STEP;
      steps += 1;
    }
    if (steps === MAX_STEPS_PER_FRAME) accumulator = 0;
    input.endFrame();
    canvas.style.cursor = screen === 'play' ? 'none' : 'default';
    playSounds();
    paint(world, screen);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === 'play') {
      screen = 'paused';
      announce('Paused.');
    }
  });

  announce(`${GAME_TITLE}. Press Enter to start.`);
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
