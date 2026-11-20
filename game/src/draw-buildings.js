// Buildings as extruded blocks: a lit roof lifted above the footprint, the south wall facing the
// camera, and a side wall that shows as roofs lean away from the middle of the screen (a cheap
// perspective). Windows, shopfront awnings, setback tiers and roof clutter make each one read.
// Also the Sun Bowl stadium, and the long shadows both of them cast across the street.
import { CITY, PALETTE, RENDER } from './config.js';
import { hexToRgb, litRgb, mixRgb, rgbString, shadeRgb } from './color.js';
import { faceLight } from './lighting.js';
import { hash2 } from './rng.js';

/** Sideways roof shift per unit of height for something centred at x. */
export function leanAt(x, rect) {
  return RENDER.lean * Math.max(-1.3, Math.min(1.3, (x - rect.cx) / rect.halfW));
}

export function totalHeight(b) {
  return b.height + (b.tier ? b.tier.height : 0);
}

/** Convex hull (monotone chain) of a flat [x0, y0, x1, y1, ...] list, as point pairs. */
function hull(points) {
  const pts = [];
  for (let k = 0; k < points.length; k += 2) pts.push([points[k], points[k + 1]]);
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let k = pts.length - 1; k >= 0; k -= 1) {
    const p = pts[k];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/** Fill a box's shadow (footprint swept along the sun vector by its height) onto the shadow layer. */
export function addBoxShadow(sctx, x, y, w, h, height, light) {
  const dx = light.shadowX * height;
  const dy = light.shadowY * height;
  const poly = hull([x, y, x + w, y, x + w, y + h, x, y + h, x + dx, y + dy, x + w + dx, y + dy, x + w + dx, y + h + dy, x + dx, y + h + dy]);
  sctx.beginPath();
  sctx.moveTo(poly[0][0], poly[0][1]);
  for (let k = 1; k < poly.length; k += 1) sctx.lineTo(poly[k][0], poly[k][1]);
  sctx.closePath();
  sctx.fill();
}

export function addBuildingShadow(sctx, b, light) {
  addBoxShadow(sctx, b.x, b.y, b.w, b.h, b.height, light);
  if (b.tier) addBoxShadow(sctx, b.tier.x, b.tier.y, b.tier.w, b.tier.h, totalHeight(b), light);
}

function quad(ctx, ax, ay, bx, by, cx, cy, dx, dy) {
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.lineTo(cx, cy);
  ctx.lineTo(dx, dy);
  ctx.closePath();
  ctx.fill();
}

function windowColour(b, light) {
  if (b.glass) return mixRgb([170, 214, 228], light.sunTint, light.golden * 0.6);
  return mixRgb([92, 128, 156], [255, 196, 140], light.golden * 0.45);
}

/** Rows of windows across the south wall between heights z0 and z1. */
function drawWindowRows(ctx, b, x, y, w, h, z0, z1, lean, light) {
  const floors = Math.round((z1 - z0) / CITY.floorHeight);
  const stride = floors > 18 ? 2 : 1;
  const win = windowColour(b, light);
  const nightLit = light.night > 0.35;
  ctx.lineWidth = CITY.floorHeight * (b.glass ? 0.32 : 0.55) * stride;
  if (b.glass) {
    ctx.strokeStyle = rgbString(win, 0.5);
    ctx.beginPath();
    for (let f = 0; f < floors; f += stride) {
      const z = z0 + (f + 0.5) * CITY.floorHeight;
      ctx.moveTo(x + 1.5 + lean * z, y + h - z);
      ctx.lineTo(x + w - 1.5 + lean * z, y + h - z);
    }
    ctx.stroke();
    ctx.lineWidth = 0.6;
    ctx.strokeStyle = rgbString(shadeRgb(hexToRgb(b.wall), 0.6), 0.55);
    ctx.beginPath();
    for (let m = x + 6; m < x + w - 3; m += 7) {
      ctx.moveTo(m + lean * z0, y + h - z0);
      ctx.lineTo(m + lean * z1, y + h - z1);
    }
    ctx.stroke();
  } else {
    ctx.setLineDash([3.4, 3.2]);
    ctx.strokeStyle = rgbString(win, 0.85);
    ctx.beginPath();
    for (let f = b.kind === 'midtown' || b.kind === 'beachfront' ? 1 : 0; f < floors; f += stride) {
      const z = z0 + (f + 0.55) * CITY.floorHeight;
      ctx.moveTo(x + 3 + lean * z, y + h - z);
      ctx.lineTo(x + w - 3 + lean * z, y + h - z);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (nightLit) {
    ctx.fillStyle = `rgba(255,214,140,${(0.55 * light.night).toFixed(3)})`;
    for (let f = 0; f < floors; f += stride) {
      for (let c = 0; c < w - 6; c += 7) {
        if (hash2(b.seed + f, c) > 0.32) continue;
        const z = z0 + (f + 0.3) * CITY.floorHeight;
        ctx.fillRect(x + 3 + c + lean * z, y + h - z - CITY.floorHeight * 0.5, 3.6, CITY.floorHeight * 0.55);
      }
    }
  }
}

/** One extruded box: side wall (if leaning), south wall with windows, roof with parapet. */
function drawBox(ctx, b, x, y, w, h, z0, z1, lean, light, top) {
  const wall = hexToRgb(b.wall);
  const L0 = lean * z0;
  const L1 = lean * z1;
  if (Math.abs(lean) > 0.002) {
    const sx = lean > 0 ? x : x + w;
    ctx.fillStyle = rgbString(litRgb(wall, faceLight(light, lean > 0 ? -1 : 1, 0) * 0.9, light));
    quad(ctx, sx + L0, y - z0, sx + L0, y + h - z0, sx + L1, y + h - z1, sx + L1, y - z1);
  }
  const southLevel = faceLight(light, 0, 1);
  ctx.fillStyle = rgbString(litRgb(wall, southLevel, light));
  quad(ctx, x + L0, y + h - z0, x + w + L0, y + h - z0, x + w + L1, y + h - z1, x + L1, y + h - z1);
  if (b.glass) {
    const g = ctx.createLinearGradient(0, y + h - z0, 0, y + h - z1);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(1, rgbString(light.sunTint, 0.16 + light.golden * 0.22));
    ctx.fillStyle = g;
    quad(ctx, x + L0, y + h - z0, x + w + L0, y + h - z0, x + w + L1, y + h - z1, x + L1, y + h - z1);
  }
  if (z1 - z0 > CITY.floorHeight * 1.5) drawWindowRows(ctx, b, x, y, w, h, z0, z1, lean, light);
  if (z0 === 0 && (b.kind === 'midtown' || b.kind === 'beachfront') && w > 30) {
    const awning = hash2(b.seed, 7) > 0.5 ? PALETTE.coral : hash2(b.seed, 9) > 0.5 ? PALETTE.mint : PALETTE.lemon;
    ctx.fillStyle = rgbString(litRgb(hexToRgb(awning), 0.95, light));
    ctx.fillRect(x + 5 + lean * 4, y + h - 5.5, w - 10, 3.2);
    ctx.fillStyle = 'rgba(30,34,60,0.35)';
    ctx.fillRect(x + 5, y + h - 2.3, w - 10, 2.3);
  }
  const roofBase = b.glass ? [206, 210, 212] : hexToRgb(b.roof);
  ctx.fillStyle = rgbString(litRgb(roofBase, 1.02, light));
  ctx.fillRect(x + L1, y - z1, w, h);
  ctx.strokeStyle = rgbString(litRgb(roofBase, 0.8, light));
  ctx.lineWidth = 1.6;
  ctx.strokeRect(x + L1 + 1.4, y - z1 + 1.4, w - 2.8, h - 2.8);
  ctx.strokeStyle = rgbString(litRgb(roofBase, 1.15, light), 0.8);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(x + L1, y - z1 + h);
  ctx.lineTo(x + L1 + w, y - z1 + h);
  ctx.stroke();
  if (top) drawRoofProps(ctx, b, x + L1, y - z1, light);
}

function drawRoofProps(ctx, b, rx, ry, light) {
  for (const p of b.props) {
    const x = rx + p.x;
    const y = ry + p.y;
    if (p.type === 'ac') {
      ctx.fillStyle = rgbString(litRgb([150, 152, 156], 0.9, light));
      ctx.fillRect(x, y + 1.5, p.w, p.h);
      ctx.fillStyle = rgbString(litRgb([214, 216, 218], 1, light));
      ctx.fillRect(x, y, p.w, p.h - 1);
      ctx.fillStyle = 'rgba(60,64,80,0.55)';
      ctx.beginPath();
      ctx.arc(x + p.w * 0.35, y + p.h * 0.45, Math.min(p.w, p.h) * 0.28, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.type === 'tank') {
      ctx.fillStyle = rgbString(litRgb([128, 108, 92], 0.9, light));
      ctx.beginPath();
      ctx.arc(x + p.w / 2, y + p.h / 2 + 1.5, p.w / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgbString(litRgb([176, 150, 126], 1, light));
      ctx.beginPath();
      ctx.arc(x + p.w / 2, y + p.h / 2, p.w / 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.type === 'vent') {
      ctx.fillStyle = rgbString(litRgb([120, 124, 130], 1, light));
      ctx.fillRect(x, y, p.w, p.h);
      ctx.strokeStyle = 'rgba(40,44,60,0.5)';
      ctx.lineWidth = 0.8;
      ctx.strokeRect(x + 2, y + 2, p.w - 4, p.h - 4);
    } else if (p.type === 'pool') {
      ctx.fillStyle = '#f7f4ec';
      ctx.fillRect(x - 2, y - 2, p.w + 4, p.h + 4);
      ctx.fillStyle = rgbString(litRgb([70, 205, 210], 1, light));
      ctx.fillRect(x, y, p.w, p.h);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(x + 3, y + p.h * 0.4);
      ctx.quadraticCurveTo(x + p.w / 2, y + p.h * 0.2, x + p.w - 3, y + p.h * 0.45);
      ctx.stroke();
    } else if (p.type === 'garden') {
      ctx.fillStyle = rgbString(litRgb([118, 178, 102], 1, light));
      ctx.fillRect(x, y, p.w, p.h);
      ctx.fillStyle = rgbString(litRgb([82, 140, 80], 1, light));
      for (let k = 0; k < 5; k += 1) ctx.fillRect(x + hash2(b.seed, k) * (p.w - 4), y + hash2(k, b.seed) * (p.h - 4), 4, 4);
    } else if (p.type === 'solar') {
      ctx.fillStyle = rgbString(litRgb([46, 70, 118], 1, light));
      ctx.fillRect(x, y, p.w, p.h);
      ctx.strokeStyle = 'rgba(190,210,240,0.5)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      for (let gx = x + 4; gx < x + p.w; gx += 4) { ctx.moveTo(gx, y); ctx.lineTo(gx, y + p.h); }
      ctx.moveTo(x, y + p.h / 2);
      ctx.lineTo(x + p.w, y + p.h / 2);
      ctx.stroke();
    } else if (p.type === 'helipad') {
      const cx = x + p.w / 2;
      const cy = y + p.h / 2;
      ctx.fillStyle = rgbString(litRgb([84, 90, 104], 1, light));
      ctx.beginPath();
      ctx.arc(cx, cy, p.w / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = b.kind === 'hospital' ? PALETTE.coral : PALETTE.lemon;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(cx, cy, p.w / 2 - 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(cx - 6, cy - 8); ctx.lineTo(cx - 6, cy + 8);
      ctx.moveTo(cx + 6, cy - 8); ctx.lineTo(cx + 6, cy + 8);
      ctx.moveTo(cx - 6, cy); ctx.lineTo(cx + 6, cy);
      ctx.stroke();
    } else if (p.type === 'ribs') {
      ctx.strokeStyle = rgbString(litRgb(hexToRgb(b.roof), 0.85, light));
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let gx = x; gx < x + p.w; gx += 5) { ctx.moveTo(gx, y); ctx.lineTo(gx, y + p.h); }
      ctx.stroke();
    }
  }
  if (b.kind === 'hospital') {
    const cx = rx + 22;
    const cy = ry + b.h - 22;
    ctx.fillStyle = PALETTE.mint;
    ctx.fillRect(cx - 4, cy - 12, 8, 24);
    ctx.fillRect(cx - 12, cy - 4, 24, 8);
  }
}

/** Draw one building as an extruded block (with its setback tier, if any). */
export function drawBuildingExtrusion(ctx, b, frame, alpha) {
  const lean = leanAt(b.x + b.w / 2, frame.rect);
  ctx.globalAlpha = alpha;
  drawBox(ctx, b, b.x, b.y, b.w, b.h, 0, b.height, lean, frame.light, !b.tier);
  if (b.tier) drawBox(ctx, b, b.tier.x, b.tier.y, b.tier.w, b.tier.h, b.height, totalHeight(b), lean, frame.light, true);
  ctx.globalAlpha = 1;
}

export function addStadiumShadow(sctx, s, light) {
  sctx.beginPath();
  sctx.ellipse(s.x + light.shadowX * s.height * 0.6, s.y + light.shadowY * s.height * 0.6, s.rx + Math.abs(light.shadowX) * s.height * 0.5, s.ry + Math.abs(light.shadowY) * s.height * 0.5, 0, 0, Math.PI * 2);
  sctx.fill();
}

/** The Sun Bowl: an extruded oval wall, raked seating in alternating colours, a striped pitch. */
export function drawStadium(ctx, s, frame) {
  const light = frame.light;
  const lean = leanAt(s.x, frame.rect) * s.height;
  const top = s.y - s.height;
  ctx.fillStyle = rgbString(litRgb([236, 228, 214], faceLight(light, 0, 1), light));
  ctx.beginPath();
  ctx.ellipse(s.x, s.y, s.rx, s.ry, 0, 0, Math.PI);
  ctx.lineTo(s.x - s.rx + lean, top);
  ctx.ellipse(s.x + lean, top, s.rx, s.ry, 0, Math.PI, 0, true);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = rgbString(litRgb([255, 122, 104], 0.95, light));
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(s.x + lean * 0.55, s.y - s.height * 0.55, s.rx, s.ry, 0, 0.1, Math.PI - 0.1);
  ctx.stroke();
  const cx = s.x + lean;
  ctx.fillStyle = rgbString(litRgb([244, 238, 226], 1.02, light));
  ctx.beginPath();
  ctx.ellipse(cx, top, s.rx, s.ry, 0, 0, Math.PI * 2);
  ctx.fill();
  const sections = 28;
  for (let k = 0; k < sections; k += 1) {
    const a0 = (k / sections) * Math.PI * 2;
    const a1 = ((k + 1) / sections) * Math.PI * 2;
    ctx.fillStyle = rgbString(litRgb(hexToRgb(k % 2 ? PALETTE.mint : PALETTE.sky), 0.95, light));
    ctx.beginPath();
    ctx.ellipse(cx, top, s.rx * 0.93, s.ry * 0.9, 0, a0, a1);
    ctx.ellipse(cx, top, s.rx * 0.68, s.ry * 0.62, 0, a1, a0, true);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = rgbString(litRgb([118, 186, 96], 1, light));
  ctx.beginPath();
  ctx.ellipse(cx, top, s.rx * 0.64, s.ry * 0.58, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, top, s.rx * 0.64, s.ry * 0.58, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = rgbString(litRgb([134, 200, 110], 1, light));
  for (let k = -6; k < 6; k += 2) ctx.fillRect(cx + k * s.rx * 0.1, top - s.ry, s.rx * 0.1, s.ry * 2);
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(cx - s.rx * 0.45, top - s.ry * 0.36, s.rx * 0.9, s.ry * 0.72);
  ctx.beginPath();
  ctx.moveTo(cx, top - s.ry * 0.36);
  ctx.lineTo(cx, top + s.ry * 0.36);
  ctx.moveTo(cx + s.ry * 0.14, top);
  ctx.arc(cx, top, s.ry * 0.14, 0, Math.PI * 2);
  ctx.stroke();
}
