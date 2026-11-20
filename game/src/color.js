// Small colour helpers shared by the renderers: parse a hex colour once, shade and mix it, and
// turn it back into a canvas fill string.

const cache = new Map();

/** '#rrggbb' to [r, g, b] (cached). */
export function hexToRgb(hex) {
  let rgb = cache.get(hex);
  if (!rgb) {
    const n = Number.parseInt(hex.slice(1), 16);
    rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    cache.set(hex, rgb);
  }
  return rgb;
}

/** [r, g, b] and an alpha to a canvas colour string. */
export function rgbString(rgb, alpha = 1) {
  const r = Math.max(0, Math.min(255, Math.round(rgb[0])));
  const g = Math.max(0, Math.min(255, Math.round(rgb[1])));
  const b = Math.max(0, Math.min(255, Math.round(rgb[2])));
  return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
}

/** Multiply a colour by a brightness factor. */
export function shadeRgb(rgb, factor) {
  return [rgb[0] * factor, rgb[1] * factor, rgb[2] * factor];
}

/** Linear mix of two colours. */
export function mixRgb(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Shade a colour by a light level and warm it toward the sun's tint. */
export function litRgb(rgb, level, light) {
  const warm = mixRgb(rgb, light.sunTint, light.warmth * 0.32);
  return shadeRgb(warm, level * light.brightness);
}
