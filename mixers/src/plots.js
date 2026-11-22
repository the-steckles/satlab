import { COLORS as C, prepare, ticks, verticalLabel } from '../../lib/plot.js';

export const KINDS = {
  wanted: { name: 'Wanted', color: '#0f9c7e' },
  lo: { name: 'LO leakage', color: '#c9780f' },
  im3: { name: 'Third-order IM', color: '#5f7df0' },
  image: { name: 'Image', color: '#d0559a' },
  spur: { name: 'Other spur', color: '#8a8f2a' },
};

const M = { l: 56, r: 12, t: 12, b: 40 };
const mhzText = (hz, step) => (hz / 1e6).toFixed(step >= 1e6 ? 0 : step >= 1e5 ? 1 : 2);

// Repeatable noise, so the trace does not shimmer when nothing has changed.
const noiseAt = (i) => {
  const x = Math.sin(i * 127.1 + 11.7) * 43758.5453;
  return x - Math.floor(x);
};

export function drawSpectrum(canvas, { list, loHz, hiHz, topDbm, bottomDbm, floorDbm, hoverX }) {
  const { ctx, w, h } = prepare(canvas);
  const pw = w - M.l - M.r, ph = h - M.t - M.b;
  const X = (hz) => M.l + ((hz - loHz) / (hiHz - loHz)) * pw;
  const Y = (db) => M.t + ((topDbm - db) / (topDbm - bottomDbm)) * ph;

  ctx.strokeStyle = C.grid;
  ctx.lineWidth = 1;
  ctx.fillStyle = C.axis;
  ctx.textAlign = 'right';
  ctx.beginPath();
  for (const db of ticks(bottomDbm, topDbm, 6).values) {
    const y = Math.round(Y(db)) + 0.5;
    ctx.moveTo(M.l, y); ctx.lineTo(M.l + pw, y);
    ctx.fillText(`${db}`, M.l - 6, y + 4);
  }
  const fx = ticks(loHz, hiHz, Math.max(2, Math.floor(pw / 90)));
  ctx.textAlign = 'center';
  for (const hz of fx.values) {
    const x = Math.round(X(hz)) + 0.5;
    ctx.moveTo(x, M.t); ctx.lineTo(x, M.t + ph);
    ctx.fillText(mhzText(hz, fx.step), Math.max(M.l + 20, Math.min(M.l + pw - 20, x)), h - 23);
  }
  ctx.stroke();
  ctx.fillText('Frequency (MHz)', M.l + pw / 2, h - 6);
  verticalLabel(ctx, 'Level (dBm)', 13, M.t + ph / 2);

  ctx.save();
  ctx.beginPath();
  ctx.rect(M.l, M.t, pw, ph);
  ctx.clip();
  ctx.strokeStyle = '#4b5b67';
  ctx.beginPath();
  for (let px = 0; px <= pw; px += 2) {
    // Log-detected noise averages about 2.5 dB below its power level and has a long low tail.
    const y = Y(floorDbm - 2.5 + 10 * Math.log10(-Math.log(Math.max(1e-3, noiseAt(px)))));
    if (px) ctx.lineTo(M.l + px, y); else ctx.moveTo(M.l + px, y);
  }
  ctx.stroke();

  const visible = list.filter((p) => p.hz >= loHz && p.hz <= hiHz && p.dbm > floorDbm);
  ctx.lineWidth = 2;
  for (const p of [...visible].reverse()) {
    const x = X(p.hz);
    ctx.strokeStyle = KINDS[p.kind].color;
    ctx.beginPath();
    ctx.moveTo(x, Y(floorDbm));
    ctx.lineTo(x, Y(p.dbm));
    ctx.stroke();
  }
  ctx.lineWidth = 1;

  // Label the strongest products that fit, and leave the rest to hover and the table.
  ctx.fillStyle = C.text;
  ctx.textAlign = 'center';
  const placed = [];
  for (const p of visible) {
    if (placed.length >= 7) break;
    const width = ctx.measureText(p.label).width + 8, x = Math.max(M.l + width / 2, Math.min(M.l + pw - width / 2, X(p.hz)));
    const y = Math.max(M.t + 11, Y(p.dbm) - 5);
    if (placed.some((b) => Math.abs(b.x - x) < (b.width + width) / 2 && Math.abs(b.y - y) < 13)) continue;
    placed.push({ x, y, width });
    ctx.fillText(p.label, x, y);
  }
  ctx.restore();

  let hit = null;
  if (hoverX !== null && hoverX !== undefined) {
    let best = 14;
    for (const p of visible) {
      const d = Math.abs(X(p.hz) - hoverX);
      if (d < best) { best = d; hit = p; }
    }
  }
  if (hit) {
    const x = X(hit.hz), y = Y(hit.dbm);
    ctx.strokeStyle = C.marker;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(x, M.t); ctx.lineTo(x, M.t + ph); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = KINDS[hit.kind].color;
    ctx.strokeStyle = C.bg;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.lineWidth = 1;
    const rows = [hit.label, `${(hit.hz / 1e6).toFixed(3)} MHz`, `${hit.dbm.toFixed(1)} dBm`, KINDS[hit.kind].name];
    if (hit.parts.length > 1) rows.push(`${hit.parts.length} products overlap`);
    const bw = Math.max(...rows.map((r) => ctx.measureText(r).width)) + 14, bh = rows.length * 15 + 8;
    const bx = x + bw + 12 > w - M.r ? x - bw - 10 : x + 10, by = Math.max(M.t + 2, Math.min(M.t + ph - bh - 2, y - bh / 2));
    ctx.fillStyle = '#141c24';
    ctx.strokeStyle = '#26333e';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    ctx.fillStyle = C.text;
    ctx.textAlign = 'left';
    rows.forEach((r, i) => ctx.fillText(r, bx + 7, by + 16 + i * 15));
  }
  return hit;
}

export function drawSlope(canvas, data, operatingPin) {
  const { ctx, w, h } = prepare(canvas);
  if (!data) {
    ctx.fillStyle = C.axis;
    ctx.textAlign = 'center';
    ctx.fillText('measuring…', w / 2, h / 2);
    return;
  }
  const m = { l: 48, r: 10, t: 10, b: 34 };
  const pw = w - m.l - m.r, ph = h - m.t - m.b;
  const pts = data.points, loX = pts[0].pin, hiX = pts.at(-1).pin;
  const ip = data.oip3 ?? pts.at(-1).single;
  const hiY = Math.ceil((Math.max(ip, ...pts.map((p) => p.single)) + 4) / 10) * 10;
  const loY = hiY - Math.max(60, Math.min(120, (hiX - loX) * 2));
  const X = (v) => m.l + ((v - loX) / (hiX - loX)) * pw, Y = (v) => m.t + ((hiY - v) / (hiY - loY)) * ph;

  ctx.strokeStyle = C.grid;
  ctx.fillStyle = C.axis;
  ctx.textAlign = 'right';
  ctx.beginPath();
  for (const v of ticks(loY, hiY, 5).values) {
    const y = Math.round(Y(v)) + 0.5;
    ctx.moveTo(m.l, y); ctx.lineTo(m.l + pw, y);
    ctx.fillText(`${v}`, m.l - 5, y + 4);
  }
  ctx.textAlign = 'center';
  for (const v of ticks(loX, hiX, Math.max(3, Math.floor(pw / 60))).values) {
    const x = Math.round(X(v)) + 0.5;
    ctx.moveTo(x, m.t); ctx.lineTo(x, m.t + ph);
    ctx.fillText(`${v}`, x, h - 20);
  }
  ctx.stroke();
  ctx.fillText('Input per tone (dBm)', m.l + pw / 2, h - 5);
  verticalLabel(ctx, 'Output (dBm)', 11, m.t + ph / 2);

  ctx.save();
  ctx.beginPath();
  ctx.rect(m.l, m.t, pw, ph);
  ctx.clip();
  const line = (key, color) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    let started = false;
    for (const p of pts) {
      if (!Number.isFinite(p[key])) continue;
      if (started) ctx.lineTo(X(p.pin), Y(p[key])); else { ctx.moveTo(X(p.pin), Y(p[key])); started = true; }
    }
    ctx.stroke();
    ctx.lineWidth = 1;
  };
  // Dashed extrapolations from the low-level slopes meet at the intercept.
  if (data.oip3 !== null) {
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#6b7c88';
    ctx.beginPath();
    ctx.moveTo(X(loX), Y(loX + data.gain)); ctx.lineTo(X(data.iip3), Y(data.oip3));
    ctx.moveTo(X(data.iip3 - 40), Y(data.oip3 - 120)); ctx.lineTo(X(data.iip3), Y(data.oip3));
    ctx.stroke();
    ctx.setLineDash([]);
  }
  line('im3', '#5f7df0');
  line('single', '#0f9c7e');
  if (Number.isFinite(operatingPin) && operatingPin >= loX && operatingPin <= hiX) {
    ctx.strokeStyle = C.marker;
    ctx.beginPath();
    ctx.moveTo(X(operatingPin), m.t); ctx.lineTo(X(operatingPin), m.t + ph);
    ctx.stroke();
  }
  const dot = (x, y, color) => {
    ctx.fillStyle = color;
    ctx.strokeStyle = C.bg;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(X(x), Y(y), 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.lineWidth = 1;
  };
  ctx.font = '10px ui-monospace, Consolas, monospace';
  ctx.fillStyle = C.text;
  if (data.p1dB) {
    dot(data.p1dB.pin, data.p1dB.pout, '#c9780f');
    ctx.fillStyle = C.text;
    ctx.textAlign = 'right';
    ctx.fillText('P1dB', X(data.p1dB.pin) - 7, Y(data.p1dB.pout) - 6);
  }
  if (data.oip3 !== null) {
    dot(data.iip3, data.oip3, '#ffffff');
    ctx.fillStyle = C.text;
    ctx.textAlign = 'right';
    ctx.fillText('IP3', X(data.iip3) - 7, Y(data.oip3) + 3);
  }
  ctx.restore();
}
