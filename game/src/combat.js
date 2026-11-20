// Gunfire and damage: bullets that travel and hit buildings, cars and pedestrians; cars that smoke,
// catch fire and explode (and set their neighbours off); pedestrians knocked down without blood;
// armour that soaks up part of every hit on the player; police rounds that find the player, on
// foot or through the car door. Crimes are reported to the wanted level.
import { BULLET, EXPLOSION, PED, TRAFFIC } from './config.js';
import { raycastSolids } from './city.js';
import { addCameraShake } from './camera.js';
import { emitDust, emitExplosion, emitFire, emitShellCasing, emitSmoke, emitSparks, spawnParticle } from './particles.js';
import { reportCrime } from './wanted.js';

/** Fire one round from (x, y) along `angle`; `ignore` is the shooter's own car (drive-bys, police). */
export function fireBullet(world, owner, x, y, angle, ignore = null) {
  world.bullets.push({ x, y, px: x, py: y, vx: Math.cos(angle) * BULLET.speed, vy: Math.sin(angle) * BULLET.speed, travelled: 0, owner, ignore });
  emitShellCasing(world, x, y, angle);
  world.sounds.push({ kind: 'shot', x, y });
  world.alarms.push({ x, y, radius: PED.fleeRadius });
}

/** Segment against a car's rotated box: entry fraction or Infinity. */
function segmentHitsCar(car, x0, y0, x1, y1) {
  const c = Math.cos(car.angle);
  const s = Math.sin(car.angle);
  const ax = (x0 - car.x) * c + (y0 - car.y) * s;
  const ay = -(x0 - car.x) * s + (y0 - car.y) * c;
  const bx = (x1 - car.x) * c + (y1 - car.y) * s;
  const by = -(x1 - car.x) * s + (y1 - car.y) * c;
  const hx = car.length / 2;
  const hy = car.width / 2;
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dy = by - ay;
  for (const [p, d, h] of [[ax, dx, hx], [ay, dy, hy]]) {
    if (Math.abs(d) < 1e-9) {
      if (p < -h || p > h) return Infinity;
    } else {
      let ta = (-h - p) / d;
      let tb = (h - p) / d;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      if (t0 > t1) return Infinity;
    }
  }
  return t0;
}

function segmentHitsCircle(cx, cy, r, x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const fx = x0 - cx;
  const fy = y0 - cy;
  const a = dx * dx + dy * dy;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0 || a < 1e-9) return Infinity;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : c < 0 ? 0 : Infinity;
}

/** Move every bullet and resolve the first thing each one hits this step. */
export function updateBullets(world, dt) {
  const list = world.bullets;
  let write = 0;
  for (let k = 0; k < list.length; k += 1) {
    const b = list[k];
    const x0 = b.x;
    const y0 = b.y;
    const x1 = x0 + b.vx * dt;
    const y1 = y0 + b.vy * dt;
    b.px = x0;
    b.py = y0;
    let best = 1;
    let hit = null;
    const wall = raycastSolids(world.city, x0, y0, x1, y1);
    if (wall && wall.t < best) {
      best = wall.t;
      hit = { kind: 'wall', wall };
    }
    const minX = Math.min(x0, x1) - 30;
    const maxX = Math.max(x0, x1) + 30;
    const minY = Math.min(y0, y1) - 30;
    const maxY = Math.max(y0, y1) + 30;
    for (const list2 of [world.cars, world.parked]) {
      for (const car of list2) {
        if (!car.active || car === b.ignore || car.x < minX || car.x > maxX || car.y < minY || car.y > maxY) continue;
        const t = segmentHitsCar(car, x0, y0, x1, y1);
        if (t < best) {
          best = t;
          hit = { kind: 'car', car };
        }
      }
    }
    for (const ped of world.peds) {
      if (!ped.active || ped.state === 'down' || ped.x < minX || ped.x > maxX || ped.y < minY || ped.y > maxY) continue;
      const t = segmentHitsCircle(ped.x, ped.y, BULLET.pedRadius, x0, y0, x1, y1);
      if (t < best) {
        best = t;
        hit = { kind: 'ped', ped };
      }
    }
    const pl = world.player;
    if (b.owner !== 'player' && pl.active && pl.alive && !pl.car && pl.x > minX && pl.x < maxX && pl.y > minY && pl.y < maxY) {
      const t = segmentHitsCircle(pl.x, pl.y, BULLET.playerRadius, x0, y0, x1, y1);
      if (t < best) {
        best = t;
        hit = { kind: 'player' };
      }
    }
    const hx = x0 + (x1 - x0) * best;
    const hy = y0 + (y1 - y0) * best;
    b.travelled += Math.hypot(hx - x0, hy - y0);
    if (hit) {
      const angle = Math.atan2(b.vy, b.vx);
      if (hit.kind === 'wall') {
        emitSparks(world, hx, hy, Math.atan2(hit.wall.ny, hit.wall.nx) || angle + Math.PI, 5);
        emitDust(world, hx, hy, 2, '#d9ccb2');
      } else if (hit.kind === 'car') {
        emitSparks(world, hx, hy, angle + Math.PI, 7);
        damageCar(world, hit.car, BULLET.carDamage, b.owner);
        if (hit.car === world.player.car && b.owner !== 'player') hurtPlayer(world, BULLET.driverDamage, x0, y0);
        world.sounds.push({ kind: 'ping', x: hx, y: hy });
      } else if (hit.kind === 'player') {
        hurtPlayer(world, BULLET.playerDamage, x0, y0);
        emitDust(world, hx, hy, 2, '#f4ede0');
      } else {
        knockDownPedestrian(world, hit.ped, b.vx * 0.06, b.vy * 0.06);
        if (b.owner === 'player') reportCrime(world, 14);
      }
      continue;
    }
    b.x = x1;
    b.y = y1;
    if (b.travelled >= BULLET.range) {
      emitDust(world, b.x, b.y, 1);
      continue;
    }
    list[write] = b;
    write += 1;
  }
  list.length = write;
}

/** Knock a pedestrian to the ground: they slide, lie still for a few seconds, then run. */
export function knockDownPedestrian(world, ped, vx, vy) {
  ped.state = 'down';
  ped.vx = vx;
  ped.vy = vy;
  ped.angle = Math.atan2(vy, vx);
  ped.timer = world.rng.range(PED.downTime[0], PED.downTime[1]);
  ped.fromX = ped.x - vx;
  ped.fromY = ped.y - vy;
  emitDust(world, ped.x, ped.y, 6);
  spawnParticle(world, { kind: 'ring', x: ped.x, y: ped.y, life: 0.25, size: 3, grow: 60, color: '#ffffff', drag: 0 });
  world.sounds.push({ kind: 'thud', x: ped.x, y: ped.y });
  world.alarms.push({ x: ped.x, y: ped.y, radius: 220 });
}

/** Damage a car (traffic, police or parked). Shot drivers panic; at zero health the car burns. */
export function damageCar(world, car, amount, owner) {
  if (car.wrecked) return;
  car.health -= amount;
  car.hitFlash = 0.08;
  if (!car.parked && !car.police) car.panic = 4;
  if (owner === 'player') reportCrime(world, car.police ? 12 : 3);
  if (car.health <= 0 && car.burning <= 0) car.burning = car.parked ? TRAFFIC.burnTime * 0.7 : TRAFFIC.burnTime;
}

/** Smoke from damaged cars, fire from burning ones, and the explosion when the fire wins. */
export function updateCarDamage(world, dt) {
  for (const list of [world.cars, world.parked]) {
    for (const car of list) {
      if (!car.active || car.health > TRAFFIC.smokeAt) continue;
      car.smokeTimer -= dt;
      if (car.smokeTimer <= 0) {
        car.smokeTimer = car.wrecked ? 0.35 : car.burning > 0 ? 0.05 : 0.12;
        const fx = car.x + Math.cos(car.angle) * car.length * 0.3;
        const fy = car.y + Math.sin(car.angle) * car.length * 0.3;
        if (car.burning > 0) emitFire(world, fx, fy);
        emitSmoke(world, fx, fy, car.burning > 0 || car.wrecked);
      }
      if (car.burning > 0 && !car.wrecked) {
        if (!car.parked) car.speed *= Math.exp(-1.5 * dt);
        car.burning -= dt;
        if (car.burning <= 0) explodeCar(world, car);
      }
    }
  }
}

/** Blow a car up: fireball, shockwave, scorch mark, knocked-down bystanders, chain reactions. */
export function explodeCar(world, car) {
  car.wrecked = true;
  car.burning = 0;
  car.health = -100;
  car.speed *= 0.3;
  emitExplosion(world, car.x, car.y);
  world.decals.push({ kind: 'scorch', x: car.x, y: car.y, r: 30 + world.rng.range(0, 10), angle: world.rng.range(0, 6.28) });
  if (world.decals.length > 40) world.decals.shift();
  world.sounds.push({ kind: 'boom', x: car.x, y: car.y });
  world.alarms.push({ x: car.x, y: car.y, radius: 520 });
  const p = world.player;
  const dp = Math.hypot(p.x - car.x, p.y - car.y);
  addCameraShake(world.camera, Math.max(0.15, 0.9 - dp / 900));
  if (dp < EXPLOSION.radius && p.alive) {
    hurtPlayer(world, EXPLOSION.playerDamage * (1 - dp / EXPLOSION.radius), car.x, car.y);
    p.vx += ((p.x - car.x) / (dp || 1)) * 240;
    p.vy += ((p.y - car.y) / (dp || 1)) * 240;
  }
  for (const ped of world.peds) {
    const d = Math.hypot(ped.x - car.x, ped.y - car.y);
    if (d < EXPLOSION.radius && ped.state !== 'down') knockDownPedestrian(world, ped, ((ped.x - car.x) / (d || 1)) * 260, ((ped.y - car.y) / (d || 1)) * 260);
  }
  for (const list of [world.cars, world.parked]) {
    for (const other of list) {
      if (other === car || other.wrecked || !other.active) continue;
      const d = Math.hypot(other.x - car.x, other.y - car.y);
      if (d < EXPLOSION.radius) {
        damageCar(world, other, EXPLOSION.carDamage * (1 - d / EXPLOSION.radius) + 10, null);
        if (other.burning > 0) other.burning = Math.min(other.burning, 0.5 + d / 200);
      }
    }
  }
  if (car.courier) world.missionEvents.push('courier-destroyed');
  reportCrime(world, 18);
}

/** Damage the player; armour soaks up most of it first. */
export function hurtPlayer(world, amount, fromX, fromY) {
  const p = world.player;
  if (!p.alive || amount <= 0) return;
  const soaked = Math.min(p.armour, amount * 0.6);
  p.armour -= soaked;
  p.health -= amount - soaked;
  p.hurtFlash = 0.35;
  p.hurtFromX = fromX;
  p.hurtFromY = fromY;
  addCameraShake(world.camera, Math.min(0.5, amount / 60));
  if (p.health <= 0) {
    p.health = 0;
    p.alive = false;
    p.deadTime = 0;
    world.sounds.push({ kind: 'down', x: p.x, y: p.y });
  }
}
