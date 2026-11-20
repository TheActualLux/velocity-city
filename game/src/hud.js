// The HUD, drawn in screen space and scaled to the window: health, armour and stamina bars, money
// with thousands separators, the clock, the pistol and its ammo, wanted stars, a circular minimap
// (roads, buildings, the player arrow, cars, pedestrians, police blips, the objective), the
// district name, the mission banner along the top, toasts, a crosshair and a control hint line.
// At the wheel it adds a speedometer with the car's condition and the drive-by arcs; on foot, an
// "F to steal" prompt over the nearest car. Every block keeps a dark backing so it stays legible
// when the window (or the screenshot) is shrunk.
import { DRIVE, PALETTE, PLAYER } from './config.js';
import { districtAt } from './city.js';
import { viewScale, worldToScreen } from './camera.js';
import { currentObjective } from './missions.js';
import { findEnterableCar } from './vehicle.js';

const FONT = '"Segoe UI", "Helvetica Neue", Arial, system-ui, sans-serif';

/** HUD scale for a window: 1 at 1280x720, larger on bigger screens, never cut off on narrow ones. */
export function hudScale(view) {
  return Math.max(0.85, Math.min(2.4, Math.min(view.h / 720, view.w / 1180)));
}

/** "$12,345" with thousands separators. */
export function formatMoney(n) {
  const whole = Math.floor(Math.abs(n));
  return `${n < 0 ? '-' : ''}$${String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

export function formatClock(hour) {
  const h = Math.floor(hour) % 24;
  const m = Math.floor((hour - Math.floor(hour)) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function panel(ctx, x, y, w, h, r, alpha = 0.62) {
  ctx.fillStyle = `rgba(22,26,52,${alpha})`;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

function textWithShadow(ctx, text, x, y, colour, u) {
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3.5 * u;
  ctx.strokeStyle = 'rgba(14,16,38,0.55)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = 'rgba(14,16,38,0.75)';
  ctx.fillText(text, x + 1.5 * u, y + 1.5 * u);
  ctx.fillStyle = colour;
  ctx.fillText(text, x, y);
}

function drawStar(ctx, x, y, r, lit, u) {
  ctx.beginPath();
  for (let k = 0; k < 10; k += 1) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const rr = k % 2 ? r * 0.45 : r;
    if (k === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.lineWidth = 2 * u;
  ctx.strokeStyle = 'rgba(14,16,38,0.85)';
  ctx.stroke();
  ctx.fillStyle = lit ? '#ffd75e' : 'rgba(255,255,255,0.14)';
  ctx.fill();
}

/** Five stars, lit to the wanted level, blinking while it rises or units are close. */
export function drawWantedStars(ctx, world, right, top, u) {
  const w = world.wanted;
  const blink = w.flash > 0 && Math.floor(world.time * 6) % 2 === 0;
  for (let k = 0; k < 5; k += 1) {
    const x = right - (4 - k) * 25 * u - 11 * u;
    drawStar(ctx, x, top + 11 * u, 10.5 * u, k < w.level && !blink, u);
  }
}

function bar(ctx, x, y, w, h, frac, colour, u) {
  ctx.fillStyle = 'rgba(14,16,38,0.7)';
  ctx.beginPath();
  ctx.roundRect(x - 2 * u, y - 2 * u, w + 4 * u, h + 4 * u, 4 * u);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = colour;
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h * 0.35);
}

function drawPistolIcon(ctx, x, y, u) {
  ctx.fillStyle = '#f4ede0';
  ctx.fillRect(x, y, 30 * u, 8 * u);
  ctx.fillRect(x + 20 * u, y + 6 * u, 8 * u, 13 * u);
  ctx.fillStyle = 'rgba(22,26,52,0.9)';
  ctx.fillRect(x + 3 * u, y + 2.5 * u, 14 * u, 2 * u);
}

/** Top-right cluster: clock, money, weapon, stars, health, armour, stamina. */
function drawStatus(ctx, world, view, u) {
  const p = world.player;
  const right = view.w - 22 * u;
  let y = 18 * u;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.font = `600 ${Math.round(15 * u)}px ${FONT}`;
  textWithShadow(ctx, formatClock(world.clock), right, y, '#f4ede0', u);
  y += 20 * u;
  ctx.font = `800 ${Math.round(30 * u)}px ${FONT}`;
  textWithShadow(ctx, formatMoney(p.money), right, y, '#9ff0c6', u);
  y += 40 * u;
  drawWantedStars(ctx, world, right, y, u);
  y += 34 * u;
  const bw = 190 * u;
  const bx = right - bw;
  bar(ctx, bx, y, bw, 9 * u, p.health / PLAYER.healthMax, p.health < 30 && Math.floor(world.time * 4) % 2 ? '#ffb3a8' : PALETTE.coral, u);
  y += 16 * u;
  bar(ctx, bx, y, bw, 7 * u, p.armour / PLAYER.armourMax, '#7cc4ff', u);
  y += 13 * u;
  bar(ctx, bx + bw * 0.45, y, bw * 0.55, 4 * u, p.stamina / PLAYER.staminaMax, p.exhausted ? '#f6a35a' : PALETTE.lemon, u);
  y += 18 * u;
  panel(ctx, right - 150 * u, y, 150 * u, 40 * u, 8 * u);
  drawPistolIcon(ctx, right - 140 * u, y + 10 * u, u);
  ctx.font = `700 ${Math.round(17 * u)}px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f4ede0';
  if (p.reloadTimer > 0) {
    ctx.font = `700 ${Math.round(12 * u)}px ${FONT}`;
    ctx.fillText('RELOADING', right - 10 * u, y + 15 * u);
    ctx.fillStyle = PALETTE.lemon;
    ctx.fillRect(right - 82 * u, y + 27 * u, 72 * u * (1 - p.reloadTimer / PLAYER.reloadTime), 3 * u);
  } else {
    ctx.fillText(`${p.mag}`, right - 46 * u, y + 20 * u);
    ctx.font = `500 ${Math.round(13 * u)}px ${FONT}`;
    ctx.fillStyle = 'rgba(244,237,224,0.65)';
    ctx.fillText('/ ∞', right - 10 * u, y + 21 * u);
  }
}

function worldToMinimap(mm, x, y) {
  return { x: mm.cx + (x - mm.fx) * mm.k, y: mm.cy + (y - mm.fy) * mm.k };
}

function clampToRing(mm, pt, inset) {
  const dx = pt.x - mm.cx;
  const dy = pt.y - mm.cy;
  const d = Math.hypot(dx, dy);
  const max = mm.r - inset;
  if (d <= max) return { x: pt.x, y: pt.y, clamped: false };
  return { x: mm.cx + (dx / d) * max, y: mm.cy + (dy / d) * max, clamped: true };
}

/** The circular minimap, north up, centred on the player. */
export function drawMinimap(ctx, world, cx, cy, r, u) {
  const city = world.city;
  const focus = world.mode === 'play' ? world.player : world.camera;
  const k = r / 820;
  const mm = { cx, cy, r, k, fx: focus.x, fy: focus.y };
  const range = r / k;
  ctx.save();
  ctx.fillStyle = 'rgba(14,16,38,0.55)';
  ctx.beginPath();
  ctx.arc(cx, cy, r + 6 * u, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.scale(k, k);
  ctx.translate(-focus.x, -focus.y);
  const x0 = focus.x - range;
  const x1 = focus.x + range;
  const y0 = focus.y - range;
  const y1 = focus.y + range;
  ctx.fillStyle = '#c9bf98';
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  ctx.fillStyle = '#2f9fa8';
  ctx.fillRect(x0, y0, city.shoreX - x0, y1 - y0);
  ctx.fillStyle = '#f0d8a4';
  ctx.fillRect(city.shoreX, y0, city.promX0 - city.shoreX, y1 - y0);
  ctx.fillStyle = '#e8dcc6';
  ctx.fillRect(city.promX0, y0, city.promX1 - city.promX0, y1 - y0);
  ctx.fillStyle = '#566076';
  ctx.fillRect(city.gridX0, city.gridY0, city.gridX1 - city.gridX0, city.gridY1 - city.gridY0);
  for (const b of city.blocks) {
    if (b.x1 < x0 || b.x0 > x1 || b.y1 < y0 || b.y0 > y1) continue;
    ctx.fillStyle = b.kind === 'park' ? '#8fca76' : '#e9dfcb';
    ctx.fillRect(b.x0 + 4, b.y0 + 4, b.x1 - b.x0 - 8, b.y1 - b.y0 - 8);
  }
  for (const b of city.buildings) {
    if (b.x + b.w < x0 || b.x > x1 || b.y + b.h < y0 || b.y > y1) continue;
    ctx.fillStyle = b.kind === 'hospital' ? '#ffffff' : b.glass ? '#7f93a8' : '#bdb3a2';
    ctx.fillRect(b.x, b.y, b.w, b.h);
  }
  if (city.stadium) {
    ctx.fillStyle = '#9bd18a';
    ctx.strokeStyle = '#f4f0e6';
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.ellipse(city.stadium.x, city.stadium.y, city.stadium.rx * 0.85, city.stadium.ry * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  if (city.park) {
    ctx.fillStyle = '#2f9fa8';
    ctx.beginPath();
    ctx.ellipse(city.park.pond.x, city.park.pond.y, city.park.pond.rx, city.park.pond.ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#c69b6a';
  for (const p of city.marina.piers) ctx.fillRect(p.x0, p.y - 6, p.x1 - p.x0, 12);
  ctx.restore();

  ctx.fillStyle = 'rgba(255,233,196,0.9)';
  for (const ped of world.peds) {
    if (!ped.active || Math.abs(ped.x - focus.x) > range || Math.abs(ped.y - focus.y) > range) continue;
    const pt = worldToMinimap(mm, ped.x, ped.y);
    ctx.fillRect(pt.x - 1 * u, pt.y - 1 * u, 2 * u, 2 * u);
  }
  for (const car of world.cars) {
    if (!car.active || car.police || car === world.player.car || Math.abs(car.x - focus.x) > range || Math.abs(car.y - focus.y) > range) continue;
    const pt = worldToMinimap(mm, car.x, car.y);
    if (Math.hypot(pt.x - cx, pt.y - cy) > r - 2) continue;
    ctx.fillStyle = car.courier ? PALETTE.coral : car.wrecked ? '#3a3a44' : '#fbf7ec';
    ctx.fillRect(pt.x - 2 * u, pt.y - 2 * u, 4 * u, 4 * u);
  }
  const obj = world.mode === 'play' ? currentObjective(world) : null;
  if (obj && obj.target) {
    const pt = clampToRing(mm, worldToMinimap(mm, obj.target.x, obj.target.y), 6 * u);
    ctx.fillStyle = PALETTE.coral;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2 * u;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 6 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  const blink = Math.floor(world.time * 6) % 2;
  for (const car of world.cars) {
    if (!car.active || !car.police || !(car.pursuing || car.seek)) continue;
    const pt = clampToRing(mm, worldToMinimap(mm, car.x, car.y), 5 * u);
    ctx.fillStyle = (blink + car.id) % 2 ? '#ff4d5e' : '#5aa8ff';
    ctx.strokeStyle = 'rgba(14,16,38,0.9)';
    ctx.lineWidth = 1.5 * u;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 5 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  const a = world.mode !== 'play' ? -Math.PI / 2 : world.player.car ? world.player.car.angle : world.player.angle;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(a);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = 'rgba(14,16,38,0.9)';
  ctx.lineWidth = 2 * u;
  ctx.beginPath();
  ctx.moveTo(9 * u, 0);
  ctx.lineTo(-6 * u, -6 * u);
  ctx.lineTo(-3 * u, 0);
  ctx.lineTo(-6 * u, 6 * u);
  ctx.closePath();
  ctx.stroke();
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(244,237,224,0.9)';
  ctx.lineWidth = 2.5 * u;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = PALETTE.coral;
  ctx.beginPath();
  ctx.arc(cx, cy - r, 9 * u, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 ${Math.round(11 * u)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('N', cx, cy - r + 0.5 * u);
}

/** The objective banner along the top of the screen. */
export function drawMissionBanner(ctx, world, view, u) {
  const obj = currentObjective(world);
  ctx.font = `600 ${Math.round(16 * u)}px ${FONT}`;
  const textW = ctx.measureText(obj.text).width;
  const w = Math.min(view.w * 0.5, Math.max(300 * u, textW + 44 * u));
  const x = view.w / 2 - w / 2;
  const y = 16 * u;
  const h = 54 * u;
  const flash = world.mission.flash > 0 ? Math.min(1, world.mission.flash) : 0;
  panel(ctx, x, y, w, h, 10 * u, 0.66 + flash * 0.15);
  ctx.fillStyle = PALETTE.coral;
  ctx.beginPath();
  ctx.roundRect(x, y, 5 * u, h, [10 * u, 0, 0, 10 * u]);
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = `800 ${Math.round(11 * u)}px ${FONT}`;
  ctx.fillStyle = PALETTE.coral;
  const label = obj.step <= obj.total && obj.title !== 'Velocity City' ? `${obj.title.toUpperCase()}  ·  ${obj.step}/${obj.total}` : 'VELOCITY CITY';
  ctx.fillText(label.split('').join(' '), view.w / 2, y + 9 * u);
  ctx.font = `600 ${Math.round(16 * u)}px ${FONT}`;
  ctx.fillStyle = '#fbf7ee';
  let text = obj.text;
  while (ctx.measureText(text).width > w - 30 * u && text.length > 8) text = `${text.slice(0, -2)}…`;
  ctx.fillText(text, view.w / 2, y + 26 * u);
}

function drawCrosshair(ctx, world, view, u) {
  const p = world.player;
  if (!p.alive || p.aimX === null) return;
  const s = worldToScreen(world.camera, view, p.aimX, p.aimY);
  const gap = (5 + p.recoil * 6) * u;
  const len = 7 * u;
  for (const [colour, width] of [['rgba(14,16,38,0.8)', 4 * u], ['#ffffff', 2 * u]]) {
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(s.x - gap - len, s.y); ctx.lineTo(s.x - gap, s.y);
    ctx.moveTo(s.x + gap, s.y); ctx.lineTo(s.x + gap + len, s.y);
    ctx.moveTo(s.x, s.y - gap - len); ctx.lineTo(s.x, s.y - gap);
    ctx.moveTo(s.x, s.y + gap); ctx.lineTo(s.x, s.y + gap + len);
    ctx.stroke();
  }
  ctx.fillStyle = PALETTE.coral;
  ctx.fillRect(s.x - 1.5 * u, s.y - 1.5 * u, 3 * u, 3 * u);
}

/** Speedometer and car condition, bottom right, while driving. */
function drawSpeedometer(ctx, world, view, u) {
  const car = world.player.car;
  if (!car) return;
  const mph = Math.round(Math.hypot(car.vx, car.vy) * DRIVE.mph);
  const w = 168 * u;
  const h = 74 * u;
  const x = view.w - w - 22 * u;
  const y = view.h - h - 40 * u;
  panel(ctx, x, y, w, h, 12 * u, 0.7);
  const frac = Math.min(1, Math.hypot(car.vx, car.vy) / DRIVE.topSpeed);
  ctx.lineWidth = 5 * u;
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.beginPath();
  ctx.arc(x + 38 * u, y + 40 * u, 24 * u, Math.PI * 0.75, Math.PI * 2.25);
  ctx.stroke();
  ctx.strokeStyle = frac > 0.8 ? PALETTE.coral : PALETTE.mint;
  ctx.beginPath();
  ctx.arc(x + 38 * u, y + 40 * u, 24 * u, Math.PI * 0.75, Math.PI * (0.75 + 1.5 * frac));
  ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${Math.round(15 * u)}px ${FONT}`;
  ctx.fillStyle = '#fbf7ee';
  ctx.fillText(car.speed < -5 ? 'R' : car.speed > 5 || car.throttle > 0 ? 'D' : 'N', x + 38 * u, y + 41 * u);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `800 ${Math.round(30 * u)}px ${FONT}`;
  textWithShadow(ctx, String(mph), x + w - 52 * u, y + 40 * u, '#fbf7ee', u);
  ctx.font = `700 ${Math.round(12 * u)}px ${FONT}`;
  ctx.fillStyle = 'rgba(251,247,238,0.75)';
  ctx.fillText('MPH', x + w - 14 * u, y + 40 * u);
  ctx.textAlign = 'left';
  ctx.font = `700 ${Math.round(10 * u)}px ${FONT}`;
  ctx.fillStyle = 'rgba(251,247,238,0.7)';
  const burning = car.burning > 0;
  ctx.fillText(burning ? 'ON FIRE: GET OUT (F)' : car.model.name.toUpperCase(), x + 74 * u, y + 56 * u);
  const health = Math.max(0, car.health) / 100;
  const flash = burning && Math.floor(world.time * 6) % 2;
  bar(ctx, x + 74 * u, y + 61 * u, w - 88 * u, 5 * u, health, flash ? '#ffe08a' : health < 0.45 ? '#f6a35a' : '#9ff0c6', u);
}

/** The two side-window arcs a drive-by can fire through, faint around the car. */
function drawDriveByArcs(ctx, world, view, u) {
  const p = world.player;
  const car = p.car;
  if (!car || !p.alive) return;
  const c = worldToScreen(world.camera, view, car.x, car.y);
  const r = car.length * 0.5 * viewScale(world.camera, view) + 30 * u;
  const [lo, hi] = DRIVE.driveByArc;
  ctx.lineWidth = 3 * u;
  for (const side of [-1, 1]) {
    const active = side === p.driveBySide;
    ctx.strokeStyle = active ? 'rgba(255,215,94,0.55)' : 'rgba(251,247,238,0.18)';
    ctx.beginPath();
    const a0 = car.angle + side * lo;
    const a1 = car.angle + side * hi;
    ctx.arc(c.x, c.y, r, Math.min(a0, a1), Math.max(a0, a1));
    ctx.stroke();
  }
}

/** "F to steal" over the nearest car the player could take. */
function drawEnterPrompt(ctx, world, view, u) {
  const near = findEnterableCar(world);
  if (!near) return;
  const car = near.car;
  const s = worldToScreen(world.camera, view, car.x, car.y - car.width / 2 - 8);
  const text = near.steal ? 'F  to steal' : 'F  to enter';
  ctx.font = `800 ${Math.round(13 * u)}px ${FONT}`;
  const w = ctx.measureText(text).width + 22 * u;
  const h = 24 * u;
  const bob = Math.sin(world.time * 5) * 2 * u;
  panel(ctx, s.x - w / 2, s.y - h - 8 * u + bob, w, h, 12 * u, 0.78);
  ctx.fillStyle = 'rgba(22,26,52,0.78)';
  ctx.beginPath();
  ctx.moveTo(s.x - 6 * u, s.y - 8 * u + bob);
  ctx.lineTo(s.x + 6 * u, s.y - 8 * u + bob);
  ctx.lineTo(s.x, s.y - 1 * u + bob);
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = PALETTE.lemon;
  ctx.fillText(text, s.x, s.y - h / 2 - 8 * u + bob);
}

/** The control hint line, shrunk (or shortened) to fit the space right of the minimap. */
function drawHints(ctx, world, view, u, left) {
  const p = world.player;
  const full = p.car
    ? 'W/S throttle · brake  ·  A/D steer  ·  Space handbrake  ·  Mouse + click drive-by  ·  F get out  ·  Esc pause'
    : 'WASD move  ·  Shift run  ·  Mouse aim  ·  Click fire  ·  R reload  ·  F enter car  ·  Esc pause  ·  M mute';
  const short = p.car ? 'WS drive · AD steer · Space slide · F exit' : 'WASD move · Click fire · F car · Esc pause';
  const room = view.w - left - 16 * u;
  let text = full;
  let size = 12 * u;
  ctx.font = `600 ${Math.round(size)}px ${FONT}`;
  let w = ctx.measureText(text).width;
  if (w + 28 * u > room) {
    size = Math.max(10, size * (room - 28 * u) / w);
    ctx.font = `600 ${Math.round(size)}px ${FONT}`;
    w = ctx.measureText(text).width;
    if (w + 28 * u > room) {
      text = short;
      w = ctx.measureText(text).width;
    }
  }
  const hx = Math.max(view.w / 2, left + w / 2 + 14 * u);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  panel(ctx, hx - w / 2 - 14 * u, view.h - 30 * u, w + 28 * u, 22 * u, 11 * u, 0.62);
  ctx.fillStyle = 'rgba(251,247,238,0.95)';
  ctx.fillText(text, hx, view.h - 19 * u);
}

/** The whole HUD for a frame of play. */
export function drawHud(ctx, world, view) {
  const u = hudScale(view);
  const p = world.player;
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.globalAlpha = 1;
  if (p.hurtFlash > 0 || p.health < 25) {
    const a = Math.max(p.hurtFlash * 1.2, p.health < 25 ? 0.18 + Math.sin(world.time * 5) * 0.06 : 0);
    const g = ctx.createRadialGradient(view.w / 2, view.h / 2, view.h * 0.3, view.w / 2, view.h / 2, view.h * 0.9);
    g.addColorStop(0, 'rgba(255,60,60,0)');
    g.addColorStop(1, `rgba(255,60,60,${Math.min(0.5, a).toFixed(3)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, view.w, view.h);
  }
  drawStatus(ctx, world, view, u);
  const r = 92 * u;
  const mx = 24 * u + r;
  const my = view.h - 40 * u - r;
  drawMinimap(ctx, world, mx, my, r, u);
  const district = districtAt(world.city, p.x, p.y);
  ctx.font = `800 ${Math.round(13 * u)}px ${FONT}`;
  const dw = ctx.measureText(district.toUpperCase()).width + 24 * u;
  panel(ctx, mx - dw / 2, view.h - 30 * u, dw, 22 * u, 11 * u, 0.7);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = PALETTE.mint;
  ctx.fillText(district.toUpperCase(), mx, view.h - 19 * u);
  drawMissionBanner(ctx, world, view, u);
  if (world.toast) {
    ctx.font = `700 ${Math.round(18 * u)}px ${FONT}`;
    const tw = ctx.measureText(world.toast.text).width + 40 * u;
    const ty = view.h * 0.72;
    ctx.globalAlpha = Math.min(1, world.toast.time * 2);
    panel(ctx, view.w / 2 - tw / 2, ty - 18 * u, tw, 36 * u, 18 * u, 0.72);
    ctx.fillStyle = PALETTE.lemon;
    ctx.fillText(world.toast.text, view.w / 2, ty);
    ctx.globalAlpha = 1;
  }
  drawHints(ctx, world, view, u, mx + r + 26 * u);
  drawSpeedometer(ctx, world, view, u);
  drawDriveByArcs(ctx, world, view, u);
  drawEnterPrompt(ctx, world, view, u);
  drawCrosshair(ctx, world, view, u);
}
