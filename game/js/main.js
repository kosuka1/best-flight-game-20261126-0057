// main.js — Skylane Runner: loop, camera, input and scene assembly.
//
// The renderer is a small software projector: world points are moved into
// camera space (right / up / forward basis from the chase camera), divided
// by depth, and drawn far-to-near on a 2D canvas. Terrain, rings, clouds
// and the aircraft all share the one projector, so the HUD instruments,
// the world and the plane can never disagree about where things are.
//
// Shot modes (?shot=cover|bank|approach|panorama&seed=N) park the plane in
// a composed pose and hold it still — the maker's screenshot rig, and a
// handy way to eyeball the island without flying it.

import { Terrain, drawTerrain, RUNWAY } from './terrain.js';
import { Plane, drawPlane } from './plane.js';
import { Mission, drawRings } from './missions.js';
import { drawHud, drawTitleScreen, drawDebrief, drawPaused } from './hud.js';
import { SoundEngine } from './audio.js';

const canvas = document.getElementById('sky');
const ctx = canvas.getContext('2d');
const W = canvas.width;
const H = canvas.height;
const boot = document.getElementById('boot');
if (boot) boot.remove();

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') ?? 7) || 7;
const shotMode = params.get('shot');

const terrain = new Terrain(seed);
const plane = new Plane();
const mission = new Mission();
const sound = new SoundEngine();

let state = 'title';            // title | flying | paused | landed | crashed
let cameraMode = 'chase';       // chase | close
let lastMs = performance.now();
let shotFrames = 0;

// Clouds: fixed billboards scattered over the island at cruise height.
const clouds = [];
{
  let s = seed * 7919 + 13;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  for (let i = 0; i < 46; i++) {
    clouds.push({
      x: (rnd() - 0.5) * 5200,
      y: 330 + rnd() * 190,
      z: (rnd() - 0.5) * 5200,
      r: 90 + rnd() * 170,
    });
  }
}

// --- Camera -----------------------------------------------------------------
// The chase camera rides behind and above the plane, eased toward its
// station so turns feel flown rather than snapped. It looks slightly
// ahead of the nose, which keeps the next ring in frame while banking.

const cam = { x: 0, y: 170, z: -2240, heading: 0, pitch: -6 };

function updateCamera(dt) {
  const back = cameraMode === 'close' ? 12 : 27;
  const up = cameraMode === 'close' ? 4 : 8.5;
  const hr = plane.headingRad;
  const tx = plane.x - Math.sin(hr) * back;
  const tz = plane.z - Math.cos(hr) * back;
  const ty = plane.y + up;
  const k = Math.min(1, dt * 4.2);
  cam.x += (tx - cam.x) * k;
  cam.y += (ty - cam.y) * k;
  cam.z += (tz - cam.z) * k;
  // Keep the camera off the ground so a low pass never clips the island.
  const floor = Math.max(terrain.heightAt(cam.x, cam.z), 0) + 3;
  if (cam.y < floor) cam.y = floor;
  let dh = plane.heading - cam.heading;
  dh = ((dh + 540) % 360) - 180;
  cam.heading += dh * Math.min(1, dt * 3.4);
  cam.pitch += ((plane.pitch * 0.45 - 7) - cam.pitch) * Math.min(1, dt * 3.4);
}

function makeProjector() {
  const hr = (cam.heading * Math.PI) / 180;
  const pr = (cam.pitch * Math.PI) / 180;
  // Camera basis: forward, right, up.
  const fwd = { x: Math.sin(hr) * Math.cos(pr), y: Math.sin(pr), z: Math.cos(hr) * Math.cos(pr) };
  const right = { x: Math.cos(hr), y: 0, z: -Math.sin(hr) };
  const up = {
    x: fwd.y * right.z - fwd.z * right.y,
    y: fwd.z * right.x - fwd.x * right.z,
    z: fwd.x * right.y - fwd.y * right.x,
  };
  const focal = (H / 2) / Math.tan((62 * Math.PI) / 360); // ~62 degree vertical fov
  return function project(x, y, z) {
    const dx = x - cam.x, dy = y - cam.y, dz = z - cam.z;
    const depth = dx * fwd.x + dy * fwd.y + dz * fwd.z;
    if (depth < 2.5) return null;
    const sx = W / 2 + ((dx * right.x + dy * right.y + dz * right.z) / depth) * focal;
    const sy = H / 2 - ((dx * up.x + dy * up.y + dz * up.z) / depth) * focal;
    if (sx < -W * 0.6 || sx > W * 1.6 || sy < -H * 0.6 || sy > H * 1.6) return null;
    return { x: sx, y: sy, depth };
  };
}

// --- Sky ---------------------------------------------------------------------

function drawSky(project) {
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#3f7fc4');
  grad.addColorStop(0.45, '#7fb2dd');
  grad.addColorStop(0.72, '#c4dfef');
  grad.addColorStop(1, '#e6f0e9');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  // Sun: a fixed direction in the south-west sky.
  const sun = project(cam.x - 2600, cam.y + 1500, cam.z - 3200);
  if (sun) {
    const glow = ctx.createRadialGradient(sun.x, sun.y, 4, sun.x, sun.y, 150);
    glow.addColorStop(0, 'rgba(255,244,200,0.95)');
    glow.addColorStop(0.25, 'rgba(255,238,170,0.55)');
    glow.addColorStop(1, 'rgba(255,238,170,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sun.x - 150, sun.y - 150, 300, 300);
    ctx.fillStyle = '#fff6d8';
    ctx.beginPath();
    ctx.arc(sun.x, sun.y, 26, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawClouds(project) {
  const sorted = clouds
    .map((c) => ({ c, p: project(c.x, c.y, c.z) }))
    .filter((e) => e.p)
    .sort((a, b) => b.p.depth - a.p.depth);
  for (const { c, p } of sorted) {
    const r = (c.r / Math.max(60, p.depth)) * 500;
    if (r < 6) continue;
    ctx.fillStyle = 'rgba(255,255,255,0.74)';
    for (const [ox, oy, s] of [[0, 0, 1], [-0.55, 0.12, 0.7], [0.55, 0.1, 0.75], [0.1, -0.22, 0.62]]) {
      ctx.beginPath();
      ctx.ellipse(p.x + ox * r, p.y + oy * r, r * s, r * s * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// --- Input -------------------------------------------------------------------

const keys = new Set();
let mouseSteer = null; // {x:-1..1, y:-1..1} while the pointer is down or moved recently

addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
  keys.add(e.key.toLowerCase());
  if (e.key === 'Enter' && state === 'title') startFlight();
  if ((e.key === 'r' || e.key === 'R') && state !== 'title') restart();
  if ((e.key === 'p' || e.key === 'P') && (state === 'flying' || state === 'paused')) {
    state = state === 'flying' ? 'paused' : 'flying';
  }
  if ((e.key === 'c' || e.key === 'C') && state === 'flying') {
    cameraMode = cameraMode === 'chase' ? 'close' : 'chase';
  }
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

canvas.addEventListener('pointermove', (e) => {
  const rect = canvas.getBoundingClientRect();
  mouseSteer = {
    x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
    y: ((e.clientY - rect.top) / rect.height) * 2 - 1,
  };
});
canvas.addEventListener('pointerdown', () => {
  sound.start();
  if (state === 'title') startFlight();
});
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (state === 'flying') plane.throttle = Math.max(0, Math.min(1, plane.throttle - Math.sign(e.deltaY) * 0.06));
}, { passive: false });

function readInput() {
  const input = { pitch: 0, roll: 0, throttleDelta: 0 };
  if (keys.has('arrowup')) input.pitch -= 1;      // stick forward = nose down
  if (keys.has('arrowdown')) input.pitch += 1;
  if (keys.has('arrowleft') || keys.has('a')) input.roll -= 1;
  if (keys.has('arrowright') || keys.has('d')) input.roll += 1;
  if (keys.has('w')) input.throttleDelta += 1;
  if (keys.has('s')) input.throttleDelta -= 1;
  if (mouseSteer && input.pitch === 0 && input.roll === 0) {
    input.roll = Math.max(-1, Math.min(1, mouseSteer.x * 1.6));
    input.pitch = Math.max(-1, Math.min(1, mouseSteer.y * 1.6));
  }
  return input;
}

// --- Game flow -----------------------------------------------------------------

function startFlight() {
  sound.start();
  state = 'flying';
}

function restart() {
  plane.reset();
  mission.reset();
  cam.x = plane.x; cam.y = plane.y + 10; cam.z = plane.z - 30;
  cam.heading = plane.heading; cam.pitch = -7;
  state = 'flying';
}

function stepGame(dt, nowMs) {
  const ground = Math.max(terrain.heightAt(plane.x, plane.z), 0);
  plane.step(dt, readInput(), ground);
  updateCamera(dt);
  if (mission.checkRingPass(plane, nowMs)) sound.ringChime();
  const verdict = mission.judgeTouchdown(plane, terrain);
  if (verdict === 'landed') {
    state = 'landed';
    sound.touchdown();
  } else if (verdict === 'crashed') {
    state = 'crashed';
    plane.damage = 100;
    sound.crash();
  }
  // World edge: turn the plane gently back toward the island.
  const edge = 2350;
  if (Math.abs(plane.x) > edge || Math.abs(plane.z) > edge) {
    const home = (Math.atan2(-plane.x, -plane.z) * 180) / Math.PI;
    let dh = ((home - plane.heading + 540) % 360) - 180;
    plane.heading += Math.sign(dh) * Math.min(Math.abs(dh), dt * 30);
  }
}

function render(nowMs) {
  const project = makeProjector();
  drawSky(project);
  drawTerrain(ctx, terrain, project, cam);
  drawClouds(project);
  drawRings(ctx, project, mission, nowMs);
  drawPlane(ctx, project, plane, terrain);
  if (state !== 'title') drawHud(ctx, W, H, plane, mission, nowMs);
  if (state === 'title') drawTitleScreen(ctx, W, H, nowMs);
  if (state === 'paused') drawPaused(ctx, W, H);
  if (state === 'landed' || state === 'crashed') drawDebrief(ctx, W, H, plane, mission, state);
}

// --- Screenshot rig --------------------------------------------------------------
// Each preset parks the plane in a composed pose, flies a few dozen frames
// of gentle autopilot so the pose looks lived-in, then holds still.

const SHOT_PRESETS = {
  cover:    { x: -60, y: 168, z: -1560, heading: 6,   pitch: 1,  roll: -9,  speed: 52, throttle: 0.62, ringsDone: 0 },
  bank:     { x: 300, y: 215, z: -620,  heading: 48,  pitch: 3,  roll: -34, speed: 58, throttle: 0.7,  ringsDone: 1 },
  approach: { x: 10,  y: 88,  z: -1360, heading: 1,   pitch: -5, roll: 2,   speed: 37, throttle: 0.3,  ringsDone: 6 },
  panorama: { x: -900, y: 430, z: 900,  heading: 128, pitch: -2, roll: 12,  speed: 64, throttle: 0.8,  ringsDone: 3 },
};

function setupShot(name) {
  const p = SHOT_PRESETS[name] ?? SHOT_PRESETS.cover;
  plane.x = p.x; plane.y = p.y; plane.z = p.z;
  plane.heading = p.heading; plane.pitch = p.pitch; plane.roll = p.roll;
  plane.speed = p.speed; plane.throttle = p.throttle;
  plane.fuel = 100 - p.ringsDone * 9;
  for (let i = 0; i < p.ringsDone && i < mission.rings.length; i++) {
    mission.rings[i].passed = true;
    mission.ringsFlown++;
    mission.score += 250;
    mission.nextIndex++;
  }
  if (mission.nextIndex >= mission.rings.length) mission.phase = 'landing';
  mission.lastPlanePos = { x: plane.x, y: plane.y, z: plane.z };
  cam.x = plane.x - Math.sin(plane.headingRad) * 30;
  cam.z = plane.z - Math.cos(plane.headingRad) * 30;
  cam.y = plane.y + 10;
  cam.heading = plane.heading;
  cam.pitch = -7;
  state = 'flying';
}

if (shotMode) setupShot(shotMode);

// --- Main loop ---------------------------------------------------------------------

function frame(nowMs) {
  requestAnimationFrame(frame);
  let dt = (nowMs - lastMs) / 1000;
  lastMs = nowMs;
  if (dt > 0.05) dt = 0.05;
  if (shotMode) {
    // Fly ~70 frames of near-level autopilot, then freeze the pose.
    if (shotFrames < 70) {
      plane.step(dt, { pitch: 0, roll: 0, throttleDelta: 0 },
        Math.max(terrain.heightAt(plane.x, plane.z), 0));
      mission.lastPlanePos = { x: plane.x, y: plane.y, z: plane.z };
      updateCamera(dt);
      shotFrames++;
    }
    render(nowMs);
    return;
  }
  if (state === 'flying') stepGame(dt, nowMs);
  else if (state === 'title') {
    // Attract mode: the plane cruises a lazy circuit behind the title.
    plane.step(dt, { pitch: 0, roll: 0.22, throttleDelta: 0 },
      Math.max(terrain.heightAt(plane.x, plane.z), 0));
    if (plane.y < 130) plane.pitch += dt * 8;
    updateCamera(dt);
  }
  sound.update(plane, state === 'flying');
  render(nowMs);
}

requestAnimationFrame(frame);
