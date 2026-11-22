import { envelopeDbi, envelopeStartDeg, gainDbi, peakGainDbi } from './antenna.js';

const M = { l: 62, r: 14, t: 12, b: 26 };
const C = { bg: '#0a0f14', grid: '#1e2a33', axis: '#8fa3b0', trace: '#4fe0c0', hold: '#e8a33d', marker: '#ffffff', env: '#e8a33d' };
const FONT = '11px ui-monospace, Consolas, monospace';

function prepare(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, w, h);
  ctx.font = FONT;
  return { ctx, w, h, pw: w - M.l - M.r, ph: h - M.t - M.b };
}

export function formatMHz(hz, spanHz) {
  const decimals = spanHz >= 50e6 ? 1 : spanHz >= 5e6 ? 2 : spanHz >= 500e3 ? 3 : spanHz >= 50e3 ? 4 : 5;
  return (hz / 1e6).toFixed(decimals);
}

function freqAxis(p, centerHz, spanHz) {
  const { ctx, pw, h } = p;
  ctx.fillStyle = C.axis;
  ctx.textAlign = 'center';
  // The edge labels hang inward, so the first gap must fit one and a half labels.
  const every = 1.5 * ctx.measureText(formatMHz(centerHz, spanHz)).width + 8 > pw / 4 ? 2 : 1;
  for (let i = 0; i <= 4; i += every) {
    const f = centerHz - spanHz / 2 + (spanHz * i) / 4;
    ctx.textAlign = i === 0 ? 'left' : i === 4 ? 'right' : 'center';
    ctx.fillText(formatMHz(f, spanHz), M.l + (pw * i) / 4, h - 9);
  }
}

export function drawSpectrum(canvas, { trace, hold, centerHz, spanHz, topDbm, bottomDbm, marker }) {
  const p = prepare(canvas);
  const { ctx, pw, ph } = p;
  const y = (db) => M.t + ((topDbm - db) / (topDbm - bottomDbm)) * ph;
  const x = (i, n) => M.l + (i / (n - 1)) * pw;

  ctx.strokeStyle = C.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= 10; i++) { const gx = Math.round(M.l + (pw * i) / 10) + 0.5; ctx.moveTo(gx, M.t); ctx.lineTo(gx, M.t + ph); }
  ctx.stroke();
  ctx.fillStyle = C.axis;
  ctx.textAlign = 'right';
  const stepDb = topDbm - bottomDbm > 80 ? 20 : 10;
  ctx.beginPath();
  for (let db = Math.ceil(bottomDbm / stepDb) * stepDb; db <= topDbm; db += stepDb) {
    const gy = Math.round(y(db)) + 0.5;
    ctx.moveTo(M.l, gy); ctx.lineTo(M.l + pw, gy);
    ctx.fillText(`${db}`, M.l - 6, gy + 4);
  }
  ctx.stroke();
  ctx.save();
  ctx.translate(13, M.t + ph / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.fillText('Amplitude (dBm)', 0, 0);
  ctx.restore();
  freqAxis(p, centerHz, spanHz);

  ctx.save();
  ctx.beginPath();
  ctx.rect(M.l, M.t, pw, ph);
  ctx.clip();
  const line = (data, color) => {
    ctx.strokeStyle = color;
    ctx.beginPath();
    data.forEach((v, i) => (i ? ctx.lineTo(x(i, data.length), y(v)) : ctx.moveTo(x(i, data.length), y(v))));
    ctx.stroke();
  };
  if (hold) line(hold, C.hold);
  if (trace) line(trace, C.trace);
  ctx.restore();

  if (marker && Number.isFinite(marker.dbm)) {
    const mx = M.l + ((marker.freqHz - (centerHz - spanHz / 2)) / spanHz) * pw;
    const my = Math.max(M.t, Math.min(M.t + ph, y(marker.dbm)));
    if (mx >= M.l && mx <= M.l + pw) {
      ctx.fillStyle = C.marker;
      ctx.beginPath();
      ctx.moveTo(mx, my - 2); ctx.lineTo(mx - 5, my - 10); ctx.lineTo(mx + 5, my - 10);
      ctx.fill();
      const text = `${(marker.freqHz / 1e6).toFixed(4)} MHz  ${marker.dbm.toFixed(1)} dBm`;
      const tw = ctx.measureText(text).width;
      ctx.textAlign = 'left';
      ctx.fillText(text, Math.max(M.l + 4, Math.min(M.l + pw - tw - 4, mx - tw / 2)), Math.max(M.t + 12, my - 15));
    }
  }
}

// Stops sampled from a perceptually ordered dark-to-bright ramp.
const STOPS = [[8, 12, 30], [32, 28, 92], [82, 34, 124], [150, 48, 104], [214, 88, 62], [245, 158, 36], [250, 230, 130]];
const LUT = Array.from({ length: 256 }, (_, i) => {
  const t = (i / 255) * (STOPS.length - 1), a = Math.floor(t), b = Math.min(a + 1, STOPS.length - 1), k = t - a;
  return STOPS[a].map((c, n) => Math.round(c + (STOPS[b][n] - c) * k));
});

export function createWaterfall(canvas, bins, rows = 320) {
  const off = document.createElement('canvas');
  off.width = bins; off.height = rows;
  const octx = off.getContext('2d');
  octx.fillStyle = `rgb(${LUT[0]})`;
  octx.fillRect(0, 0, bins, rows);
  const line = octx.createImageData(bins, 1);
  return {
    push(trace, lowDbm, highDbm) {
      octx.drawImage(off, 0, 1);
      for (let i = 0; i < bins; i++) {
        const v = Math.max(0, Math.min(255, Math.round(((trace[i] - lowDbm) / (highDbm - lowDbm)) * 255)));
        const [r, g, b] = LUT[v];
        line.data.set([r, g, b, 255], i * 4);
      }
      octx.putImageData(line, 0, 0);
    },
    draw(centerHz, spanHz) {
      const p = prepare(canvas);
      p.ctx.imageSmoothingEnabled = false;
      p.ctx.drawImage(off, M.l, M.t, p.pw, p.ph);
      freqAxis(p, centerHz, spanHz);
      p.ctx.save();
      p.ctx.translate(13, M.t + p.ph / 2);
      p.ctx.rotate(-Math.PI / 2);
      p.ctx.textAlign = 'center';
      p.ctx.fillStyle = C.axis;
      p.ctx.fillText('Time (newest at top)', 0, 0);
      p.ctx.restore();
    },
  };
}

export const PHASE_COLORS = { search: '#5f7df0', measure: '#c9780f', hold: '#0f9c7e' };
const PHASE_NAMES = { search: 'Search', measure: 'Measuring', hold: 'Holding' };
const wrapDelta = (a) => ((a + 540) % 360) - 180;

// Three stacked lanes with their own scales, because az, el and dBm are not comparable.
export function drawHistory(canvas, { samples, windowS, nowMs, showSat, hoverX, cursorT = null }) {
  if (!canvas.clientWidth) return;
  const p = prepare(canvas);
  const { ctx, w, h } = p;
  const left = M.l, right = w - M.r, stripH = 6, gap = 10;
  const top = M.t + stripH + 6, laneH = (h - top - M.b - 2 * gap) / 3;
  const x = (t) => right - ((nowMs - t) / (windowS * 1000)) * (right - left);
  const visible = samples.filter((s) => s.t >= nowMs - windowS * 1000);
  const stride = Math.max(1, Math.ceil(visible.length / (right - left))); // one point per pixel is all a line can show
  const refAz = visible.at(-1)?.az ?? 0;
  const az = (v) => refAz + wrapDelta(v - refAz);

  for (let i = 1; i < visible.length; i++) {
    const color = PHASE_COLORS[visible[i].phase];
    if (!color) continue;
    ctx.fillStyle = color;
    ctx.fillRect(x(visible[i - 1].t), M.t, Math.max(1, x(visible[i].t) - x(visible[i - 1].t)), stripH);
  }

  const lanes = [
    { name: 'Azimuth (°)', value: (s) => az(s.az), sat: (s) => az(s.satAz), minSpan: 0.1, label: (v) => ((v % 360) + 360) % 360 },
    { name: 'Elevation (°)', value: (s) => s.el, sat: (s) => s.satEl, minSpan: 0.1, label: (v) => v },
    { name: 'Beacon (dBm)', value: (s) => s.db, sat: null, minSpan: 10, label: (v) => v },
  ];
  lanes.forEach((lane, n) => {
    const y0 = top + n * (laneH + gap);
    const values = visible.flatMap((s) => (showSat && lane.sat ? [lane.value(s), lane.sat(s)] : [lane.value(s)])).filter(Number.isFinite);
    let lo = values.length ? Math.min(...values) : 0, hi = values.length ? Math.max(...values) : 1;
    const pad = Math.max((lane.minSpan - (hi - lo)) / 2, (hi - lo) * 0.08);
    lo -= pad; hi += pad;
    lane.y = (v) => y0 + ((hi - v) / (hi - lo)) * laneH;
    const decimals = hi - lo < 1 ? 3 : hi - lo < 20 ? 2 : 1;
    lane.format = (v) => lane.label(v).toFixed(decimals);

    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const f of [0, 0.5, 1]) { const gy = Math.round(y0 + f * laneH) + 0.5; ctx.moveTo(left, gy); ctx.lineTo(right, gy); }
    ctx.stroke();
    ctx.fillStyle = C.axis;
    ctx.textAlign = 'right';
    ctx.fillText(lane.format(hi), left - 5, y0 + 9);
    ctx.fillText(lane.format(lo), left - 5, y0 + laneH);
    ctx.textAlign = 'left';
    ctx.fillText(lane.name, left + 4, y0 + 11);

    ctx.save();
    ctx.beginPath();
    ctx.rect(left, y0, right - left, laneH);
    ctx.clip();
    const line = (get, color, dash) => {
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.setLineDash(dash);
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < visible.length; i += stride) {
        const v = get(visible[i]);
        if (!Number.isFinite(v)) { started = false; continue; }
        if (started) ctx.lineTo(x(visible[i].t), lane.y(v)); else ctx.moveTo(x(visible[i].t), lane.y(v));
        started = true;
      }
      ctx.stroke();
      ctx.setLineDash([]);
    };
    if (showSat && lane.sat) line(lane.sat, C.hold, [5, 4]);
    line(lane.value, C.trace, []);
    ctx.restore();
  });

  ctx.fillStyle = C.axis;
  for (let i = 0; i <= 4; i++) {
    const secs = windowS * (1 - i / 4);
    ctx.textAlign = i === 0 ? 'left' : i === 4 ? 'right' : 'center';
    ctx.fillText(secs ? `−${secs >= 120 ? `${secs / 60} min` : `${secs} s`}` : 'now', left + ((right - left) * i) / 4, h - 9);
  }

  if (cursorT !== null && x(cursorT) >= left && x(cursorT) <= right) {
    ctx.strokeStyle = C.marker;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x(cursorT), M.t); ctx.lineTo(x(cursorT), h - M.b); ctx.stroke();
  }
  if (hoverX === null || hoverX < left || hoverX > right || !visible.length) return;
  const t = nowMs - ((right - hoverX) / (right - left)) * windowS * 1000;
  const s = visible.reduce((a, b) => (Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a));
  const hx = x(s.t);
  ctx.strokeStyle = C.axis;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(hx, M.t); ctx.lineTo(hx, h - M.b); ctx.stroke();
  ctx.fillStyle = C.marker;
  lanes.forEach((lane) => { ctx.beginPath(); ctx.arc(hx, lane.y(lane.value(s)), 4, 0, 2 * Math.PI); ctx.fill(); });
  const rows = [`${((nowMs - s.t) / 1000).toFixed(1)} s ago · ${PHASE_NAMES[s.phase] ?? 'Manual'}`, `Az ${s.az.toFixed(3)}°`, `El ${s.el.toFixed(3)}°`, `Beacon ${s.db.toFixed(1)} dBm`];
  if (showSat) rows.push(`Sat ${s.satAz.toFixed(3)}°, ${s.satEl.toFixed(3)}°`);
  const boxW = Math.max(...rows.map((r) => ctx.measureText(r).width)) + 14, boxH = rows.length * 15 + 8;
  const bx = hx + boxW + 12 > right ? hx - boxW - 8 : hx + 8;
  ctx.fillStyle = '#1b2732';
  ctx.strokeStyle = C.axis;
  ctx.fillRect(bx, top, boxW, boxH);
  ctx.strokeRect(bx + 0.5, top + 0.5, boxW - 1, boxH - 1);
  ctx.fillStyle = '#dbe5ea';
  ctx.textAlign = 'left';
  rows.forEach((r, i) => ctx.fillText(r, bx + 7, top + 16 + i * 15));
}

function drawSearchMap(ctx, w, h, info) {
  const extent = Math.max(...info.path.map((q) => Math.max(Math.abs(q.x), Math.abs(q.y)))) || 1;
  const cx = w / 2, cy = (h - 16) / 2, scale = (Math.min(w, h - 16) / 2 - 8) / extent;
  const done = info.measured.filter(Number.isFinite);
  const lo = done.length ? Math.min(...done) : 0, hi = done.length ? Math.max(...done) : 1;
  ctx.strokeStyle = C.grid;
  ctx.beginPath();
  ctx.moveTo(cx - extent * scale, cy); ctx.lineTo(cx + extent * scale, cy);
  ctx.moveTo(cx, cy - extent * scale); ctx.lineTo(cx, cy + extent * scale);
  ctx.stroke();
  ctx.strokeStyle = C.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  info.path.forEach((q, i) => (i ? ctx.lineTo(cx + q.x * scale, cy - q.y * scale) : ctx.moveTo(cx + q.x * scale, cy - q.y * scale)));
  ctx.stroke();
  info.path.forEach((q, i) => {
    const v = info.measured[i];
    const k = Number.isFinite(v) ? (v - lo) / Math.max(1e-6, hi - lo) : 0;
    ctx.fillStyle = Number.isFinite(v) ? `rgba(79,224,192,${0.15 + 0.85 * k * k})` : C.grid;
    ctx.beginPath();
    ctx.arc(cx + q.x * scale, cy - q.y * scale, Number.isFinite(v) ? 2 + 2 * k : 1.5, 0, 2 * Math.PI);
    ctx.fill();
  });
  const ring = (q, color, r) => {
    ctx.strokeStyle = color; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx + q.x * scale, cy - q.y * scale, r, 0, 2 * Math.PI); ctx.stroke();
  };
  if (done.length) ring(info.path[info.bestIndex], C.hold, 7);
  if (info.phase === 'search') ring(info.path[info.index], C.marker, 5);
  ctx.fillStyle = C.axis;
  ctx.textAlign = 'center';
  ctx.fillText('Search map: brighter is stronger, orange ring is best so far', w / 2, h - 3);
}

function drawFit(ctx, x0, w, h, title, fit, partial, step, mark = -1) {
  const pad = { l: 8, r: 8, t: 18, b: 30 };
  const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
  const span = step * 1.6;
  const X = (d) => x0 + pad.l + ((d + span) / (2 * span)) * pw;
  const offsets = [0, -step, step];
  const shown = partial?.length ? partial : fit ? [fit.center, fit.minus, fit.plus] : [];
  ctx.fillStyle = C.axis;
  ctx.textAlign = 'center';
  ctx.fillText(title, x0 + w / 2, 12);
  if (!shown.length) { ctx.fillText('waiting for readings', x0 + w / 2, h / 2); return; }
  const lo = Math.min(...shown), hi = Math.max(...shown), margin = Math.max(0.5, (hi - lo) * 0.25);
  const Y = (v) => pad.t + ((hi + margin - v) / (hi - lo + 2 * margin)) * ph;
  ctx.strokeStyle = C.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const d of offsets) { ctx.moveTo(X(d), pad.t); ctx.lineTo(X(d), pad.t + ph); }
  ctx.stroke();
  const complete = shown.length === 3;
  if (complete) {
    const [c, m, q] = shown;
    const a = (m + q - 2 * c) / (2 * step * step), b = (q - m) / (2 * step);
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, pad.t, w, ph); ctx.clip();
    ctx.strokeStyle = C.trace; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 50; i++) {
      const d = -span + (2 * span * i) / 50, py = Y(c + b * d + a * d * d);
      if (i) ctx.lineTo(X(d), py); else ctx.moveTo(X(d), py);
    }
    ctx.stroke();
    ctx.restore();
  }
  ctx.fillStyle = C.marker;
  shown.forEach((v, i) => { ctx.beginPath(); ctx.arc(X(offsets[i]), Y(v), 4, 0, 2 * Math.PI); ctx.fill(); });
  if (mark >= 0 && mark < shown.length) {
    ctx.strokeStyle = C.hold;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(X(offsets[mark]), Y(shown[mark]), 8, 0, 2 * Math.PI); ctx.stroke();
  }
  if (complete && fit && !partial?.length) {
    ctx.strokeStyle = C.hold;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(X(fit.delta), pad.t); ctx.lineTo(X(fit.delta), pad.t + ph); ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.fillStyle = C.axis;
  ctx.fillText(`−${step.toFixed(3)}°`, X(-step), h - 17);
  ctx.fillText('0', X(0), h - 17);
  ctx.fillText(`+${step.toFixed(3)}°`, X(step), h - 17);
  if (fit && !partial?.length) ctx.fillText(`peak at ${Math.abs(fit.delta) < 0.0005 ? '0.000' : `${fit.delta > 0 ? '+' : '−'}${Math.abs(fit.delta).toFixed(3)}`}°`, x0 + w / 2, h - 3);
  else ctx.fillText(`${shown.length} of 3 readings`, x0 + w / 2, h - 3);
}

export function drawExplainer(canvas, info) {
  if (!canvas.clientWidth) return;
  const { ctx, w, h } = prepare(canvas);
  if (!info) return;
  if (info.kind === 'peak' && (info.phase === 'search' || info.phase === 'notfound')) { drawSearchMap(ctx, w, h, info); return; }
  const { axis, samples, fits, step } = info.scan;
  const live = info.phase === 'refine' || info.phase === 'cycle';
  const mark = (name) => (info.highlight?.axis === name ? info.highlight.point : -1);
  drawFit(ctx, 0, w / 2, h, 'Azimuth fit', fits.az, live && axis === 'az' ? samples : null, step, mark('az'));
  drawFit(ctx, w / 2, w / 2, h, 'Elevation fit', fits.el, live && axis === 'el' ? samples : null, step, mark('el'));
}

export function drawPattern(canvas, { diameterM, freqHz, beamwidth, offAxis }) {
  const p = prepare(canvas);
  const { ctx, pw, ph } = p;
  const peak = peakGainDbi(diameterM, freqHz);
  const maxDeg = beamwidth * 8;
  const top = Math.ceil(peak / 10) * 10, bottom = Math.min(-20, top - 80);
  const x = (t) => M.l + ((t + maxDeg) / (2 * maxDeg)) * pw;
  const y = (g) => M.t + ((top - g) / (top - bottom)) * ph;

  ctx.strokeStyle = C.grid;
  ctx.fillStyle = C.axis;
  ctx.textAlign = 'right';
  ctx.beginPath();
  for (let g = bottom; g <= top; g += 20) { ctx.moveTo(M.l, y(g)); ctx.lineTo(M.l + pw, y(g)); ctx.fillText(`${g}`, M.l - 6, y(g) + 4); }
  ctx.stroke();
  ctx.textAlign = 'center';
  for (const t of [-maxDeg, -maxDeg / 2, 0, maxDeg / 2, maxDeg]) ctx.fillText(`${t.toFixed(2)}°`, Math.max(M.l + 18, Math.min(M.l + pw - 18, x(t))), p.h - 9);
  ctx.save();
  ctx.translate(13, M.t + ph / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Gain (dBi)', 0, 0);
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.rect(M.l, M.t, pw, ph);
  ctx.clip();
  ctx.strokeStyle = C.trace;
  ctx.beginPath();
  for (let i = 0; i <= pw; i++) {
    const t = -maxDeg + (2 * maxDeg * i) / pw;
    const py = y(gainDbi(t, diameterM, freqHz));
    if (i) ctx.lineTo(M.l + i, py); else ctx.moveTo(M.l, py);
  }
  ctx.stroke();
  const start = envelopeStartDeg(diameterM, freqHz);
  if (start < maxDeg) {
    ctx.strokeStyle = C.env;
    ctx.setLineDash([4, 3]);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      for (let t = start; t <= maxDeg; t += maxDeg / 150) {
        if (t === start) ctx.moveTo(x(side * t), y(envelopeDbi(t))); else ctx.lineTo(x(side * t), y(envelopeDbi(t)));
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  if (offAxis !== null) {
    ctx.fillStyle = C.marker;
    ctx.beginPath();
    ctx.arc(x(Math.min(offAxis, maxDeg)), y(gainDbi(offAxis, diameterM, freqHz)), 4, 0, 2 * Math.PI);
    ctx.fill();
  }
  ctx.restore();
}
