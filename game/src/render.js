// The top-down 2.5D renderer. Each frame: the sea, sand and promenade; asphalt, sidewalks and lot
// grounds; lane markings, stop lines and crosswalks; one shadow layer for everything (long, warm-
// light shadows in deep blue, cast away from the sun); then every standing thing sorted by y,
// buildings drawn as extruded blocks; effects; and last the time-of-day grade, the light glows
// and a vignette. Only what the camera sees is drawn.
import { CITY, PALETTE, RENDER } from './config.js';
import { viewRect } from './camera.js';
import { computeLighting } from './lighting.js';
import { hexToRgb, litRgb, rgbString } from './color.js';
import { hash2 } from './rng.js';
import { DISTRICTS } from './city.js';
import { currentObjective } from './missions.js';
import { addBuildingShadow, addStadiumShadow, drawBuildingExtrusion, drawStadium, leanAt, totalHeight } from './draw-buildings.js';
import { addCarShadow, addFigureShadow, drawCar, drawPedestrian, drawPlayer } from './draw-actors.js';
import {
  addBoatShadow, addGullShadow, addLampShadow, addTreeShadow, addUmbrellaShadow, drawBoat, drawBullets, drawFountain, drawGull,
  drawLamp, drawMissionMarker, drawPalm, drawParticles, drawRoundTree, drawSignal, drawTowel, drawUmbrella,
} from './draw-props.js';

const GROUND_COLOURS = { plaza: '#e3d5ba', parking: PALETTE.parking, grass: PALETTE.grass };

/** Make a renderer for a canvas that fills the window at devicePixelRatio. */
export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const shadowCanvas = document.createElement('canvas');
  const sctx = shadowCanvas.getContext('2d');
  const view = { w: 1280, h: 720, dpr: 1 };
  const items = [];

  function resize() {
    view.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    view.w = Math.max(320, window.innerWidth);
    view.h = Math.max(240, window.innerHeight);
    canvas.width = Math.round(view.w * view.dpr);
    canvas.height = Math.round(view.h * view.dpr);
    shadowCanvas.width = canvas.width;
    shadowCanvas.height = canvas.height;
  }
  resize();

  function draw(world) {
    const rect = viewRect(world.camera, view);
    const light = computeLighting(world.clock);
    const frame = {
      view, rect, light, time: world.time, glows: [],
      x0: rect.x0 - RENDER.cullMargin, y0: rect.y0 - RENDER.cullMargin, x1: rect.x1 + RENDER.cullMargin, y1: rect.y1 + RENDER.extrusionMargin,
    };
    const s = rect.scale * view.dpr;
    const toWorld = (c) => c.setTransform(s, 0, 0, s, view.dpr * view.w / 2 - rect.cx * s, view.dpr * view.h / 2 - rect.cy * s);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PALETTE.scrub;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    toWorld(ctx);
    drawSeaAndShore(ctx, world, frame);
    drawGroundLayer(ctx, world, frame);
    drawRoadMarkings(ctx, world.city, frame);
    drawGroundDetails(ctx, world, frame);
    drawShadowLayer(sctx, shadowCanvas, toWorld, world, frame);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = light.shadowAlpha;
    ctx.drawImage(shadowCanvas, 0, 0);
    ctx.globalAlpha = 1;
    toWorld(ctx);
    drawWaterCraft(ctx, world, frame);
    drawEntitiesSorted(ctx, world, frame, items);
    drawParticles(ctx, world, frame);
    drawBullets(ctx, world);
    if (world.mode === 'play') {
      const obj = currentObjective(world);
      drawMissionMarker(ctx, obj.target, obj.kind, frame);
    }
    for (const g of world.gulls) if (inView(frame, g.x, g.y - g.z, 20)) drawGull(ctx, g);
    drawColourGrade(ctx, canvas, toWorld, frame);
    return frame;
  }

  return { canvas, ctx, view, resize, draw };
}

function inView(frame, x, y, pad) {
  return x > frame.x0 - pad && x < frame.x1 + pad && y > frame.y0 - pad && y < frame.y1 + pad;
}

function boxInView(frame, x0, y0, x1, y1) {
  return x1 > frame.x0 && x0 < frame.x1 && y1 > frame.y0 && y0 < frame.y1;
}

/** Shoreline x offset at a height y: a gentle animated lap of the waves. */
function shoreWave(y, t) {
  return Math.sin(y * 0.031 + t * 1.1) * 4 + Math.sin(y * 0.013 - t * 0.6) * 3;
}

/** The sea (teal shallows to deep water, glinting swell), wet sand and foam, the sand, the promenade. */
function drawSeaAndShore(ctx, world, frame) {
  const city = world.city;
  const { x0, y0, x1, y1 } = frame;
  const t = frame.time;
  const light = frame.light;
  if (x0 < city.promX1) {
    const sea = ctx.createLinearGradient(city.shoreX, 0, city.shoreX - 900, 0);
    sea.addColorStop(0, rgbString(litRgb(hexToRgb(PALETTE.seaShallow), 1, light)));
    sea.addColorStop(0.35, rgbString(litRgb([36, 160, 170], 1, light)));
    sea.addColorStop(1, rgbString(litRgb(hexToRgb(PALETTE.seaDeep), 1, light)));
    ctx.fillStyle = sea;
    ctx.fillRect(x0, y0, city.shoreX + 30 - x0, y1 - y0);
    ctx.strokeStyle = rgbString(light.golden > 0.3 ? [255, 214, 160] : [230, 255, 250], 0.32);
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    const step = 22;
    for (let gy = Math.floor(y0 / step) * step; gy < y1; gy += step) {
      for (let gx = Math.floor(x0 / 64) * 64; gx < city.shoreX - 20; gx += 64) {
        const h = hash2(gx, gy, 3);
        const x = gx + ((h * 64 + t * (6 + h * 6)) % 64);
        const len = 6 + h * 10;
        ctx.moveTo(x, gy + h * 8);
        ctx.quadraticCurveTo(x + len / 2, gy + h * 8 - 2, x + len, gy + h * 8);
      }
    }
    ctx.stroke();
    if (light.golden > 0.2) {
      const glint = ctx.createRadialGradient(frame.rect.cx - 600, frame.rect.cy, 10, frame.rect.cx - 600, frame.rect.cy, 700);
      glint.addColorStop(0, `rgba(255,190,120,${(0.35 * light.golden).toFixed(3)})`);
      glint.addColorStop(1, 'rgba(255,190,120,0)');
      ctx.fillStyle = glint;
      ctx.fillRect(x0, y0, city.shoreX - x0, y1 - y0);
    }
  }
  ctx.fillStyle = rgbString(litRgb(hexToRgb(PALETTE.sand), 1, light));
  ctx.fillRect(city.shoreX, y0, city.promX0 - city.shoreX, y1 - y0);
  if (x0 < city.promX0 && x1 > city.shoreX) {
    ctx.fillStyle = rgbString(litRgb([214, 186, 132], 1, light), 0.55);
    for (let gy = Math.floor(y0 / 16) * 16; gy < y1; gy += 16) {
      for (let gx = Math.floor(city.shoreX / 16) * 16; gx < city.promX0; gx += 16) {
        const h = hash2(gx, gy, 11);
        if (h < 0.5) ctx.fillRect(gx + h * 16, gy + hash2(gy, gx, 5) * 16, 1.6, 1.6);
      }
    }
    const m = city.marina;
    ctx.beginPath();
    ctx.moveTo(city.shoreX + 14, y0);
    for (let y = Math.floor(y0 / 8) * 8; y <= y1; y += 8) ctx.lineTo(city.shoreX + 14 + shoreWave(y, t) * 0.6, y);
    ctx.lineTo(city.shoreX - 30, y1);
    ctx.lineTo(city.shoreX - 30, y0);
    ctx.closePath();
    ctx.fillStyle = rgbString(litRgb(hexToRgb(PALETTE.sandWet), 1, light));
    ctx.fill();
    ctx.beginPath();
    for (let y = Math.floor(y0 / 8) * 8; y <= y1; y += 8) {
      const x = city.shoreX + shoreWave(y, t);
      if (y === Math.floor(y0 / 8) * 8) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = PALETTE.foam;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.lineTo(city.shoreX - 60, y1);
    ctx.lineTo(city.shoreX - 60, y0);
    ctx.closePath();
    ctx.fillStyle = rgbString(litRgb(hexToRgb(PALETTE.seaShallow), 1.05, light));
    ctx.fill();
    ctx.strokeStyle = 'rgba(240,255,250,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let y = Math.floor(y0 / 8) * 8; y <= y1; y += 8) {
      const x = city.shoreX - 12 + shoreWave(y + 40, t * 1.3) * 1.4 - ((t * 6) % 10);
      if (y === Math.floor(y0 / 8) * 8) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    if (boxInView(frame, m.quayX0 - 10, m.y0, m.quayX1, m.y1)) {
      ctx.fillStyle = rgbString(litRgb([150, 186, 190], 1, light));
      ctx.fillRect(m.quayX0 - 260, m.y0, 290, m.y1 - m.y0);
      ctx.fillStyle = rgbString(litRgb([40, 158, 168], 1, light));
      ctx.fillRect(m.quayX0 - 252, m.y0 + 8, 252, m.y1 - m.y0 - 16);
      ctx.fillStyle = rgbString(litRgb([226, 214, 192], 1, light));
      ctx.fillRect(m.quayX0, m.y0, m.quayX1 - m.quayX0, m.y1 - m.y0);
      ctx.strokeStyle = rgbString(litRgb([196, 182, 158], 1, light));
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let y = m.y0; y < m.y1; y += 18) { ctx.moveTo(m.quayX0, y); ctx.lineTo(m.quayX1, y); }
      ctx.stroke();
      ctx.fillStyle = rgbString(litRgb([168, 160, 146], 1, light));
      ctx.fillRect(m.quayX0 - 4, m.y0, 5, m.y1 - m.y0);
      ctx.fillStyle = rgbString(litRgb([150, 146, 140], 1, light));
      for (let y = m.y0 - 30; y < m.y1 + 30; y += 9) {
        if (Math.abs(y - (m.y0 + m.y1) / 2) < 40) continue;
        const h = hash2(y, 5, 9);
        ctx.beginPath();
        ctx.arc(m.breakwaterX + h * 8 - 4, y, 6 + h * 3, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const p of m.piers) {
        ctx.fillStyle = rgbString(litRgb(hexToRgb(PALETTE.wood), 1, light));
        ctx.fillRect(p.x0, p.y - p.w / 2, p.x1 - p.x0, p.w);
        ctx.strokeStyle = rgbString(litRgb([140, 104, 70], 1, light));
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        for (let x = p.x0 + 4; x < p.x1; x += 4) { ctx.moveTo(x, p.y - p.w / 2); ctx.lineTo(x, p.y + p.w / 2); }
        ctx.stroke();
      }
    }
  }
  ctx.fillStyle = rgbString(litRgb([233, 220, 196], 1, light));
  ctx.fillRect(city.promX0, y0, city.promX1 - city.promX0, y1 - y0);
  if (x0 < city.promX1 && x1 > city.promX0) {
    ctx.strokeStyle = rgbString(litRgb([214, 198, 170], 1, light));
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let y = Math.floor(y0 / 20) * 20; y < y1; y += 20) { ctx.moveTo(city.promX0, y); ctx.lineTo(city.promX1, y); }
    ctx.stroke();
    ctx.fillStyle = rgbString(litRgb(hexToRgb(PALETTE.mint), 0.95, light));
    ctx.fillRect(city.promX0 + 20, y0, 2, y1 - y0);
    ctx.fillStyle = rgbString(litRgb(hexToRgb(PALETTE.coral), 0.95, light));
    ctx.fillRect(city.promX1 - 4, y0, 4, y1 - y0);
  }
}

/** Asphalt under the grid, sidewalks and curbs around each block, lot grounds, the park. */
function drawGroundLayer(ctx, world, frame) {
  const city = world.city;
  const light = frame.light;
  ctx.fillStyle = rgbString(litRgb(hexToRgb(PALETTE.asphalt), 1, light));
  ctx.fillRect(Math.max(frame.x0, city.gridX0), Math.max(frame.y0, city.gridY0), Math.min(frame.x1, city.gridX1) - Math.max(frame.x0, city.gridX0), Math.min(frame.y1, city.gridY1) - Math.max(frame.y0, city.gridY0));
  const sw = CITY.sidewalk;
  const walk = rgbString(litRgb(hexToRgb(PALETTE.sidewalk), 1, light));
  const curb = rgbString(litRgb(hexToRgb(PALETTE.curb), 1, light));
  const joints = rgbString(litRgb([214, 200, 176], 1, light));
  for (const b of city.blocks) {
    if (!boxInView(frame, b.x0, b.y0, b.x1, b.y1)) continue;
    ctx.fillStyle = walk;
    ctx.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
    ctx.strokeStyle = joints;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    for (let x = b.x0 + 14; x < b.x1; x += 14) {
      ctx.moveTo(x, b.y0); ctx.lineTo(x, b.y0 + sw);
      ctx.moveTo(x, b.y1 - sw); ctx.lineTo(x, b.y1);
    }
    for (let y = b.y0 + 14; y < b.y1; y += 14) {
      ctx.moveTo(b.x0, y); ctx.lineTo(b.x0 + sw, y);
      ctx.moveTo(b.x1 - sw, y); ctx.lineTo(b.x1, y);
    }
    ctx.stroke();
    ctx.strokeStyle = curb;
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x0 + 1, b.y0 + 1, b.x1 - b.x0 - 2, b.y1 - b.y0 - 2);
    ctx.fillStyle = rgbString(litRgb(hexToRgb(DISTRICTS[b.district].ground), 1, light));
    ctx.fillRect(b.x0 + sw, b.y0 + sw, b.x1 - b.x0 - sw * 2, b.y1 - b.y0 - sw * 2);
  }
  for (const g of city.grounds) {
    if (!boxInView(frame, g.x0, g.y0, g.x1, g.y1)) continue;
    ctx.fillStyle = rgbString(litRgb(hexToRgb(GROUND_COLOURS[g.kind]), 1, light));
    ctx.fillRect(g.x0, g.y0, g.x1 - g.x0, g.y1 - g.y0);
    if (g.kind === 'parking') {
      ctx.strokeStyle = 'rgba(240,236,224,0.75)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = g.x0 + 3; x < g.x1 - 6; x += 26) {
        ctx.moveTo(x, g.y0 + 6); ctx.lineTo(x, g.y0 + 52);
        ctx.moveTo(x, g.y1 - 52); ctx.lineTo(x, g.y1 - 6);
      }
      ctx.stroke();
    } else if (g.kind === 'plaza') {
      ctx.strokeStyle = rgbString(litRgb([206, 192, 166], 1, light));
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      for (let x = g.x0 + 12; x < g.x1; x += 12) { ctx.moveTo(x, g.y0); ctx.lineTo(x, g.y1); }
      for (let y = g.y0 + 12; y < g.y1; y += 12) { ctx.moveTo(g.x0, y); ctx.lineTo(g.x1, y); }
      ctx.stroke();
    }
  }
  const park = city.park;
  if (park && boxInView(frame, park.x0, park.y0, park.x1, park.y1)) drawPark(ctx, park, light);
}

function drawPark(ctx, park, light) {
  ctx.fillStyle = rgbString(litRgb(hexToRgb(PALETTE.grass), 1, light));
  ctx.fillRect(park.x0, park.y0, park.x1 - park.x0, park.y1 - park.y0);
  ctx.save();
  ctx.beginPath();
  ctx.rect(park.x0, park.y0, park.x1 - park.x0, park.y1 - park.y0);
  ctx.clip();
  ctx.fillStyle = rgbString(litRgb(hexToRgb(PALETTE.grassDark), 1, light), 0.35);
  for (let k = -20; k < 40; k += 2) {
    ctx.beginPath();
    ctx.moveTo(park.x0 + k * 14, park.y0);
    ctx.lineTo(park.x0 + k * 14 + 14, park.y0);
    ctx.lineTo(park.x0 + k * 14 + 14 - 300, park.y1 + 10);
    ctx.lineTo(park.x0 + k * 14 - 300, park.y1 + 10);
    ctx.fill();
  }
  ctx.strokeStyle = rgbString(litRgb([228, 208, 168], 1, light));
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(park.x0, park.y0);
  ctx.lineTo(park.x1, park.y1);
  ctx.moveTo(park.x1, park.y0);
  ctx.quadraticCurveTo(park.pond.x - park.pond.rx - 30, park.pond.y + park.pond.ry + 40, park.x0, park.y1);
  ctx.stroke();
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.ellipse(park.pond.x, park.pond.y, park.pond.rx + 14, park.pond.ry + 12, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.restore();
  ctx.fillStyle = rgbString(litRgb([206, 196, 170], 1, light));
  ctx.beginPath();
  ctx.ellipse(park.pond.x, park.pond.y, park.pond.rx + 3, park.pond.ry + 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rgbString(litRgb(hexToRgb(PALETTE.water), 1, light));
  ctx.beginPath();
  ctx.ellipse(park.pond.x, park.pond.y, park.pond.rx, park.pond.ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rgbString(litRgb([120, 190, 110], 1, light));
  for (let k = 0; k < 6; k += 1) {
    ctx.beginPath();
    ctx.arc(park.pond.x + Math.cos(k * 1.7) * park.pond.rx * 0.6, park.pond.y + Math.sin(k * 2.3) * park.pond.ry * 0.5, 2.6, 0.4, Math.PI * 2);
    ctx.lineTo(park.pond.x + Math.cos(k * 1.7) * park.pond.rx * 0.6, park.pond.y + Math.sin(k * 2.3) * park.pond.ry * 0.5);
    ctx.fill();
  }
}

/** Centre lines, lane dividers, parking edges and stop lines on every road segment in view. */
function drawRoadMarkings(ctx, city, frame) {
  const sw = CITY.sidewalk;
  const LW = CITY.laneWidth;
  const white = rgbString(litRgb(hexToRgb(PALETTE.laneWhite), 1, frame.light), 0.85);
  const yellow = rgbString(litRgb(hexToRgb(PALETTE.laneYellow), 1, frame.light), 0.9);
  const segs = [];
  city.vroads.forEach((road, i) => {
    if (road.x + road.half < frame.x0 || road.x - road.half > frame.x1) return;
    for (let j = 0; j < city.hroads.length - 1; j += 1) {
      const a = city.hroads[j].y + city.hroads[j].half;
      const b = city.hroads[j + 1].y - city.hroads[j + 1].half;
      if (b < frame.y0 || a > frame.y1) continue;
      segs.push({ v: true, road, a, b, i });
    }
  });
  city.hroads.forEach((road) => {
    if (road.y + road.half < frame.y0 || road.y - road.half > frame.y1) return;
    for (let i = 0; i < city.vroads.length - 1; i += 1) {
      const a = city.vroads[i].x + city.vroads[i].half;
      const b = city.vroads[i + 1].x - city.vroads[i + 1].half;
      if (b < frame.x0 || a > frame.x1) continue;
      segs.push({ v: false, road, a, b });
    }
  });
  const line = (v, c, a, b) => {
    if (v) { ctx.moveTo(c, a); ctx.lineTo(c, b); } else { ctx.moveTo(a, c); ctx.lineTo(b, c); }
  };
  const centre = (s) => (s.v ? s.road.x : s.road.y);
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = yellow;
  ctx.beginPath();
  for (const s of segs) {
    const off = s.road.median > 0 ? s.road.median / 2 - 1 : 1.6;
    line(s.v, centre(s) - off, s.a, s.b);
    line(s.v, centre(s) + off, s.a, s.b);
  }
  ctx.stroke();
  ctx.strokeStyle = white;
  ctx.setLineDash([12, 12]);
  ctx.beginPath();
  for (const s of segs) {
    for (let k = 1; k < s.road.lanes; k += 1) {
      const off = s.road.median / 2 + k * LW;
      line(s.v, centre(s) - off, s.a + sw, s.b - sw);
      line(s.v, centre(s) + off, s.a + sw, s.b - sw);
    }
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const s of segs) {
    if (!s.road.parking) continue;
    const off = s.road.half - CITY.parkingLane;
    line(s.v, centre(s) - off, s.a + sw, s.b - sw);
    line(s.v, centre(s) + off, s.a + sw, s.b - sw);
  }
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (const s of segs) {
    const inner = s.road.median / 2 + 1;
    const outer = s.road.median / 2 + s.road.lanes * LW;
    const c = centre(s);
    if (s.v) {
      ctx.moveTo(c - outer, s.b - sw - 3); ctx.lineTo(c - inner, s.b - sw - 3);
      ctx.moveTo(c + inner, s.a + sw + 3); ctx.lineTo(c + outer, s.a + sw + 3);
    } else {
      ctx.moveTo(s.b - sw - 3, c + inner); ctx.lineTo(s.b - sw - 3, c + outer);
      ctx.moveTo(s.a + sw + 3, c - outer); ctx.lineTo(s.a + sw + 3, c - inner);
    }
  }
  ctx.stroke();
  ctx.fillStyle = white;
  for (const cw of city.crosswalks) {
    if (!boxInView(frame, cw.x0, cw.y0, cw.x1, cw.y1)) continue;
    if (cw.axis === 'v') for (let x = cw.x0 + 3; x < cw.x1 - 3; x += 8) ctx.fillRect(x, cw.y0 + 2, 4.5, cw.y1 - cw.y0 - 4);
    else for (let y = cw.y0 + 3; y < cw.y1 - 3; y += 8) ctx.fillRect(cw.x0 + 2, y, cw.x1 - cw.x0 - 4, 4.5);
  }
}

/** Rubber laid down by sliding tyres, fading over half a minute (drawn in a few alpha bands). */
function drawSkidMarks(ctx, world, frame) {
  if (world.skids.length === 0) return;
  ctx.lineCap = 'round';
  ctx.lineWidth = 3.4;
  for (const band of [0, 1, 2, 3]) {
    ctx.beginPath();
    let any = false;
    for (const m of world.skids) {
      const age = world.time - m.t;
      if (Math.min(3, Math.floor(age / 8)) !== band) continue;
      if (!inView(frame, m.x1, m.y1, 10)) continue;
      ctx.moveTo(m.x0, m.y0);
      ctx.lineTo(m.x1, m.y1);
      any = true;
    }
    if (!any) continue;
    ctx.strokeStyle = `rgba(28,26,30,${(0.42 * (1 - band * 0.24)).toFixed(3)})`;
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
}

/** Things lying on the ground: towels, fountains, scorch marks, skid marks. */
function drawGroundDetails(ctx, world, frame) {
  const city = world.city;
  drawSkidMarks(ctx, world, frame);
  for (const p of city.beachProps) if (p.kind === 'towel' && inView(frame, p.x, p.y, 20)) drawTowel(ctx, p, frame);
  for (const f of city.fountains) if (inView(frame, f.x, f.y, 30)) drawFountain(ctx, f, frame);
  for (const d of world.decals) {
    if (!inView(frame, d.x, d.y, 40)) continue;
    const g = ctx.createRadialGradient(d.x, d.y, 2, d.x, d.y, d.r);
    g.addColorStop(0, 'rgba(20,18,22,0.7)');
    g.addColorStop(1, 'rgba(20,18,22,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(d.x, d.y, d.r, d.r * 0.8, d.angle, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Every shadow into one opaque layer, composited once so overlaps never double-darken. */
function drawShadowLayer(sctx, shadowCanvas, toWorld, world, frame) {
  const city = world.city;
  const light = frame.light;
  sctx.setTransform(1, 0, 0, 1, 0, 0);
  sctx.clearRect(0, 0, shadowCanvas.width, shadowCanvas.height);
  toWorld(sctx);
  const colour = light.golden > 0.4 ? '#2b2a78' : PALETTE.shadow;
  sctx.fillStyle = colour;
  sctx.strokeStyle = colour;
  const reach = 3.2 * 160;
  const sx0 = frame.x0 - Math.max(0, light.shadowX) * reach;
  const sx1 = frame.x1 - Math.min(0, light.shadowX) * reach;
  const sy0 = frame.y0 - Math.max(0, light.shadowY) * reach;
  const sy1 = frame.y1 - Math.min(0, light.shadowY) * reach;
  for (const b of city.buildings) {
    if (b.x + b.w > sx0 && b.x < sx1 && b.y + b.h > sy0 && b.y < sy1) addBuildingShadow(sctx, b, light);
  }
  if (city.stadium && inView(frame, city.stadium.x, city.stadium.y, 300)) addStadiumShadow(sctx, city.stadium, light);
  for (const t of city.trees) if (inView(frame, t.x, t.y, 160)) addTreeShadow(sctx, t, light);
  for (const l of city.lamps) if (inView(frame, l.x, l.y, 90)) addLampShadow(sctx, l, light);
  for (const u of city.beachProps) if (u.kind === 'umbrella' && inView(frame, u.x, u.y, 60)) addUmbrellaShadow(sctx, u, light);
  for (const list of [world.cars, world.parked]) for (const c of list) if (c.active && inView(frame, c.x, c.y, 50)) addCarShadow(sctx, c, light);
  for (const p of world.peds) if (p.active && inView(frame, p.x, p.y, 30)) addFigureShadow(sctx, p.x, p.y, p.state === 'down' ? 2 : 13, light);
  if (world.player.active && !world.player.car) addFigureShadow(sctx, world.player.x, world.player.y, world.player.alive ? 14 : 2, light);
  for (const b of city.marina.boats) if (inView(frame, b.x, b.y, 40)) addBoatShadow(sctx, b, light);
  for (const b of world.boats) if (inView(frame, b.x, b.y, 60)) addBoatShadow(sctx, b, light);
  for (const g of world.gulls) addGullShadow(sctx, g, light);
}

function drawWaterCraft(ctx, world, frame) {
  for (const b of world.city.marina.boats) if (inView(frame, b.x, b.y, 40)) drawBoat(ctx, b, frame, false);
  for (const b of world.boats) if (inView(frame, b.x, b.y, 60)) drawBoat(ctx, b, frame, true);
}

/** True when the player stands in the screen area a building's extrusion covers (so draw it see-through). */
function hidesPlayer(b, p, frame) {
  if (!p.active || p.y > b.y + 2) return false;
  const H = totalHeight(b);
  if (p.y < b.y - H - 14) return false;
  const lean = leanAt(b.x + b.w / 2, frame.rect) * H;
  return p.x > b.x + Math.min(0, lean) - 8 && p.x < b.x + b.w + Math.max(0, lean) + 8;
}

/** Collect everything that stands up, sort by its base y, draw back to front. */
function drawEntitiesSorted(ctx, world, frame, items) {
  const city = world.city;
  items.length = 0;
  const add = (y, kind, obj) => items.push({ y, kind, obj });
  for (const b of city.buildings) if (boxInView(frame, b.x - 40, b.y, b.x + b.w + 40, b.y + b.h)) add(b.y + b.h, 'building', b);
  for (const t of city.trees) if (inView(frame, t.x, t.y, 30)) add(t.y, 'tree', t);
  for (const l of city.lamps) if (inView(frame, l.x, l.y, 20)) add(l.y, 'lamp', l);
  for (const u of city.beachProps) if (u.kind === 'umbrella' && inView(frame, u.x, u.y, 20)) add(u.y, 'umbrella', u);
  for (const n of city.nodes) {
    if (!inView(frame, n.x, n.y, 80)) continue;
    const v = city.vroads[n.i];
    const h = city.hroads[n.j];
    if (n.i < CITY.cols && n.j < CITY.rows) add(n.y + h.half + 5, 'signal', { x: n.x + v.half + 5, y: n.y + h.half + 5, i: n.i, j: n.j, axis: 'ns' });
    if (n.i > 0 && n.j > 0) add(n.y - h.half - 5, 'signal', { x: n.x - v.half - 5, y: n.y - h.half - 5, i: n.i, j: n.j, axis: 'ew' });
  }
  if (city.stadium && inView(frame, city.stadium.x, city.stadium.y, 260)) add(city.stadium.y + city.stadium.ry, 'stadium', city.stadium);
  for (const list of [world.cars, world.parked]) for (const c of list) if (c.active && inView(frame, c.x, c.y, 40)) add(c.y + 4, 'car', c);
  for (const p of world.peds) if (p.active && inView(frame, p.x, p.y, 20)) add(p.y, 'ped', p);
  if (world.player.active && !world.player.car) add(world.player.y + 0.5, 'player', world.player);
  items.sort((a, b) => a.y - b.y);
  const p = world.player;
  for (const it of items) {
    const o = it.obj;
    if (it.kind === 'building') drawBuildingExtrusion(ctx, o, frame, hidesPlayer(o, p, frame) ? 0.42 : 1);
    else if (it.kind === 'tree') (o.kind === 'palm' ? drawPalm : drawRoundTree)(ctx, o, frame);
    else if (it.kind === 'lamp') drawLamp(ctx, o, frame);
    else if (it.kind === 'umbrella') drawUmbrella(ctx, o, frame);
    else if (it.kind === 'signal') drawSignal(ctx, o, city, frame);
    else if (it.kind === 'stadium') drawStadium(ctx, o, frame);
    else if (it.kind === 'car') drawCar(ctx, o, frame, o === p.car ? p : null);
    else if (it.kind === 'ped') drawPedestrian(ctx, o, frame);
    else drawPlayer(ctx, o, frame);
  }
}

/** Time-of-day grade (warm soft light, golden haze, night), additive glows, then the vignette. */
function drawColourGrade(ctx, canvas, toWorld, frame) {
  const light = frame.light;
  const W = canvas.width;
  const H = canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'soft-light';
  ctx.fillStyle = `rgba(255,${Math.round(160 - light.golden * 40)},${Math.round(90 - light.golden * 40)},${(0.16 + light.golden * 0.4).toFixed(3)})`;
  ctx.fillRect(0, 0, W, H);
  if (light.golden > 0.05) {
    ctx.globalCompositeOperation = 'screen';
    const haze = ctx.createLinearGradient(0, 0, 0, H * 0.7);
    haze.addColorStop(0, `rgba(255,160,96,${(0.26 * light.golden).toFixed(3)})`);
    haze.addColorStop(1, 'rgba(255,160,96,0)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, W, H);
  }
  if (light.night > 0.01) {
    ctx.globalCompositeOperation = 'multiply';
    const n = light.night;
    ctx.fillStyle = rgbString([255 - 190 * n, 255 - 170 * n, 255 - 90 * n]);
    ctx.fillRect(0, 0, W, H);
  }
  ctx.globalCompositeOperation = 'lighter';
  toWorld(ctx);
  for (const g of frame.glows) {
    if (!inView(frame, g.x, g.y, g.r)) continue;
    const grad = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, g.r);
    grad.addColorStop(0, rgbString(g.color, Math.min(1, g.a)));
    grad.addColorStop(1, rgbString(g.color, 0));
    ctx.fillStyle = grad;
    ctx.fillRect(g.x - g.r, g.y - g.r, g.r * 2, g.r * 2);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  const vignette = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.58);
  vignette.addColorStop(0, 'rgba(24,26,72,0)');
  vignette.addColorStop(1, `rgba(24,26,72,${(0.38 + light.golden * 0.1).toFixed(3)})`);
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);
}
