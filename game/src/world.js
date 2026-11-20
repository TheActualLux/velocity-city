// The world: the city plus everything alive in it, and the one fixed-step update that advances
// them all in a fixed order. Nothing here reads the clock or Math.random, so a seed and a list
// of controls always replay the same way (that is what the screenshot scenes rely on).
import { CITY, TIME } from './config.js';
import { createRng, deriveSeed } from './rng.js';
import { blockAtIndex, generateCity } from './city.js';
import { createPlayer, updatePlayer } from './player.js';
import { populateAround, recyclePopulation, scarePedestrians, updatePedestrians, updateTraffic } from './npc.js';
import { dispatchPolice, updatePolice } from './police.js';
import { updateBullets, updateCarDamage } from './combat.js';
import { updateParticles } from './particles.js';
import { updateBoats, updateGulls } from './ambient.js';
import { updateLooseCars } from './vehicle.js';
import { createWantedState, updateWanted } from './wanted.js';
import { createMissionState, updateMission } from './missions.js';
import { createCamera, snapCamera, startCameraPan, updateCamera } from './camera.js';
import { idleControls } from './input.js';

/** Where a new game starts: the west sidewalk of a Mercado block near the beach. */
export function playerStartPoint(city) {
  const b = blockAtIndex(city, 1, 2);
  return { x: b.x0 + CITY.sidewalk / 2, y: (b.y0 + b.y1) / 2 };
}

function parkedCarRecord(world, p) {
  return {
    id: world.nextId++, x: p.x, y: p.y, angle: p.angle, speed: 0, model: p.model, length: p.model.length, width: p.model.width,
    color: p.color, health: 100, burning: 0, wrecked: false, parked: true, police: false, active: true, hitFlash: 0, smokeTimer: 0, braking: false,
  };
}

/** The downtown avenue pan the title screen runs behind its text. */
export function titlePan(city) {
  const road = city.vroads[CITY.avenueCols[1]];
  const y0 = city.hroads[CITY.downtown.j + 2].y;
  const y1 = city.hroads[CITY.downtown.j - 2].y;
  return { from: { x: road.x + 60, y: y0 }, to: { x: road.x + 140, y: y1 }, seconds: 90, zoom: 0.84 };
}

/** Build a world from a seed, sitting on the title screen. */
export function createWorld(seed) {
  const city = generateCity(seed);
  const start = playerStartPoint(city);
  const world = {
    seed, city, rng: createRng(deriveSeed(seed, 'sim')), mode: 'title', time: 0, clock: 18.2, clockRunning: true,
    player: createPlayer(start.x, start.y), cars: [], parked: [], peds: [], bullets: [], particles: [], decals: [],
    gulls: [], boats: [], alarms: [], sounds: [], missionEvents: [], skids: [], skidHead: 0,
    wanted: createWantedState(), mission: createMissionState(), camera: createCamera(start.x, start.y),
    toast: null, nextId: 1, nextDispatch: 0, nextRoadblock: 0,
  };
  world.parked = city.parked.map((p) => parkedCarRecord(world, p));
  const pan = titlePan(city);
  startCameraPan(world.camera, pan.from, pan.to, pan.seconds, pan.zoom);
  populateAround(world, pan.from.x, pan.from.y);
  return world;
}

/** Leave the title: put the player in the street, start the clock at mid-morning, fill the streets around them. */
export function startPlaying(world, x, y, hour = TIME.start) {
  const p = world.player;
  const start = playerStartPoint(world.city);
  p.x = x ?? start.x;
  p.y = y ?? start.y;
  p.active = true;
  p.aimX = p.x;
  p.aimY = p.y - 60;
  p.lookX = null;
  p.lookY = null;
  world.mode = 'play';
  world.clock = hour;
  world.camera.mode = 'follow';
  world.camera.pan = null;
  world.camera.targetZoom = 1;
  snapCamera(world.camera, p.x, p.y);
  populateAround(world, p.x, p.y);
}

/** The point the population ring and the gulls follow. */
export function worldFocus(world) {
  return world.mode === 'play' ? world.player : world.camera;
}

/** Advance the whole world one fixed step. */
export function stepWorld(world, controls, dt) {
  world.time += dt;
  if (world.clockRunning) world.clock = (world.clock + TIME.hoursPerSecond * dt) % 24;
  const playing = world.mode === 'play';
  if (playing) updatePlayer(world, controls ?? idleControls(), dt);
  updateTraffic(world, dt);
  updateLooseCars(world, dt);
  if (playing) {
    dispatchPolice(world);
    updatePolice(world, dt);
  }
  updatePedestrians(world, dt);
  updateBullets(world, dt);
  updateCarDamage(world, dt);
  updateParticles(world, dt);
  const focus = worldFocus(world);
  updateGulls(world, focus.x, focus.y, dt);
  updateBoats(world, focus.y, dt);
  if (playing) {
    updateWanted(world, dt);
    updateMission(world, dt);
  }
  recyclePopulation(world, focus.x, focus.y);
  updateCamera(world.camera, world, dt);
  for (const a of world.alarms) scarePedestrians(world, a.x, a.y, a.radius);
  world.alarms.length = 0;
  if (world.sounds.length > 48) world.sounds.splice(0, world.sounds.length - 48);
  if (world.toast) {
    world.toast.time -= dt;
    if (world.toast.time <= 0) world.toast = null;
  }
}
