// Effects particles: sparks off metal and stone, dust puffs, smoke from damaged cars, fire,
// explosion fireballs and debris, shell casings and shockwave rings. Blood-free by design.
// They are simulation state, drawn from the world's seeded stream, so effects replay exactly.

const MAX_PARTICLES = 1100;

/** Add one particle; `p` holds kind, position, velocity (z is height), life, size and colour. */
export function spawnParticle(world, p) {
  if (world.particles.length >= MAX_PARTICLES) world.particles.shift();
  world.particles.push({
    z: 0, vx: 0, vy: 0, vz: 0, grow: 0, drag: 2, gravity: 0, size: 2, color: '#ffffff',
    ...p, age: 0,
  });
}

export function emitSparks(world, x, y, angle, count) {
  const r = world.rng;
  for (let k = 0; k < count; k += 1) {
    const a = angle + r.range(-0.9, 0.9);
    const s = r.range(120, 320);
    spawnParticle(world, { kind: 'spark', x, y, z: r.range(2, 10), vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: r.range(20, 90), gravity: 260, life: r.range(0.12, 0.3), size: r.range(1, 1.8), color: r.chance(0.5) ? '#fff3b0' : '#ffc35a', drag: 4 });
  }
}

export function emitDust(world, x, y, count, color = '#e9dcc2') {
  const r = world.rng;
  for (let k = 0; k < count; k += 1) {
    const a = r.range(0, Math.PI * 2);
    const s = r.range(10, 50);
    spawnParticle(world, { kind: 'puff', x, y, z: r.range(0, 6), vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: r.range(5, 20), life: r.range(0.4, 0.8), size: r.range(3, 6), grow: 10, color, drag: 3 });
  }
}

export function emitSmoke(world, x, y, dark) {
  const r = world.rng;
  spawnParticle(world, { kind: 'smoke', x: x + r.range(-4, 4), y: y + r.range(-4, 4), z: 6, vx: r.range(-6, 6) + 10, vy: r.range(-6, 6) - 6, vz: r.range(18, 30), life: r.range(1.2, 2.2), size: r.range(4, 7), grow: 9, color: dark ? '#3b3b44' : '#9a9aa4', drag: 0.6 });
}

export function emitFire(world, x, y) {
  const r = world.rng;
  spawnParticle(world, { kind: 'fire', x: x + r.range(-8, 8), y: y + r.range(-6, 6), z: r.range(2, 6), vx: r.range(-8, 8), vy: r.range(-8, 8), vz: r.range(24, 50), life: r.range(0.35, 0.7), size: r.range(4, 8), grow: -4, color: r.chance(0.5) ? '#ffb347' : '#ff6a3d', drag: 1 });
}

export function emitShellCasing(world, x, y, angle) {
  const r = world.rng;
  const a = angle + Math.PI / 2 + r.range(-0.3, 0.3);
  spawnParticle(world, { kind: 'shell', x, y, z: 10, vx: Math.cos(a) * 70, vy: Math.sin(a) * 70, vz: 60, gravity: 400, life: 0.9, size: 1.2, color: '#e8c36a', drag: 3 });
}

export function emitExplosion(world, x, y) {
  const r = world.rng;
  spawnParticle(world, { kind: 'ring', x, y, life: 0.45, size: 10, grow: 300, color: '#fff1c4', drag: 0 });
  spawnParticle(world, { kind: 'flash', x, y, z: 10, life: 0.22, size: 60, grow: 120, color: '#fff6d8', drag: 0 });
  for (let k = 0; k < 26; k += 1) {
    const a = r.range(0, Math.PI * 2);
    const s = r.range(30, 160);
    spawnParticle(world, { kind: 'fire', x, y, z: r.range(4, 14), vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: r.range(30, 110), life: r.range(0.5, 1.1), size: r.range(8, 16), grow: -6, color: r.pick(['#ffe08a', '#ffb347', '#ff6a3d', '#f04a2a']), drag: 2.4 });
  }
  for (let k = 0; k < 16; k += 1) {
    const a = r.range(0, Math.PI * 2);
    const s = r.range(20, 70);
    spawnParticle(world, { kind: 'smoke', x, y, z: 10, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: r.range(20, 50), life: r.range(1.6, 3), size: r.range(10, 16), grow: 12, color: '#2f3038', drag: 1 });
  }
  for (let k = 0; k < 12; k += 1) {
    const a = r.range(0, Math.PI * 2);
    const s = r.range(120, 300);
    spawnParticle(world, { kind: 'debris', x, y, z: 8, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: r.range(80, 200), gravity: 420, life: r.range(0.8, 1.4), size: r.range(2, 4), color: '#2a2a30', drag: 1.2 });
  }
  emitSparks(world, x, y, 0, 10);
  emitSparks(world, x, y, Math.PI, 10);
}

/** Age, move and fade every particle. */
export function updateParticles(world, dt) {
  const list = world.particles;
  let write = 0;
  for (let k = 0; k < list.length; k += 1) {
    const p = list[k];
    p.age += dt;
    if (p.age >= p.life) continue;
    const drag = Math.exp(-p.drag * dt);
    p.vx *= drag;
    p.vy *= drag;
    p.vz -= p.gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    if (p.z < 0) {
      p.z = 0;
      p.vz *= -0.3;
      p.vx *= 0.6;
      p.vy *= 0.6;
    }
    p.size = Math.max(0.2, p.size + p.grow * dt);
    list[write] = p;
    write += 1;
  }
  list.length = write;
}
