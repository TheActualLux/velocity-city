// Meridian Patrol. With no stars a couple of patrol cars cruise with the traffic and watch for
// speeding and hit-and-runs. With stars, one interceptor per star is on the player: units race
// along the street grid (overtaking traffic on the left, ignoring lights), then leave the lanes and
// close in. On foot they stop a car length away with the light bar going; against a car they lead
// the target and ram it. From two stars they shoot when close, and from three they set roadblocks
// across the road ahead of a fleeing car. Units that fall far behind rejoin the lanes.
import { CITY, POLICE, POLICE_MODEL, POPULATION } from './config.js';
import { DIR_E, DIR_N, DIR_S, DIR_W, DIR_X, DIR_Y, nodeAt, raycastSolids, resolveCircle } from './city.js';
import { approachSpeed, createCar, hitPeopleWithCar, placeCarNear, placeCarOnLane, planNextLeg, wrapAngle } from './npc.js';
import { fireBullet } from './combat.js';

function takePoliceCar(world, pursuing = true) {
  let car = world.cars.find((c) => c.police && !c.active);
  if (!car) {
    car = createCar(world, POLICE_MODEL, '#f6f3ec');
    car.police = true;
    world.cars.push(car);
  }
  car.cruise = 130;
  car.pursuing = pursuing;
  car.seek = false;
  car.roadblock = false;
  car.owned = false;
  car.driver = null;
  car.vx = undefined;
  car.dodge = 0;
  car.avoid = 0;
  car.fireCooldown = 1 + world.rng.range(0, 0.6);
  car.active = true;
  return car;
}

/** Put a pursuing unit on a given lane (scripted scenes use this to stage a chase). */
export function spawnPoliceUnit(world, axis, road, seg, dir, lane, t) {
  const car = takePoliceCar(world);
  placeCarOnLane(world, car, axis, road, seg, dir, lane, t);
  car.speed = POLICE.speed * 0.85;
  return car;
}

/** Park a unit across the road at (x, y), lights on, waiting for the player to arrive. */
export function spawnRoadblock(world, x, y, angle) {
  const car = takePoliceCar(world);
  car.path.length = 0;
  car.x = x;
  car.y = y;
  car.angle = angle;
  car.speed = 0;
  car.roadblock = true;
  return car;
}

/** Send a unit in from the ring around the player, on the nearest lane. */
function dispatchFromRing(world, pursuing) {
  const p = world.player;
  const car = takePoliceCar(world, pursuing);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const a = world.rng.range(0, Math.PI * 2);
    placeCarNear(world, car, p.x + Math.cos(a) * POPULATION.spawnMin, p.y + Math.sin(a) * POPULATION.spawnMin);
    if (Math.hypot(car.x - p.x, car.y - p.y) > POPULATION.spawnMin * 0.9) break;
  }
  car.speed = pursuing ? POLICE.speed * 0.7 : car.cruise * 0.8;
}

/** A roadblock on the road ahead of the player's car, across the lanes it is using. */
function placeRoadblockAhead(world) {
  const p = world.player;
  const car = p.car;
  if (!car) return false;
  const city = world.city;
  const vertical = Math.abs(car.vy) > Math.abs(car.vx);
  const ahead = 560;
  if (vertical) {
    let i = 0;
    for (let k = 1; k < city.vroads.length; k += 1) if (Math.abs(city.vroads[k].x - p.x) < Math.abs(city.vroads[i].x - p.x)) i = k;
    const road = city.vroads[i];
    if (Math.abs(road.x - p.x) > road.half) return false;
    const y = p.y + Math.sign(car.vy) * ahead;
    if (y < city.gridY0 + 40 || y > city.gridY1 - 40) return false;
    spawnRoadblock(world, p.x + (road.x - p.x) * 0.3, y, 0.12);
  } else {
    let j = 0;
    for (let k = 1; k < city.hroads.length; k += 1) if (Math.abs(city.hroads[k].y - p.y) < Math.abs(city.hroads[j].y - p.y)) j = k;
    const road = city.hroads[j];
    if (Math.abs(road.y - p.y) > road.half) return false;
    const x = p.x + Math.sign(car.vx) * ahead;
    if (x < city.gridX0 + 40 || x > city.gridX1 - 40) return false;
    spawnRoadblock(world, x, p.y + (road.y - p.y) * 0.3, Math.PI / 2 + 0.12);
  }
  return true;
}

/** Keep one unit per star on the player, patrols on the beat at zero stars, roadblocks from three. */
export function dispatchPolice(world) {
  const p = world.player;
  const want = Math.min(POLICE.max, world.wanted.level * POLICE.perStar);
  let units = 0;
  let onDuty = 0;
  for (const car of world.cars) {
    if (!car.police || !car.active || car.owned) continue;
    const d = Math.hypot(car.x - p.x, car.y - p.y);
    if (d > POPULATION.despawn + 300) {
      car.active = false;
      continue;
    }
    if (want === 0) {
      if (car.roadblock) car.seek = true;
      car.pursuing = false;
      car.roadblock = false;
    } else if (!car.pursuing && !car.wrecked && units < want && d < POPULATION.despawn) car.pursuing = true;
    if (car.pursuing) units += 1;
    if (!car.wrecked) onDuty += 1;
  }
  if (!p.alive || world.time < world.nextDispatch) return;
  if (units < want) {
    dispatchFromRing(world, true);
    world.nextDispatch = world.time + 2.5;
  } else if (want === 0 && onDuty < POLICE.patrols) {
    dispatchFromRing(world, false);
    world.nextDispatch = world.time + 4;
  } else if (world.wanted.level >= POLICE.roadblockFromLevel && p.car && Math.hypot(p.car.vx, p.car.vy) > 150 && world.time >= (world.nextRoadblock ?? 0)) {
    if (placeRoadblockAhead(world)) world.nextRoadblock = world.time + POLICE.roadblockEvery;
  }
}

/** Which way to turn at the next intersection: the exit whose next node is closest to the player. */
function routeTowardPlayer(world, car) {
  const p = world.player;
  return (options) => {
    let best = options[0];
    let bestD = Infinity;
    for (const d of options) {
      const ni = Math.max(0, Math.min(CITY.cols, car.i + DIR_X[d]));
      const nj = Math.max(0, Math.min(CITY.rows, car.j + DIR_Y[d]));
      const node = nodeAt(world.city, ni, nj);
      const dist = Math.hypot(node.x - p.x, node.y - p.y);
      if (dist < bestD) {
        bestD = dist;
        best = d;
      }
    }
    return best;
  };
}

function driveLanesInPursuit(world, car, dt) {
  if (car.path.length === 0) planNextLeg(world, car, routeTowardPlayer(world, car));
  let wp = car.path[0];
  if (Math.hypot(wp.x - car.x, wp.y - car.y) < 8 + car.speed * dt) {
    car.path.shift();
    if (wp.stop) planNextLeg(world, car, routeTowardPlayer(world, car));
    wp = car.path[0];
  }
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  let blocked = false;
  for (const o of world.cars) {
    if (o === car || !o.active) continue;
    const dx = o.x - car.x;
    const dy = o.y - car.y;
    const ahead = dx * fx + dy * fy;
    if (ahead > 0 && ahead < 120 && Math.abs(-dx * fy + dy * fx) < 18) blocked = true;
  }
  car.dodge += ((blocked ? 26 : 0) - car.dodge) * Math.min(1, dt * 4);
  const tx = wp.x + fy * car.dodge;
  const ty = wp.y - fx * car.dodge;
  const diff = wrapAngle(Math.atan2(ty - car.y, tx - car.x) - car.angle);
  car.angle = wrapAngle(car.angle + diff * Math.min(1, dt * 8));
  const flatOut = world.player.car ? POLICE.chaseSpeed : POLICE.speed;
  approachSpeed(car, Math.abs(diff) > 0.45 ? 120 : flatOut, dt);
}

function closeInOnPlayer(world, car, dt, dx, dy, d) {
  const p = world.player;
  const target = p.car;
  let desired;
  if (target) {
    // Lead the moving car a little and drive straight through it: that is the ram.
    const lead = Math.min(0.45, d / 600);
    desired = Math.atan2(dy + target.vy * lead, dx + target.vx * lead);
  } else desired = Math.atan2(dy, dx);
  if (car.avoid > 0) {
    car.avoid -= dt;
    desired += (car.id % 2 ? 1 : -1) * 1.1;
  }
  const diff = wrapAngle(desired - car.angle);
  car.angle = wrapAngle(car.angle + diff * Math.min(1, dt * (target ? 5 : 4)));
  let speed;
  if (target) {
    const theirs = Math.hypot(target.vx, target.vy);
    speed = (d > 150 ? POLICE.chaseSpeed : Math.max(150, theirs + 60)) * (Math.abs(diff) > 1 ? 0.5 : 1);
  } else speed = d > POLICE.holdDistance + 50 ? POLICE.speed * (Math.abs(diff) > 1 ? 0.45 : 0.9) : Math.max(0, (d - POLICE.holdDistance) * 3);
  approachSpeed(car, speed, dt);
}

/** A unit that fell far behind leaves the direct chase and rejoins the nearest lane toward the player. */
function rejoinLanes(world, car) {
  const city = world.city;
  const p = world.player;
  let i = 0;
  for (let k = 1; k < city.vroads.length; k += 1) if (Math.abs(city.vroads[k].x - car.x) < Math.abs(city.vroads[i].x - car.x)) i = k;
  let j = 0;
  for (let k = 1; k < city.hroads.length; k += 1) if (Math.abs(city.hroads[k].y - car.y) < Math.abs(city.hroads[j].y - car.y)) j = k;
  const keep = { health: car.health, burning: car.burning, speed: car.speed, hitFlash: car.hitFlash };
  if (Math.abs(city.vroads[i].x - car.x) < Math.abs(city.hroads[j].y - car.y)) {
    let seg = 0;
    while (seg < CITY.rows - 1 && car.y > city.hroads[seg + 1].y) seg += 1;
    const dir = p.y < car.y ? DIR_N : DIR_S;
    const y0 = city.hroads[seg].y;
    const y1 = city.hroads[seg + 1].y;
    const t = dir === DIR_S ? (car.y - y0) / (y1 - y0) : (y1 - car.y) / (y1 - y0);
    placeCarOnLane(world, car, 'v', i, seg, dir, 0, Math.max(0.05, Math.min(0.9, t)));
  } else {
    let seg = 0;
    while (seg < CITY.cols - 1 && car.x > city.vroads[seg + 1].x) seg += 1;
    const dir = p.x < car.x ? DIR_W : DIR_E;
    const x0 = city.vroads[seg].x;
    const x1 = city.vroads[seg + 1].x;
    const t = dir === DIR_E ? (car.x - x0) / (x1 - x0) : (x1 - car.x) / (x1 - x0);
    placeCarOnLane(world, car, 'h', j, seg, dir, 0, Math.max(0.05, Math.min(0.9, t)));
  }
  Object.assign(car, keep);
  car.seek = false;
}

/** From two stars, officers fire at the player when they are close and have a clear line. */
function shootAtPlayer(world, car, dt, d) {
  const p = world.player;
  car.fireCooldown = (car.fireCooldown ?? 0) - dt;
  if (car.fireCooldown > 0 || !p.alive || world.wanted.level < POLICE.fireFromLevel || d > POLICE.fireRange || d < 20) return;
  car.fireCooldown = POLICE.fireInterval + world.rng.range(0, 0.45);
  const aim = Math.atan2(p.y - car.y, p.x - car.x);
  const side = wrapAngle(aim - car.angle) < 0 ? -1 : 1;
  const c = Math.cos(car.angle);
  const s = Math.sin(car.angle);
  const ly = side * (car.width / 2 + 4);
  const mx = car.x - ly * s;
  const my = car.y + ly * c;
  if (raycastSolids(world.city, mx, my, p.x, p.y)) return;
  fireBullet(world, 'police', mx, my, aim + world.rng.range(-POLICE.spread, POLICE.spread), car);
  car.muzzleFlash = 0.07;
  car.muzzleSide = side;
  car.muzzleAngle = aim;
}

/** Step one pursuing unit. */
export function updatePoliceCar(world, car, dt) {
  const p = world.player;
  const dx = p.x - car.x;
  const dy = p.y - car.y;
  const d = Math.hypot(dx, dy);
  car.muzzleFlash = Math.max(0, (car.muzzleFlash ?? 0) - dt);
  if (car.roadblock) {
    car.speed = 0;
    const vx = p.car ? p.car.vx : p.vx;
    const vy = p.car ? p.car.vy : p.vy;
    const passed = -dx * vx - dy * vy < -40 * Math.hypot(vx, vy);
    if (d < 130 || (passed && d < 400)) {
      car.roadblock = false;
      car.seek = true;
    }
    shootAtPlayer(world, car, dt, d);
    return;
  }
  if (!car.seek && d < POLICE.seekRange) car.seek = true;
  if (car.seek && d > POLICE.loseRange) rejoinLanes(world, car);
  if (car.seek) closeInOnPlayer(world, car, dt, dx, dy, d);
  else driveLanesInPursuit(world, car, dt);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  if (car.seek) {
    const body = { x: car.x, y: car.y };
    if (resolveCircle(world.city, body, car.width * 0.62)) {
      car.x = body.x;
      car.y = body.y;
      car.speed *= 0.7;
      car.avoid = 0.6;
    }
    for (const o of world.cars) {
      if (o === car || !o.active || o === p.car) continue;
      const ox = car.x - o.x;
      const oy = car.y - o.y;
      const od = Math.hypot(ox, oy);
      const min = (car.length + o.length) * 0.36;
      if (od < min && od > 0.01) {
        car.x += (ox / od) * (min - od) * 0.5;
        car.y += (oy / od) * (min - od) * 0.5;
      }
    }
  }
  hitPeopleWithCar(world, car);
  shootAtPlayer(world, car, dt, d);
}

/** Step every unit that is on the player's tail. */
export function updatePolice(world, dt) {
  for (const car of world.cars) {
    if (car.police && car.active && car.pursuing && !car.wrecked && !car.owned) updatePoliceCar(world, car, dt);
  }
}
