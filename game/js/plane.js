// plane.js — the Skylane Runner flight model and the aircraft drawing.
//
// Arcade flight with real discipline: throttle sets a target speed, pitch
// trades speed for height, bank turns the nose, and below stall speed the
// wing stops holding the plane up. Fuel burns with throttle, so a sortie
// is a budget: rings first, then get home to the runway before the tank
// and the terrain settle the argument.

export const STALL_SPEED = 23;      // m/s
export const MAX_SPEED = 78;        // m/s at full throttle, level
export const FUEL_CAPACITY = 100;

export class Plane {
  constructor() {
    this.reset();
  }

  reset() {
    // Start on final approach south of the island, lined up on the strip
    // so the first thing a new pilot sees is the runway and Ring 1 beyond.
    this.x = 0;
    this.z = -2100;
    this.y = 150;
    this.heading = 0;        // degrees, 0 = north
    this.pitch = 0;          // degrees, + nose up
    this.roll = 0;           // degrees, + right wing down
    this.speed = 42;         // m/s
    this.throttle = 0.55;    // 0..1
    this.fuel = FUEL_CAPACITY;
    this.damage = 0;         // 0..100
    this.vspeed = 0;         // m/s, + climbing
    this.stalled = false;
    this.engineOut = false;
    this.propAngle = 0;
  }

  get headingRad() { return (this.heading * Math.PI) / 180; }
  get pitchRad() { return (this.pitch * Math.PI) / 180; }
  get rollRad() { return (this.roll * Math.PI) / 180; }

  // Unit forward vector in world space (x east, y up, z north).
  forward() {
    const cp = Math.cos(this.pitchRad);
    return {
      x: Math.sin(this.headingRad) * cp,
      y: Math.sin(this.pitchRad),
      z: Math.cos(this.headingRad) * cp,
    };
  }

  // Advance the model. input: {pitch:-1..1, roll:-1..1, throttleDelta:-1..1}
  step(dt, input, groundHeight) {
    if (this.engineOut) this.throttle = 0;
    this.throttle = clamp(this.throttle + input.throttleDelta * dt * 0.55, 0, 1);

    // Pitch and roll answer the controls, then settle toward level.
    this.pitch += input.pitch * dt * 42;
    this.pitch -= this.pitch * dt * 0.55;
    this.roll += input.roll * dt * 95;
    this.roll -= this.roll * dt * 1.5;
    this.roll = clamp(this.roll, -58, 58);

    // Speed: engine pushes toward the throttle's target; pitch trades it.
    const target = 16 + this.throttle * (MAX_SPEED - 16);
    this.speed += (target - this.speed) * Math.min(1, dt * 0.7);
    this.speed -= Math.sin(this.pitchRad) * 13 * dt;   // climb bleeds, dive gains
    this.speed = clamp(this.speed, 6, 110);

    // Bank turns the nose; tighter at low speed, lazier fast.
    const turnRate = (this.roll / 58) * (46 - Math.min(22, this.speed * 0.22));
    this.heading = (this.heading + turnRate * dt + 360) % 360;

    // Lift: below stall speed the nose drops and the plane sinks.
    this.stalled = this.speed < STALL_SPEED;
    let sink = 0;
    if (this.stalled) {
      sink = (STALL_SPEED - this.speed) * 0.85;
      this.pitch -= dt * 26;
    }
    this.pitch = clamp(this.pitch, -38, 30);

    const f = this.forward();
    this.vspeed = f.y * this.speed - sink;
    this.x += f.x * this.speed * dt;
    this.z += f.z * this.speed * dt;
    this.y += this.vspeed * dt;

    // Fuel burn follows the throttle; an empty tank is a glider.
    if (!this.engineOut) {
      this.fuel -= (0.22 + this.throttle * 0.85) * dt;
      if (this.fuel <= 0) {
        this.fuel = 0;
        this.engineOut = true;
      }
    }
    this.propAngle += dt * (this.engineOut ? 2 : 40 + this.throttle * 130);

    // Ground contact is judged by the caller (landing vs crash), but the
    // model never lets the plane sink through the island.
    if (this.y < groundHeight) this.y = groundHeight;
  }

  // Instruments in aviation units for the HUD.
  get altitudeFt() { return Math.max(0, this.y * 3.28084); }
  get speedKt() { return this.speed * 1.94384; }
  get vspeedFpm() { return this.vspeed * 196.85; }
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// --- Aircraft drawing -----------------------------------------------------
// The plane is a small set of flat-shaded polygons in plane-local space
// (x right, y up, z forward), rotated by yaw/pitch/roll into the world and
// projected by the camera. Drawn last each frame so it sits crisp in the
// chase view; its shadow ellipse on the terrain sells the height.

const FUSELAGE = '#e8eef4';
const ACCENT = '#e4572e';
const WING = '#cfd9e2';
const GLASS = '#7fd4e8';

function localToWorld(plane, lx, ly, lz) {
  // Roll about the forward axis (positive roll = right wing down), then
  // pitch about the right axis (positive pitch = nose up), then yaw.
  const cr = Math.cos(plane.rollRad), sr = Math.sin(plane.rollRad);
  let x = lx * cr + ly * sr;
  let y = -lx * sr + ly * cr;
  let z = lz;
  const cp = Math.cos(plane.pitchRad), sp = Math.sin(plane.pitchRad);
  const y2 = y * cp + z * sp;
  const z2 = -y * sp + z * cp;
  y = y2; z = z2;
  const cy = Math.cos(plane.headingRad), sy = Math.sin(plane.headingRad);
  const x3 = x * cy + z * sy;
  const z3 = -x * sy + z * cy;
  return { x: plane.x + x3, y: plane.y + y, z: plane.z + z3 };
}

function poly(ctx, project, plane, points, colour) {
  const pts = [];
  for (const [lx, ly, lz] of points) {
    const w = localToWorld(plane, lx, ly, lz);
    const p = project(w.x, w.y, w.z);
    if (!p) return;
    pts.push(p);
  }
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fill();
}

export function drawPlane(ctx, project, plane, terrain) {
  // Ground shadow first: a soft dark ellipse under the aircraft.
  const gy = Math.max(terrain.heightAt(plane.x, plane.z), 0) + 0.4;
  const shadow = project(plane.x, gy, plane.z);
  if (shadow) {
    const r = Math.max(6, 3400 / Math.max(40, plane.y - gy + 60));
    ctx.fillStyle = 'rgba(10,20,15,0.26)';
    ctx.beginPath();
    ctx.ellipse(shadow.x, shadow.y, r * 1.6, r * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Wings (drawn before the fuselage so the body overlaps the roots).
  poly(ctx, project, plane, [[-8.6, -0.2, 0.9], [-0.7, -0.15, 1.3], [-0.7, -0.15, -0.7], [-8.6, -0.2, -0.5]], WING);
  poly(ctx, project, plane, [[8.6, -0.2, 0.9], [0.7, -0.15, 1.3], [0.7, -0.15, -0.7], [8.6, -0.2, -0.5]], WING);
  // Wing tips in accent orange.
  poly(ctx, project, plane, [[-8.6, -0.2, 0.9], [-7.2, -0.18, 1.0], [-7.2, -0.18, -0.55], [-8.6, -0.2, -0.5]], ACCENT);
  poly(ctx, project, plane, [[8.6, -0.2, 0.9], [7.2, -0.18, 1.0], [7.2, -0.18, -0.55], [8.6, -0.2, -0.5]], ACCENT);
  // Tailplane and fin.
  poly(ctx, project, plane, [[-2.6, 0.25, -4.6], [2.6, 0.25, -4.6], [2.6, 0.25, -3.7], [-2.6, 0.25, -3.7]], WING);
  poly(ctx, project, plane, [[0, 0.3, -4.7], [0, 1.9, -4.2], [0, 0.3, -3.4]], ACCENT);
  // Fuselage: top deck, sides, belly.
  poly(ctx, project, plane, [[-0.75, 0.45, 3.4], [0.75, 0.45, 3.4], [0.55, 0.7, -3.8], [-0.55, 0.7, -3.8]], FUSELAGE);
  poly(ctx, project, plane, [[-0.75, -0.5, 3.4], [-0.75, 0.45, 3.4], [-0.55, 0.7, -3.8], [-0.5, -0.2, -3.8]], '#d5dde6');
  poly(ctx, project, plane, [[0.75, -0.5, 3.4], [0.75, 0.45, 3.4], [0.55, 0.7, -3.8], [0.5, -0.2, -3.8]], '#d5dde6');
  poly(ctx, project, plane, [[-0.75, -0.5, 3.4], [0.75, -0.5, 3.4], [0.5, -0.2, -3.8], [-0.5, -0.2, -3.8]], '#b9c4cf');
  // Nose cowling and spinner.
  poly(ctx, project, plane, [[-0.75, -0.5, 3.4], [0.75, -0.5, 3.4], [0.75, 0.45, 3.4], [-0.75, 0.45, 3.4]], ACCENT);
  // Canopy glass.
  poly(ctx, project, plane, [[-0.55, 0.62, 1.9], [0.55, 0.62, 1.9], [0.5, 0.95, 0.2], [-0.5, 0.95, 0.2]], GLASS);
  // Propeller: translucent disc plus two blades at the current angle.
  const nose = localToWorld(plane, 0, 0, 3.7);
  const np = project(nose.x, nose.y, nose.z);
  if (np) {
    const discR = Math.max(4, 900 / Math.max(30, np.depth));
    ctx.fillStyle = 'rgba(40,44,52,0.28)';
    ctx.beginPath();
    ctx.arc(np.x, np.y, discR, 0, Math.PI * 2);
    ctx.fill();
    const a = plane.propAngle;
    ctx.strokeStyle = 'rgba(30,34,40,0.85)';
    ctx.lineWidth = Math.max(2, discR * 0.16);
    ctx.beginPath();
    ctx.moveTo(np.x - Math.cos(a) * discR, np.y - Math.sin(a) * discR);
    ctx.lineTo(np.x + Math.cos(a) * discR, np.y + Math.sin(a) * discR);
    ctx.stroke();
  }
}
