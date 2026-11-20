// Deterministic screenshot scenes for ?shot=<name>&seed=<n>. Each scene drives the real game: it
// builds the world from the seed, places the player, feeds a scripted input sequence (walk, aim,
// fire, steal a car, throttle, steer, handbrake, drive-by), uses the real spawners for traffic and
// the police, sets the wanted level and lets every system run forward in fixed steps. The world is
// then frozen for one frame with the HUD up.
//
// The virtual pointer sits at the centre of the screen for the whole staging (main.js passes a
// `pointer()` that maps the screen centre to the world), so the camera's look-ahead settles with
// the player in the middle of the frame. Aim is scripted separately, in world coordinates.
import { CAR_MODELS, CITY, PALETTE, SIGNAL, STEP } from './config.js';
import { DIR_N, DIR_S, blockAtIndex, laneCoord, nodeAt, stopPoint } from './city.js';
import { createCar, placeCarOnLane } from './npc.js';
import { spawnPoliceUnit, spawnRoadblock } from './police.js';
import { setWantedLevel } from './wanted.js';
import { startObjective } from './missions.js';
import { startPlaying, stepWorld } from './world.js';
import { idleControls } from './input.js';

export const SHOT_NAMES = ['title', 'street', 'chase', 'waterfront'];

/** Scripted controls for one step: move (or throttle/steer), aim at a world point, fire, handbrake, F. */
function scripted(moveX, moveY, aimX, aimY, fire = false, run = false, handbrake = false, enter = false) {
  return { moveX, moveY, run, fire, reload: false, handbrake, enter, aimX, aimY, lookX: null, lookY: null };
}

/** Add an extra ambient car on a given lane (real traffic: it drives, brakes and recycles). */
function addTraffic(world, axis, road, seg, dir, lane, t, modelName, colour) {
  const model = CAR_MODELS.find((m) => m.name === modelName) ?? world.rng.pick(CAR_MODELS);
  const car = createCar(world, model, colour ?? (model.kind === 'cab' ? PALETTE.lemon : world.rng.pick(PALETTE.cars)));
  placeCarOnLane(world, car, axis, road, seg, dir, lane, t);
  world.cars.push(car);
  return car;
}

/** Make a stager bound to a world and the screen-centre pointer. */
function stager(world, pointer) {
  /** One step with `controls`, the pointer held at the centre of the screen. */
  function step(controls) {
    const c = controls ?? idleControls();
    const look = pointer ? pointer() : null;
    stepWorld(world, look ? { ...c, lookX: look.x, lookY: look.y } : c, STEP);
  }
  return {
    step,
    run(seconds, controlsAt) {
      const steps = Math.round(seconds / STEP);
      for (let k = 0; k < steps; k += 1) step(controlsAt ? controlsAt(k * STEP) : null);
    },
    /** Step until north-south traffic at node (i, j) has been held on red for `heldFor` seconds. */
    runUntilQueued(i, j, heldFor, controls) {
      for (let k = 0; k < SIGNAL.cycle * 2 / STEP; k += 1) {
        const phase = (world.time + nodeAt(world.city, i, j).offset) % SIGNAL.cycle;
        if (phase > SIGNAL.nsAmber + heldFor && phase < SIGNAL.ewGreen - 1.5) return;
        step(controls);
      }
    },
    /** Step until every node in `plan` ({ i, j, at }) will show north-south green `at` seconds from now. */
    runUntilGreenWave(plan, controls) {
      const green = (n) => {
        const phase = (world.time + n.at + nodeAt(world.city, n.i, n.j).offset) % SIGNAL.cycle;
        return phase > 0.4 && phase < SIGNAL.nsGreen - 0.6;
      };
      for (let k = 0; k < SIGNAL.cycle * 3 / STEP && !plan.every(green); k += 1) step(controls);
    },
    /** Keep stepping (firing) until the frame right after a shot, so the muzzle flash is in it. */
    runToMuzzleFlash(controlsAt) {
      for (let k = 0; k < 40 && !(world.player.muzzleFlash > 0.03); k += 1) step(controlsAt());
    },
  };
}

function stageTitle(world, s) {
  world.clock = 18.3;
  const ave = CITY.avenueCols[1];
  const seg = CITY.downtown.j + 1;
  addTraffic(world, 'v', ave, seg, DIR_N, 0, 0.3, 'Solano Cab');
  addTraffic(world, 'v', ave, seg, DIR_N, 1, 0.55);
  addTraffic(world, 'v', ave, seg, DIR_S, 0, 0.45);
  addTraffic(world, 'v', ave, seg - 1, DIR_S, 1, 0.7, 'Ardent Roadster', PALETTE.coral);
  addTraffic(world, 'v', ave, seg - 1, DIR_N, 0, 0.6, 'Marlin Sedan');
  addTraffic(world, 'v', ave, seg - 2, DIR_N, 1, 0.4, 'Vesper Van');
  addTraffic(world, 'v', ave, seg - 2, DIR_S, 0, 0.25);
  s.run(12);
  // The player waits on the avenue sidewalk right under the pan, so the HUD reads off them.
  const p = world.player;
  const cam = world.camera;
  const block = blockAtIndex(world.city, ave, CITY.downtown.j);
  p.x = block.x0 + CITY.sidewalk / 2;
  p.y = cam.y + 6;
  p.active = true;
  p.angle = -Math.PI / 2;
  p.aimX = null;
  return { screen: 'title', hud: true };
}

function stageStreet(world, s) {
  const ave = CITY.avenueCols[1];
  const j = CITY.downtown.j;
  const block = blockAtIndex(world.city, ave, j);
  const px = block.x0 + CITY.sidewalk / 2 + 2;
  const py = block.y0 + (block.y1 - block.y0) * 0.6;
  startPlaying(world, px, py, 12.4);
  addTraffic(world, 'v', ave, j, DIR_N, 0, 0.35, 'Solano Cab');
  addTraffic(world, 'v', ave, j, DIR_N, 1, 0.5);
  addTraffic(world, 'v', ave, j, DIR_N, 0, 0.62, 'Vesper Van');
  addTraffic(world, 'v', ave, j, DIR_N, 1, 0.74);
  addTraffic(world, 'v', ave, j, DIR_N, 0, 0.86, 'Coastline Ute');
  addTraffic(world, 'v', ave, j, DIR_S, 0, 0.3);
  addTraffic(world, 'v', ave, j, DIR_S, 1, 0.55, 'Tern Wagon');
  addTraffic(world, 'v', ave, j - 1, DIR_S, 1, 0.6, 'Marlin Sedan');
  addTraffic(world, 'v', ave, j - 1, DIR_S, 0, 0.8, 'Solano Cab');
  const stand = scripted(0, 0, px - 150, py - 150);
  s.run(4, () => stand);
  s.runUntilQueued(ave, j, 4.5, stand);
  const p = world.player;
  s.run(1.4, () => scripted(0, -0.42, p.x - 160, p.y - 170));
  s.run(0.6, () => scripted(0, 0, p.x - 160, p.y - 170));
  return { screen: 'play' };
}

/** A police unit `back` units behind (positive) or ahead (negative) of `car` on the northbound side, closing in. */
function policeNear(world, car, ave, lane, back) {
  const unit = spawnPoliceUnit(world, 'v', ave, CITY.downtown.j + 1, DIR_N, lane, 0.5);
  unit.x = laneCoord(world.city.vroads[ave], DIR_N, lane);
  unit.y = car.y + back;
  unit.angle = -Math.PI / 2;
  unit.speed = Math.max(220, Math.hypot(car.vx, car.vy) * 0.95);
  unit.seek = true;
  return unit;
}

function stageChase(world, s) {
  const city = world.city;
  const ave = CITY.avenueCols[1];
  const startRow = CITY.downtown.j + 2;
  const road = city.vroads[ave];
  const block = blockAtIndex(city, ave, startRow);
  const px = block.x0 + CITY.sidewalk / 2;
  const py = block.y0 + (block.y1 - block.y0) * 0.75;
  startPlaying(world, px, py, 16.6);
  startObjective(world, 3);
  const p = world.player;
  const ahead = () => scripted(0, -1, p.x + 120, p.y + 260);
  // Wait at the curb for a green wave up the avenue (the crosswalks ahead are clear on green).
  const idle = scripted(0, 0, px - 40, py);
  s.runUntilGreenWave([{ i: ave, j: startRow, at: 1.9 }, { i: ave, j: startRow - 1, at: 3 }, { i: ave, j: startRow - 2, at: 4 }], idle);
  // Traffic ahead on the avenue (both directions) for the getaway to scatter.
  for (const [seg, dir, lane, t, model] of [
    [startRow - 2, DIR_N, 0, 0.75, 'Marlin Sedan'], [startRow - 2, DIR_S, 1, 0.6, 'Vesper Van'],
    [startRow - 1, DIR_S, 0, 0.4, 'Coastline Ute'], [startRow - 1, DIR_S, 1, 0.75, null],
    [startRow - 2, DIR_S, 0, 0.2, 'Solano Cab'], [startRow, DIR_S, 1, 0.3, null],
  ]) addTraffic(world, 'v', ave, seg, dir, lane, t, model);
  // Three stars from here on; the dispatcher holds its ring units while the scene places its own.
  setWantedLevel(world, 3);
  world.nextDispatch = world.time + 12;
  world.nextRoadblock = world.time + 1e6;
  // The getaway car: a coral roadster idling at the curb lane right beside the player.
  const getaway = addTraffic(world, 'v', ave, startRow, DIR_N, 1, 0.5, 'Ardent Roadster', PALETTE.coral);
  getaway.x = laneCoord(road, DIR_N, 1);
  getaway.y = py;
  getaway.speed = 0;
  getaway.path.length = 0;
  getaway.path.push(stopPoint(city, ave, startRow, DIR_N, 1));
  // Steal it (F), then floor it north.
  s.step(scripted(0, 0, px - 40, py, false, false, false, true));
  const car = p.car;
  s.run(1.5, ahead);
  // Two units come screaming up behind, lights going.
  policeNear(world, car, ave, 0, 230);
  policeNear(world, car, ave, 1, 300);
  s.run(1.1, ahead);
  // A third parks across the avenue ahead.
  spawnRoadblock(world, (laneCoord(road, DIR_N, 0) + laneCoord(road, DIR_N, 1)) / 2 - 4, car.y - 560, 0.18);
  // Flick the handbrake to slide past slower traffic, then catch it with opposite lock.
  s.run(0.3, () => scripted(-1, -1, p.x + 120, p.y + 260, false, false, true));
  s.run(0.25, () => scripted(0.8, -1, p.x + 120, p.y + 260));
  s.run(0.3, () => scripted(0.35, -1, p.x + 120, p.y + 260));
  // Drive-by: shoot back at the pursuit out of the passenger window.
  const behind = () => {
    const cop = world.cars.find((c) => c.police && c.seek && !c.roadblock && c.active) ?? car;
    return scripted(0.1, -1, cop.x, cop.y, true);
  };
  s.run(0.25, behind);
  s.runToMuzzleFlash(behind);
  return { screen: 'play' };
}

function stageWaterfront(world, s) {
  const city = world.city;
  const px = city.promX0 + 36;
  const py = city.marina.y0 - 60;
  startPlaying(world, px, py, 18.85);
  const seg = CITY.marinaRows[0] - 1;
  addTraffic(world, 'v', 0, seg, DIR_S, 0, 0.4, 'Ardent Roadster', PALETTE.mint);
  addTraffic(world, 'v', 0, seg, DIR_S, 1, 0.75);
  addTraffic(world, 'v', 0, seg + 1, DIR_N, 0, 0.3, 'Solano Cab');
  addTraffic(world, 'v', 0, seg, DIR_N, 1, 0.5, 'Coastline Ute');
  addTraffic(world, 'v', 0, seg - 1, DIR_S, 0, 0.6, 'Tern Wagon');
  addTraffic(world, 'v', 0, seg - 1, DIR_N, 0, 0.35);
  const stroll = () => scripted(0, 0.32, world.player.x - 260, world.player.y + 150);
  s.run(6, stroll);
  return { screen: 'play' };
}

/**
 * Stage the named scene on a fresh world; returns the screen to draw it with (and whether the HUD
 * shows under a title card). `pointer()` gives the world point under the centre of the screen.
 */
export function stageShot(name, world, pointer = null) {
  const s = stager(world, pointer);
  if (name === 'street') return stageStreet(world, s);
  if (name === 'chase') return stageChase(world, s);
  if (name === 'waterfront') return stageWaterfront(world, s);
  return stageTitle(world, s);
}
