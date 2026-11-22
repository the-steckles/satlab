import { COLORS as C, prepare, ticks, verticalLabel } from '../../lib/plot.js';

export const M = { l: 56, r: 12, t: 12, b: 40 };
const WANTED = '#0f9c7e', OTHER = '#5f7df0';

export function drawTrace(canvas, { db, lowMHz, highMHz, centerMHz, topDb, bottomDb, carriers, hoverX }) {
  const { ctx, w, h } = prepare(canvas);
  const pw = w - M.l - M.r, ph = h - M.t - M.b;
  const X = (mhz) => M.l + ((mhz - lowMHz) / (highMHz - lowMHz)) * pw;
  const Y = (v) => M.t + ((topDb - v) / (topDb - bottomDb)) * ph;

  for (const c of carriers) {
    ctx.fillStyle = c.main ? 'rgba(15,156,126,.14)' : 'rgba(95,125,240,.13)';
    ctx.fillRect(X(c.mhz - c.width / 2), M.t, X(c.mhz + c.width / 2) - X(c.mhz - c.width / 2), ph);
  }
  ctx.strokeStyle = C.grid;
  ctx.fillStyle = C.axis;
  ctx.textAlign = 'right';
  ctx.beginPath();
  for (const v of ticks(bottomDb, topDb, 6).values) {
    const y = Math.round(Y(v)) + 0.5;
    ctx.moveTo(M.l, y); ctx.lineTo(M.l + pw, y);
    ctx.fillText(`${v}`, M.l - 6, y + 4);
  }
  ctx.textAlign = 'center';
  const fx = ticks(lowMHz + centerMHz, highMHz + centerMHz, Math.max(3, Math.floor(pw / 90)));
  for (const f of fx.values) {
    const x = Math.round(X(f - centerMHz)) + 0.5;
    ctx.moveTo(x, M.t); ctx.lineTo(x, M.t + ph);
    ctx.fillText(`${f}`, Math.max(M.l + 18, Math.min(M.l + pw - 18, x)), h - 23);
  }
  ctx.stroke();
  ctx.fillText('Frequency (MHz)', M.l + pw / 2, h - 6);
  verticalLabel(ctx, 'dB relative to clear-sky carrier', 13, M.t + ph / 2);

  ctx.save();
  ctx.beginPath();
  ctx.rect(M.l, M.t, pw, ph);
  ctx.clip();
  ctx.strokeStyle = '#4fe0c0';
  ctx.beginPath();
  db.forEach((v, i) => {
    const x = M.l + (i / (db.length - 1)) * pw;
    if (i) ctx.lineTo(x, Y(v)); else ctx.moveTo(x, Y(v));
  });
  ctx.stroke();
  ctx.textAlign = 'center';
  for (const c of carriers) {
    ctx.fillStyle = c.main ? WANTED : OTHER;
    ctx.fillRect(X(c.mhz - c.width / 2), M.t, X(c.mhz + c.width / 2) - X(c.mhz - c.width / 2), 2);
    ctx.fillStyle = C.text;
    ctx.fillText(c.name, X(c.mhz), M.t + 15);
  }
  ctx.restore();

  if (hoverX !== null && hoverX >= M.l && hoverX <= M.l + pw) {
    const i = Math.round(((hoverX - M.l) / pw) * (db.length - 1)), mhz = lowMHz + (i / (db.length - 1)) * (highMHz - lowMHz);
    ctx.strokeStyle = C.marker;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(hoverX, M.t); ctx.lineTo(hoverX, M.t + ph); ctx.stroke();
    ctx.setLineDash([]);
    const rows = [`${(centerMHz + mhz).toFixed(1)} MHz`, `${db[i].toFixed(1).replace('-', '−')} dB`];
    const bw = Math.max(...rows.map((r) => ctx.measureText(r).width)) + 14;
    const bx = hoverX + bw + 12 > w - M.r ? hoverX - bw - 8 : hoverX + 8;
    ctx.fillStyle = '#141c24';
    ctx.strokeStyle = '#26333e';
    ctx.fillRect(bx, M.t + 26, bw, 38);
    ctx.strokeRect(bx + 0.5, M.t + 26.5, bw - 1, 37);
    ctx.fillStyle = C.text;
    ctx.textAlign = 'left';
    rows.forEach((r, n) => ctx.fillText(r, bx + 7, M.t + 42 + n * 15));
  }
}

const STOPS = [[8, 12, 30], [32, 28, 92], [82, 34, 124], [150, 48, 104], [214, 88, 62], [245, 158, 36], [250, 230, 130]];
const color = (t) => {
  const x = Math.max(0, Math.min(0.9999, t)) * (STOPS.length - 1), i = Math.floor(x), f = x - i;
  return STOPS[i].map((v, c) => v + (STOPS[i + 1][c] - v) * f);
};

export function createWaterfall(canvas, bins) {
  canvas.width = bins;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#080c1e';
  ctx.fillRect(0, 0, bins, 160);
  const row = ctx.createImageData(bins, 1);
  return {
    push(db, bottom, top) {
      ctx.drawImage(canvas, 0, 0, bins, 159, 0, 1, bins, 159);
      for (let i = 0; i < bins; i++) {
        const [r, g, b] = color((db[i] - bottom) / (top - bottom));
        row.data.set([r, g, b, 255], i * 4);
      }
      ctx.putImageData(row, 0, 0);
    },
    clear() { ctx.fillStyle = '#080c1e'; ctx.fillRect(0, 0, bins, 160); },
  };
}
