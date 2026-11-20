// The follow camera: it trails the player (or their car) smoothly, leans toward the pointer, zooms
// out with speed and, at the wheel, pulls well back and leads the direction of travel. It shakes on
// gunfire and impacts. It is simulation state (stepped with the world, shaken by deterministic
// noise) so a screenshot scene frames the same shot every time.
import { CAMERA, DRIVE } from './config.js';

export function createCamera(x, y) {
  return { x, y, zoom: 1, targetZoom: 1, trauma: 0, shakeX: 0, shakeY: 0, mode: 'follow', pan: null };
}

/** Add screen shake (0..1 trauma; it is squared, so small knocks stay small). */
export function addCameraShake(camera, amount) {
  camera.trauma = Math.min(1, camera.trauma + amount);
}

/** Snap straight to a point (on start, respawn and for scripted scenes). */
export function snapCamera(camera, x, y) {
  camera.x = x;
  camera.y = y;
  camera.zoom = camera.targetZoom;
}

/** A slow scripted pan from one point toward another (the title shot). */
export function startCameraPan(camera, from, to, seconds, zoom) {
  camera.mode = 'pan';
  camera.pan = { from, to, seconds, t: 0 };
  camera.targetZoom = zoom;
  snapCamera(camera, from.x, from.y);
}

/** Step the camera: follow the target with look-ahead toward the pointer, or advance the pan. */
export function updateCamera(camera, world, dt) {
  if (camera.mode === 'pan' && camera.pan) {
    const pan = camera.pan;
    pan.t = (pan.t + dt) % pan.seconds;
    const k = pan.t / pan.seconds;
    camera.x = pan.from.x + (pan.to.x - pan.from.x) * k;
    camera.y = pan.from.y + (pan.to.y - pan.from.y) * k;
  } else {
    // The target is the player, or the car they are driving. The pointer (`look`) leans the view
    // toward it; at the wheel the view also runs ahead along the direction of travel and pulls back.
    const p = world.player;
    const car = p.car;
    let lx = 0;
    let ly = 0;
    if (p.alive && p.lookX !== null) {
      const k = car ? CAMERA.driveLook : CAMERA.lookAhead;
      lx = (p.lookX - p.x) * k;
      ly = (p.lookY - p.y) * k;
      const len = Math.hypot(lx, ly);
      if (len > CAMERA.maxLook) {
        lx *= CAMERA.maxLook / len;
        ly *= CAMERA.maxLook / len;
      }
    }
    if (car) {
      let ax = car.vx * CAMERA.driveLead;
      let ay = car.vy * CAMERA.driveLead;
      const len = Math.hypot(ax, ay);
      if (len > CAMERA.maxDriveLead) {
        ax *= CAMERA.maxDriveLead / len;
        ay *= CAMERA.maxDriveLead / len;
      }
      lx += ax;
      ly += ay;
    }
    const k = 1 - Math.exp(-(car ? CAMERA.driveFollow : CAMERA.follow) * dt);
    camera.x += (p.x + lx - camera.x) * k;
    camera.y += (p.y + ly - camera.y) * k;
    const speed = Math.hypot(p.vx, p.vy);
    camera.targetZoom = car
      ? 1 - CAMERA.driveZoomOut * Math.min(1, speed / DRIVE.topSpeed)
      : 1 - CAMERA.speedZoomOut * Math.min(1, speed / 180);
  }
  camera.zoom += (camera.targetZoom - camera.zoom) * (1 - Math.exp(-CAMERA.zoomFollow * dt));
  camera.trauma = Math.max(0, camera.trauma - CAMERA.shakeDecay * dt);
  const shake = camera.trauma * camera.trauma * CAMERA.maxShake;
  const t = world.time;
  camera.shakeX = shake * (Math.sin(t * 47.3) * 0.6 + Math.sin(t * 91.7 + 1.3) * 0.4);
  camera.shakeY = shake * (Math.sin(t * 53.1 + 2.1) * 0.6 + Math.sin(t * 83.9 + 0.4) * 0.4);
}

/** Screen pixels (CSS) per world unit for a view of the given CSS height. */
export function viewScale(camera, view) {
  return (view.h / 720) * CAMERA.baseZoom * camera.zoom;
}

/** The world rectangle the camera shows in a view. */
export function viewRect(camera, view) {
  const s = viewScale(camera, view);
  const halfW = view.w / 2 / s;
  const halfH = view.h / 2 / s;
  const cx = camera.x + camera.shakeX;
  const cy = camera.y + camera.shakeY;
  return { cx, cy, halfW, halfH, x0: cx - halfW, y0: cy - halfH, x1: cx + halfW, y1: cy + halfH, scale: s };
}

export function screenToWorld(camera, view, sx, sy) {
  const r = viewRect(camera, view);
  return { x: r.cx + (sx - view.w / 2) / r.scale, y: r.cy + (sy - view.h / 2) / r.scale };
}

export function worldToScreen(camera, view, x, y) {
  const r = viewRect(camera, view);
  return { x: (x - r.cx) * r.scale + view.w / 2, y: (y - r.cy) * r.scale + view.h / 2 };
}
