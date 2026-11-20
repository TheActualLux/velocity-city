// The population of Velocity City. Pedestrians walk the sidewalk loops, wait for the signal and
// cross at crosswalks, scatter from gunfire and speeding cars, and get back up after a knock.
// Ambient traffic follows lane waypoints from stop line to stop line, obeys the signals, brakes
// for whatever is ahead and can be shot; it pulls over and scatters out of the way of a speeding
// player or a police car with its lights on. Both are recycled in a ring around the player, always
// off screen, so the streets stay full without anything popping into view.
import { CITY, PALETTE, PED, POPULATION, TRAFFIC, CAR_MODELS } from './config.js';
import {
  DIR_ANGLE, DIR_E, DIR_N, DIR_S, DIR_W, DIR_X, DIR_Y, SIGNAL_AMBER, SIGNAL_RED,
  blockAt, canLeave, crossingIsSafe, exitPoint, resolveCircle, signalFor, stopPoint,
} from './city.js';
import { hurtPlayer, knockDownPedestrian } from './combat.js';

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// ---------------------------------------------------------------- traffic

/** A new car record (not yet placed). */
export function createCar(world, model, color) {
  return {
    id: world.nextId++, x: 0, y: 0, angle: 0, speed: 0, cruise: world.rng.range(TRAFFIC.cruise[0], TRAFFIC.cruise[1]),
    model, length: model.length, width: model.width, color,
    health: TRAFFIC.health, burning: 0, wrecked: false, parked: false, police: false, pursuing: false, courier: false,
    dir: DIR_E, i: 0, j: 0, lane: 0, path: [], braking: false, blocker: -1, stuck: 0, ghost: 0, panic: 0,
    hitFlash: 0, smokeTimer: 0, seek: false, dodge: 0, active: true, owned: false, driver: null, yieldTimer: 0, yieldSide: 1,
  };
}

/** Put a car on a lane: `axis` 'v' or 'h', the road index, the block segment along it, a direction, a lane and 0..1 along. */
export function placeCarOnLane(world, car, axis, road, seg, dir, lane, t) {
  const city = world.city;
  car.dir = dir;
  car.lane = lane;
  car.angle = DIR_ANGLE[dir];
  car.speed = car.cruise * 0.8;
  car.wrecked = false;
  car.burning = 0;
  car.health = TRAFFIC.health;
  car.path.length = 0;
  car.seek = false;
  if (axis === 'v') {
    const from = dir === DIR_S ? seg : seg + 1;
    const to = dir === DIR_S ? seg + 1 : seg;
    const a = exitPoint(city, road, from, dir, lane);
    const b = stopPoint(city, road, to, dir, lane);
    car.x = a.x;
    car.y = a.y + (b.y - a.y) * t;
    car.i = road;
    car.j = to;
  } else {
    const from = dir === DIR_E ? seg : seg + 1;
    const to = dir === DIR_E ? seg + 1 : seg;
    const a = exitPoint(city, from, road, dir, lane);
    const b = stopPoint(city, to, road, dir, lane);
    car.x = a.x + (b.x - a.x) * t;
    car.y = a.y;
    car.i = to;
    car.j = road;
  }
  car.path.push(stopPoint(city, car.i, car.j, dir, lane));
}

/** Snap a world point to the nearest lane and place the car there, heading a random way. */
export function placeCarNear(world, car, px, py) {
  const city = world.city;
  const rng = world.rng;
  const vertical = rng.chance(0.5);
  if (vertical) {
    let i = 0;
    for (let k = 1; k < city.vroads.length; k += 1) if (Math.abs(city.vroads[k].x - px) < Math.abs(city.vroads[i].x - px)) i = k;
    let seg = 0;
    while (seg < CITY.rows - 1 && py > city.hroads[seg + 1].y) seg += 1;
    const dir = rng.chance(0.5) ? DIR_S : DIR_N;
    placeCarOnLane(world, car, 'v', i, seg, dir, rng.int(0, city.vroads[i].lanes - 1), rng.range(0.05, 0.9));
  } else {
    let j = 0;
    for (let k = 1; k < city.hroads.length; k += 1) if (Math.abs(city.hroads[k].y - py) < Math.abs(city.hroads[j].y - py)) j = k;
    let seg = 0;
    while (seg < CITY.cols - 1 && px > city.vroads[seg + 1].x) seg += 1;
    const dir = rng.chance(0.5) ? DIR_E : DIR_W;
    placeCarOnLane(world, car, 'h', j, seg, dir, rng.int(0, city.hroads[j].lanes - 1), rng.range(0.05, 0.9));
  }
}

function laneIsClear(world, car) {
  for (const o of world.cars) {
    if (o !== car && o.active && Math.abs(o.x - car.x) < 56 && Math.abs(o.y - car.y) < 56) return false;
  }
  return true;
}

/** Respawn a traffic car on a lane between minD and maxD from the focus. Returns false if no spot was found. */
export function spawnTrafficCar(world, car, fx, fy, minD, maxD) {
  const rng = world.rng;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(minD, maxD);
    placeCarNear(world, car, fx + Math.cos(a) * d, fy + Math.sin(a) * d);
    const dist = Math.hypot(car.x - fx, car.y - fy);
    if (dist >= minD * 0.96 && dist <= maxD + 160 && laneIsClear(world, car)) {
      car.active = true;
      return true;
    }
  }
  car.active = false;
  return false;
}

/** Pick the next leg at an intersection and queue the curve through it and the next stop line. */
export function planNextLeg(world, car, choose) {
  const city = world.city;
  const rng = world.rng;
  const straight = car.dir;
  const right = (car.dir + 1) % 4;
  const left = (car.dir + 3) % 4;
  const options = [straight, right, left].filter((d) => canLeave(car.i, car.j, d));
  let dir;
  if (options.length === 0) dir = (car.dir + 2) % 4;
  else if (choose) dir = choose(options);
  else {
    const roll = rng.next();
    dir = options.includes(straight) && roll < 0.58 ? straight : options.includes(right) && roll < 0.82 ? right : rng.pick(options);
  }
  const vertical = dir === DIR_N || dir === DIR_S;
  const lanes = vertical ? city.vroads[car.i].lanes : city.hroads[car.j].lanes;
  const lane = dir === straight ? Math.min(car.lane, lanes - 1) : dir === right ? lanes - 1 : 0;
  const exit = exitPoint(city, car.i, car.j, dir, lane);
  const entry = { x: car.x, y: car.y };
  let cx = (entry.x + exit.x) / 2;
  let cy = (entry.y + exit.y) / 2;
  if (dir !== straight && dir !== (car.dir + 2) % 4) {
    const wasVertical = car.dir === DIR_N || car.dir === DIR_S;
    cx = wasVertical ? entry.x : exit.x;
    cy = wasVertical ? exit.y : entry.y;
  }
  for (const t of [0.35, 0.7, 1]) {
    const u = 1 - t;
    car.path.push({ x: u * u * entry.x + 2 * u * t * cx + t * t * exit.x, y: u * u * entry.y + 2 * u * t * cy + t * t * exit.y, stop: false });
  }
  car.i += DIR_X[dir];
  car.j += DIR_Y[dir];
  car.dir = dir;
  car.lane = lane;
  car.path.push(stopPoint(city, car.i, car.j, dir, lane));
}

/** The highest speed that keeps a safe gap to whatever is in front (cars, people, the player). */
function senseAhead(world, car) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const range = 40 + Math.min(car.speed, 200) * 0.7;
  let limit = Infinity;
  let blocker = -1;
  for (const o of world.cars) {
    if (o === car || !o.active) continue;
    const dx = o.x - car.x;
    const dy = o.y - car.y;
    if (Math.abs(dx) > range + 40 || Math.abs(dy) > range + 40) continue;
    const ahead = dx * fx + dy * fy;
    const lat = -dx * fy + dy * fx;
    if (ahead <= 0 || ahead > range + o.length / 2) continue;
    const crossing = Math.abs(Math.cos(o.angle - car.angle)) < 0.8;
    const halfSpan = car.width / 2 + (crossing ? o.length / 2 : o.width / 2) + 2;
    if (Math.abs(lat) > halfSpan) continue;
    if (car.ghost > 0 && !o.wrecked) continue;
    if (crossing && o.blocker === car.id && car.id < o.id) continue;
    const gap = ahead - car.length / 2 - (crossing ? o.width / 2 : o.length / 2) - 7;
    const allowed = Math.max(0, gap * 2.3);
    if (allowed < limit) {
      limit = allowed;
      blocker = o.id;
    }
  }
  const people = world.peds;
  for (let k = 0; k < people.length; k += 1) {
    const p = people[k];
    const dx = p.x - car.x;
    const dy = p.y - car.y;
    if (Math.abs(dx) > range || Math.abs(dy) > range) continue;
    const ahead = dx * fx + dy * fy;
    if (ahead <= 0 || ahead > range) continue;
    if (Math.abs(-dx * fy + dy * fx) > car.width / 2 + 7) continue;
    limit = Math.min(limit, Math.max(0, (ahead - car.length / 2 - 9) * 2.6));
  }
  const pl = world.player;
  if (pl.active && !pl.car) {
    const dx = pl.x - car.x;
    const dy = pl.y - car.y;
    const ahead = dx * fx + dy * fy;
    if (ahead > 0 && ahead < range && Math.abs(-dx * fy + dy * fx) < car.width / 2 + 9) {
      limit = Math.min(limit, Math.max(0, (ahead - car.length / 2 - 10) * 2.6));
    }
  }
  car.blocker = blocker;
  return limit;
}

/** Ease speed toward a target with the car's acceleration and brakes. */
export function approachSpeed(car, target, dt) {
  car.braking = target < car.speed - 2;
  if (car.speed < target) car.speed = Math.min(target, car.speed + TRAFFIC.accel * dt);
  else car.speed = Math.max(target, car.speed - TRAFFIC.brake * dt);
}

/** Follow the lane waypoints: signals, gap keeping, steering and the stuck-breaker. */
function driveAlongLanes(world, car, dt) {
  const city = world.city;
  if (car.path.length === 0) planNextLeg(world, car);
  let wp = car.path[0];
  let dx = wp.x - car.x;
  let dy = wp.y - car.y;
  let dist = Math.hypot(dx, dy);
  let target = car.cruise * (car.panic > 0 ? 1.45 : 1);
  let holding = false;
  if (wp.stop && car.panic <= 0) {
    const light = signalFor(city, car.i, car.j, car.dir, world.time);
    holding = light === SIGNAL_RED || (light === SIGNAL_AMBER && dist > 34);
    if (holding) target = Math.min(target, Math.max(0, (dist - 2) * 2.4));
  }
  if (!holding && dist < 6 + car.speed * dt) {
    car.path.shift();
    if (wp.stop) planNextLeg(world, car);
    wp = car.path[0];
    dx = wp.x - car.x;
    dy = wp.y - car.y;
    dist = Math.hypot(dx, dy);
  }
  target = Math.min(target, senseAhead(world, car));
  let sx = 0;
  let sy = 0;
  if (car.yieldTimer > 0) {
    target = Math.min(target, car.cruise * 0.55);
    const off = 24 * car.yieldSide;
    sx = -Math.sin(car.angle) * off;
    sy = Math.cos(car.angle) * off;
  }
  if (dist > 0.5) {
    const diff = wrapAngle(Math.atan2(dy + sy, dx + sx) - car.angle);
    car.angle = wrapAngle(car.angle + diff * Math.min(1, dt * 9));
    if (Math.abs(diff) > 0.45) target = Math.min(target, 72);
  }
  approachSpeed(car, target, dt);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  if (car.speed < 3 && !holding) {
    car.stuck += dt;
    if (car.stuck > 4.5) {
      car.ghost = 1.4;
      car.stuck = 0;
    }
  } else car.stuck = 0;
}

/** Knock down anyone a moving car drives into; hurt the player. */
export function hitPeopleWithCar(world, car) {
  if (car.speed < 45) return;
  const c = Math.cos(car.angle);
  const s = Math.sin(car.angle);
  const reach = car.length / 2 + 6;
  for (const p of world.peds) {
    if (p.state === 'down' || Math.abs(p.x - car.x) > reach || Math.abs(p.y - car.y) > reach) continue;
    const dx = p.x - car.x;
    const dy = p.y - car.y;
    if (Math.abs(dx * c + dy * s) < car.length / 2 + 3 && Math.abs(-dx * s + dy * c) < car.width / 2 + 3) {
      knockDownPedestrian(world, p, c * car.speed * 0.7 - s * 40, s * car.speed * 0.7 + c * 40);
      car.speed *= 0.75;
    }
  }
  const pl = world.player;
  if (pl.active && pl.alive && !pl.car) {
    const dx = pl.x - car.x;
    const dy = pl.y - car.y;
    const lx = dx * c + dy * s;
    const ly = -dx * s + dy * c;
    if (Math.abs(lx) < car.length / 2 + pl.radius && Math.abs(ly) < car.width / 2 + pl.radius) {
      hurtPlayer(world, car.speed * 0.12, car.x, car.y);
      const side = ly >= 0 ? 1 : -1;
      pl.vx += -s * side * 160 + c * car.speed * 0.4;
      pl.vy += c * side * 160 + s * car.speed * 0.4;
      car.speed *= 0.6;
    }
  }
}

/** Fast cars that send traffic to the curb: the player's at speed, police with lights on. */
function collectThreats(world) {
  const threats = [];
  for (const c of world.cars) {
    if (!c.active || c.wrecked) continue;
    const fast = c.driver === 'player' ? Math.hypot(c.vx, c.vy) > 150 : c.police && (c.pursuing || c.seek) && Math.abs(c.speed) > 90;
    if (fast) threats.push(c);
  }
  return threats;
}

/** Pull over away from a threat bearing down on this car. */
function yieldTo(car, threats) {
  for (const t of threats) {
    if (t === car) continue;
    const dx = car.x - t.x;
    const dy = car.y - t.y;
    if (Math.abs(dx) > 230 || Math.abs(dy) > 230) continue;
    const tvx = t.vx !== undefined && t.driver ? t.vx : Math.cos(t.angle) * t.speed;
    const tvy = t.vx !== undefined && t.driver ? t.vy : Math.sin(t.angle) * t.speed;
    const tv = Math.hypot(tvx, tvy) || 1;
    const along = (dx * tvx + dy * tvy) / tv;
    if (along < -40) continue;
    const lat = (-dx * tvy + dy * tvx) / tv;
    const awayX = (-tvy / tv) * (lat >= 0 ? 1 : -1);
    const awayY = (tvx / tv) * (lat >= 0 ? 1 : -1);
    car.yieldSide = awayX * -Math.sin(car.angle) + awayY * Math.cos(car.angle) >= 0 ? 1 : -1;
    car.yieldTimer = 1.6;
    if (Math.abs(lat) < 30 && along < 120) car.panic = Math.max(car.panic, 1.5);
    return;
  }
}

/** Step every non-pursuing car. */
export function updateTraffic(world, dt) {
  const threats = collectThreats(world);
  for (const car of world.cars) {
    if (!car.active) continue;
    car.hitFlash = Math.max(0, car.hitFlash - dt);
    car.panic = Math.max(0, car.panic - dt);
    car.ghost = Math.max(0, car.ghost - dt);
    car.yieldTimer = Math.max(0, (car.yieldTimer || 0) - dt);
    if (car.owned) continue;
    if (car.wrecked) {
      car.speed *= Math.exp(-3 * dt);
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      continue;
    }
    if (car.police && car.pursuing) continue;
    if (car.police && car.seek) {
      car.speed *= Math.exp(-3 * dt);
      continue;
    }
    if (threats.length > 0 && !car.police) yieldTo(car, threats);
    driveAlongLanes(world, car, dt);
    hitPeopleWithCar(world, car);
  }
}

// ---------------------------------------------------------------- pedestrians

/** A new pedestrian with a randomised look (not yet placed). */
export function createPedestrian(world) {
  const r = world.rng;
  return {
    id: world.nextId++, x: 0, y: 0, vx: 0, vy: 0, angle: 0, speed: 0,
    walkSpeed: r.range(PED.walkSpeed[0], PED.walkSpeed[1]),
    loop: 0, v: 0, dir: 1, ox: r.range(-4, 4), oy: r.range(-4, 4),
    state: 'walk', timer: 0, link: null, fromX: 0, fromY: 0, tx: 0, ty: 0,
    shirt: r.pick(PALETTE.shirts), pants: r.pick(PALETTE.pants), skin: r.pick(PALETTE.skins), hair: r.pick(PALETTE.hair),
    hat: r.chance(0.18) ? r.pick(['#f3e3b5', '#ffffff', PALETTE.coral, '#2d3a64']) : null,
    bag: r.chance(0.25), build: r.range(0.9, 1.12), step: r.range(0, 6), active: true,
  };
}

function loopPoint(loop, k) {
  return loop.pts[((k % loop.pts.length) + loop.pts.length) % loop.pts.length];
}

/** Put a pedestrian on a walk loop at segment `seg`, fraction `t`, walking either way. */
function placePedOnLoop(world, ped, loopIndex, seg, t) {
  const loop = world.city.walkLoops[loopIndex];
  const a = loopPoint(loop, seg);
  const b = loopPoint(loop, seg + 1);
  ped.loop = loopIndex;
  ped.x = a[0] + (b[0] - a[0]) * t + ped.ox;
  ped.y = a[1] + (b[1] - a[1]) * t + ped.oy;
  ped.dir = world.rng.chance(0.5) ? 1 : -1;
  ped.v = ped.dir > 0 ? (seg + 1) % loop.pts.length : seg;
  ped.state = 'walk';
  ped.link = null;
  ped.active = true;
}

function loopNear(city, x, y) {
  if (x < city.gridX0 - 4) return city.promenadeLoop;
  const block = blockAt(city, x, y);
  return block ? block.loop : city.promenadeLoop;
}

/** Respawn a pedestrian on a sidewalk between minD and maxD from the focus. */
export function spawnPedestrian(world, ped, fx, fy, minD, maxD) {
  const rng = world.rng;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(minD, maxD);
    const loopIndex = loopNear(world.city, fx + Math.cos(a) * d, fy + Math.sin(a) * d);
    const loop = world.city.walkLoops[loopIndex];
    placePedOnLoop(world, ped, loopIndex, rng.int(0, loop.pts.length - 1), rng.next());
    const dist = Math.hypot(ped.x - fx, ped.y - fy);
    if (dist >= minD * 0.96 && dist <= maxD + 200) return true;
  }
  ped.active = false;
  return false;
}

/** Send everyone within `radius` of (x, y) running. */
export function scarePedestrians(world, x, y, radius) {
  for (const p of world.peds) {
    if (p.state === 'down') continue;
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < radius) {
      p.state = 'flee';
      p.fromX = x;
      p.fromY = y;
      p.timer = world.rng.range(PED.fleeTime[0], PED.fleeTime[1]) * (1 - (d / radius) * 0.4);
    }
  }
}

function walkToward(ped, tx, ty, speed, dt) {
  const dx = tx - ped.x;
  const dy = ty - ped.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.001) return 0;
  const step = Math.min(d, speed * dt);
  ped.vx = (dx / d) * speed;
  ped.vy = (dy / d) * speed;
  ped.x += (dx / d) * step;
  ped.y += (dy / d) * step;
  ped.angle = Math.atan2(dy, dx);
  ped.speed = speed;
  return d - step;
}

/** Find the nearest point on the nearest loop and head back to it. */
function returnToSidewalk(world, ped) {
  const city = world.city;
  const loopIndex = loopNear(city, ped.x, ped.y);
  const loop = city.walkLoops[loopIndex];
  let best = Infinity;
  for (let k = 0; k < loop.pts.length; k += 1) {
    const a = loop.pts[k];
    const b = loopPoint(loop, k + 1);
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const len2 = ex * ex + ey * ey || 1;
    const t = Math.max(0, Math.min(1, ((ped.x - a[0]) * ex + (ped.y - a[1]) * ey) / len2));
    const px = a[0] + ex * t;
    const py = a[1] + ey * t;
    const d = Math.hypot(px - ped.x, py - ped.y);
    if (d < best) {
      best = d;
      ped.tx = px + ped.ox;
      ped.ty = py + ped.oy;
      ped.loop = loopIndex;
      ped.v = (k + 1) % loop.pts.length;
      ped.dir = 1;
    }
  }
  ped.state = 'return';
}

function arriveAtCorner(world, ped) {
  const city = world.city;
  const loop = city.walkLoops[ped.loop];
  const links = city.links.get(`${ped.loop}:${ped.v}`);
  if (links && world.rng.chance(PED.crossChance)) {
    ped.link = world.rng.pick(links);
    ped.state = 'wait';
    ped.timer = 0;
    return;
  }
  ped.v = (ped.v + ped.dir + loop.pts.length) % loop.pts.length;
}

/** Step every pedestrian: walk, wait, cross, flee, lie down, get back to the sidewalk. */
export function updatePedestrians(world, dt) {
  const city = world.city;
  const fast = world.cars.filter((c) => c.active && !c.wrecked && c.speed > TRAFFIC.speedingSpeed);
  for (const ped of world.peds) {
    if (!ped.active) continue;
    ped.step += ped.speed * dt * 0.22;
    if (ped.state === 'down') {
      ped.speed = 0;
      const k = Math.exp(-4 * dt);
      ped.vx *= k;
      ped.vy *= k;
      ped.x += ped.vx * dt;
      ped.y += ped.vy * dt;
      resolveCircle(city, ped, PED.radius);
      ped.timer -= dt;
      if (ped.timer <= 0) {
        ped.state = 'flee';
        ped.timer = 4;
      }
      continue;
    }
    for (const car of fast) {
      const fx = car.x + Math.cos(car.angle) * 50;
      const fy = car.y + Math.sin(car.angle) * 50;
      if (Math.abs(ped.x - fx) < 70 && Math.abs(ped.y - fy) < 70 && ped.state !== 'flee') {
        ped.state = 'flee';
        ped.fromX = car.x;
        ped.fromY = car.y;
        ped.timer = 2.2;
      }
    }
    if (ped.state === 'flee') {
      let ax = ped.x - ped.fromX;
      let ay = ped.y - ped.fromY;
      const d = Math.hypot(ax, ay) || 1;
      ax /= d;
      ay /= d;
      const wobble = Math.sin(world.time * 3 + ped.id) * 0.35;
      const c = Math.cos(wobble);
      const s = Math.sin(wobble);
      walkToward(ped, ped.x + (ax * c - ay * s) * 10, ped.y + (ax * s + ay * c) * 10, PED.runSpeed * ped.build, dt);
      resolveCircle(city, ped, PED.radius);
      ped.timer -= dt;
      if (ped.timer <= 0) returnToSidewalk(world, ped);
      continue;
    }
    if (ped.state === 'return') {
      if (walkToward(ped, ped.tx, ped.ty, ped.walkSpeed * 1.2, dt) < 1) ped.state = 'walk';
      resolveCircle(city, ped, PED.radius);
      continue;
    }
    if (ped.state === 'wait') {
      ped.speed = 0;
      ped.timer += dt;
      const link = ped.link;
      if (crossingIsSafe(city, link.i, link.j, link.axis, world.time) || ped.timer > 22) ped.state = 'cross';
      continue;
    }
    if (ped.state === 'cross') {
      const link = ped.link;
      const target = city.walkLoops[link.loop].pts[link.v];
      if (walkToward(ped, target[0] + ped.ox, target[1] + ped.oy, ped.walkSpeed * 1.25, dt) < 1) {
        ped.loop = link.loop;
        ped.dir = world.rng.chance(0.5) ? 1 : -1;
        const n = city.walkLoops[link.loop].pts.length;
        ped.v = (link.v + ped.dir + n) % n;
        ped.link = null;
        ped.state = 'walk';
      }
      continue;
    }
    const loop = city.walkLoops[ped.loop];
    const target = loopPoint(loop, ped.v);
    if (walkToward(ped, target[0] + ped.ox, target[1] + ped.oy, ped.walkSpeed, dt) < 1) arriveAtCorner(world, ped);
  }
}

// ---------------------------------------------------------------- population

/** Fill the streets around (fx, fy): half the crowd close by, the rest spread out to the ring. */
export function populateAround(world, fx, fy) {
  for (let k = world.peds.length; k < PED.count; k += 1) world.peds.push(createPedestrian(world));
  world.peds.forEach((ped, k) => {
    const near = k < PED.count * POPULATION.nearFraction;
    spawnPedestrian(world, ped, fx, fy, near ? 40 : 300, near ? 620 : POPULATION.spawnMax);
  });
  for (let k = world.cars.filter((c) => !c.police).length; k < TRAFFIC.count; k += 1) {
    const model = world.rng.pick(CAR_MODELS);
    const color = model.kind === 'cab' ? PALETTE.lemon : world.rng.pick(PALETTE.cars);
    world.cars.push(createCar(world, model, color));
  }
  world.cars.forEach((car, k) => {
    if (car.police || car.courier || car.owned) return;
    spawnTrafficCar(world, car, fx, fy, k < TRAFFIC.count * 0.45 ? 60 : 300, POPULATION.spawnMax);
  });
}

/** Move anyone who has fallen too far behind to the far edge of the ring, out of sight. */
export function recyclePopulation(world, fx, fy) {
  const far = POPULATION.despawn;
  for (const ped of world.peds) {
    if (!ped.active || Math.abs(ped.x - fx) > far || Math.abs(ped.y - fy) > far || Math.hypot(ped.x - fx, ped.y - fy) > far) {
      spawnPedestrian(world, ped, fx, fy, POPULATION.spawnMin, POPULATION.spawnMax);
      ped.ox = world.rng.range(-4, 4);
      ped.oy = world.rng.range(-4, 4);
    }
  }
  let traffic = 0;
  let surplus = null;
  for (const car of world.cars) {
    if (car.police || car.courier || car.driver) continue;
    if (car.owned) {
      if (Math.hypot(car.x - fx, car.y - fy) < far * 1.2) continue;
      car.owned = false;
      car.vx = undefined;
    }
    traffic += 1;
    // Cars the player brought in from the curb push traffic past its budget: retire them.
    if (traffic > TRAFFIC.count) {
      (surplus ??= new Set()).add(car);
      continue;
    }
    if (!car.active || Math.hypot(car.x - fx, car.y - fy) > far) {
      spawnTrafficCar(world, car, fx, fy, POPULATION.spawnMin, POPULATION.spawnMax);
    }
  }
  if (surplus) world.cars = world.cars.filter((car) => !surplus.has(car) || Math.hypot(car.x - fx, car.y - fy) < far);
}
