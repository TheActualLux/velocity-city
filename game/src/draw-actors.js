// Cars, pedestrians and the player, drawn top-down with a little height: car bodies sit on a dark
// skirt, people stand up off their feet. Police light bars flash red and blue, brake lights glow,
// wrecks go charcoal, and the pistol throws a muzzle flash (from the side window of the player's
// car on a drive-by, and from police windows). Lights are queued as glows for the renderer to add
// after the colour grade.
import { PALETTE } from './config.js';
import { hexToRgb, litRgb, mixRgb, rgbString, shadeRgb } from './color.js';

/** A rotated rectangle's shadow swept by `height` along the sun vector. */
export function addRotatedBoxShadow(sctx, x, y, length, width, angle, height, light) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const hx = length / 2;
  const hy = width / 2;
  const dx = light.shadowX * height;
  const dy = light.shadowY * height;
  sctx.beginPath();
  for (const [ox, oy] of [[0, 0], [dx, dy]]) {
    sctx.moveTo(x + ox + c * hx - s * hy, y + oy + s * hx + c * hy);
    sctx.lineTo(x + ox - c * hx - s * hy, y + oy - s * hx + c * hy);
    sctx.lineTo(x + ox - c * hx + s * hy, y + oy - s * hx - c * hy);
    sctx.lineTo(x + ox + c * hx + s * hy, y + oy + s * hx - c * hy);
    sctx.closePath();
  }
  sctx.fill();
  sctx.beginPath();
  for (const [sx, sy] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
    const px = x + c * hx * sx - s * hy * sy;
    const py = y + s * hx * sx + c * hy * sy;
    sctx.moveTo(px, py);
    sctx.lineTo(px + dx, py + dy);
  }
  sctx.lineWidth = Math.min(length, width) * 0.9;
  sctx.stroke();
}

export function addCarShadow(sctx, car, light) {
  addRotatedBoxShadow(sctx, car.x, car.y, car.length * 0.96, car.width * 0.96, car.angle, 7, light);
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

/** A star-shaped muzzle flash at (mx, my) pointing along `angle`, with its glow; k is 0..1 freshness. */
function drawMuzzleFlash(ctx, frame, mx, my, angle, k) {
  ctx.fillStyle = '#fff6c8';
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const a = angle + (i / 10) * Math.PI * 2;
    const r = (i % 2 ? 3 : i === 0 ? 13 : 7) * (0.6 + k * 0.5);
    if (i === 0) ctx.moveTo(mx + Math.cos(a) * r, my + Math.sin(a) * r);
    else ctx.lineTo(mx + Math.cos(a) * r, my + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffd25a';
  ctx.beginPath();
  ctx.arc(mx, my, 3.2, 0, Math.PI * 2);
  ctx.fill();
  frame.glows.push({ x: mx, y: my, r: 60, color: [255, 210, 120], a: 0.8 * k });
}

/** The driver's arm and pistol out of the side window, while a drive-by is under way. */
function drawDriveByArm(ctx, car, p, frame) {
  if (!(p.fireCooldown > 0 || p.recoil > 0 || p.muzzleFlash > 0)) return;
  const c = Math.cos(car.angle);
  const s = Math.sin(car.angle);
  const side = p.driveBySide;
  const wx = car.x + car.length * 0.05 * c - side * (car.width / 2 - 2) * s;
  const wy = car.y - 1.2 + car.length * 0.05 * s + side * (car.width / 2 - 2) * c;
  const ac = Math.cos(p.angle);
  const as = Math.sin(p.angle);
  const reach = 9 - p.recoil * 2.5;
  ctx.lineCap = 'round';
  ctx.strokeStyle = rgbString(litRgb(hexToRgb('#d9a27c'), 1, frame.light));
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(wx, wy);
  ctx.lineTo(wx + ac * reach, wy + as * reach);
  ctx.stroke();
  ctx.strokeStyle = '#1f2330';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(wx + ac * (reach - 1), wy + as * (reach - 1));
  ctx.lineTo(wx + ac * (reach + 5), wy + as * (reach + 5));
  ctx.stroke();
  ctx.lineCap = 'butt';
  if (p.muzzleFlash > 0) drawMuzzleFlash(ctx, frame, wx + ac * (reach + 9), wy + as * (reach + 9), p.angle, p.muzzleFlash / 0.07);
}

/** One car: skirt, body, glasshouse by body style, lights, police light bar, damage tint. `driver` is the player at the wheel. */
export function drawCar(ctx, car, frame, driver = null) {
  const light = frame.light;
  const L = car.length;
  const W = car.width;
  const kind = car.model.kind;
  let body = hexToRgb(car.color);
  if (car.wrecked) body = [46, 42, 44];
  else if (car.health < 45) body = mixRgb(body, [70, 64, 60], (45 - car.health) / 90);
  const lit = litRgb(body, 1, light);
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.save();
  ctx.translate(0, 2.4);
  ctx.rotate(car.angle);
  ctx.fillStyle = rgbString(shadeRgb(lit, 0.5));
  roundedRect(ctx, -L / 2, -W / 2, L, W, 5);
  ctx.restore();
  ctx.translate(0, -1.2);
  ctx.rotate(car.angle);
  ctx.fillStyle = rgbString(lit);
  roundedRect(ctx, -L / 2, -W / 2, L, W, kind === 'van' ? 3.5 : 5.5);
  ctx.fillStyle = rgbString(shadeRgb(lit, 1.1), 0.6);
  ctx.fillRect(-L / 2 + 3, -W * 0.18, L - 6, W * 0.36);
  const glass = car.wrecked ? 'rgb(26,24,28)' : rgbString(mixRgb([52, 74, 98], light.sunTint, light.golden * 0.35));
  ctx.fillStyle = glass;
  if (kind === 'van') {
    ctx.fillRect(L * 0.3, -W / 2 + 2, L * 0.1, W - 4);
    ctx.fillStyle = rgbString(shadeRgb(lit, 1.06));
    ctx.fillRect(-L / 2 + 3, -W / 2 + 2.5, L * 0.78, W - 5);
  } else if (kind === 'pickup') {
    ctx.fillRect(L * 0.08, -W / 2 + 2.5, L * 0.13, W - 5);
    ctx.fillStyle = rgbString(shadeRgb(lit, 1.06));
    ctx.fillRect(-L * 0.06, -W / 2 + 2.5, L * 0.14, W - 5);
    ctx.fillStyle = rgbString(shadeRgb(lit, 0.62));
    ctx.fillRect(-L / 2 + 3, -W / 2 + 3, L * 0.38, W - 6);
  } else if (kind === 'roadster') {
    ctx.fillRect(L * 0.05, -W / 2 + 2.5, L * 0.1, W - 5);
    ctx.fillStyle = 'rgb(58,40,36)';
    ctx.fillRect(-L * 0.2, -W / 2 + 3, L * 0.24, W - 6);
  } else {
    ctx.fillRect(L * 0.1, -W / 2 + 2.2, L * 0.17, W - 4.4);
    ctx.fillRect(-L * 0.34, -W / 2 + 2.6, L * 0.12, W - 5.2);
    ctx.fillStyle = rgbString(kind === 'police' ? [40, 56, 104] : shadeRgb(lit, 1.07));
    ctx.fillRect(-L * 0.22, -W / 2 + 2.6, L * 0.32, W - 5.2);
    ctx.fillStyle = glass;
    ctx.fillRect(-L * 0.2, -W / 2 + 1, L * 0.28, 1.6);
    ctx.fillRect(-L * 0.2, W / 2 - 2.6, L * 0.28, 1.6);
  }
  if (kind === 'police' && !car.wrecked) {
    ctx.fillStyle = 'rgb(40,56,104)';
    ctx.fillRect(L * 0.3, -W / 2 + 1, L * 0.2, W - 2);
    ctx.fillRect(-L / 2 + 1, -W / 2 + 1, L * 0.12, W - 2);
    const on = car.pursuing || car.seek;
    const phase = Math.floor(frame.time * 8 + car.id) % 2;
    ctx.fillStyle = on && phase === 0 ? '#ff4d5e' : '#7a2a34';
    ctx.fillRect(-L * 0.06, -W / 2 + 2, 4, W / 2 - 2);
    ctx.fillStyle = on && phase === 1 ? '#5aa8ff' : '#28406e';
    ctx.fillRect(-L * 0.06, 0, 4, W / 2 - 2);
    if (on) {
      const c = Math.cos(car.angle);
      const s = Math.sin(car.angle);
      frame.glows.push({ x: car.x - c * 3 - s * (phase ? 5 : -5), y: car.y - s * 3 + c * (phase ? 5 : -5), r: 70, color: phase ? [90, 168, 255] : [255, 77, 94], a: 0.55 });
    }
  }
  if (kind === 'cab' && !car.wrecked) {
    ctx.fillStyle = '#2b2f3c';
    ctx.fillRect(-L * 0.08, -W * 0.22, 5, W * 0.44);
    ctx.fillStyle = PALETTE.lemon;
    ctx.fillRect(-L * 0.07, -W * 0.18, 3, W * 0.36);
  }
  if (!car.wrecked) {
    ctx.fillStyle = '#fff6d2';
    ctx.fillRect(L / 2 - 2.4, -W / 2 + 2, 2.2, 3.6);
    ctx.fillRect(L / 2 - 2.4, W / 2 - 5.6, 2.2, 3.6);
    ctx.fillStyle = car.braking ? '#ff3b3b' : '#a8263a';
    ctx.fillRect(-L / 2 + 0.3, -W / 2 + 2, 2, 3.6);
    ctx.fillRect(-L / 2 + 0.3, W / 2 - 5.6, 2, 3.6);
    if (frame.light.night > 0.3 && !car.parked) {
      const c = Math.cos(car.angle);
      const s = Math.sin(car.angle);
      frame.glows.push({ x: car.x + c * (L / 2 + 26), y: car.y + s * (L / 2 + 26), r: 34, color: [255, 236, 190], a: 0.35 * frame.light.night });
    }
    if (car.braking && !car.parked) {
      const c = Math.cos(car.angle);
      const s = Math.sin(car.angle);
      frame.glows.push({ x: car.x - c * (L / 2 + 3), y: car.y - s * (L / 2 + 3), r: 14, color: [255, 60, 60], a: 0.5 });
    }
  }
  if (car.hitFlash > 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    roundedRect(ctx, -L / 2, -W / 2, L, W, 5);
  }
  ctx.restore();
  if (driver) drawDriveByArm(ctx, car, driver, frame);
  if (car.muzzleFlash > 0 && kind === 'police') {
    const c = Math.cos(car.angle);
    const s = Math.sin(car.angle);
    const off = (car.muzzleSide ?? 1) * (W / 2 + 8);
    drawMuzzleFlash(ctx, frame, car.x - s * off, car.y + c * off, car.muzzleAngle ?? car.angle, car.muzzleFlash / 0.07);
  }
  if (car.burning > 0) frame.glows.push({ x: car.x, y: car.y, r: 70, color: [255, 140, 60], a: 0.5 + 0.2 * Math.sin(frame.time * 23) });
}

export function addFigureShadow(sctx, x, y, height, light) {
  const len = Math.hypot(light.shadowX, light.shadowY) * height;
  sctx.beginPath();
  sctx.ellipse(x + light.shadowX * height * 0.5, y + light.shadowY * height * 0.5, 3.5 + len * 0.5, 3.2, Math.atan2(light.shadowY, light.shadowX), 0, Math.PI * 2);
  sctx.fill();
}

function drawLyingFigure(ctx, ped, light) {
  ctx.save();
  ctx.translate(ped.x, ped.y);
  ctx.rotate(ped.angle);
  ctx.fillStyle = rgbString(litRgb(hexToRgb(ped.pants), 1, light));
  ctx.fillRect(-9, -3, 7, 6);
  ctx.fillStyle = rgbString(litRgb(hexToRgb(ped.shirt), 1, light));
  ctx.beginPath();
  ctx.ellipse(1, 0, 5, 4.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rgbString(litRgb(hexToRgb(ped.skin), 1, light));
  ctx.beginPath();
  ctx.arc(7.5, 0, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** A standing person seen from above and a little south: feet, swinging legs, torso, head. */
function drawStandingFigure(ctx, x, y, angle, step, moving, look, light, armAngle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const swing = moving ? Math.sin(step) * 3.4 : 0;
  const b = look.build;
  ctx.fillStyle = rgbString(litRgb(hexToRgb(look.pants), 0.9, light));
  for (const side of [-1, 1]) {
    const fx = x + c * swing * side - s * 2 * side;
    const fy = y + s * swing * side + c * 2 * side;
    ctx.beginPath();
    ctx.ellipse(fx, fy - 2, 2, 2.8, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const ty = y - 6.5;
  ctx.fillStyle = rgbString(litRgb(hexToRgb(look.pants), 1, light));
  ctx.beginPath();
  ctx.ellipse(x, ty + 2.5, 3.6 * b, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rgbString(litRgb(hexToRgb(look.skin), 1, light));
  for (const side of [-1, 1]) {
    const sw = armAngle === null ? -swing * side * 0.8 : 0;
    ctx.beginPath();
    ctx.arc(x - s * 4.6 * side * b + c * sw, ty - 1 + c * 4.6 * side * 0.5 + s * sw, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = rgbString(litRgb(hexToRgb(look.shirt), 1, light));
  ctx.beginPath();
  ctx.ellipse(x, ty - 1, 4.7 * b, 3.9, angle + Math.PI / 2, 0, Math.PI * 2);
  ctx.ellipse(x, ty - 1, 4.2 * b, 4.2, 0, 0, Math.PI * 2);
  ctx.fill();
  if (look.bag) {
    ctx.fillStyle = 'rgb(120,86,60)';
    ctx.fillRect(x - c * 4 - 1.5, ty - s * 4 - 1, 3, 3);
  }
  const hy = ty - 5.4;
  ctx.fillStyle = rgbString(litRgb(hexToRgb(look.skin), 1.03, light));
  ctx.beginPath();
  ctx.arc(x + c * 0.6, hy + s * 0.6, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rgbString(litRgb(hexToRgb(look.hat ?? look.hair), 1, light));
  ctx.beginPath();
  if (look.hat) ctx.arc(x, hy - 0.4, 3.9, 0, Math.PI * 2);
  else ctx.arc(x - c * 0.9, hy - s * 0.9 - 0.5, 2.9, 0, Math.PI * 2);
  ctx.fill();
}

export function drawPedestrian(ctx, ped, frame) {
  if (ped.state === 'down') drawLyingFigure(ctx, ped, frame.light);
  else drawStandingFigure(ctx, ped.x, ped.y, ped.angle, ped.step, ped.state !== 'wait' && ped.speed > 1, ped, frame.light, null);
}

const PLAYER_LOOK = { shirt: '#fbf7ef', pants: '#ff7a68', skin: '#d9a27c', hair: '#1f1712', hat: null, bag: false, build: 1.12 };

/** The player: a standing figure with the pistol arm out toward the aim, and the muzzle flash. */
export function drawPlayer(ctx, p, frame) {
  if (!p.active) return;
  const light = frame.light;
  if (!p.alive) {
    drawLyingFigure(ctx, { ...PLAYER_LOOK, x: p.x, y: p.y, angle: p.angle }, light);
    return;
  }
  const moving = Math.hypot(p.vx, p.vy) > 8;
  const body = moving ? p.moveAngle : p.angle;
  const c = Math.cos(p.angle);
  const s = Math.sin(p.angle);
  const behind = s < -0.2;
  const drawGun = () => {
    const sx = p.x - s * 3;
    const sy = p.y - 7 + c * 1.5;
    const reach = 11 - p.recoil * 2.5;
    ctx.strokeStyle = rgbString(litRgb(hexToRgb(PLAYER_LOOK.skin), 1, light));
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + c * reach, sy + s * reach);
    ctx.stroke();
    ctx.strokeStyle = '#1f2330';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(sx + c * (reach - 1), sy + s * (reach - 1));
    ctx.lineTo(sx + c * (reach + 5), sy + s * (reach + 5));
    ctx.stroke();
    ctx.lineCap = 'butt';
  };
  if (behind) drawGun();
  drawStandingFigure(ctx, p.x, p.y, body, p.step, moving, PLAYER_LOOK, light, p.angle);
  if (!behind) drawGun();
  if (p.hurtFlash > 0) {
    ctx.fillStyle = `rgba(255,80,80,${(p.hurtFlash * 1.2).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y - 7, 8, 0, Math.PI * 2);
    ctx.fill();
  }
  if (p.muzzleFlash > 0) drawMuzzleFlash(ctx, frame, p.x - s * 3 + c * 19, p.y - 7 + c * 1.5 + s * 19, p.angle, p.muzzleFlash / 0.07);
}
