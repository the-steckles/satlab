// Shared canvas helpers for the SatLab plots.
export const COLORS = { bg: '#0a0f14', grid: '#1e2a33', axis: '#8fa3b0', text: '#dbe5ea', marker: '#ffffff' };
export const FONT = '11px ui-monospace, Consolas, monospace';

export function prepare(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, w, h);
  ctx.font = FONT;
  return { ctx, w, h };
}

// Tick values on a 1, 2 or 5 step, spaced for roughly `count` labels.
export function ticks(lo, hi, count = 5) {
  const raw = (hi - lo) / Math.max(1, count), mag = 10 ** Math.floor(Math.log10(raw)), n = raw / mag;
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag, out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-6; v += step) out.push(Math.abs(v) < step * 1e-6 ? 0 : v);
  return { values: out, step };
}

export function verticalLabel(ctx, text, x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.fillText(text, 0, 0);
  ctx.restore();
}
