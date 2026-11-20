// Seeded, deterministic randomness. Every generator and every simulation system draws from a
// mulberry32 stream made here, so one seed always builds the same city and plays the same scene.

/** The mulberry32 generator: a function returning floats in [0, 1) from a 32-bit seed. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mix a seed with a label into an independent 32-bit seed (one stream per generator). */
export function deriveSeed(seed, label) {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  for (let i = 0; i < label.length; i += 1) {
    h = Math.imul(h ^ label.charCodeAt(i), 0x85ebca6b);
    h ^= h >>> 13;
  }
  return (h ^ (h >>> 16)) >>> 0;
}

/** A seeded random stream with the helpers the generators use. */
export function createRng(seed) {
  const next = mulberry32(seed);
  return {
    next,
    range: (a, b) => a + (b - a) * next(),
    int: (a, b) => a + Math.floor(next() * (b - a + 1)),
    pick: (list) => list[Math.floor(next() * list.length)],
    chance: (p) => next() < p,
    sign: () => (next() < 0.5 ? -1 : 1),
  };
}

/** A stateless hash of two integers to [0, 1): stable texture noise for the renderer. */
export function hash2(x, y, seed = 0) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
