// Driving: getting in and out of cars (stealing traffic and parked cars, the driver bails out), the
// player's car physics (throttle, brakes and reverse, steering that tightens with speed, grip that
// lets go under the handbrake), collisions with buildings, trees, other cars and pedestrians with
// impact damage, skid marks and tyre smoke, drive-by shooting out of the side windows, and the
// crimes a reckless driver commits in front of a patrol. Cars the player has left behind coast to a
// stop with the same physics. Everything is stepped with the world, so a scene replays exactly.
import { DRIVE, PED, PLAYER, POLICE, TRAFFIC, WANTED } from './config.js';
import { resolveCircle } from './city.js';
import { addCameraShake } from './camera.js';
import { damageCar, fireBullet, knockDownPedestrian } from './combat.js';
import { spawnParticle, emitSparks } from './particles.js';
import { reportCrime } from './wanted.js';
import { wrapAngle } from './npc.js';

const MAX_SKIDS = 900;

/** Give any car record (traffic, police or parked) the state the physics needs. */
function ensureDrivable(car) {
  if (car.vx !== undefined) return;
  car.vx = Math.cos(car.angle) * (car.speed || 0);
  car.vy = Math.sin(car.angle) * (car.speed || 0);
  car.spin = 0;
  car.steer = 0;
  car.slip = 0;
  car.throttle = 0;
  car.tyreTimer = 0;
  car.skidFrom = null;
  car.fireCooldown = 0;
}

/** Distance from a point to a car's rotated box (0 inside). */
function distanceToCar(car, x, y) {
  const c = Math.cos(car.angle);
  const s = Math.sin(car.angle);
  const dx = x - car.x;
  const dy = y - car.y;
  const lx = Math.abs(dx * c + dy * s) - car.length / 2;
  const ly = Math.abs(-dx * s + dy * c) - car.width / 2;
  return Math.hypot(Math.max(0, lx), Math.max(0, ly));
}

/** Whether the player could take this car. */
function enterable(car) {
  if (!car.active || car.wrecked || car.driver) return false;
  if (car.police && (car.pursuing || car.seek || car.roadblock)) return false;
  return Math.abs(car.speed || 0) < DRIVE.maxEnterSpeed;
}

/** The nearest car the player on foot could get into: { car, steal } or null. */
export function findEnterableCar(world) {
  const p = world.player;
  if (!p.active || !p.alive || p.car) return null;
  let best = null;
  let bestD = DRIVE.enterRange;
  for (const list of [world.cars, world.parked]) {
    for (const car of list) {
      if (Math.abs(car.x - p.x) > 60 || Math.abs(car.y - p.y) > 60 || !enterable(car)) continue;
      const d = distanceToCar(car, p.x, p.y);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
  }
  return best ? { car: best, steal: !best.owned } : null;
}

/** World point beside a door: side -1 is the driver's (left) side, +1 the passenger's. */
function doorPoint(car, side, out) {
  const c = Math.cos(car.angle);
  const s = Math.sin(car.angle);
  const lx = car.length * 0.08;
  const ly = side * (car.width / 2 + out);
  return { x: car.x + lx * c - ly * s, y: car.y + lx * s + ly * c };
}

/** Is the point clear of every car box and building? */
function spotIsClear(world, x, y, r) {
  const probe = { x, y };
  if (resolveCircle(world.city, probe, r)) return false;
  for (const list of [world.cars, world.parked]) {
    for (const car of list) {
      if (car.active && Math.abs(car.x - x) < 50 && Math.abs(car.y - y) < 50 && distanceToCar(car, x, y) < r) return false;
    }
  }
  return true;
}

/** The driver of a stolen traffic car jumps out and runs (a pedestrian from the crowd plays them). */
function ejectDriver(world, car) {
  const p = world.player;
  let ped = null;
  let far = -1;
  for (const o of world.peds) {
    const d = Math.abs(o.x - p.x) + Math.abs(o.y - p.y);
    if (d > far) {
      far = d;
      ped = o;
    }
  }
  if (!ped) return;
  const door = doorPoint(car, 1, PED.radius + 3);
  ped.x = door.x;
  ped.y = door.y;
  ped.active = true;
  ped.state = 'flee';
  ped.fromX = p.x;
  ped.fromY = p.y;
  ped.timer = 5;
  ped.link = null;
}

/** Lane-driving state a parked car lacks, so it can rejoin traffic once the player is done with it. */
function giveTrafficState(world, car) {
  const defaults = {
    dir: 0, i: 0, j: 0, lane: 0, blocker: -1, stuck: 0, ghost: 0, panic: 0, pursuing: false, courier: false,
    seek: false, dodge: 0, yieldTimer: 0, yieldSide: 1, smokeTimer: 0, hitFlash: 0,
  };
  for (const [key, value] of Object.entries(defaults)) if (car[key] === undefined) car[key] = value;
  if (!car.path) car.path = [];
  if (car.cruise === undefined) car.cruise = world.rng.range(TRAFFIC.cruise[0], TRAFFIC.cruise[1]);
}

/** Get into (or steal) a car. */
export function enterCar(world, car) {
  const p = world.player;
  const stolen = !car.owned;
  const wasParked = !!car.parked;
  const parkedAt = world.parked.indexOf(car);
  if (parkedAt >= 0) {
    // A parked car joins the moving list, so traffic brakes for it and it can be recycled later.
    world.parked.splice(parkedAt, 1);
    world.cars.push(car);
    giveTrafficState(world, car);
  }
  car.parked = false;
  ensureDrivable(car);
  if (stolen && !wasParked && !car.police) {
    ejectDriver(world, car);
    const witnesses = world.peds.some((o) => o.state !== 'down' && Math.abs(o.x - p.x) < 300 && Math.abs(o.y - p.y) < 300);
    if (witnesses) reportCrime(world, 6);
  }
  if (stolen && copsWatching(world, car.x, car.y)) reportCrime(world, car.police ? 45 : 14);
  car.owned = true;
  car.driver = 'player';
  car.pursuing = false;
  car.seek = false;
  car.braking = false;
  car.vx = Math.cos(car.angle) * (car.speed || 0) * 0.3;
  car.vy = Math.sin(car.angle) * (car.speed || 0) * 0.3;
  car.speed *= 0.3;
  if (car.path) car.path.length = 0;
  p.car = car;
  p.x = car.x;
  p.y = car.y;
  p.vx = car.vx;
  p.vy = car.vy;
  world.sounds.push({ kind: 'door', x: car.x, y: car.y });
  if (stolen) world.toast = { text: `${wasParked ? 'Hot-wired' : 'Stole'} a ${car.model.name}`, time: 2.4 };
}

/** Step out beside the driver's door (or wherever is clear), pushed clear of the car. */
export function exitCar(world) {
  const p = world.player;
  const car = p.car;
  if (!car) return;
  car.driver = null;
  car.throttle = 0;
  car.braking = false;
  p.car = null;
  const r = p.radius + 1;
  const candidates = [doorPoint(car, -1, r + 2), doorPoint(car, 1, r + 2), doorPoint(car, -1, r + 14), doorPoint(car, 1, r + 14)];
  const c = Math.cos(car.angle);
  const s = Math.sin(car.angle);
  candidates.push({ x: car.x - c * (car.length / 2 + r + 2), y: car.y - s * (car.length / 2 + r + 2) });
  candidates.push({ x: car.x + c * (car.length / 2 + r + 2), y: car.y + s * (car.length / 2 + r + 2) });
  const spot = candidates.find((q) => spotIsClear(world, q.x, q.y, r)) ?? candidates[0];
  p.x = spot.x;
  p.y = spot.y;
  resolveCircle(world.city, p, p.radius);
  p.vx = car.vx * 0.25;
  p.vy = car.vy * 0.25;
  world.sounds.push({ kind: 'door', x: car.x, y: car.y });
}

/** Any working patrol car close enough to see (x, y)? */
export function copsWatching(world, x, y) {
  for (const c of world.cars) {
    if (c.police && c.active && !c.wrecked && !c.owned && Math.abs(c.x - x) < POLICE.witnessRange && Math.abs(c.y - y) < POLICE.witnessRange) {
      if (Math.hypot(c.x - x, c.y - y) < POLICE.witnessRange) return true;
    }
  }
  return false;
}

/** Engine and top-speed multiplier for a car's body style, sapped by damage. */
function powerOf(car) {
  const base = DRIVE.power[car.model.kind] ?? 1;
  const hurt = car.health < 30 ? 0.6 + (car.health / 30) * 0.4 : 1;
  return car.wrecked ? 0 : base * hurt;
}

/** Throttle, brake/reverse, steering and grip for one step. `input` holds throttle, steer, handbrake (-1..1). */
function applyDriving(car, input, dt) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  let vf = car.vx * fx + car.vy * fy;
  let vr = -car.vx * fy + car.vy * fx;
  const power = powerOf(car);
  const top = DRIVE.topSpeed * power;
  car.throttle = input.throttle;
  car.braking = false;
  if (input.throttle > 0) {
    if (vf < -5) {
      vf = Math.min(0, vf + DRIVE.brake * dt);
      car.braking = true;
    } else vf += DRIVE.accel * power * input.throttle * Math.max(0, 1 - vf / Math.max(1, top)) * dt * (vf < 60 ? 1.25 : 1);
  } else if (input.throttle < 0) {
    if (vf > 5) {
      vf = Math.max(0, vf - DRIVE.brake * dt);
      car.braking = true;
    } else vf = Math.max(-DRIVE.reverseSpeed, vf - DRIVE.reverseAccel * (power > 0 ? 1 : 0) * dt);
  } else {
    const roll = DRIVE.roll * dt;
    vf = Math.abs(vf) <= roll ? 0 : vf - Math.sign(vf) * roll;
  }
  vf *= Math.exp(-DRIVE.drag * dt * Math.min(1, Math.abs(vf) / 200));
  if (input.handbrake) {
    const hb = DRIVE.handbrakeDrag * dt;
    vf = Math.abs(vf) <= hb ? 0 : vf - Math.sign(vf) * hb;
    car.braking = true;
  }
  // Steering: no turn at a standstill, full lock at low speed, tightening (less lock) as speed builds.
  car.steer += (input.steer - car.steer) * Math.min(1, dt * DRIVE.steerResponse);
  const speed = Math.abs(vf);
  const atSpeed = Math.min(1, speed / Math.max(1, DRIVE.topSpeed));
  const lock = Math.min(1, speed / 70) * (1 - (1 - DRIVE.highSpeedSteer) * atSpeed);
  let turn = car.steer * DRIVE.steerRate * lock * Math.sign(vf || 1);
  if (input.handbrake && speed > 60) turn += car.steer * DRIVE.handbrakeSpin * Math.sign(vf);
  // Grip: lateral velocity bleeds away fast on rubber, slowly with the rear wheels locked.
  const grip = input.handbrake ? DRIVE.handbrakeGrip : DRIVE.grip * (1 - 0.35 * atSpeed * Math.abs(car.steer));
  vr *= Math.exp(-grip * dt);
  car.spin += (turn - car.spin) * Math.min(1, dt * (input.handbrake ? 3 : 9));
  car.angle = wrapAngle(car.angle + car.spin * dt);
  const nfx = Math.cos(car.angle);
  const nfy = Math.sin(car.angle);
  car.vx = nfx * vf - nfy * vr;
  car.vy = nfy * vf + nfx * vr;
  car.slip = Math.abs(vr) + (input.handbrake && speed > 80 ? speed * 0.25 : 0);
  car.speed = vf;
}

/** Push out of buildings, trunks and the shore: bounce, scrape, spin and take damage. */
function collideWithCity(world, car) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const r = car.width / 2;
  const reach = car.length / 2 - r;
  let worst = 0;
  for (const off of [-reach, 0, reach]) {
    const body = { x: car.x + fx * off, y: car.y + fy * off };
    const ox = body.x;
    const oy = body.y;
    if (!resolveCircle(world.city, body, r)) continue;
    const dx = body.x - ox;
    const dy = body.y - oy;
    const d = Math.hypot(dx, dy);
    if (d < 1e-6) continue;
    car.x += dx;
    car.y += dy;
    const nx = dx / d;
    const ny = dy / d;
    const vn = car.vx * nx + car.vy * ny;
    if (vn < 0) {
      car.vx -= 1.3 * vn * nx;
      car.vy -= 1.3 * vn * ny;
      car.vx *= 0.94;
      car.vy *= 0.94;
      const rx = fx * off;
      const ry = fy * off;
      car.spin += (rx * ny - ry * nx) * -vn * 0.0006;
      worst = Math.max(worst, -vn);
      if (-vn > 40) emitSparks(world, body.x - nx * r, body.y - ny * r, Math.atan2(ny, nx), Math.min(10, Math.round(-vn / 30)));
    }
  }
  if (worst > 0) impact(world, car, worst, car.x, car.y);
}

/** Separating axis test of two car boxes: the push for `a` out of `b`, or null. */
function boxOverlap(a, b) {
  const ca = Math.cos(a.angle);
  const sa = Math.sin(a.angle);
  const cb = Math.cos(b.angle);
  const sb = Math.sin(b.angle);
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  let best = null;
  for (const [nx, ny] of [[ca, sa], [-sa, ca], [cb, sb], [-sb, cb]]) {
    const ra = (a.length / 2) * Math.abs(ca * nx + sa * ny) + (a.width / 2) * Math.abs(-sa * nx + ca * ny);
    const rb = (b.length / 2) * Math.abs(cb * nx + sb * ny) + (b.width / 2) * Math.abs(-sb * nx + cb * ny);
    const d = dx * nx + dy * ny;
    const overlap = ra + rb - Math.abs(d);
    if (overlap <= 0) return null;
    if (!best || overlap < best.depth) best = { nx: d < 0 ? -nx : nx, ny: d < 0 ? -ny : ny, depth: overlap };
  }
  return best;
}

function massOf(car) {
  if (car.wrecked) return 2.2;
  if (car.parked && !car.owned) return 1.5;
  if (car.police) return 1.25;
  return car.model.kind === 'van' ? 1.3 : 1;
}

/** Bump into other cars: separate, exchange momentum, dent both, and anger whoever was hit. */
function collideWithCars(world, car) {
  for (const list of [world.cars, world.parked]) {
    for (const o of list) {
      if (o === car || !o.active || Math.abs(o.x - car.x) > 60 || Math.abs(o.y - car.y) > 60) continue;
      const hit = boxOverlap(car, o);
      if (!hit) continue;
      const ma = massOf(car);
      const mb = massOf(o);
      const share = mb / (ma + mb);
      car.x += hit.nx * hit.depth * share;
      car.y += hit.ny * hit.depth * share;
      o.x -= hit.nx * hit.depth * (1 - share);
      o.y -= hit.ny * hit.depth * (1 - share);
      const physical = o.vx !== undefined && o.owned;
      const ovx = physical ? o.vx : Math.cos(o.angle) * (o.speed || 0);
      const ovy = physical ? o.vy : Math.sin(o.angle) * (o.speed || 0);
      const vn = (car.vx - ovx) * hit.nx + (car.vy - ovy) * hit.ny;
      if (vn >= 0) continue;
      const j = (-(1 + 0.3) * vn) / (1 / ma + 1 / mb);
      car.vx += (j / ma) * hit.nx;
      car.vy += (j / ma) * hit.ny;
      const nvx = ovx - (j / mb) * hit.nx;
      const nvy = ovy - (j / mb) * hit.ny;
      if (physical) {
        o.vx = nvx;
        o.vy = nvy;
      } else if (!o.parked) {
        o.speed = Math.max(0, nvx * Math.cos(o.angle) + nvy * Math.sin(o.angle));
        o.angle = wrapAngle(o.angle + Math.max(-0.5, Math.min(0.5, (-hit.ny * Math.cos(o.angle) + hit.nx * Math.sin(o.angle)) * -vn * 0.002)));
      }
      const rx = (o.x - car.x) / 2;
      const ry = (o.y - car.y) / 2;
      car.spin += (rx * hit.ny - ry * hit.nx) * (j / ma) * 0.0005;
      const cx = (car.x + o.x) / 2;
      const cy = (car.y + o.y) / 2;
      impact(world, car, -vn, cx, cy, o);
      if (-vn > 30) emitSparks(world, cx, cy, Math.atan2(hit.ny, hit.nx), Math.min(12, Math.round(-vn / 25)));
    }
  }
}

/** Damage, noise and consequences of a hit of a given closing speed. */
function impact(world, car, closing, x, y, other = null) {
  if (closing < 25) return;
  world.sounds.push({ kind: 'crash', x, y, power: Math.min(1, closing / 300) });
  if (closing <= DRIVE.crashMin) return;
  const dmg = (closing - DRIVE.crashMin) * DRIVE.crashDamage;
  damageCar(world, car, dmg, null);
  if (car.driver === 'player') addCameraShake(world.camera, Math.min(0.6, closing / 500));
  if (other && !other.wrecked) {
    damageCar(world, other, dmg * 0.8, null);
    if (!other.police && !other.parked) other.panic = 3;
    if (car.driver === 'player') {
      if (other.police) reportCrime(world, 9);
      else if (copsWatching(world, x, y)) reportCrime(world, 5);
    }
  }
}

/** Knock down anyone in the way; shove people at a crawl. Crimes in front of a patrol cost stars. */
function hitPeople(world, car) {
  const c = Math.cos(car.angle);
  const s = Math.sin(car.angle);
  const speed = Math.hypot(car.vx, car.vy);
  const reach = car.length / 2 + 8;
  for (const ped of world.peds) {
    if (!ped.active || ped.state === 'down' || Math.abs(ped.x - car.x) > reach || Math.abs(ped.y - car.y) > reach) continue;
    const dx = ped.x - car.x;
    const dy = ped.y - car.y;
    const lx = dx * c + dy * s;
    const ly = -dx * s + dy * c;
    const hx = car.length / 2 + PED.radius * 0.6;
    const hy = car.width / 2 + PED.radius * 0.6;
    if (Math.abs(lx) >= hx || Math.abs(ly) >= hy) continue;
    if (speed > DRIVE.pedHitSpeed) {
      const side = ly >= 0 ? 1 : -1;
      knockDownPedestrian(world, ped, car.vx * 0.75 - s * side * 60, car.vy * 0.75 + c * side * 60);
      car.vx *= 0.93;
      car.vy *= 0.93;
      if (car.driver === 'player') {
        reportCrime(world, 6);
        if (copsWatching(world, ped.x, ped.y)) {
          reportCrime(world, 34);
          world.toast = { text: 'A patrol saw that!', time: 2 };
        }
      }
    } else {
      const side = ly >= 0 ? 1 : -1;
      const px = Math.abs(lx) / hx > Math.abs(ly) / hy ? Math.sign(lx) * hx : lx;
      const py = Math.abs(lx) / hx > Math.abs(ly) / hy ? ly : side * hy;
      ped.x = car.x + px * c - py * s;
      ped.y = car.y + px * s + py * c;
    }
  }
}

/** Skid marks from both rear wheels and tyre smoke while the car slides. */
function markTyres(world, car, dt) {
  const sliding = car.slip > DRIVE.slipMarks && Math.hypot(car.vx, car.vy) > 40;
  if (!sliding) {
    car.skidFrom = null;
    return;
  }
  const c = Math.cos(car.angle);
  const s = Math.sin(car.angle);
  const back = -car.length / 2 + 7;
  const side = car.width / 2 - 3;
  const wheels = [-1, 1].map((k) => ({ x: car.x + back * c - k * side * s, y: car.y + back * s + k * side * c }));
  const strength = Math.min(1, (car.slip - DRIVE.slipMarks) / 120 + 0.35);
  if (car.skidFrom) {
    for (let k = 0; k < 2; k += 1) {
      addSkid(world, car.skidFrom[k].x, car.skidFrom[k].y, wheels[k].x, wheels[k].y, strength);
    }
  }
  car.skidFrom = wheels;
  car.tyreTimer -= dt;
  if (car.tyreTimer <= 0) {
    car.tyreTimer = 0.045;
    const r = world.rng;
    for (const w of wheels) {
      spawnParticle(world, {
        kind: 'smoke', x: w.x + r.range(-2, 2), y: w.y + r.range(-2, 2), z: 2, vx: -car.vx * 0.12 + r.range(-12, 12), vy: -car.vy * 0.12 + r.range(-12, 12),
        vz: r.range(6, 16), life: r.range(0.8, 1.5), size: r.range(4, 7) * (0.7 + strength * 0.5), grow: 16, color: '#ebe8e2', drag: 1.4,
      });
    }
  }
}

/** One skid segment into the world's ring of marks. */
export function addSkid(world, x0, y0, x1, y1, a) {
  const mark = { x0, y0, x1, y1, a, t: world.time };
  if (world.skids.length < MAX_SKIDS) world.skids.push(mark);
  else world.skids[world.skidHead] = mark;
  world.skidHead = (world.skidHead + 1) % MAX_SKIDS;
}

/** Physics, collisions and marks for one car, driven or coasting. */
function stepCar(world, car, input, dt) {
  ensureDrivable(car);
  applyDriving(car, input, dt);
  car.x += car.vx * dt;
  car.y += car.vy * dt;
  collideWithCity(world, car);
  collideWithCars(world, car);
  if (Math.hypot(car.vx, car.vy) > 5) hitPeople(world, car);
  markTyres(world, car, dt);
}

/** Clamp an aim angle into the drive-by arcs either side of the car (no shooting through the windscreen or boot). */
export function driveByAngle(car, aimAngle) {
  const [lo, hi] = DRIVE.driveByArc;
  const rel = wrapAngle(aimAngle - car.angle);
  const side = rel < 0 ? -1 : 1;
  const mag = Math.max(lo, Math.min(hi, Math.abs(rel)));
  return { angle: wrapAngle(car.angle + side * mag), side };
}

/** The player's turn behind the wheel: drive, and shoot out of whichever side window faces the aim. */
export function updatePlayerCar(world, controls, dt) {
  const p = world.player;
  const car = p.car;
  stepCar(world, car, { throttle: -controls.moveY, steer: controls.moveX, handbrake: !!controls.handbrake }, dt);
  p.x = car.x;
  p.y = car.y;
  p.vx = car.vx;
  p.vy = car.vy;
  p.step = 0;
  p.running = false;
  p.stamina = Math.min(PLAYER.staminaMax, p.stamina + PLAYER.staminaRegen * dt);
  if (controls.aimX !== null) {
    p.aimX = controls.aimX;
    p.aimY = controls.aimY;
  }
  if (p.aimX !== null) {
    const shot = driveByAngle(car, Math.atan2(p.aimY - car.y, p.aimX - car.x));
    p.angle = shot.angle;
    p.driveBySide = shot.side;
  }
  const speed = Math.hypot(car.vx, car.vy);
  // Speeding past a patrol earns a star or two; once they are after you it adds nothing new.
  if (speed > DRIVE.speeding && world.wanted.heat < WANTED.thresholds[2] && copsWatching(world, car.x, car.y)) {
    const before = world.wanted.level;
    reportCrime(world, 11 * dt);
    if (before === 0 && world.wanted.level > 0) world.toast = { text: 'Clocked speeding past a patrol', time: 2.2 };
  }
}

/** Where a drive-by round leaves the car: the side window facing the aim. */
export function driveByMuzzle(car, side) {
  const c = Math.cos(car.angle);
  const s = Math.sin(car.angle);
  const lx = car.length * 0.05;
  const ly = side * (car.width / 2 + 4);
  return { x: car.x + lx * c - ly * s, y: car.y + lx * s + ly * c };
}

/** Fire one drive-by round (the pistol logic in player.js decides when). */
export function fireDriveBy(world, car, angle, side) {
  const m = driveByMuzzle(car, side);
  fireBullet(world, 'player', m.x, m.y, angle, car);
}

/** Cars the player has left behind coast to a stop with the same physics; parked cars' hit flashes fade. */
export function updateLooseCars(world, dt) {
  const idle = { throttle: 0, steer: 0, handbrake: false };
  for (const list of [world.cars, world.parked]) {
    for (const car of list) {
      if (!car.active) continue;
      if (list === world.parked) car.hitFlash = Math.max(0, (car.hitFlash || 0) - dt);
      if (!car.owned || car.driver) continue;
      if (Math.abs(car.vx) + Math.abs(car.vy) + Math.abs(car.spin) < 0.5) {
        car.vx = 0;
        car.vy = 0;
        car.spin = 0;
        car.speed = 0;
        car.skidFrom = null;
        continue;
      }
      stepCar(world, car, idle, dt);
    }
  }
}
