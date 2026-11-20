// The player on foot: walking and running on stamina, health and armour, money, aiming at the
// mouse, a pistol with a magazine, reloads and a muzzle flash, and collision against buildings,
// trunks, cars and people. F gets in and out of cars (vehicle.js drives them); the pistol works
// from the driver's seat out of the side windows. Death leads to St. Aurelia Medical Center,
// which bills for the visit.
import { PED, PLAYER } from './config.js';
import { resolveCircle } from './city.js';
import { addCameraShake, snapCamera } from './camera.js';
import { fireBullet } from './combat.js';
import { reportCrime, setWantedLevel } from './wanted.js';
import { enterCar, exitCar, findEnterableCar, fireDriveBy, updatePlayerCar } from './vehicle.js';

export function createPlayer(x, y) {
  return {
    x, y, vx: 0, vy: 0, radius: PLAYER.radius, angle: 0, moveAngle: 0, aimX: null, aimY: null,
    health: PLAYER.healthMax, armour: PLAYER.startArmour, money: PLAYER.startMoney, stamina: PLAYER.staminaMax, exhausted: false,
    mag: PLAYER.magazine, reloadTimer: 0, fireCooldown: 0, muzzleFlash: 0, recoil: 0,
    alive: true, active: false, deadTime: 0, hurtFlash: 0, hurtFromX: 0, hurtFromY: 0, step: 0, running: false, shotsFired: 0,
    car: null, driveBySide: 1, lookX: null, lookY: null,
  };
}

/** Push the player out of a car's rotated box. */
function pushOutOfCar(p, car) {
  const c = Math.cos(car.angle);
  const s = Math.sin(car.angle);
  const dx = p.x - car.x;
  const dy = p.y - car.y;
  const lx = dx * c + dy * s;
  const ly = -dx * s + dy * c;
  const hx = car.length / 2 + p.radius;
  const hy = car.width / 2 + p.radius;
  if (Math.abs(lx) >= hx || Math.abs(ly) >= hy) return;
  const px = hx - Math.abs(lx);
  const py = hy - Math.abs(ly);
  const nlx = px < py ? Math.sign(lx) * hx : lx;
  const nly = px < py ? ly : Math.sign(ly) * hy;
  p.x = car.x + nlx * c - nly * s;
  p.y = car.y + nlx * s + nly * c;
}

function collidePlayer(world, p) {
  resolveCircle(world.city, p, p.radius);
  for (const list of [world.cars, world.parked]) {
    for (const car of list) {
      if (car.active && Math.abs(car.x - p.x) < 40 && Math.abs(car.y - p.y) < 40) pushOutOfCar(p, car);
    }
  }
  for (const ped of world.peds) {
    const dx = ped.x - p.x;
    const dy = ped.y - p.y;
    const d = Math.hypot(dx, dy);
    const min = p.radius + PED.radius;
    if (d < min && d > 0.01 && ped.state !== 'down') {
      ped.x = p.x + (dx / d) * min;
      ped.y = p.y + (dy / d) * min;
    }
  }
}

function tryToFire(world, p, controls) {
  if (p.reloadTimer > 0) return;
  if (controls.reload && p.mag < PLAYER.magazine) {
    p.reloadTimer = PLAYER.reloadTime;
    world.sounds.push({ kind: 'reload', x: p.x, y: p.y });
    return;
  }
  if (!controls.fire || p.fireCooldown > 0) return;
  if (p.mag <= 0) {
    p.reloadTimer = PLAYER.reloadTime;
    world.sounds.push({ kind: 'reload', x: p.x, y: p.y });
    return;
  }
  const a = p.angle + world.rng.range(-PLAYER.spread * (p.car ? 1.6 : 1), PLAYER.spread * (p.car ? 1.6 : 1));
  if (p.car) fireDriveBy(world, p.car, a, p.driveBySide);
  else fireBullet(world, 'player', p.x + Math.cos(p.angle) * 13, p.y + Math.sin(p.angle) * 13, a);
  p.mag -= 1;
  p.shotsFired += 1;
  p.fireCooldown = PLAYER.fireInterval;
  p.muzzleFlash = 0.07;
  p.recoil = 1;
  addCameraShake(world.camera, 0.16);
  const witnesses = world.peds.some((ped) => Math.abs(ped.x - p.x) < 320 && Math.abs(ped.y - p.y) < 320);
  if (witnesses) reportCrime(world, 2.5);
}

/** Step the player from this step's controls. */
export function updatePlayer(world, controls, dt) {
  const p = world.player;
  p.muzzleFlash = Math.max(0, p.muzzleFlash - dt);
  p.hurtFlash = Math.max(0, p.hurtFlash - dt);
  p.fireCooldown = Math.max(0, p.fireCooldown - dt);
  p.recoil = Math.max(0, p.recoil - dt * 8);
  if (p.reloadTimer > 0) {
    p.reloadTimer -= dt;
    if (p.reloadTimer <= 0) {
      p.reloadTimer = 0;
      p.mag = PLAYER.magazine;
    }
  }
  if (p.car && (!p.alive || p.car.wrecked || !p.car.active)) exitCar(world);
  p.lookX = controls.lookX ?? null;
  p.lookY = controls.lookY ?? null;
  if (!p.alive) {
    p.deadTime += dt;
    p.vx *= Math.exp(-5 * dt);
    p.vy *= Math.exp(-5 * dt);
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    resolveCircle(world.city, p, p.radius);
    return;
  }
  if (controls.enter) {
    if (p.car) exitCar(world);
    else {
      const near = findEnterableCar(world);
      if (near) enterCar(world, near.car);
    }
  }
  if (p.car) {
    updatePlayerCar(world, controls, dt);
    tryToFire(world, p, controls);
    return;
  }
  if (controls.aimX !== null) {
    p.aimX = controls.aimX;
    p.aimY = controls.aimY;
    p.angle = Math.atan2(p.aimY - p.y, p.aimX - p.x);
  }
  let mx = controls.moveX;
  let my = controls.moveY;
  const len = Math.hypot(mx, my);
  if (len > 1) {
    mx /= len;
    my /= len;
  }
  const moving = len > 0.01;
  if (p.stamina <= 0) p.exhausted = true;
  if (p.exhausted && p.stamina > PLAYER.staminaMax * 0.3) p.exhausted = false;
  p.running = moving && controls.run && !p.exhausted;
  if (p.running) p.stamina = Math.max(0, p.stamina - PLAYER.staminaDrain * dt);
  else p.stamina = Math.min(PLAYER.staminaMax, p.stamina + PLAYER.staminaRegen * dt * (moving ? 0.6 : 1));
  const speed = p.running ? PLAYER.runSpeed : PLAYER.walkSpeed;
  const k = Math.min(1, dt * 12);
  p.vx += (mx * speed - p.vx) * k;
  p.vy += (my * speed - p.vy) * k;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  if (moving) p.moveAngle = Math.atan2(my, mx);
  p.step += Math.hypot(p.vx, p.vy) * dt * 0.2;
  collidePlayer(world, p);
  tryToFire(world, p, controls);
}

/** Wake up outside St. Aurelia, minus the bill. */
export function respawnAtHospital(world) {
  const p = world.player;
  const door = world.city.landmarks.hospital;
  if (p.car) exitCar(world);
  const fee = Math.min(p.money, PLAYER.hospitalFee);
  p.money -= fee;
  p.x = door.x;
  p.y = door.y;
  p.vx = 0;
  p.vy = 0;
  p.health = PLAYER.healthMax;
  p.armour = 0;
  p.stamina = PLAYER.staminaMax;
  p.mag = PLAYER.magazine;
  p.reloadTimer = 0;
  p.alive = true;
  p.deadTime = 0;
  setWantedLevel(world, 0);
  for (const car of world.cars) if (car.police) car.active = false;
  snapCamera(world.camera, p.x, p.y);
  world.toast = { text: `St. Aurelia Medical Center billed you $${fee.toLocaleString('en-US')}`, time: 4.5 };
}
