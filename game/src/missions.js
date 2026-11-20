// The first story mission, "The Sunburn Job", for fixer Odessa Vance: a chain of objectives
// (go somewhere, wreck the courier's car, shake the police) with cash on completion. The HUD's
// banner and the minimap's marker read the current objective from here.
import { CAR_MODELS } from './config.js';
import { createCar, spawnTrafficCar } from './npc.js';

export const STORY = { title: 'The Sunburn Job', giver: 'Odessa Vance' };

const OBJECTIVES = [
  { kind: 'reach', at: 'pier', text: 'Meet Odessa Vance on the Saltline Promenade', reward: 0 },
  { kind: 'reach', at: 'plaza', text: 'Pick up the burner phone at Glasshill Plaza', reward: 250 },
  { kind: 'destroy', text: "Wreck the courier's silver Marlin before it reaches the marina", reward: 1500 },
  { kind: 'clear', text: 'Lose the cops: let your wanted level drop to zero', reward: 0 },
  { kind: 'reach', at: 'marina', text: 'Collect your cut from Odessa at Bluewater Marina', reward: 2500 },
];

const FREE_ROAM = 'Free roam: Velocity City is yours. More work soon.';

export function createMissionState() {
  return { index: 0, courier: null, flash: 3 };
}

/** The courier's car: a silver Marlin that drives with traffic and is not recycled. */
export function spawnCourier(world) {
  const model = CAR_MODELS.find((m) => m.name === 'Marlin Sedan');
  const car = createCar(world, model, '#d8dde3');
  car.courier = true;
  car.cruise = 125;
  world.cars.push(car);
  const p = world.player;
  spawnTrafficCar(world, car, p.x, p.y, 420, 620);
  car.active = true;
  world.mission.courier = car;
  return car;
}

/** Jump straight to objective `index` (scripted scenes). */
export function startObjective(world, index) {
  world.mission.index = index;
  world.mission.flash = 3;
}

/** The objective the banner shows: title, text, a world target (or null) and progress. */
export function currentObjective(world) {
  const m = world.mission;
  const obj = OBJECTIVES[m.index];
  if (!obj) return { title: 'Velocity City', text: FREE_ROAM, target: null, step: OBJECTIVES.length, total: OBJECTIVES.length };
  let target = null;
  if (obj.kind === 'reach') target = world.city.landmarks[obj.at];
  else if (obj.kind === 'destroy' && m.courier) target = m.courier;
  return { title: STORY.title, text: obj.text, target, step: m.index + 1, total: OBJECTIVES.length, kind: obj.kind };
}

function completeObjective(world, obj) {
  const m = world.mission;
  world.player.money += obj.reward;
  m.index += 1;
  m.flash = 3;
  const last = m.index >= OBJECTIVES.length;
  const cash = obj.reward > 0 ? `  +$${obj.reward.toLocaleString('en-US')}` : '';
  world.toast = { text: last ? `Mission passed: ${STORY.title}${cash}` : `Objective complete${cash}`, time: 4 };
  world.sounds.push({ kind: 'mission', x: world.player.x, y: world.player.y });
}

/** Check the current objective and advance the chain. */
export function updateMission(world, dt) {
  const m = world.mission;
  m.flash = Math.max(0, m.flash - dt);
  const obj = OBJECTIVES[m.index];
  const events = world.missionEvents;
  if (!obj) {
    events.length = 0;
    return;
  }
  const p = world.player;
  if (obj.kind === 'reach') {
    const at = world.city.landmarks[obj.at];
    if (p.alive && Math.hypot(at.x - p.x, at.y - p.y) < 46) completeObjective(world, obj);
  } else if (obj.kind === 'destroy') {
    if (!m.courier) spawnCourier(world);
    const c = m.courier;
    if (c.wrecked || events.includes('courier-destroyed')) {
      completeObjective(world, obj);
      c.courier = false;
      m.courier = null;
    } else if (Math.hypot(c.x - p.x, c.y - p.y) > 2200) {
      spawnTrafficCar(world, c, p.x, p.y, 900, 1200);
      c.active = true;
    }
  } else if (obj.kind === 'clear' && world.wanted.level === 0) {
    completeObjective(world, obj);
  }
  events.length = 0;
}
