// Procedural generation of Velocity City from one seed: a grid of avenues and streets, city blocks
// subdivided into lots, buildings with footprints, heights and roof detail, sidewalks, crosswalks,
// traffic signals, street lamps, palms, parked cars, the Saltline waterfront (sand, promenade, sea),
// Juniper Park, the Sun Bowl stadium, Bluewater Marina and the Glasshill tower cluster. It also
// answers the spatial questions the simulation asks: lanes, stop lines, solids, districts.
import { CAR_MODELS, CITY, PALETTE, SIGNAL } from './config.js';
import { createRng, deriveSeed } from './rng.js';

export const DIR_E = 0;
export const DIR_S = 1;
export const DIR_W = 2;
export const DIR_N = 3;
export const DIR_X = [1, 0, -1, 0];
export const DIR_Y = [0, 1, 0, -1];
export const DIR_ANGLE = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

export const DISTRICTS = {
  beach: { name: 'Saltline Beach', style: 'beachfront', ground: '#eadbb8' },
  marina: { name: 'Bluewater Marina', style: 'beachfront', ground: '#eadbb8' },
  downtown: { name: 'Glasshill', style: 'downtown', ground: '#dacdb4' },
  midtown: { name: 'Mercado', style: 'midtown', ground: '#ddd0b6' },
  north: { name: 'Palmetto Heights', style: 'residential', ground: '#b7d18e' },
  south: { name: 'Coral Flats', style: 'residential', ground: '#bcd492' },
  east: { name: 'Ironside', style: 'industrial', ground: '#c4bca8' },
  park: { name: 'Juniper Park', style: 'park', ground: '#9fcd7c' },
};

const LOT_WIDTH = {
  downtown: [118, 190],
  midtown: [70, 128],
  residential: [48, 80],
  beachfront: [92, 150],
  industrial: [110, 176],
};
const SETBACK = { downtown: 6, midtown: 3, residential: 8, beachfront: 8, industrial: 5 };
const PALM_CHANCE = { downtown: 0.45, midtown: 0.45, residential: 0.6, beachfront: 0.9, industrial: 0.15, park: 0.7 };

function makeRoad(avenue, parking) {
  const lanes = avenue ? 2 : 1;
  const median = avenue ? CITY.median : 0;
  const half = median / 2 + lanes * CITY.laneWidth + (parking ? CITY.parkingLane : 0);
  return { lanes, median, parking, avenue, half, x: 0, y: 0 };
}

/** Lay out a row of parallel roads with random block spans between their edges. */
function layoutRoads(rng, count, avenues, span, axis) {
  const roads = [];
  for (let k = 0; k < count; k += 1) {
    const avenue = avenues.includes(k);
    roads.push(makeRoad(avenue, !avenue));
  }
  let pos = 0;
  for (let k = 0; k < count; k += 1) {
    if (k > 0) pos += roads[k - 1].half + rng.range(span[0], span[1]) + roads[k].half;
    roads[k][axis] = Math.round(pos);
  }
  return roads;
}

function classifyBlock(i, j) {
  if (i === CITY.park.i && j === CITY.park.j) return 'park';
  if (i === 0) return j >= CITY.marinaRows[0] ? 'marina' : 'beach';
  const d = Math.hypot(i - CITY.downtown.i, (j - CITY.downtown.j) * 1.15);
  if (d < 1.7) return 'downtown';
  if (i >= CITY.cols - 3) return 'east';
  if (d < 3) return 'midtown';
  if (j <= 2) return 'north';
  if (j >= CITY.rows - 3) return 'south';
  return 'midtown';
}

function floorsFor(style, rng, block) {
  if (style === 'downtown') {
    const d = Math.hypot(block.i - CITY.downtown.i, block.j - CITY.downtown.j);
    return Math.round(rng.range(16, 30) + (1.7 - d) * rng.range(6, 12));
  }
  if (style === 'midtown') return rng.int(5, 13);
  if (style === 'residential') return rng.int(2, 4);
  if (style === 'beachfront') return rng.int(6, 15);
  return rng.int(2, 4);
}

function wallsFor(style) {
  if (style === 'downtown') return PALETTE.wallsDowntown;
  if (style === 'midtown') return PALETTE.wallsMidtown;
  if (style === 'residential') return PALETTE.wallsResidential;
  if (style === 'beachfront') return PALETTE.wallsBeach;
  return PALETTE.wallsIndustrial;
}

/** Roof clutter: AC units, water tanks, vents, pools, gardens, solar panels and helipads. */
function generateRoofProps(b, rng) {
  const props = [];
  const w = b.tier ? b.tier.w : b.w;
  const h = b.tier ? b.tier.h : b.h;
  const add = (type, pw, ph) => {
    if (pw > w - 6 || ph > h - 6) return;
    props.push({ type, x: rng.range(3, w - pw - 3), y: rng.range(3, h - ph - 3), w: pw, h: ph });
  };
  if (b.style === 'downtown') {
    if (w > 60 && h > 60 && rng.chance(0.45)) props.push({ type: 'helipad', x: w / 2 - 22, y: h / 2 - 22, w: 44, h: 44 });
    else for (let k = rng.int(2, 4); k > 0; k -= 1) add('ac', rng.range(8, 16), rng.range(6, 12));
    if (rng.chance(0.5)) add('vent', 10, 10);
  } else if (b.style === 'beachfront') {
    add('pool', Math.min(w * 0.5, 46), Math.min(h * 0.4, 24));
    add('ac', 10, 8);
  } else if (b.style === 'residential') {
    if (rng.chance(0.4)) add('garden', rng.range(16, 26), rng.range(12, 20));
    else if (rng.chance(0.5)) add('solar', rng.range(16, 24), rng.range(10, 16));
    if (rng.chance(0.4)) add('tank', 8, 8);
  } else if (b.style === 'industrial') {
    props.push({ type: 'ribs', x: 4, y: 4, w: w - 8, h: h - 8 });
    add('vent', 9, 9);
  } else {
    for (let k = rng.int(1, 3); k > 0; k -= 1) add('ac', rng.range(7, 13), rng.range(6, 10));
    if (rng.chance(0.4)) add('tank', 10, 10);
    if (rng.chance(0.25)) add('garden', 20, 14);
  }
  return props;
}

function makeBuilding(x, y, w, h, style, rng, block) {
  const floors = Math.max(1, floorsFor(style, rng, block));
  const b = {
    x, y, w, h, style, floors,
    height: floors * CITY.floorHeight,
    wall: rng.pick(wallsFor(style)),
    roof: style === 'residential' && rng.chance(0.35) ? PALETTE.roofTerracotta : PALETTE.roofLight,
    glass: style === 'downtown',
    tier: null,
    props: [],
    seed: Math.floor(rng.next() * 1e9),
    kind: style,
  };
  if (style === 'downtown' && rng.chance(0.55) && w > 60 && h > 60) {
    const ix = w * rng.range(0.14, 0.24);
    const iy = h * rng.range(0.14, 0.24);
    const extra = rng.int(5, 14);
    b.tier = { x: x + ix, y: y + iy, w: w - ix * 2, h: h - iy * 2, floors: extra, height: extra * CITY.floorHeight };
  }
  b.props = generateRoofProps(b, rng);
  return b;
}

/** Split a block's inner rectangle into building lots: one or two rows, then strips along x. */
function subdivideBlock(block, rng) {
  const s = CITY.sidewalk;
  const ix0 = block.x0 + s;
  const iy0 = block.y0 + s;
  const ix1 = block.x1 - s;
  const iy1 = block.y1 - s;
  const lots = [];
  const twoRows = iy1 - iy0 > 150;
  const split = twoRows ? Math.round(iy0 + (iy1 - iy0) * rng.range(0.44, 0.56)) : iy1;
  const [minW, maxW] = LOT_WIDTH[block.style];
  for (let r = 0; r < (twoRows ? 2 : 1); r += 1) {
    const y0 = r === 0 ? iy0 : split;
    const y1 = r === 0 ? split : iy1;
    let x = ix0;
    while (x < ix1 - 1) {
      let w = rng.range(minW, maxW);
      if (ix1 - (x + w) < minW * 0.6) w = ix1 - x;
      lots.push({ x0: x, y0, x1: x + w, y1, front: r === 0 ? DIR_N : DIR_S });
      x += w;
    }
  }
  return lots;
}

function makeParkedCar(x, y, angle, rng) {
  const model = rng.pick(CAR_MODELS.filter((m) => m.kind !== 'cab'));
  return { x, y, angle, model, color: rng.pick(PALETTE.cars) };
}

/** Fill one lot: a building, or a plaza, parking lot or garden yard. */
function populateLot(city, block, lot, rng) {
  const style = block.style;
  const w = lot.x1 - lot.x0;
  const h = lot.y1 - lot.y0;
  const roll = rng.next();
  const plaza = (style === 'downtown' && roll < 0.12) || (style === 'midtown' && roll < 0.05) || (style === 'beachfront' && roll < 0.1);
  const parking = (style === 'midtown' && roll > 0.93) || (style === 'industrial' && roll < 0.16);
  const yard = style === 'residential' && roll < 0.12;
  if (plaza) {
    city.grounds.push({ x0: lot.x0, y0: lot.y0, x1: lot.x1, y1: lot.y1, kind: 'plaza' });
    const cx = (lot.x0 + lot.x1) / 2;
    const cy = (lot.y0 + lot.y1) / 2;
    city.fountains.push({ x: cx, y: cy, r: Math.min(w, h) * 0.18 });
    city.solids.push({ x: cx - 12, y: cy - 12, w: 24, h: 24, circle: true, r: Math.min(w, h) * 0.18 });
    for (const [fx, fy] of [[0.2, 0.25], [0.8, 0.25], [0.2, 0.78], [0.8, 0.78]]) {
      addTree(city, lot.x0 + w * fx, lot.y0 + h * fy, style === 'downtown' ? 'round' : 'palm', rng);
    }
    if (!city.landmarks.plaza && style === 'downtown') city.landmarks.plaza = { x: cx, y: cy + Math.min(w, h) * 0.3, name: 'Glasshill Plaza' };
    return;
  }
  if (parking) {
    city.grounds.push({ x0: lot.x0 + 2, y0: lot.y0 + 2, x1: lot.x1 - 2, y1: lot.y1 - 2, kind: 'parking' });
    for (let x = lot.x0 + 16; x < lot.x1 - 14; x += 26) {
      if (rng.chance(0.6)) city.parked.push(makeParkedCar(x, lot.y0 + 30, Math.PI / 2, rng));
      if (h > 110 && rng.chance(0.6)) city.parked.push(makeParkedCar(x, lot.y1 - 30, -Math.PI / 2, rng));
    }
    return;
  }
  if (yard) {
    city.grounds.push({ x0: lot.x0 + 2, y0: lot.y0 + 2, x1: lot.x1 - 2, y1: lot.y1 - 2, kind: 'grass' });
    addTree(city, lot.x0 + w * rng.range(0.3, 0.7), lot.y0 + h * rng.range(0.3, 0.7), 'round', rng);
    return;
  }
  const set = SETBACK[style];
  const sx0 = set * rng.range(0.6, 1.3);
  const sx1 = set * rng.range(0.6, 1.3);
  const sy0 = set * rng.range(0.6, 1.5);
  const sy1 = set * rng.range(0.6, 1.5);
  const bw = w - sx0 - sx1;
  const bh = h - sy0 - sy1;
  if (bw < 20 || bh < 20) return;
  const b = makeBuilding(lot.x0 + sx0, lot.y0 + sy0, bw, bh, style, rng, block);
  addBuilding(city, b);
}

function addBuilding(city, b) {
  city.buildings.push(b);
  city.solids.push({ x: b.x, y: b.y, w: b.w, h: b.h, building: b });
}

function addTree(city, x, y, kind, rng) {
  const tree = kind === 'palm'
    ? { x, y, kind, height: rng.range(36, 58), lean: rng.range(-7, 7), fronds: rng.int(7, 9), phase: rng.range(0, 6.28), tone: rng.range(0.85, 1.1) }
    : { x, y, kind, height: rng.range(14, 22), size: rng.range(13, 20), phase: rng.range(0, 6.28), tone: rng.range(0.85, 1.1) };
  city.trees.push(tree);
  city.solids.push({ x: x - 3, y: y - 3, w: 6, h: 6, circle: true, r: kind === 'palm' ? 3 : 5 });
}

/** Palms and lamps along every curb, clear of the corners where the crosswalks are. */
function lineSidewalks(city, block, rng) {
  const inset = 4;
  const sides = [
    { x0: block.x0, y0: block.y0 + inset, x1: block.x1, y1: block.y0 + inset, nx: 0, ny: -1 },
    { x0: block.x0, y0: block.y1 - inset, x1: block.x1, y1: block.y1 - inset, nx: 0, ny: 1 },
    { x0: block.x0 + inset, y0: block.y0, x1: block.x0 + inset, y1: block.y1, nx: -1, ny: 0 },
    { x0: block.x1 - inset, y0: block.y0, x1: block.x1 - inset, y1: block.y1, nx: 1, ny: 0 },
  ];
  const palmChance = PALM_CHANCE[block.style] ?? 0.4;
  for (const side of sides) {
    const len = Math.hypot(side.x1 - side.x0, side.y1 - side.y0);
    let d = 34 + rng.range(0, 16);
    let k = 0;
    while (d < len - 34) {
      const t = d / len;
      const x = side.x0 + (side.x1 - side.x0) * t;
      const y = side.y0 + (side.y1 - side.y0) * t;
      if (k % 3 === 1) city.lamps.push({ x, y, nx: side.nx, ny: side.ny });
      else if (rng.chance(palmChance)) addTree(city, x, y, 'palm', rng);
      d += rng.range(58, 84);
      k += 1;
    }
  }
}

/** Parked cars in the curbside lanes of every street that has them. */
function parkAlongStreets(city, rng) {
  const pw = CITY.parkingLane;
  const clear = CITY.sidewalk + 30;
  city.vroads.forEach((road) => {
    if (!road.parking) return;
    for (let j = 0; j < city.hroads.length - 1; j += 1) {
      const ya = city.hroads[j].y + city.hroads[j].half + clear;
      const yb = city.hroads[j + 1].y - city.hroads[j + 1].half - clear;
      for (const side of [-1, 1]) {
        for (let y = ya + rng.range(0, 30); y < yb; y += rng.range(54, 82)) {
          if (rng.chance(0.5)) city.parked.push(makeParkedCar(road.x + side * (road.half - pw / 2), y, side < 0 ? Math.PI / 2 : -Math.PI / 2, rng));
        }
      }
    }
  });
  city.hroads.forEach((road) => {
    if (!road.parking) return;
    for (let i = 0; i < city.vroads.length - 1; i += 1) {
      const xa = city.vroads[i].x + city.vroads[i].half + clear;
      const xb = city.vroads[i + 1].x - city.vroads[i + 1].half - clear;
      for (const side of [-1, 1]) {
        for (let x = xa + rng.range(0, 30); x < xb; x += rng.range(54, 82)) {
          if (rng.chance(0.5)) city.parked.push(makeParkedCar(x, road.y + side * (road.half - pw / 2), side < 0 ? Math.PI : 0, rng));
        }
      }
    }
  });
}

/** Juniper Park: lawns, a pond, gravel paths and a grove of trees inside one block. */
function generatePark(city, block, rng) {
  const s = CITY.sidewalk;
  const x0 = block.x0 + s;
  const y0 = block.y0 + s;
  const x1 = block.x1 - s;
  const y1 = block.y1 - s;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const pond = { x: cx + (x1 - x0) * 0.18, y: cy - (y1 - y0) * 0.08, rx: (x1 - x0) * 0.16, ry: (y1 - y0) * 0.14 };
  city.park = { x0, y0, x1, y1, pond, name: 'Juniper Park' };
  city.solids.push({ x: pond.x - pond.rx * 0.8, y: pond.y - pond.ry * 0.8, w: pond.rx * 1.6, h: pond.ry * 1.6 });
  for (let k = 0; k < 26; k += 1) {
    const x = rng.range(x0 + 14, x1 - 14);
    const y = rng.range(y0 + 14, y1 - 14);
    if (Math.hypot((x - pond.x) / (pond.rx + 16), (y - pond.y) / (pond.ry + 16)) < 1) continue;
    if (Math.abs((x - x0) / (x1 - x0) - (y - y0) / (y1 - y0)) < 0.06) continue;
    addTree(city, x, y, rng.chance(0.3) ? 'palm' : 'round', rng);
  }
  city.landmarks.park = { x: cx, y: cy, name: 'Juniper Park' };
}

/** The Sun Bowl: an oval stadium filling one block in Ironside. */
function generateStadium(city, block) {
  const cx = (block.x0 + block.x1) / 2;
  const cy = (block.y0 + block.y1) / 2;
  const rx = (block.x1 - block.x0) / 2 - CITY.sidewalk - 14;
  const ry = (block.y1 - block.y0) / 2 - CITY.sidewalk - 12;
  city.stadium = { x: cx, y: cy, rx, ry, height: 34, name: 'Meridian Sun Bowl' };
  city.grounds.push({ x0: block.x0 + CITY.sidewalk, y0: block.y0 + CITY.sidewalk, x1: block.x1 - CITY.sidewalk, y1: block.y1 - CITY.sidewalk, kind: 'plaza' });
  city.solids.push({ x: cx - rx * 0.86, y: cy - ry * 0.7, w: rx * 1.72, h: ry * 1.4 });
  city.solids.push({ x: cx - rx * 0.7, y: cy - ry * 0.88, w: rx * 1.4, h: ry * 1.76 });
  city.landmarks.stadium = { x: cx, y: cy, name: city.stadium.name };
}

/** St. Aurelia Medical Center: one big white building, a helipad, and a door on the south side. */
function generateHospital(city, block, rng) {
  const s = CITY.sidewalk + 10;
  const b = makeBuilding(block.x0 + s, block.y0 + s, block.x1 - block.x0 - s * 2, block.y1 - block.y0 - s * 2 - 16, 'midtown', rng, block);
  b.floors = 8;
  b.height = 8 * CITY.floorHeight;
  b.wall = '#f7f4ee';
  b.kind = 'hospital';
  b.props = [{ type: 'helipad', x: b.w / 2 - 24, y: b.h / 2 - 24, w: 48, h: 48 }, { type: 'ac', x: 8, y: 8, w: 16, h: 10 }];
  addBuilding(city, b);
  city.grounds.push({ x0: block.x0 + CITY.sidewalk, y0: block.y0 + CITY.sidewalk, x1: block.x1 - CITY.sidewalk, y1: block.y1 - CITY.sidewalk, kind: 'plaza' });
  city.landmarks.hospital = { x: b.x + b.w / 2, y: block.y1 - CITY.sidewalk / 2 - 6, name: 'St. Aurelia Medical Center' };
}

/** The waterfront: sand, promenade, lifeguard towers, umbrellas, and Bluewater Marina's piers and boats. */
function generateWaterfront(city, rng) {
  const top = city.bounds.y0;
  const bottom = city.bounds.y1;
  const mY0 = city.hroads[CITY.marinaRows[0]].y;
  const mY1 = city.hroads[CITY.marinaRows[1]].y;
  const marina = { y0: mY0, y1: mY1, quayX0: city.shoreX, quayX1: city.promX0, piers: [], boats: [], breakwaterX: city.shoreX - 260 };
  city.marina = marina;
  for (let y = mY0 + 40; y < mY1 - 30; y += 74) {
    const pier = { x0: city.shoreX - 200, x1: city.shoreX, y: y, w: 10 };
    marina.piers.push(pier);
    for (const side of [-1, 1]) {
      for (let x = pier.x0 + 14; x < pier.x1 - 30; x += rng.range(34, 52)) {
        if (!rng.chance(0.75)) continue;
        const len = rng.range(26, 46);
        marina.boats.push({
          x: x + len / 2, y: y + side * (pier.w / 2 + 9), angle: rng.chance(0.5) ? 0 : Math.PI,
          length: len, width: len * 0.36, hull: rng.pick(['#fbfaf6', '#f4efe4', '#e9f3f6']), stripe: rng.pick([PALETTE.coral, PALETTE.mint, '#2f6f9a', PALETTE.lemon]),
          sail: rng.chance(0.35), phase: rng.range(0, 6.28),
        });
      }
    }
  }
  const office = makeBuilding(city.shoreX + 40, mY0 + 60, 84, 56, 'beachfront', rng, { i: 0, j: CITY.marinaRows[0] });
  office.floors = 2;
  office.height = 2 * CITY.floorHeight;
  office.wall = '#fbf5ea';
  office.kind = 'marina';
  office.props = [{ type: 'garden', x: 6, y: 6, w: 20, h: 14 }];
  addBuilding(city, office);
  city.landmarks.marina = { x: city.promX0 - 20, y: mY0 + 150, name: 'Bluewater Marina' };
  city.landmarks.pier = { x: city.promX0 + 30, y: city.hroads[1].y, name: 'Saltline Promenade' };
  for (let y = top + 120; y < bottom - 60; y += rng.range(70, 130)) {
    if (y > mY0 - 30 && y < mY1 + 30) continue;
    const x = rng.range(city.shoreX + 30, city.promX0 - 26);
    if (rng.chance(0.14)) {
      const tower = makeBuilding(x - 9, y - 9, 18, 18, 'beachfront', rng, { i: 0, j: 0 });
      tower.floors = 2;
      tower.height = 7;
      tower.wall = PALETTE.mint;
      tower.roof = PALETTE.coral;
      tower.kind = 'lifeguard';
      tower.props = [];
      addBuilding(city, tower);
    } else {
      city.beachProps.push({ kind: 'umbrella', x, y, color: rng.pick([PALETTE.coral, PALETTE.mint, PALETTE.lemon, '#ffffff', PALETTE.sky]), r: rng.range(10, 14) });
      if (rng.chance(0.7)) city.beachProps.push({ kind: 'towel', x: x + rng.range(-16, 16), y: y + rng.range(10, 18), color: rng.pick(PALETTE.shirts), angle: rng.range(-0.4, 0.4) });
    }
  }
  for (let y = top + 40; y < bottom; y += rng.range(70, 96)) {
    if (rng.chance(0.85)) addTree(city, city.promX0 + 8, y, 'palm', rng);
    if (rng.chance(0.4)) city.lamps.push({ x: city.promX1 - 6, y: y + 30, nx: 1, ny: 0 });
  }
}

/** Sidewalk loops pedestrians circle, and the crosswalk links between them. */
function buildWalkNetwork(city) {
  const s2 = CITY.sidewalk / 2;
  const { cols, rows } = CITY;
  for (const block of city.blocks) {
    block.loop = city.walkLoops.length;
    city.walkLoops.push({
      pts: [[block.x0 + s2, block.y0 + s2], [block.x1 - s2, block.y0 + s2], [block.x1 - s2, block.y1 - s2], [block.x0 + s2, block.y1 - s2]],
      x0: block.x0, y0: block.y0, x1: block.x1, y1: block.y1,
    });
  }
  const east = city.promX1 - 12;
  const west = city.promX0 + 14;
  const prom = { pts: [], x0: city.promX0, y0: city.bounds.y0, x1: city.promX1, y1: city.bounds.y1 };
  for (let j = 0; j < rows; j += 1) {
    const b = city.blocks[j * cols];
    prom.pts.push([east, b.y0 + s2], [east, b.y1 - s2]);
  }
  prom.pts.push([west, prom.pts[prom.pts.length - 1][1]], [west, prom.pts[0][1]]);
  city.promenadeLoop = city.walkLoops.length;
  city.walkLoops.push(prom);

  const loopOf = (i, j) => city.blocks[j * cols + i].loop;
  const link = (la, va, lb, vb, ni, nj, axis) => {
    const key = `${la}:${va}`;
    const back = `${lb}:${vb}`;
    if (!city.links.has(key)) city.links.set(key, []);
    if (!city.links.has(back)) city.links.set(back, []);
    city.links.get(key).push({ loop: lb, v: vb, i: ni, j: nj, axis });
    city.links.get(back).push({ loop: la, v: va, i: ni, j: nj, axis });
    const a = city.walkLoops[la].pts[va];
    if (axis === 'v') {
      const road = city.vroads[ni];
      city.crosswalks.push({ x0: road.x - road.half, x1: road.x + road.half, y0: a[1] - s2, y1: a[1] + s2, axis });
    } else {
      const road = city.hroads[nj];
      city.crosswalks.push({ x0: a[0] - s2, x1: a[0] + s2, y0: road.y - road.half, y1: road.y + road.half, axis });
    }
  };
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const l = loopOf(i, j);
      if (i + 1 < cols) {
        link(l, 1, loopOf(i + 1, j), 0, i + 1, j, 'v');
        link(l, 2, loopOf(i + 1, j), 3, i + 1, j + 1, 'v');
      }
      if (j + 1 < rows) {
        link(l, 3, loopOf(i, j + 1), 0, i, j + 1, 'h');
        link(l, 2, loopOf(i, j + 1), 1, i + 1, j + 1, 'h');
      }
      if (i === 0) {
        link(l, 0, city.promenadeLoop, j * 2, 0, j, 'v');
        link(l, 3, city.promenadeLoop, j * 2 + 1, 0, j + 1, 'v');
      }
    }
  }
}

/** Bucket every solid into a coarse grid so collision and bullets test only nearby ones. */
function buildSolidGrid(city) {
  const cell = CITY.cell;
  const { x0, y0, x1, y1 } = city.bounds;
  const gw = Math.ceil((x1 - x0) / cell) + 1;
  const gh = Math.ceil((y1 - y0) / cell) + 1;
  const cells = Array.from({ length: gw * gh }, () => []);
  city.solids.forEach((s, index) => {
    s.stamp = 0;
    const cx0 = Math.max(0, Math.floor((s.x - x0) / cell));
    const cy0 = Math.max(0, Math.floor((s.y - y0) / cell));
    const cx1 = Math.min(gw - 1, Math.floor((s.x + s.w - x0) / cell));
    const cy1 = Math.min(gh - 1, Math.floor((s.y + s.h - y0) / cell));
    for (let cy = cy0; cy <= cy1; cy += 1) for (let cx = cx0; cx <= cx1; cx += 1) cells[cy * gw + cx].push(index);
  });
  city.grid = { cell, gw, gh, cells, stamp: 0 };
}

/** Generate the whole of Velocity City from a seed. */
export function generateCity(seed) {
  const rng = createRng(deriveSeed(seed, 'city'));
  const vroads = layoutRoads(rng, CITY.cols + 1, CITY.avenueCols, CITY.blockWidth, 'x');
  const hroads = layoutRoads(rng, CITY.rows + 1, CITY.avenueRows, CITY.blockHeight, 'y');
  const lastV = vroads[vroads.length - 1];
  const lastH = hroads[hroads.length - 1];
  const promX1 = vroads[0].x - vroads[0].half;
  const promX0 = promX1 - CITY.promenadeWidth;
  const shoreX = promX0 - CITY.sandWidth;
  const city = {
    seed, vroads, hroads, promX0, promX1, shoreX,
    gridX0: promX1, gridY0: hroads[0].y - hroads[0].half, gridX1: lastV.x + lastV.half, gridY1: lastH.y + lastH.half,
    bounds: null, blocks: [], grounds: [], buildings: [], solids: [], trees: [], lamps: [], parked: [], fountains: [],
    crosswalks: [], walkLoops: [], links: new Map(), beachProps: [], nodes: [], landmarks: {},
    park: null, stadium: null, marina: null, promenadeLoop: -1, grid: null,
  };
  city.bounds = { x0: shoreX - CITY.seaDepth, y0: city.gridY0 - CITY.margin, x1: city.gridX1 + CITY.margin, y1: city.gridY1 + CITY.margin };

  for (let j = 0; j <= CITY.rows; j += 1) {
    for (let i = 0; i <= CITY.cols; i += 1) {
      city.nodes.push({ i, j, x: vroads[i].x, y: hroads[j].y, offset: (i * 2.9 + j * 4.3 + rng.range(0, 3)) % SIGNAL.cycle });
    }
  }
  for (let j = 0; j < CITY.rows; j += 1) {
    for (let i = 0; i < CITY.cols; i += 1) {
      const district = classifyBlock(i, j);
      city.blocks.push({
        i, j, district, style: DISTRICTS[district].style, kind: 'city',
        x0: vroads[i].x + vroads[i].half, x1: vroads[i + 1].x - vroads[i + 1].half,
        y0: hroads[j].y + hroads[j].half, y1: hroads[j + 1].y - hroads[j + 1].half, loop: -1,
      });
    }
  }
  for (const block of city.blocks) {
    if (block.district === 'park') {
      block.kind = 'park';
      generatePark(city, block, rng);
    } else if (block.i === CITY.stadium.i && block.j === CITY.stadium.j) {
      block.kind = 'stadium';
      generateStadium(city, block);
    } else if (block.i === CITY.hospital.i && block.j === CITY.hospital.j) {
      block.kind = 'hospital';
      generateHospital(city, block, rng);
    } else {
      for (const lot of subdivideBlock(block, rng)) populateLot(city, block, lot, rng);
    }
    lineSidewalks(city, block, rng);
  }
  if (!city.landmarks.plaza) {
    const b = blockAtIndex(city, CITY.downtown.i, CITY.downtown.j);
    city.landmarks.plaza = { x: b.x0 + 9, y: (b.y0 + b.y1) / 2, name: 'Glasshill Plaza' };
  }
  parkAlongStreets(city, rng);
  generateWaterfront(city, rng);
  buildWalkNetwork(city);
  buildSolidGrid(city);
  return city;
}

export function blockAtIndex(city, i, j) {
  return city.blocks[j * CITY.cols + i];
}

export function nodeAt(city, i, j) {
  return city.nodes[j * (CITY.cols + 1) + i];
}

/** The block a point lies in or nearest to (by column and row), or null west of the coastal road. */
export function blockAt(city, x, y) {
  if (x < city.gridX0) return null;
  let i = 0;
  while (i < CITY.cols - 1 && x > city.vroads[i + 1].x) i += 1;
  let j = 0;
  while (j < CITY.rows - 1 && y > city.hroads[j + 1].y) j += 1;
  return blockAtIndex(city, i, j);
}

/** The district name for a world point. */
export function districtAt(city, x, y) {
  if (x < city.promX1 + 4) {
    return y > city.marina.y0 - 40 && y < city.marina.y1 + 40 ? DISTRICTS.marina.name : DISTRICTS.beach.name;
  }
  const block = blockAt(city, x, y);
  return block ? DISTRICTS[block.district].name : DISTRICTS.beach.name;
}

/** Centre of the lane for a road travelled in `dir` (x for vertical roads, y for horizontal ones). */
export function laneCoord(road, dir, lane) {
  const off = road.median / 2 + (lane + 0.5) * CITY.laneWidth;
  if (dir === DIR_S) return road.x - off;
  if (dir === DIR_N) return road.x + off;
  if (dir === DIR_E) return road.y + off;
  return road.y - off;
}

export function roadForDir(city, dir, i, j) {
  return dir === DIR_E || dir === DIR_W ? city.hroads[j] : city.vroads[i];
}

/** Where a car in `lane` heading `dir` waits before the crosswalk of node (i, j). */
export function stopPoint(city, i, j, dir, lane) {
  const back = CITY.sidewalk + 5;
  if (dir === DIR_E || dir === DIR_W) {
    const v = city.vroads[i];
    return { x: v.x - DIR_X[dir] * (v.half + back), y: laneCoord(city.hroads[j], dir, lane), stop: true };
  }
  const h = city.hroads[j];
  return { x: laneCoord(city.vroads[i], dir, lane), y: h.y - DIR_Y[dir] * (h.half + back), stop: true };
}

/** Where a car leaving node (i, j) heading `dir` in `lane` is clear of the far crosswalk. */
export function exitPoint(city, i, j, dir, lane) {
  const out = CITY.sidewalk + 5;
  if (dir === DIR_E || dir === DIR_W) {
    const v = city.vroads[i];
    return { x: v.x + DIR_X[dir] * (v.half + out), y: laneCoord(city.hroads[j], dir, lane) };
  }
  const h = city.hroads[j];
  return { x: laneCoord(city.vroads[i], dir, lane), y: h.y + DIR_Y[dir] * (h.half + out) };
}

/** Whether the grid continues from node (i, j) in `dir`. */
export function canLeave(i, j, dir) {
  if (dir === DIR_E) return i < CITY.cols;
  if (dir === DIR_W) return i > 0;
  if (dir === DIR_S) return j < CITY.rows;
  return j > 0;
}

export const SIGNAL_GO = 0;
export const SIGNAL_AMBER = 1;
export const SIGNAL_RED = 2;

/** The light a car heading `dir` sees at node (i, j) at time `t`. */
export function signalFor(city, i, j, dir, t) {
  const phase = (t + nodeAt(city, i, j).offset) % SIGNAL.cycle;
  const vertical = dir === DIR_N || dir === DIR_S;
  if (vertical) return phase < SIGNAL.nsGreen ? SIGNAL_GO : phase < SIGNAL.nsAmber ? SIGNAL_AMBER : SIGNAL_RED;
  if (phase < SIGNAL.nsAmber) return SIGNAL_RED;
  return phase < SIGNAL.ewGreen ? SIGNAL_GO : SIGNAL_AMBER;
}

/** Whether a pedestrian may cross the road on `axis` ('v' crosses a north-south road) at node (i, j). */
export function crossingIsSafe(city, i, j, axis, t) {
  const phase = (t + nodeAt(city, i, j).offset) % SIGNAL.cycle;
  if (axis === 'v') return phase > SIGNAL.nsAmber + 0.4 && phase < SIGNAL.ewGreen - 1.2;
  return phase > 0.4 && phase < SIGNAL.nsGreen - 1.2;
}

/** Call `visit(solid)` once for each solid whose box touches the given rectangle. */
export function forEachSolidNear(city, x0, y0, x1, y1, visit) {
  const g = city.grid;
  const b = city.bounds;
  g.stamp += 1;
  const cx0 = Math.max(0, Math.floor((x0 - b.x0) / g.cell));
  const cy0 = Math.max(0, Math.floor((y0 - b.y0) / g.cell));
  const cx1 = Math.min(g.gw - 1, Math.floor((x1 - b.x0) / g.cell));
  const cy1 = Math.min(g.gh - 1, Math.floor((y1 - b.y0) / g.cell));
  for (let cy = cy0; cy <= cy1; cy += 1) {
    for (let cx = cx0; cx <= cx1; cx += 1) {
      const list = g.cells[cy * g.gw + cx];
      for (let k = 0; k < list.length; k += 1) {
        const s = city.solids[list[k]];
        if (s.stamp === g.stamp) continue;
        s.stamp = g.stamp;
        if (visit(s) === true) return;
      }
    }
  }
}

/** Push a circle (an object with x, y) out of buildings, trunks, the sea and the city's edge. Returns true on contact. */
export function resolveCircle(city, body, r) {
  let hit = false;
  forEachSolidNear(city, body.x - r, body.y - r, body.x + r, body.y + r, (s) => {
    if (s.circle) {
      const cx = s.x + s.w / 2;
      const cy = s.y + s.h / 2;
      const dx = body.x - cx;
      const dy = body.y - cy;
      const d = Math.hypot(dx, dy);
      const min = s.r + r;
      if (d < min && d > 1e-6) {
        body.x = cx + (dx / d) * min;
        body.y = cy + (dy / d) * min;
        hit = true;
      }
      return false;
    }
    const qx = Math.max(s.x, Math.min(body.x, s.x + s.w));
    const qy = Math.max(s.y, Math.min(body.y, s.y + s.h));
    const dx = body.x - qx;
    const dy = body.y - qy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) return false;
    hit = true;
    if (d2 > 1e-9) {
      const d = Math.sqrt(d2);
      body.x = qx + (dx / d) * r;
      body.y = qy + (dy / d) * r;
    } else {
      const left = body.x - s.x;
      const right = s.x + s.w - body.x;
      const top = body.y - s.y;
      const bottom = s.y + s.h - body.y;
      const m = Math.min(left, right, top, bottom);
      if (m === left) body.x = s.x - r;
      else if (m === right) body.x = s.x + s.w + r;
      else if (m === top) body.y = s.y - r;
      else body.y = s.y + s.h + r;
    }
    return false;
  });
  const minX = city.shoreX - 14;
  if (body.x < minX) { body.x = minX; hit = true; }
  if (body.x > city.gridX1 + 60) { body.x = city.gridX1 + 60; hit = true; }
  if (body.y < city.gridY0 - 60) { body.y = city.gridY0 - 60; hit = true; }
  if (body.y > city.gridY1 + 60) { body.y = city.gridY1 + 60; hit = true; }
  return hit;
}

/** First building a segment hits: { t in [0, 1], x, y, nx, ny } or null. Trunks and lamps let bullets past. */
export function raycastSolids(city, x0, y0, x1, y1) {
  let best = null;
  const dx = x1 - x0;
  const dy = y1 - y0;
  forEachSolidNear(city, Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1), (s) => {
    if (s.circle) return false;
    let tmin = 0;
    let tmax = 1;
    let nx = 0;
    let ny = 0;
    if (Math.abs(dx) < 1e-9) {
      if (x0 < s.x || x0 > s.x + s.w) return false;
    } else {
      let ta = (s.x - x0) / dx;
      let tb = (s.x + s.w - x0) / dx;
      let n = -Math.sign(dx);
      if (ta > tb) [ta, tb] = [tb, ta];
      if (ta > tmin) { tmin = ta; nx = n; ny = 0; }
      tmax = Math.min(tmax, tb);
    }
    if (Math.abs(dy) < 1e-9) {
      if (y0 < s.y || y0 > s.y + s.h) return false;
    } else {
      let ta = (s.y - y0) / dy;
      let tb = (s.y + s.h - y0) / dy;
      if (ta > tb) [ta, tb] = [tb, ta];
      if (ta > tmin) { tmin = ta; nx = 0; ny = -Math.sign(dy); }
      tmax = Math.min(tmax, tb);
    }
    if (tmin <= tmax && (best === null || tmin < best.t)) best = { t: tmin, x: x0 + dx * tmin, y: y0 + dy * tmin, nx, ny };
    return false;
  });
  return best;
}
