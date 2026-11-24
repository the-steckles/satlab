import { COLORS as C, prepare, ticks, verticalLabel } from '../../lib/plot.js';

export const KINDS = {
  wanted: { name: 'Wanted', color: '#0f9c7e' },
  lo: { name: 'LO leakage', color: '#c9780f' },
  im3: { name: 'Third-order IM', color: '#5f7df0' },
  image: { name: 'Image', color: '#d0559a' },
  spur: { name: 'Other spur', color: '#8a8f2a' },
};

export const M = { l: 56, r: 12, t: 12, b: 40 };
const mhzText = (hz, step) => (hz / 1e6).toFixed(step >= 1e6 ? 0 : step >= 1e5 ? 1 : 2);

// Repeatable noise, so the trace does not shimmer when nothing has changed.
const randomAt = (i) => {
  const x = Math.sin(i * 127.1 + 11.7) * 43758.5453;
  return x - Math.floor(x);
};

export function drawSpectrum(canvas, { list, loHz, hiHz, topDbm, bottomDbm, floorDbm, noiseAt = () => floorDbm, hoverX }) {
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
  const fx = ticks(loHz, hiHz, Math.max(3, Math.floor(pw / 90)));
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
  const noiseFloorAt = noiseAt;
  ctx.strokeStyle = '#4b5b67';
  ctx.beginPath();
  // Like an analyzer's peak detector, each point shows the highest level in its slice of frequency, so a
  // filter passband narrower than a pixel still shows, and every product's line meets the trace.
  // Points sit on fixed frequency bins and draw their noise from the bin number, so dragging moves the noise
  // with the signals instead of sliding the signals over a frozen pattern.
  const bucket = ((hiHz - loHz) / pw) * 2;
  for (let bin = Math.floor(loHz / bucket), first = true; bin * bucket <= hiHz + bucket; bin++, first = false) {
    const hz = bin * bucket, a = hz - bucket / 2, px = X(hz) - M.l;
    let level = -Infinity, signal = -Infinity;
    for (let k = 0; k <= 8; k++) level = Math.max(level, noiseFloorAt(a + (k / 8) * bucket));
    for (const p of list) if (p.hz >= a && p.hz < a + bucket) { level = Math.max(level, noiseFloorAt(p.hz)); signal = Math.max(signal, p.dbm); }
    // Log-detected noise averages about 2.5 dB below its power level and has a long low tail.
    const y = Y(Math.max(signal, level - 2.5 + 10 * Math.log10(-Math.log(Math.max(1e-3, randomAt(bin))))));
    if (first) ctx.moveTo(M.l + px, y); else ctx.lineTo(M.l + px, y);
  }
  ctx.stroke();

  const visible = list.filter((p) => p.hz >= loHz && p.hz <= hiHz && p.dbm > noiseAt(p.hz));
  ctx.lineWidth = 2;
  for (const p of [...visible].reverse()) {
    const x = X(p.hz);
    ctx.strokeStyle = KINDS[p.kind].color;
    ctx.beginPath();
    ctx.moveTo(x, Y(noiseAt(p.hz)));
    ctx.lineTo(x, Y(p.dbm));
    ctx.stroke();
    // Two signals on one frequency: draw the weaker one inside the stronger so neither is hidden.
    const other = p.parts.filter((q) => q.kind !== p.kind && q.dbm > noiseAt(p.hz)).sort((a, b) => b.dbm - a.dbm)[0];
    if (other) {
      ctx.strokeStyle = KINDS[other.kind].color;
      ctx.beginPath();
      ctx.moveTo(x, Y(noiseAt(p.hz)));
      ctx.lineTo(x, Y(other.dbm));
      ctx.stroke();
    }
  }
  ctx.lineWidth = 1;

  // Label the strongest products that fit, and leave the rest to hover and the table.
  ctx.fillStyle = C.text;
  ctx.textAlign = 'center';
  // Products a few pixels apart draw as one line, so name them all rather than letting one hide the rest.
  const sameLine = (p) => visible.filter((q) => q !== p && Math.abs(X(q.hz) - X(p.hz)) < 4);
  const placed = [], named = new Set();
  for (const p of [...visible].sort((a, b) => b.dbm - a.dbm)) {
    if (placed.length >= 7) break;
    if (named.has(p)) continue;
    const group = [p, ...sameLine(p).filter((q) => !named.has(q))];
    group.forEach((q) => named.add(q));
    const text = group.length === 1 ? p.label : group.length === 2 ? group.sort((a, b) => a.hz - b.hz).map((q) => q.label).join(', ') : `${p.label} +${group.length - 1}`;
    const width = ctx.measureText(text).width + 8, top = Math.max(M.t + 11, Y(p.dbm) - 5);
    // Lean away from a close neighbour, so a pair reads "left name | right name" on one row. Otherwise try
    // centered, then either side, then a row higher, so close neighbours each keep a name.
    const near = visible.filter((q) => !group.includes(q) && Math.abs(X(q.hz) - X(p.hz)) < width);
    const right = near.some((q) => q.hz > p.hz), left = near.some((q) => q.hz < p.hz);
    const sides = right && !left ? [-1, 0, 1] : left && !right ? [1, 0, -1] : [0, -1, 1];
    const spot = [0, 13, 26].flatMap((up) => sides.map((side) => ({
      x: Math.max(M.l + width / 2, Math.min(M.l + pw - width / 2, X(p.hz) + side * (width / 2 - 4))),
      y: Math.max(M.t + 11, top - up),
    }))).find((s) => !placed.some((b) => Math.abs(b.x - s.x) < (b.width + width) / 2 && Math.abs(b.y - s.y) < 13));
    if (!spot) continue;
    placed.push({ ...spot, width });
    ctx.fillText(text, spot.x, spot.y);
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
    const others = sameLine(hit).sort((a, b) => b.dbm - a.dbm);
    if (others.length) rows.push('Also on this line, zoom in to separate:', ...others.slice(0, 5).map((q) => `${q.label}  ${(q.hz / 1e6).toFixed(3)} MHz  ${q.dbm.toFixed(1)} dBm`));
    if (others.length > 5) rows.push(`and ${others.length - 5} more`);
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
  if (!data || !data.points.every((p) => Number.isFinite(p.single))) {
    ctx.fillStyle = C.axis;
    ctx.textAlign = 'center';
    ctx.fillText(data ? 'no wanted carrier at this point' : 'measuring…', w / 2, h / 2);
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
  line('tone', '#c9780f');
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
  if (data.p1dBTwoTone) {
    dot(data.p1dBTwoTone.pin, data.p1dBTwoTone.pout, '#5f7df0');
    ctx.fillStyle = C.text;
    ctx.textAlign = 'left';
    ctx.fillText('2-tone', X(data.p1dBTwoTone.pin) + 7, Y(data.p1dBTwoTone.pout) + 13);
  }
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

// Filter loss against frequency, with each product arriving at the filter placed on the curve.
export function drawFilter(canvas, { settings, lossAt, list }) {
  const { ctx, w, h } = prepare(canvas);
  const m = { l: 48, r: 12, t: 10, b: 38 }, pw = w - m.l - m.r, ph = h - m.t - m.b, maxLoss = 100;
  const half = settings.bwMHz * 2.5, lo = Math.max(0.001, settings.centerMHz - half), hi = settings.centerMHz + half;
  const X = (mhz) => m.l + ((mhz - lo) / (hi - lo)) * pw, Y = (db) => m.t + (Math.min(maxLoss, db) / maxLoss) * ph;
  ctx.strokeStyle = C.grid;
  ctx.fillStyle = C.axis;
  ctx.textAlign = 'right';
  ctx.beginPath();
  for (const db of [0, 20, 40, 60, 80, 100]) {
    const y = Math.round(Y(db)) + 0.5;
    ctx.moveTo(m.l, y); ctx.lineTo(m.l + pw, y);
    ctx.fillText(db ? `−${db}` : '0', m.l - 5, y + 4);
  }
  const fx = ticks(lo * 1e6, hi * 1e6, Math.max(3, Math.floor(pw / 90)));
  ctx.textAlign = 'center';
  for (const hz of fx.values) {
    const x = Math.round(X(hz / 1e6)) + 0.5;
    ctx.moveTo(x, m.t); ctx.lineTo(x, m.t + ph);
    ctx.fillText(mhzText(hz, fx.step), Math.max(m.l + 20, Math.min(m.l + pw - 20, x)), h - 22);
  }
  ctx.stroke();
  ctx.fillText('Frequency (MHz)', m.l + pw / 2, h - 5);
  verticalLabel(ctx, 'Response (dB)', 11, m.t + ph / 2);
  ctx.save();
  ctx.beginPath(); ctx.rect(m.l, m.t, pw, ph); ctx.clip();
  ctx.strokeStyle = settings.on ? '#dbe5ea' : '#6b7c88';
  ctx.lineWidth = 2;
  if (!settings.on) ctx.setLineDash([5, 4]);
  ctx.beginPath();
  for (let px = 0; px <= pw; px++) {
    const y = Y(lossAt(lo + (px / pw) * (hi - lo)));
    if (px) ctx.lineTo(m.l + px, y); else ctx.moveTo(m.l, y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineWidth = 2;
  for (const p of list) {
    const mhz = p.hz / 1e6;
    if (mhz < lo || mhz > hi) continue;
    ctx.fillStyle = KINDS[p.kind].color;
    ctx.strokeStyle = C.bg;
    ctx.beginPath(); ctx.arc(X(mhz), Y(lossAt(mhz)), 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
  ctx.lineWidth = 1;
}

// A number line showing why the input and its image land on the same output.
export function drawPlan(canvas, { rf, lo, out, image, product, mode }) {
  const { ctx, w, h } = prepare(canvas);
  const items = [
    { name: 'Output', mhz: out, color: KINDS.wanted.color },
    { name: 'F1', mhz: rf, color: C.text },
    { name: 'LO', mhz: lo, color: KINDS.lo.color },
    { name: mode === 'upconvert' ? 'Other sideband' : 'Image', mhz: image, color: KINDS.image.color },
  ];
  const top = Math.max(...items.map((x) => x.mhz)) * 1.08, m = 16, base = h - 34;
  const X = (mhz) => m + (mhz / top) * (w - 2 * m);
  ctx.strokeStyle = C.axis;
  ctx.beginPath(); ctx.moveTo(m, base + 0.5); ctx.lineTo(w - m, base + 0.5); ctx.stroke();

  // The mixer only sees distance from the LO, so draw the equal distances.
  ctx.textAlign = 'center';
  const span = (a, b, y, label = `${+out.toFixed(3)} MHz`) => {
    ctx.strokeStyle = KINDS.image.color;
    ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(X(a), y); ctx.lineTo(X(b), y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = C.text;
    ctx.fillText(label, (X(a) + X(b)) / 2, y - 4);
  };
  if (mode === 'upconvert') { /* No image input to compare: the diagram just places the two sidebands. */ }
  else if (mode === 'aboveTwoLo') { span(lo, rf, 24); span(image, out, 44, `+ LO ${+lo.toFixed(3)} MHz`); }
  else if (product === 'sum') span(lo, image, 24);
  else { span(Math.min(lo, rf), Math.max(lo, rf), 24); span(Math.min(lo, image), Math.max(lo, image), 44); }

  ctx.lineWidth = 2;
  const placed = [];
  for (const item of [...items].sort((a, b) => a.mhz - b.mhz)) {
    const x = X(item.mhz);
    ctx.strokeStyle = item.color;
    ctx.beginPath(); ctx.moveTo(x, base - 22); ctx.lineTo(x, base); ctx.stroke();
    const text = `${item.name} ${+item.mhz.toFixed(1)}`, width = ctx.measureText(text).width + 8;
    const cx = Math.max(m + width / 2, Math.min(w - m - width / 2, x));
    const row = placed.some((p) => p.row === 0 && Math.abs(p.x - cx) < (p.width + width) / 2) ? 1 : 0;
    placed.push({ x: cx, width, row });
    ctx.fillStyle = C.text;
    ctx.fillText(text, cx, base + 14 + row * 14);
  }
  ctx.lineWidth = 1;
}
