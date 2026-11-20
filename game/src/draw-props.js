// Street furniture and effects: palms and park trees that sway, street lamps, traffic signals,
// beach umbrellas and towels, fountains, boats, gulls, particles, bullet tracers and the mission
// marker. Each prop can also add its long shadow to the shadow layer.
import { PALETTE } from './config.js';
import { hexToRgb, litRgb, mixRgb, rgbString } from './color.js';
import { SIGNAL_AMBER, SIGNAL_GO, DIR_N, DIR_E, signalFor } from './city.js';

export function addTreeShadow(sctx, t, light) {
  const sx = light.shadowX;
  const sy = light.shadowY;
  if (t.kind === 'palm') {
    sctx.lineWidth = 3;
    sctx.beginPath();
    sctx.moveTo(t.x, t.y);
    sctx.lineTo(t.x + sx * t.height + t.lean, t.y + sy * t.height);
    sctx.stroke();
    const cx = t.x + sx * t.height + t.lean;
    const cy = t.y + sy * t.height;
    sctx.beginPath();
    for (let k = 0; k < t.fronds; k += 1) {
      const a = t.phase + (k / t.fronds) * Math.PI * 2;
      sctx.moveTo(cx, cy);
      sctx.ellipse(cx + Math.cos(a) * 9, cy + Math.sin(a) * 9, 9, 3, a, 0, Math.PI * 2);
    }
    sctx.fill();
  } else {
    sctx.beginPath();
    sctx.ellipse(t.x + sx * t.height, t.y + sy * t.height, t.size * (1 + Math.abs(sx) * 0.3), t.size * 0.85, 0, 0, Math.PI * 2);
    sctx.fill();
  }
}

/** A palm: curved ringed trunk and drooping fronds that sway in the sea breeze. */
export function drawPalm(ctx, t, frame) {
  const light = frame.light;
  const sway = Math.sin(frame.time * 0.9 + t.phase) * 1.6;
  const tx = t.x + t.lean + sway;
  const ty = t.y - t.height;
  ctx.strokeStyle = rgbString(litRgb([150, 112, 78], 1, light));
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.moveTo(t.x, t.y);
  ctx.quadraticCurveTo(t.x + t.lean * 0.15 + 3, t.y - t.height * 0.5, tx, ty);
  ctx.stroke();
  ctx.strokeStyle = rgbString(litRgb([196, 160, 116], 1, light), 0.8);
  ctx.lineWidth = 3.4;
  ctx.setLineDash([1.2, 3.2]);
  ctx.stroke();
  ctx.setLineDash([]);
  const green = mixRgb([64, 150, 92], [96, 182, 104], t.tone - 0.85);
  for (let k = 0; k < t.fronds; k += 1) {
    const a = t.phase + (k / t.fronds) * Math.PI * 2 + Math.sin(frame.time * 1.3 + k) * 0.05;
    const reach = 17 + (k % 3) * 2;
    const ex = tx + Math.cos(a) * reach;
    const ey = ty + Math.sin(a) * reach * 0.7 + 6;
    const mx = tx + Math.cos(a) * reach * 0.55;
    const my = ty + Math.sin(a) * reach * 0.38 - 3;
    const facing = Math.cos(a) * light.sunX + Math.sin(a) * light.sunY;
    ctx.fillStyle = rgbString(litRgb(green, 0.85 + 0.25 * Math.max(0, facing), light));
    const nx = -Math.sin(a) * 3.4;
    const ny = Math.cos(a) * 3.4;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.quadraticCurveTo(mx + nx, my + ny, ex, ey);
    ctx.quadraticCurveTo(mx - nx, my - ny, tx, ty);
    ctx.fill();
  }
  ctx.fillStyle = rgbString(litRgb([120, 84, 46], 1, light));
  ctx.beginPath();
  ctx.arc(tx - 1.5, ty + 1.5, 1.8, 0, Math.PI * 2);
  ctx.arc(tx + 1.6, ty + 1.2, 1.8, 0, Math.PI * 2);
  ctx.fill();
}

/** A broadleaf park tree: a short trunk and a clump of lit canopy blobs. */
export function drawRoundTree(ctx, t, frame) {
  const light = frame.light;
  const top = t.y - t.height;
  ctx.strokeStyle = rgbString(litRgb([120, 90, 66], 1, light));
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(t.x, t.y);
  ctx.lineTo(t.x, top + t.size * 0.4);
  ctx.stroke();
  const base = mixRgb([70, 140, 76], [96, 164, 84], t.tone - 0.85);
  ctx.fillStyle = rgbString(litRgb(base, 0.78, light));
  ctx.beginPath();
  ctx.arc(t.x, top, t.size, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rgbString(litRgb(base, 1, light));
  ctx.beginPath();
  ctx.arc(t.x + light.sunX * t.size * 0.25 - t.size * 0.2, top - t.size * 0.2, t.size * 0.72, 0, Math.PI * 2);
  ctx.arc(t.x + t.size * 0.4, top + t.size * 0.1, t.size * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rgbString(litRgb(base, 1.22, light), 0.8);
  ctx.beginPath();
  ctx.arc(t.x + light.sunX * t.size * 0.45, top + light.sunY * t.size * 0.3 - t.size * 0.3, t.size * 0.32, 0, Math.PI * 2);
  ctx.fill();
}

export function addLampShadow(sctx, l, light) {
  sctx.lineWidth = 1.6;
  sctx.beginPath();
  sctx.moveTo(l.x, l.y);
  sctx.lineTo(l.x + light.shadowX * 30, l.y + light.shadowY * 30);
  sctx.stroke();
}

/** A street lamp: pole, arm over the road, head; it glows at dusk and after dark. */
export function drawLamp(ctx, l, frame) {
  const light = frame.light;
  const hx = l.x + l.nx * 8;
  const hy = l.y - 30 + l.ny * 8;
  ctx.strokeStyle = rgbString(litRgb([82, 90, 110], 1, light));
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(l.x, l.y);
  ctx.lineTo(l.x, l.y - 30);
  ctx.lineTo(hx, hy);
  ctx.stroke();
  const on = light.night > 0.2 || light.golden > 0.7;
  ctx.fillStyle = on ? '#fff1c2' : rgbString(litRgb([210, 214, 220], 1, light));
  ctx.beginPath();
  ctx.ellipse(hx, hy, 3.4, 1.9, 0, 0, Math.PI * 2);
  ctx.fill();
  if (on) {
    const a = Math.max(light.night, (light.golden - 0.7) * 1.2);
    frame.glows.push({ x: hx, y: hy + 28, r: 56, color: [255, 214, 150], a: 0.4 * a });
    frame.glows.push({ x: hx, y: hy, r: 12, color: [255, 240, 200], a: 0.6 * a });
  }
}

/** A traffic signal head on a corner pole, lit for the axis it controls. */
export function drawSignal(ctx, sig, city, frame) {
  const state = signalFor(city, sig.i, sig.j, sig.axis === 'ns' ? DIR_N : DIR_E, frame.time);
  ctx.strokeStyle = '#3c4256';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(sig.x, sig.y);
  ctx.lineTo(sig.x, sig.y - 20);
  ctx.stroke();
  ctx.fillStyle = '#262a38';
  ctx.fillRect(sig.x - 2.6, sig.y - 29, 5.2, 11);
  const colours = ['#3cff9a', '#ffc94a', '#ff4b4b'];
  const slot = state === SIGNAL_GO ? 2 : state === SIGNAL_AMBER ? 1 : 0;
  for (let k = 0; k < 3; k += 1) {
    const lit = (2 - k) === state;
    ctx.fillStyle = lit ? colours[state] : '#43465a';
    ctx.beginPath();
    ctx.arc(sig.x, sig.y - 26.6 + k * 3.3, 1.2, 0, Math.PI * 2);
    ctx.fill();
  }
  if (frame.light.night > 0.3 || frame.light.golden > 0.6) frame.glows.push({ x: sig.x, y: sig.y - 26.6 + slot * 3.3, r: 9, color: hexToRgb(colours[state]), a: 0.6 });
}

export function addUmbrellaShadow(sctx, u, light) {
  sctx.beginPath();
  sctx.ellipse(u.x + light.shadowX * 14, u.y + light.shadowY * 14, u.r * 1.05, u.r * 0.8, 0, 0, Math.PI * 2);
  sctx.fill();
}

/** A striped beach umbrella on its pole. */
export function drawUmbrella(ctx, u, frame) {
  const light = frame.light;
  ctx.strokeStyle = '#e9e2d4';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(u.x, u.y);
  ctx.lineTo(u.x, u.y - 14);
  ctx.stroke();
  const c = litRgb(hexToRgb(u.color), 1, light);
  const w = litRgb([252, 250, 244], 1, light);
  for (let k = 0; k < 8; k += 1) {
    ctx.fillStyle = rgbString(k % 2 ? c : w);
    ctx.beginPath();
    ctx.moveTo(u.x, u.y - 15);
    ctx.ellipse(u.x, u.y - 14, u.r, u.r * 0.82, 0, (k / 8) * Math.PI * 2, ((k + 1) / 8) * Math.PI * 2);
    ctx.closePath();
    ctx.fill();
  }
}

export function drawTowel(ctx, t, frame) {
  ctx.save();
  ctx.translate(t.x, t.y);
  ctx.rotate(t.angle);
  ctx.fillStyle = rgbString(litRgb(hexToRgb(t.color), 1, frame.light));
  ctx.fillRect(-6, -10, 12, 20);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillRect(-6, -4, 12, 2.4);
  ctx.fillRect(-6, 3, 12, 2.4);
  ctx.restore();
}

export function drawFountain(ctx, f, frame) {
  ctx.fillStyle = rgbString(litRgb([226, 216, 196], 1, frame.light));
  ctx.beginPath();
  ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rgbString(litRgb([80, 196, 204], 1, frame.light));
  ctx.beginPath();
  ctx.arc(f.x, f.y, f.r - 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(240,255,255,0.85)';
  for (let k = 0; k < 10; k += 1) {
    const a = (k / 10) * Math.PI * 2 + frame.time * 0.8;
    const d = ((frame.time * 9 + k * 3) % (f.r - 4));
    ctx.beginPath();
    ctx.arc(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d - (f.r - 4 - d) * 0.4, 1.1, 0, Math.PI * 2);
    ctx.fill();
  }
}

function boatHull(ctx, L, W) {
  ctx.beginPath();
  ctx.moveTo(L / 2, 0);
  ctx.quadraticCurveTo(L * 0.2, -W / 2, -L / 2, -W / 2 + 1);
  ctx.lineTo(-L / 2, W / 2 - 1);
  ctx.quadraticCurveTo(L * 0.2, W / 2, L / 2, 0);
  ctx.closePath();
}

export function addBoatShadow(sctx, b, light) {
  sctx.save();
  sctx.translate(b.x + light.shadowX * 5, b.y + light.shadowY * 5);
  sctx.rotate(b.angle);
  boatHull(sctx, b.length, b.width ?? b.length * 0.36);
  sctx.fill();
  sctx.restore();
}

/** A boat: pointed hull with a stripe, deck and cabin; sailboats get a mast and, under way, a sail. */
export function drawBoat(ctx, b, frame, moving) {
  const light = frame.light;
  const L = b.length;
  const W = b.width ?? L * 0.36;
  const bob = Math.sin(frame.time * 1.6 + b.phase) * 0.8;
  ctx.save();
  ctx.translate(b.x, b.y + bob);
  ctx.rotate(b.angle + Math.sin(frame.time * 1.1 + b.phase) * 0.03);
  if (moving) {
    ctx.strokeStyle = 'rgba(240,255,250,0.55)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-L / 2, -W / 2);
    ctx.lineTo(-L * 1.6, -W * 1.5);
    ctx.moveTo(-L / 2, W / 2);
    ctx.lineTo(-L * 1.6, W * 1.5);
    ctx.stroke();
  }
  ctx.fillStyle = rgbString(litRgb(hexToRgb(b.hull), 1, light));
  boatHull(ctx, L, W);
  ctx.fill();
  ctx.strokeStyle = rgbString(litRgb(hexToRgb(b.stripe ?? PALETTE.coral), 1, light));
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.fillStyle = rgbString(litRgb([214, 190, 150], 1, light));
  ctx.fillRect(-L * 0.4, -W * 0.28, L * 0.5, W * 0.56);
  ctx.fillStyle = rgbString(litRgb([248, 248, 244], 1, light));
  ctx.fillRect(-L * 0.18, -W * 0.3, L * 0.26, W * 0.6);
  ctx.fillStyle = rgbString(mixRgb([50, 80, 100], light.sunTint, light.golden * 0.4));
  ctx.fillRect(L * 0.04, -W * 0.24, L * 0.05, W * 0.48);
  if (b.sail || b.kind === 'sail') {
    ctx.fillStyle = '#d9d6cc';
    ctx.beginPath();
    ctx.arc(-L * 0.02, 0, 1.6, 0, Math.PI * 2);
    ctx.fill();
    if (moving) {
      ctx.fillStyle = 'rgba(255,253,246,0.92)';
      ctx.beginPath();
      ctx.moveTo(-L * 0.02, 0);
      ctx.lineTo(-L * 0.45, W * 0.9);
      ctx.lineTo(-L * 0.45, -W * 0.1);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

export function addGullShadow(sctx, g, light) {
  sctx.beginPath();
  sctx.ellipse(g.x + light.shadowX * g.z, g.y + light.shadowY * g.z, 4.5, 2, g.angle, 0, Math.PI * 2);
  sctx.fill();
}

/** A gull in flight, wings beating. */
export function drawGull(ctx, g) {
  const x = g.x;
  const y = g.y - g.z;
  const c = Math.cos(g.angle);
  const s = Math.sin(g.angle);
  const beat = Math.sin(g.flap) * 3;
  ctx.strokeStyle = '#fbfbf7';
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - s * 8 - c * 1, y + c * 8 - 1 - beat);
  ctx.quadraticCurveTo(x - s * 3, y + c * 3 - 2 - beat * 0.6, x, y);
  ctx.quadraticCurveTo(x + s * 3, y - c * 3 - 2 - beat * 0.6, x + s * 8 - c * 1, y - c * 8 - 1 - beat);
  ctx.stroke();
  ctx.strokeStyle = '#59606e';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x - s * 8 - c, y + c * 8 - 1 - beat);
  ctx.lineTo(x - s * 6.5 - c, y + c * 6.5 - 1.3 - beat);
  ctx.moveTo(x + s * 8 - c, y - c * 8 - 1 - beat);
  ctx.lineTo(x + s * 6.5 - c, y - c * 6.5 - 1.3 - beat);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(x, y, 3.4, 1.4, g.angle, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f6c34a';
  ctx.fillRect(x + c * 3.4 - 0.6, y + s * 3.4 - 0.6, 1.2, 1.2);
  ctx.lineCap = 'butt';
}

/** Every live particle, by kind; fire, sparks and flashes add light. */
export function drawParticles(ctx, world, frame) {
  for (const p of world.particles) {
    const k = 1 - p.age / p.life;
    const y = p.y - p.z;
    if (p.kind === 'spark') {
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = p.color;
      ctx.globalAlpha = k;
      ctx.lineWidth = p.size;
      ctx.beginPath();
      ctx.moveTo(p.x, y);
      ctx.lineTo(p.x - p.vx * 0.025, y - p.vy * 0.025 + p.vz * 0.02);
      ctx.stroke();
    } else if (p.kind === 'fire' || p.kind === 'flash') {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = k * (p.kind === 'flash' ? 0.8 : 0.85);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, y, p.size, 0, Math.PI * 2);
      ctx.fill();
      if (p.kind === 'flash') frame.glows.push({ x: p.x, y: p.y, r: p.size * 2.5, color: [255, 200, 120], a: k });
    } else if (p.kind === 'ring') {
      ctx.globalAlpha = k * 0.7;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.stroke();
    } else if (p.kind === 'debris' || p.kind === 'shell') {
      ctx.globalAlpha = Math.min(1, k * 3);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, y - p.size / 2, p.size, p.size * 0.6);
    } else {
      ctx.globalAlpha = k * (p.kind === 'smoke' ? 0.42 : 0.5);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

/** Bright tracers for bullets in flight. */
export function drawBullets(ctx, world) {
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (const b of world.bullets) {
    const len = Math.hypot(b.vx, b.vy) || 1;
    ctx.strokeStyle = 'rgba(255,236,170,0.9)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(b.x - (b.vx / len) * 22, b.y - 7 - (b.vy / len) * 22);
    ctx.lineTo(b.x, b.y - 7);
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
  ctx.globalCompositeOperation = 'source-over';
}

/** The objective marker: a pulsing ring with a beam of light, or an arrow over a target car. */
export function drawMissionMarker(ctx, target, kind, frame) {
  if (!target) return;
  const pulse = (Math.sin(frame.time * 4) + 1) / 2;
  if (kind === 'destroy') {
    const y = target.y - 34 - pulse * 5;
    ctx.fillStyle = PALETTE.coral;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(target.x - 8, y - 10);
    ctx.lineTo(target.x + 8, y - 10);
    ctx.lineTo(target.x, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    return;
  }
  ctx.strokeStyle = `rgba(255,122,104,${(0.6 + pulse * 0.4).toFixed(3)})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(target.x, target.y, 22 + pulse * 5, 15 + pulse * 3, 0, 0, Math.PI * 2);
  ctx.stroke();
  const g = ctx.createLinearGradient(0, target.y, 0, target.y - 150);
  g.addColorStop(0, 'rgba(255,122,104,0.55)');
  g.addColorStop(1, 'rgba(255,122,104,0)');
  ctx.fillStyle = g;
  ctx.fillRect(target.x - 7, target.y - 150, 14, 150);
  frame.glows.push({ x: target.x, y: target.y, r: 40, color: [255, 122, 104], a: 0.35 });
}
