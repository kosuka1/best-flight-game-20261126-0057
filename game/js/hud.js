// hud.js — the Skylane Runner instrument panel.
//
// Everything the pilot flies by, drawn big enough to read when the frame
// is shrunk to a thumbnail: a compass strip across the top, speed and
// altitude tapes down the sides with digital readouts, an artificial
// horizon in the middle, fuel and throttle bars, the mission banner, a
// target arrow with distance, and the title / debrief screens.

const INK = '#eaf6ff';
const DIM = 'rgba(234,246,255,0.62)';
const PANEL = 'rgba(8,22,38,0.55)';
const GOLD = '#ffc21f';
const WARN = '#ff5a4e';

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = PANEL;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(180,220,250,0.35)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function text(ctx, str, x, y, size, colour = INK, align = 'center', weight = 'bold') {
  ctx.fillStyle = colour;
  ctx.font = `${weight} ${size}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(str, x, y);
}

export function drawHud(ctx, W, H, plane, mission, nowMs) {
  drawCompass(ctx, W, plane);
  drawSpeedTape(ctx, H, plane);
  drawAltitudeTape(ctx, W, H, plane);
  drawHorizon(ctx, W, H, plane);
  drawFuelAndThrottle(ctx, H, plane);
  drawMissionBanner(ctx, W, plane, mission, nowMs);
  drawWarnings(ctx, W, H, plane, nowMs);
}

function drawCompass(ctx, W, plane) {
  const w = 460, x = W / 2 - w / 2, y = 14;
  panel(ctx, x, y, w, 52);
  const pxPerDeg = w / 90;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x + 6, y + 4, w - 12, 44);
  ctx.clip();
  // Ticks: walk headings around the current one.
  for (let off = -50; off <= 50; off += 5) {
    const hdg = ((Math.round((plane.heading + off) / 5) * 5) % 360 + 360) % 360;
    const rel = ((hdg - plane.heading + 540) % 360) - 180;
    const tx = W / 2 + rel * pxPerDeg;
    const major = hdg % 30 === 0;
    ctx.strokeStyle = DIM;
    ctx.lineWidth = major ? 2.5 : 1.2;
    ctx.beginPath();
    ctx.moveTo(tx, y + 38);
    ctx.lineTo(tx, y + (major ? 24 : 31));
    ctx.stroke();
    if (major) {
      const label = hdg === 0 ? 'N' : hdg === 90 ? 'E' : hdg === 180 ? 'S' : hdg === 270 ? 'W' : String(hdg / 10);
      text(ctx, label, tx, y + 15, 15, hdg % 90 === 0 ? GOLD : INK);
    }
  }
  ctx.restore();
  // Current heading readout in the middle.
  panel(ctx, W / 2 - 34, y + 40, 68, 30);
  text(ctx, `${String(Math.round(plane.heading) % 360).padStart(3, '0')}°`, W / 2, y + 56, 20, GOLD);
}

function drawTape(ctx, x, y, w, h, value, step, label, unit, colour = INK) {
  panel(ctx, x, y, w, h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x + 4, y + 4, w - 8, h - 8);
  ctx.clip();
  const pxPerUnit = h / (step * 6);
  const base = Math.round(value / step) * step;
  for (let v = base - step * 4; v <= base + step * 4; v += step) {
    if (v < 0) continue;
    const ty = y + h / 2 - (v - value) * pxPerUnit;
    ctx.strokeStyle = DIM;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + w - 22, ty);
    ctx.lineTo(x + w - 8, ty);
    ctx.stroke();
    text(ctx, String(v), x + w - 30, ty, 15, DIM, 'right');
  }
  ctx.restore();
  // Digital readout at the centre.
  panel(ctx, x + 6, y + h / 2 - 20, w - 12, 40);
  text(ctx, String(Math.round(value)), x + w / 2, y + h / 2 - 4, 26, colour);
  text(ctx, unit, x + w / 2, y + h / 2 + 15, 11, DIM);
  text(ctx, label, x + w / 2, y - 12, 13, DIM);
}

function drawSpeedTape(ctx, H, plane) {
  drawTape(ctx, 16, H / 2 - 130, 96, 260, plane.speedKt, 10, 'SPEED', 'KNOTS',
    plane.stalled ? WARN : INK);
}

function drawAltitudeTape(ctx, W, H, plane) {
  drawTape(ctx, W - 112, H / 2 - 130, 96, 260, plane.altitudeFt, 100, 'ALTITUDE', 'FEET');
  // Vertical speed under the altitude tape.
  const vs = Math.round(plane.vspeedFpm / 10) * 10;
  text(ctx, `${vs >= 0 ? '+' : ''}${vs} FPM`, W - 64, H / 2 + 152, 15, vs < -700 ? WARN : DIM);
}

function drawHorizon(ctx, W, H, plane) {
  const cx = W / 2, cy = H / 2 - 122, r = 54;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(-plane.rollRad);
  const pitchPx = plane.pitch * 2.2;
  ctx.fillStyle = '#4d94d6';
  ctx.fillRect(-r * 2, -r * 2 + pitchPx, r * 4, r * 2);
  ctx.fillStyle = '#8a6a44';
  ctx.fillRect(-r * 2, pitchPx, r * 4, r * 2);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-r * 2, pitchPx);
  ctx.lineTo(r * 2, pitchPx);
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = 'rgba(234,246,255,0.8)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  // Fixed aircraft symbol.
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(cx - 34, cy);
  ctx.lineTo(cx - 10, cy);
  ctx.lineTo(cx, cy + 7);
  ctx.lineTo(cx + 10, cy);
  ctx.lineTo(cx + 34, cy);
  ctx.stroke();
}

function drawFuelAndThrottle(ctx, H, plane) {
  const x = 16, y = H - 108, w = 210;
  panel(ctx, x, y, w, 92);
  text(ctx, 'FUEL', x + 12, y + 18, 13, DIM, 'left');
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(x + 12, y + 28, w - 24, 14);
  const frac = Math.max(0, plane.fuel / 100);
  ctx.fillStyle = frac < 0.18 ? WARN : frac < 0.4 ? '#ffb84d' : '#58c472';
  ctx.fillRect(x + 12, y + 28, (w - 24) * frac, 14);
  text(ctx, plane.engineOut ? 'ENGINE OUT' : `${Math.round(plane.fuel)}%`, x + w - 12, y + 18, 13,
    plane.engineOut ? WARN : INK, 'right');
  text(ctx, 'THROTTLE', x + 12, y + 58, 13, DIM, 'left');
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(x + 12, y + 68, w - 24, 12);
  ctx.fillStyle = '#7fd4e8';
  ctx.fillRect(x + 12, y + 68, (w - 24) * plane.throttle, 12);
  if (plane.damage > 0) {
    text(ctx, `DAMAGE ${Math.round(plane.damage)}%`, x + w - 12, y + 58, 13, WARN, 'right');
  }
}

function drawMissionBanner(ctx, W, plane, mission, nowMs) {
  const w = 520, x = W / 2 - w / 2, y = 86;
  panel(ctx, x, y, w, 58);
  text(ctx, mission.targetLabel, W / 2, y + 20, 24, GOLD);
  const t = mission.target;
  const dx = t.x - plane.x, dz = t.z - plane.z;
  const dist = Math.hypot(dx, dz);
  const bearing = (Math.atan2(dx, dz) * 180) / Math.PI;
  const rel = ((bearing - plane.heading + 540) % 360) - 180;
  const arrow = Math.abs(rel) < 12 ? '▲' : rel > 0 ? '▶' : '◀';
  text(ctx, `${arrow} ${Math.round(dist)} m`, W / 2, y + 44, 17, INK);
  // Score, top right.
  panel(ctx, W - 196, 14, 180, 52);
  text(ctx, 'SCORE', W - 106, 28, 12, DIM);
  text(ctx, String(mission.score), W - 106, 50, 26, INK);
  if (mission.message && nowMs < mission.messageUntil) {
    text(ctx, mission.message, W / 2, y + 92, 30, GOLD);
  }
}

function drawWarnings(ctx, W, H, plane, nowMs) {
  const blink = Math.floor(nowMs / 420) % 2 === 0;
  if (plane.stalled && blink) {
    text(ctx, 'STALL', W / 2, H / 2 + 130, 40, WARN);
  }
  if (plane.fuel < 18 && !plane.engineOut && blink) {
    text(ctx, 'LOW FUEL', W / 2, H / 2 + 172, 26, WARN);
  }
}

// --- Full-screen states ----------------------------------------------------

export function drawTitleScreen(ctx, W, H, nowMs) {
  ctx.fillStyle = 'rgba(6,18,32,0.55)';
  ctx.fillRect(0, 0, W, H);
  text(ctx, 'SKYLANE RUNNER', W / 2, H * 0.3, 84, '#ffffff');
  text(ctx, 'Thread six rings over the island, then land on the runway — before the fuel does.', W / 2, H * 0.3 + 58, 21, DIM);
  const lines = [
    'W / S or mouse wheel — throttle        Arrows / A D — pitch and bank',
    'Mouse — steer toward the pointer        C — camera        P — pause        R — restart',
    'Fly through the gold ring, in order. Land gently on the strip to finish the sortie.',
  ];
  lines.forEach((line, i) => text(ctx, line, W / 2, H * 0.52 + i * 34, 19, INK));
  if (Math.floor(nowMs / 600) % 2 === 0) {
    text(ctx, 'PRESS ENTER OR CLICK TO FLY', W / 2, H * 0.74, 30, GOLD);
  }
}

export function drawDebrief(ctx, W, H, plane, mission, outcome) {
  ctx.fillStyle = 'rgba(6,18,32,0.62)';
  ctx.fillRect(0, 0, W, H);
  if (outcome === 'landed') {
    text(ctx, 'SORTIE COMPLETE', W / 2, H * 0.26, 64, '#ffffff');
    const gradeText = {
      greaser: 'A greaser of a landing.', firm: 'A firm arrival, safely down.',
      rough: 'Rough, but the plane is in one piece.', field: 'Down in a field — walk home.',
    }[mission.landingGrade] ?? '';
    text(ctx, gradeText, W / 2, H * 0.26 + 52, 22, DIM);
  } else {
    text(ctx, 'CRASHED', W / 2, H * 0.26, 64, WARN);
    text(ctx, 'The island wins this one. Check the sink rate and try again.', W / 2, H * 0.26 + 52, 22, DIM);
  }
  const fuelBonus = outcome === 'landed' ? mission.fuelBonus(plane) : 0;
  const rows = [
    ['Rings flown', `${mission.ringsFlown} of ${mission.rings.length}`],
    ['Ring points', String(mission.ringsFlown * 250)],
    ['Landing', mission.landingGrade ? mission.landingGrade.toUpperCase() : '—'],
    ['Fuel bonus', String(fuelBonus)],
    ['TOTAL SCORE', String(mission.score + fuelBonus)],
  ];
  rows.forEach(([k, v], i) => {
    const y = H * 0.42 + i * 40;
    text(ctx, k, W / 2 - 190, y, 21, DIM, 'left');
    text(ctx, v, W / 2 + 190, y, 21, i === rows.length - 1 ? GOLD : INK, 'right');
  });
  text(ctx, 'PRESS R TO FLY AGAIN', W / 2, H * 0.42 + rows.length * 40 + 44, 26, GOLD);
}

export function drawPaused(ctx, W, H) {
  ctx.fillStyle = 'rgba(6,18,32,0.5)';
  ctx.fillRect(0, 0, W, H);
  text(ctx, 'PAUSED', W / 2, H / 2, 56, '#ffffff');
  text(ctx, 'P to resume', W / 2, H / 2 + 48, 20, DIM);
}
