// DVB-S2 constellations at unit average power, and a shared IQ plot.
import { COLORS as C, prepare } from './plot.js';

const ring = (count, radius, offset) => Array.from({ length: count }, (_, k) => {
  const a = offset + (2 * Math.PI * k) / count;
  return { i: radius * Math.cos(a), q: radius * Math.sin(a) };
});

function normalized(points) {
  const scale = Math.sqrt(points.reduce((sum, p) => sum + p.i * p.i + p.q * p.q, 0) / points.length);
  return points.map((p) => ({ i: p.i / scale, q: p.q / scale }));
}

// Ring ratios are the DVB-S2 values for rate 3/4 (ETSI EN 302 307-1).
export function constellation(modcod) {
  const name = modcod.split(' ')[0];
  if (name === 'QPSK') return normalized(ring(4, 1, Math.PI / 4));
  if (name === '8PSK') return normalized(ring(8, 1, 0));
  if (name === '16APSK') return normalized([...ring(4, 1, Math.PI / 4), ...ring(12, 2.85, Math.PI / 12)]);
  if (name === '32APSK') return normalized([...ring(4, 1, Math.PI / 4), ...ring(12, 2.84, Math.PI / 12), ...ring(16, 5.27, 0)]);
  throw new Error(`Unknown constellation: ${modcod}`);
}

export const gaussian = (rand = Math.random) => Math.sqrt(-2 * Math.log(Math.max(1e-12, rand()))) * Math.cos(2 * Math.PI * rand());

// Modulation error ratio from received samples and the symbols they were sent as.
export function merDb(samples) {
  let signal = 0, error = 0;
  for (const s of samples) {
    signal += s.refI * s.refI + s.refQ * s.refQ;
    error += (s.i - s.refI) ** 2 + (s.q - s.refQ) ** 2;
  }
  return error > 0 ? 10 * Math.log10(signal / error) : Infinity;
}

export function drawConstellation(canvas, { samples, ideal, color = '#4fe0c0', label = '' }) {
  const { ctx, w, h } = prepare(canvas);
  const size = Math.min(w, h), cx = w / 2, cy = h / 2, scale = size / 4.4;
  ctx.strokeStyle = C.grid;
  ctx.beginPath();
  ctx.moveTo(cx - size / 2, cy + 0.5); ctx.lineTo(cx + size / 2, cy + 0.5);
  ctx.moveTo(cx + 0.5, cy - size / 2); ctx.lineTo(cx + 0.5, cy + size / 2);
  ctx.stroke();
  ctx.fillStyle = C.axis;
  ctx.textAlign = 'left';
  ctx.fillText('I', cx + size / 2 - 10, cy - 5);
  ctx.fillText('Q', cx + 5, cy - size / 2 + 11);
  if (label) ctx.fillText(label, 6, 14);
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - size / 2, cy - size / 2, size, size);
  ctx.clip();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.55;
  for (const s of samples) ctx.fillRect(cx + s.i * scale - 1, cy - s.q * scale - 1, 2, 2);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = C.marker;
  for (const p of ideal) {
    const x = cx + p.i * scale, y = cy - p.q * scale;
    ctx.beginPath();
    ctx.moveTo(x - 4, y); ctx.lineTo(x + 4, y);
    ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 4);
    ctx.stroke();
  }
  ctx.restore();
}
