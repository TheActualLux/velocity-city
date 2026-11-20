// Ambient life on the waterfront: gulls wheeling over the sand and the marina (they scatter at
// gunfire), and boats cruising the coast offshore. Both stay anchored near the player's stretch
// of coastline and are recycled out of sight.
const GULL_COUNT = 12;
const BOAT_COUNT = 4;

function anchorGull(world, g, fy, spread) {
  const city = world.city;
  const r = world.rng;
  g.cx = r.range(city.shoreX - 320, city.promX1 - 20);
  g.cy = fy + r.range(-spread, spread);
  g.r = r.range(40, 120);
  g.t = r.range(0, Math.PI * 2);
  g.speed = r.range(26, 44) * r.sign();
  g.height = r.range(36, 70);
}

/** Wheel the gulls around their anchors; re-anchor any that fall far behind the player. */
export function updateGulls(world, fx, fy, dt) {
  const r = world.rng;
  while (world.gulls.length < GULL_COUNT) {
    const g = { x: 0, y: 0, z: 0, angle: 0, flap: r.range(0, 6), scared: 0, cx: 0, cy: 0, r: 60, t: 0, speed: 30, height: 50 };
    anchorGull(world, g, fy, 650);
    world.gulls.push(g);
  }
  for (const g of world.gulls) {
    if (Math.abs(g.cy - fy) > 1200) anchorGull(world, g, fy + (fy > g.cy ? 900 : -900), 200);
    for (const a of world.alarms) {
      if (Math.hypot(a.x - g.x, a.y - g.y) < a.radius) g.scared = 3;
    }
    g.scared = Math.max(0, g.scared - dt);
    const boost = g.scared > 0 ? 2.6 : 1;
    g.t += (g.speed * boost * dt) / g.r;
    const px = g.x;
    const py = g.y;
    g.x = g.cx + Math.cos(g.t) * g.r + Math.sin(g.t * 2.3) * 16 + (g.scared > 0 ? (3 - g.scared) * 30 * Math.sign(g.speed) : 0);
    g.y = g.cy + Math.sin(g.t) * g.r * 0.7;
    g.z = g.height + Math.sin(g.t * 1.7) * 8 + (g.scared > 0 ? 30 : 0);
    if (Math.abs(g.x - px) + Math.abs(g.y - py) > 0.01) g.angle = Math.atan2(g.y - py, g.x - px);
    g.flap += dt * (g.scared > 0 ? 18 : 7 + Math.sin(g.t * 3) * 3);
  }
}

/** Cruise boats up and down the coast offshore, wrapping them around out of view. */
export function updateBoats(world, fy, dt) {
  const city = world.city;
  const r = world.rng;
  while (world.boats.length < BOAT_COUNT) {
    const south = r.chance(0.5);
    world.boats.push({
      x: city.shoreX - r.range(330, 900), y: fy + r.range(-1100, 1100), angle: south ? Math.PI / 2 : -Math.PI / 2,
      speed: r.range(18, 46), kind: r.chance(0.5) ? 'sail' : 'motor', length: r.range(30, 52), hull: r.pick(['#fbfaf6', '#f3ede0', '#2f6f9a']),
      phase: r.range(0, 6.28),
    });
  }
  for (const b of world.boats) {
    b.y += Math.sin(b.angle) * b.speed * dt;
    if (Math.abs(b.y - fy) > 1350) b.y = fy - Math.sign(Math.sin(b.angle)) * 1300;
  }
}
