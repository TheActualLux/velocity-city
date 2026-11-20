// Time of day: where the sun is, how long and which way shadows fall, how warm the light is, and
// how dark the night gets. The renderer asks for this once per frame from the game clock.

const SUNRISE = 6;
const DAY_LENGTH = 13.5;
const MAX_ELEVATION = 1.15;

/** Lighting for an hour of the day (0..24). */
export function computeLighting(hour) {
  const h = ((hour % 24) + 24) % 24;
  const t = (h - SUNRISE) / DAY_LENGTH;
  const up = t > 0 && t < 1;
  const elevation = up ? MAX_ELEVATION * Math.sin(Math.PI * t) : 0;
  const azimuth = Math.PI + Math.max(0, Math.min(1, t)) * Math.PI;
  const length = up ? Math.min(3.1, Math.max(0.28, (Math.cos(elevation) / Math.max(0.05, Math.sin(elevation))) * 0.55)) : 0.4;
  const golden = up ? Math.max(0, 1 - elevation / 0.55) : 0;
  const sunset = SUNRISE + DAY_LENGTH;
  const dark = h >= sunset ? h - sunset : SUNRISE - h;
  const night = up ? Math.max(0, 1 - elevation / 0.12) * 0.5 : 0.5 + 0.5 * Math.min(1, dark / 0.75);
  const shadowX = Math.cos(azimuth) * length;
  const shadowY = Math.sin(azimuth) * length;
  const sunX = -Math.cos(azimuth);
  const sunY = -Math.sin(azimuth);
  return {
    hour: h,
    elevation,
    shadowX,
    shadowY,
    sunX,
    sunY,
    warmth: Math.min(1, 0.18 + golden * 0.95),
    golden,
    night: Math.min(1, night),
    brightness: 1 - Math.min(1, night) * 0.25,
    sunTint: [255, 168 - golden * 30, 104 - golden * 30],
    shadowAlpha: 0.3 + golden * 0.14,
  };
}

/** How brightly a wall facing (nx, ny) is lit by the sun. */
export function faceLight(light, nx, ny) {
  const d = nx * light.sunX + ny * light.sunY;
  return 0.66 + 0.3 * Math.max(0, d) - 0.08 * Math.max(0, -d);
}
