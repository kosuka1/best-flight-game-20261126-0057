// terrain.js — the island Skylane Runner flies over.
//
// A seeded heightfield (value noise + island falloff) with a flattened
// runway strip carved into its southern flats. The same height function
// feeds three jobs: the polygon renderer below, the flight model's ground
// collision, and the plane's ground shadow. Everything is deterministic
// for a given seed so every player races the same island.

export const WORLD_SIZE = 4800;          // metres, square
export const GRID_CELLS = 96;            // cells per side
export const CELL = WORLD_SIZE / GRID_CELLS;
export const WATER_Y = 0;

// Runway: a north-south strip on the southern flats. Heading 360/180.
export const RUNWAY = {
  x: 0,            // centreline easting
  zSouth: -1150,   // threshold 36 end (south)
  zNorth: -350,    // threshold 18 end (north)
  halfWidth: 26,
  height: 3,
};

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Terrain {
  constructor(seed = 7) {
    this.seed = seed;
    this.heights = new Float32Array((GRID_CELLS + 1) * (GRID_CELLS + 1));
    this.buildHeightfield();
  }

  buildHeightfield() {
    const rand = mulberry32(this.seed * 2654435761);
    // A handful of smooth hills scattered over the island.
    const hills = [];
    for (let i = 0; i < 26; i++) {
      hills.push({
        x: (rand() - 0.5) * WORLD_SIZE * 0.86,
        z: (rand() - 0.5) * WORLD_SIZE * 0.86,
        r: 420 + rand() * 900,
        h: 16 + rand() * 56,
      });
    }
    const half = WORLD_SIZE / 2;
    for (let gz = 0; gz <= GRID_CELLS; gz++) {
      for (let gx = 0; gx <= GRID_CELLS; gx++) {
        const x = gx * CELL - half;
        const z = gz * CELL - half;
        // Island falloff: the rim sinks below the sea.
        const d = Math.max(Math.abs(x), Math.abs(z)) / half;
        const rim = Math.max(0, 1 - Math.pow(Math.max(0, d - 0.62) / 0.38, 1.6));
        let h = -14 + rim * 16;
        for (const hill of hills) {
          const dx = x - hill.x;
          const dz = z - hill.z;
          const q = (dx * dx + dz * dz) / (hill.r * hill.r);
          if (q < 1) h += hill.h * rim * (1 - q) * (1 - q);
        }
        // Gentle rolling detail so the flats are not billiard-smooth.
        h += rim * (Math.sin(x * 0.004 + z * 0.0021) + Math.cos(z * 0.005 - x * 0.0017)) * 2.4;
        // Carve the runway strip flat, blending at the edges.
        const rx = Math.abs(x - RUNWAY.x);
        const inZ = z > RUNWAY.zSouth - 160 && z < RUNWAY.zNorth + 160;
        if (inZ && rx < RUNWAY.halfWidth + 130) {
          const edge = Math.max(0, Math.min(1, (RUNWAY.halfWidth + 130 - rx) / 130));
          const zend = Math.max(0, Math.min(1, Math.min(z - (RUNWAY.zSouth - 160), (RUNWAY.zNorth + 160) - z) / 160));
          const k = Math.min(edge, zend);
          h = h * (1 - k) + RUNWAY.height * k;
        }
        this.heights[gz * (GRID_CELLS + 1) + gx] = h;
      }
    }
  }

  // Bilinear height at world (x, z). Outside the island the sea floor wins.
  heightAt(x, z) {
    const half = WORLD_SIZE / 2;
    const fx = (x + half) / CELL;
    const fz = (z + half) / CELL;
    if (fx < 0 || fz < 0 || fx > GRID_CELLS || fz > GRID_CELLS) return -20;
    const gx = Math.min(GRID_CELLS - 1, Math.floor(fx));
    const gz = Math.min(GRID_CELLS - 1, Math.floor(fz));
    const tx = fx - gx;
    const tz = fz - gz;
    const row = GRID_CELLS + 1;
    const h00 = this.heights[gz * row + gx];
    const h10 = this.heights[gz * row + gx + 1];
    const h01 = this.heights[(gz + 1) * row + gx];
    const h11 = this.heights[(gz + 1) * row + gx + 1];
    return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
  }

  onRunway(x, z, margin = 0) {
    return Math.abs(x - RUNWAY.x) <= RUNWAY.halfWidth + margin &&
      z >= RUNWAY.zSouth - margin && z <= RUNWAY.zNorth + margin;
  }

  // Flat-shade colour for a cell from its average height and steepness.
  cellColour(hAvg, steep) {
    if (hAvg <= WATER_Y + 0.4) return '#2e6da8';            // sea
    if (hAvg < 5) return '#d9c48a';                          // sand
    if (steep > 0.55) return hAvg > 70 ? '#8d8d94' : '#7a6a55'; // rock
    if (hAvg > 95) return '#e8ecef';                         // snow caps
    if (hAvg > 48) return '#6f8f57';                         // high meadow
    return '#7fae5f';                                        // grass
  }
}

// Draw the island as flat-shaded quads, far to near, through the camera
// projector supplied by main.js. Cells on the runway strip are asphalt.
export function drawTerrain(ctx, terrain, project, camPos, viewRange = 2800) {
  const half = WORLD_SIZE / 2;
  const row = GRID_CELLS + 1;
  const cells = [];
  for (let gz = 0; gz < GRID_CELLS; gz++) {
    for (let gx = 0; gx < GRID_CELLS; gx++) {
      const x0 = gx * CELL - half;
      const z0 = gz * CELL - half;
      const cx = x0 + CELL / 2;
      const cz = z0 + CELL / 2;
      const dx = cx - camPos.x;
      const dz = cz - camPos.z;
      const dist2 = dx * dx + dz * dz;
      if (dist2 > viewRange * viewRange) continue;
      const h00 = terrain.heights[gz * row + gx];
      const h10 = terrain.heights[gz * row + gx + 1];
      const h01 = terrain.heights[(gz + 1) * row + gx];
      const h11 = terrain.heights[(gz + 1) * row + gx + 1];
      cells.push({ x0, z0, h00, h10, h01, h11, dist2 });
    }
  }
  cells.sort((a, b) => b.dist2 - a.dist2);
  for (const c of cells) {
    const hAvg = (c.h00 + c.h10 + c.h01 + c.h11) / 4;
    const steep = Math.max(
      Math.abs(c.h10 - c.h00), Math.abs(c.h01 - c.h00),
      Math.abs(c.h11 - c.h10), Math.abs(c.h11 - c.h01)) / CELL;
    const cx = c.x0 + CELL / 2;
    const cz = c.z0 + CELL / 2;
    let colour;
    if (terrain.onRunway(cx, cz, 4) && hAvg > WATER_Y) {
      colour = '#3c4147'; // asphalt
    } else {
      colour = terrain.cellColour(Math.max(hAvg, WATER_Y), steep);
    }
    // Sea cells render as a flat water quad at WATER_Y.
    const wy = (h) => (hAvg <= WATER_Y + 0.4 ? WATER_Y : h);
    const p1 = project(c.x0, wy(c.h00), c.z0);
    const p2 = project(c.x0 + CELL, wy(c.h10), c.z0);
    const p3 = project(c.x0 + CELL, wy(c.h11), c.z0 + CELL);
    const p4 = project(c.x0, wy(c.h01), c.z0 + CELL);
    if (!p1 || !p2 || !p3 || !p4) continue;
    // Cheap distance haze: blend toward sky blue with range.
    const haze = Math.min(0.38, Math.sqrt(c.dist2) / viewRange * 0.38);
    ctx.fillStyle = shadeWithHaze(colour, haze);
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.lineTo(p4.x, p4.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke(); // seals hairline gaps between neighbouring cells
  }
  drawRunwayMarkings(ctx, project);
}

function shadeWithHaze(hex, k) {
  if (k <= 0.01) return hex;
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const hr = 150, hg = 185, hb = 220;
  const mix = (a, b2) => Math.round(a + (b2 - a) * k);
  return `rgb(${mix(r, hr)},${mix(g, hg)},${mix(b, hb)})`;
}

// White threshold bars, centreline dashes and edge lines on the strip.
function drawRunwayMarkings(ctx, project) {
  const y = RUNWAY.height + 0.15;
  const quad = (x1, z1, x2, z2, colour) => {
    const a = project(x1, y, z1), b = project(x2, y, z1);
    const c = project(x2, y, z2), d = project(x1, y, z2);
    if (!a || !b || !c || !d) return;
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
    ctx.closePath(); ctx.fill();
  };
  // Threshold piano keys at both ends.
  for (const zEnd of [RUNWAY.zSouth, RUNWAY.zNorth]) {
    const dir = zEnd === RUNWAY.zSouth ? 1 : -1;
    for (let i = -3; i <= 3; i++) {
      quad(RUNWAY.x + i * 6 - 1.6, zEnd, RUNWAY.x + i * 6 + 1.6, zEnd + dir * 34, '#e8e8e8');
    }
  }
  // Centreline dashes.
  for (let z = RUNWAY.zSouth + 60; z < RUNWAY.zNorth - 60; z += 46) {
    quad(RUNWAY.x - 1.1, z, RUNWAY.x + 1.1, z + 24, '#dfe3e6');
  }
  // Edge lines.
  quad(RUNWAY.x - RUNWAY.halfWidth, RUNWAY.zSouth, RUNWAY.x - RUNWAY.halfWidth + 1.4, RUNWAY.zNorth, '#cfd4d8');
  quad(RUNWAY.x + RUNWAY.halfWidth - 1.4, RUNWAY.zSouth, RUNWAY.x + RUNWAY.halfWidth, RUNWAY.zNorth, '#cfd4d8');
}
