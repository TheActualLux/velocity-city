// Full-screen overlays drawn over the live world: the title card (over the golden-hour skyline
// pan), the pause menu and the hospital screen after the player goes down.
import { PALETTE, PLAYER } from './config.js';
import { hudScale } from './hud.js';

const FONT = '"Segoe UI", "Helvetica Neue", Arial, system-ui, sans-serif';
const DISPLAY = '"Arial Black", "Segoe UI Black", Impact, "Helvetica Neue", system-ui, sans-serif';

export const GAME_TITLE = 'VELOCITY CITY';
export const PREMISE = 'Off the night bus with a borrowed pistol and a debt to Odessa Vance: one long weekend to own the sun-soaked streets of Meridian.';

const CONTROLS = [
  ['WASD / Arrows', 'Walk  ·  Drive'],
  ['Shift', 'Run'],
  ['Mouse', 'Aim'],
  ['Left click', 'Fire  ·  Drive-by'],
  ['F', 'Steal / exit car'],
  ['Space', 'Handbrake'],
  ['R', 'Reload'],
  ['Esc', 'Pause'],
  ['L', 'Lock pointer'],
  ['M', 'Mute'],
];

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** The title card: logo, premise, the prompt to start and the controls. */
export function drawTitleScreen(ctx, view, time) {
  const u = hudScale(view);
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  const shade = ctx.createLinearGradient(0, 0, view.w * 0.75, 0);
  shade.addColorStop(0, 'rgba(26,20,58,0.78)');
  shade.addColorStop(0.55, 'rgba(26,20,58,0.42)');
  shade.addColorStop(1, 'rgba(26,20,58,0)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, view.w, view.h);
  const left = 70 * u;
  let y = view.h * 0.2;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `800 ${Math.round(15 * u)}px ${FONT}`;
  ctx.fillStyle = PALETTE.mint;
  ctx.fillText('MERIDIAN  ·  SUN COAST'.split('').join(' '), left + 4 * u, y);
  y += 84 * u;
  ctx.save();
  ctx.translate(left, y);
  ctx.transform(1, 0, -0.12, 1, 0, 0);
  ctx.font = `900 ${Math.round(88 * u)}px ${DISPLAY}`;
  const words = GAME_TITLE.split(' ');
  ctx.fillStyle = 'rgba(14,10,40,0.6)';
  ctx.fillText(words[0], 6 * u, 6 * u);
  ctx.fillText(words[1], 6 * u, 92 * u);
  const grad = ctx.createLinearGradient(0, -80 * u, 0, 100 * u);
  grad.addColorStop(0, '#ffe08a');
  grad.addColorStop(0.45, PALETTE.coral);
  grad.addColorStop(1, '#ff4f8b');
  ctx.fillStyle = grad;
  ctx.fillText(words[0], 0, 0);
  const grad2 = ctx.createLinearGradient(0, 10 * u, 0, 100 * u);
  grad2.addColorStop(0, '#b8fff0');
  grad2.addColorStop(1, PALETTE.mint);
  ctx.fillStyle = grad2;
  ctx.fillText(words[1], 0, 86 * u);
  ctx.restore();
  y += 86 * u + 48 * u;
  ctx.font = `500 ${Math.round(19 * u)}px ${FONT}`;
  ctx.fillStyle = '#fbf3e4';
  for (const line of wrapText(ctx, PREMISE, Math.min(470 * u, view.w * 0.4))) {
    ctx.fillText(line, left, y);
    y += 27 * u;
  }
  y += 30 * u;
  const pulse = 0.55 + 0.45 * Math.sin(time * 3.2);
  ctx.font = `800 ${Math.round(22 * u)}px ${FONT}`;
  ctx.fillStyle = `rgba(255,215,94,${pulse.toFixed(3)})`;
  ctx.fillText('Press Enter to start', left, y);
  const boxW = 270 * u;
  const boxH = (CONTROLS.length * 24 + 46) * u;
  const bx = view.w - boxW - 50 * u;
  const by = view.h - boxH - 50 * u;
  ctx.fillStyle = 'rgba(22,26,52,0.66)';
  ctx.beginPath();
  ctx.roundRect(bx, by, boxW, boxH, 12 * u);
  ctx.fill();
  ctx.font = `800 ${Math.round(12 * u)}px ${FONT}`;
  ctx.fillStyle = PALETTE.coral;
  ctx.fillText('CONTROLS'.split('').join(' '), bx + 20 * u, by + 28 * u);
  CONTROLS.forEach(([key, action], k) => {
    const ry = by + (52 + k * 24) * u;
    ctx.font = `700 ${Math.round(14 * u)}px ${FONT}`;
    ctx.fillStyle = '#fbf3e4';
    ctx.textAlign = 'left';
    ctx.fillText(key, bx + 20 * u, ry);
    ctx.font = `500 ${Math.round(14 * u)}px ${FONT}`;
    ctx.fillStyle = 'rgba(251,243,228,0.72)';
    ctx.textAlign = 'right';
    ctx.fillText(action, bx + boxW - 20 * u, ry);
  });
  ctx.textAlign = 'left';
}

function centredOverlay(ctx, view, title, colour, lines) {
  const u = hudScale(view);
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.fillStyle = 'rgba(18,16,44,0.55)';
  ctx.fillRect(0, 0, view.w, view.h);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${Math.round(72 * u)}px ${DISPLAY}`;
  ctx.fillStyle = 'rgba(10,8,30,0.6)';
  ctx.fillText(title, view.w / 2 + 5 * u, view.h * 0.4 + 5 * u);
  ctx.fillStyle = colour;
  ctx.fillText(title, view.w / 2, view.h * 0.4);
  lines.forEach((line, k) => {
    ctx.font = `${k === 0 ? 600 : 500} ${Math.round((k === 0 ? 20 : 16) * u)}px ${FONT}`;
    ctx.fillStyle = k === 0 ? '#fbf3e4' : 'rgba(251,243,228,0.75)';
    ctx.fillText(line, view.w / 2, view.h * 0.4 + (70 + k * 32) * u);
  });
}

export function drawPauseScreen(ctx, view) {
  centredOverlay(ctx, view, 'PAUSED', PALETTE.mint, ['Esc or Enter to resume', 'R to restart  ·  T for the title screen']);
}

export function drawGameOverScreen(ctx, view, world) {
  const fee = Math.min(world.player.money, PLAYER.hospitalFee);
  const ready = world.player.deadTime > 2;
  centredOverlay(ctx, view, 'FLATLINED', PALETTE.coral, [
    `St. Aurelia Medical Center will patch you up for $${fee.toLocaleString('en-US')}`,
    ready ? 'Press Enter to wake up  ·  R to restart' : ' ',
  ]);
}
