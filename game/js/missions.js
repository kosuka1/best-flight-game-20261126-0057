// missions.js — the Skylane Runner course: six rings, then land.
//
// The course is a fixed slalom over the island: each ring hangs in the air
// facing the direction of travel from the previous one, so the route reads
// as a ribbon the pilot follows. Only the next ring counts. After the last
// ring the mission becomes the landing: put the plane on the runway strip
// gently, wings level, and the sortie is scored on rings, landing quality
// and the fuel left in the tank.

import { RUNWAY } from './terrain.js';

export const RING_RADIUS = 34;      // metres — generous, but not free
export const RING_POINTS = 250;
export const LANDING_POINTS = 600;

// Ring centres (x east, y up, z north) and the heading each one faces.
const COURSE = [
  { x: 0,    y: 150, z: -900,  face: 0 },
  { x: 620,  y: 190, z: -260,  face: 55 },
  { x: 1250, y: 240, z: 420,   face: 40 },
  { x: 520,  y: 300, z: 1180,  face: 315 },
  { x: -560, y: 260, z: 760,   face: 250 },
  { x: -420, y: 170, z: -180,  face: 195 },
];

export class Mission {
  constructor() {
    this.reset();
  }

  reset() {
    this.rings = COURSE.map((r) => ({ ...r, passed: false }));
    this.nextIndex = 0;
    this.phase = 'rings';        // 'rings' -> 'landing' -> 'done'
    this.score = 0;
    this.ringsFlown = 0;
    this.landingGrade = null;    // 'greaser' | 'firm' | 'rough'
    this.message = '';
    this.messageUntil = 0;
    this.lastPlanePos = null;
  }

  get nextRing() {
    return this.phase === 'rings' ? this.rings[this.nextIndex] : null;
  }

  // Where the HUD arrow should point: the next ring, or the runway centre.
  get target() {
    if (this.phase === 'rings') return this.rings[this.nextIndex];
    return { x: RUNWAY.x, y: RUNWAY.height + 30, z: (RUNWAY.zSouth + RUNWAY.zNorth) / 2 };
  }

  get targetLabel() {
    if (this.phase === 'rings') return `RING ${this.nextIndex + 1} OF ${this.rings.length}`;
    if (this.phase === 'landing') return 'LAND ON THE RUNWAY';
    return 'SORTIE COMPLETE';
  }

  // Check whether the segment lastPos -> planePos threads the next ring:
  // the segment must cross the ring's plane inside the ring's radius.
  checkRingPass(plane, nowMs) {
    const ring = this.nextRing;
    if (!ring) return false;
    const prev = this.lastPlanePos ?? { x: plane.x, y: plane.y, z: plane.z };
    this.lastPlanePos = { x: plane.x, y: plane.y, z: plane.z };
    const faceRad = (ring.face * Math.PI) / 180;
    const nx = Math.sin(faceRad), nz = Math.cos(faceRad); // ring plane normal
    const dPrev = (prev.x - ring.x) * nx + (prev.z - ring.z) * nz;
    const dNow = (plane.x - ring.x) * nx + (plane.z - ring.z) * nz;
    if (dPrev === 0 || Math.sign(dPrev) === Math.sign(dNow)) return false;
    // Crossing point along the segment.
    const t = dPrev / (dPrev - dNow);
    const cx = prev.x + (plane.x - prev.x) * t;
    const cy = prev.y + (plane.y - prev.y) * t;
    const cz = prev.z + (plane.z - prev.z) * t;
    const dist = Math.hypot(cx - ring.x, cy - ring.y, cz - ring.z);
    if (dist > RING_RADIUS) return false;
    ring.passed = true;
    this.ringsFlown++;
    this.score += RING_POINTS;
    this.nextIndex++;
    if (this.nextIndex >= this.rings.length) {
      this.phase = 'landing';
      this.message = 'ALL RINGS! NOW LAND ON THE RUNWAY';
    } else {
      this.message = `RING ${this.ringsFlown} CLEAR  +${RING_POINTS}`;
    }
    this.messageUntil = nowMs + 2600;
    return true;
  }

  // Judge a touchdown. Returns 'landed' | 'crashed' | null (still flying).
  judgeTouchdown(plane, terrain) {
    const ground = Math.max(terrain.heightAt(plane.x, plane.z), 0);
    if (plane.y > ground + 1.2) return null;
    const gentle = plane.vspeed > -6.5 && plane.speed < 52 && Math.abs(plane.roll) < 14;
    const onStrip = terrain.onRunway(plane.x, plane.z, 6);
    if (onStrip && gentle) {
      this.landingGrade = plane.vspeed > -2.2 ? 'greaser' : plane.vspeed > -4.5 ? 'firm' : 'rough';
      const bonus = this.landingGrade === 'greaser' ? 300 : this.landingGrade === 'firm' ? 150 : 50;
      this.score += LANDING_POINTS + bonus;
      this.phase = 'done';
      return 'landed';
    }
    // A slow, gentle arrival on grass is survivable but scores nothing.
    if (!onStrip && plane.vspeed > -4 && plane.speed < 34 && Math.abs(plane.roll) < 10 && ground > 0.5) {
      this.landingGrade = 'field';
      this.phase = 'done';
      return 'landed';
    }
    return 'crashed';
  }

  fuelBonus(plane) {
    return Math.round(plane.fuel * 4);
  }
}

// Draw the rings: the next one gold and pulsing, the rest pale. Each ring
// is a circle of short segments in its facing plane, stroked thick so it
// reads at distance and in a shrunk screenshot.
export function drawRings(ctx, project, mission, nowMs) {
  for (let i = mission.rings.length - 1; i >= 0; i--) {
    const ring = mission.rings[i];
    if (ring.passed) continue;
    const isNext = i === mission.nextIndex && mission.phase === 'rings';
    const faceRad = (ring.face * Math.PI) / 180;
    // Ring plane basis: right vector and up vector.
    const rx = Math.cos(faceRad), rz = -Math.sin(faceRad);
    const pulse = isNext ? 1 + Math.sin(nowMs / 280) * 0.06 : 1;
    const R = RING_RADIUS * pulse;
    const pts = [];
    let ok = true;
    for (let s = 0; s <= 28; s++) {
      const a = (s / 28) * Math.PI * 2;
      const px = ring.x + rx * Math.cos(a) * R;
      const py = ring.y + Math.sin(a) * R;
      const pz = ring.z + rz * Math.cos(a) * R;
      const p = project(px, py, pz);
      if (!p) { ok = false; break; }
      pts.push(p);
    }
    if (!ok) continue;
    const depth = pts[0].depth;
    ctx.strokeStyle = isNext ? '#ffc21f' : 'rgba(150,205,240,0.75)';
    ctx.lineWidth = Math.max(3, Math.min(16, 2600 / Math.max(60, depth)));
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (const p of pts) ctx.lineTo(p.x, p.y);
    ctx.closePath();
    ctx.stroke();
    if (isNext) {
      // A soft glow pass so the target ring pops against the terrain.
      ctx.strokeStyle = 'rgba(255,194,31,0.35)';
      ctx.lineWidth *= 2.4;
      ctx.stroke();
      // Number tag above the ring.
      const top = project(ring.x, ring.y + R + 12, ring.z);
      if (top) {
        ctx.fillStyle = '#ffc21f';
        ctx.font = `bold ${Math.max(14, Math.min(34, 1500 / Math.max(60, depth)))}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(String(i + 1), top.x, top.y);
      }
    }
  }
}
