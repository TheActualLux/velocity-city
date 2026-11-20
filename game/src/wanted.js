// The wanted level: crimes add heat, heat crosses thresholds into stars, and the stars cool off
// once the player has kept their head down for a while with no police close by.
import { WANTED } from './config.js';

export function createWantedState() {
  return { level: 0, heat: 0, calm: 0, flash: 0 };
}

/** Record a crime worth `heat` points. */
export function reportCrime(world, heat) {
  const w = world.wanted;
  w.heat = Math.min(WANTED.thresholds[5] + 40, w.heat + heat);
  w.calm = 0;
  const before = w.level;
  w.level = levelForHeat(w.heat);
  if (w.level > before) w.flash = 2.5;
}

/** Force a wanted level (scripted scenes and missions). */
export function setWantedLevel(world, level) {
  const w = world.wanted;
  w.level = Math.max(0, Math.min(5, level));
  w.heat = WANTED.thresholds[w.level] + (w.level > 0 ? 4 : 0);
  w.calm = 0;
  w.flash = level > 0 ? 2.5 : 0;
}

function levelForHeat(heat) {
  let level = 0;
  for (let k = 1; k < WANTED.thresholds.length; k += 1) if (heat >= WANTED.thresholds[k]) level = k;
  return level;
}

/** Cool the heat off once nothing has happened for a while and no unit is near the player. */
export function updateWanted(world, dt) {
  const w = world.wanted;
  w.flash = Math.max(0, w.flash - dt);
  if (w.level === 0) {
    w.heat = Math.max(0, w.heat - WANTED.decay * dt);
    return;
  }
  const p = world.player;
  const watched = world.cars.some((c) => c.police && c.pursuing && Math.hypot(c.x - p.x, c.y - p.y) < 420);
  w.calm = watched ? 0 : w.calm + dt;
  if (w.calm > WANTED.calmDelay) {
    w.heat = Math.max(0, w.heat - WANTED.decay * dt * (1 + w.level * 0.4));
    w.level = levelForHeat(w.heat);
  }
}
