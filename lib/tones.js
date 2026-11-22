// Exact tone products through nonlinear RF stages, using artificial frequency mapping.
// Each source gets a virtual bin so every product m1*f1 + m2*f2 + ... lands on its own FFT bin.

const R_OHMS = 50;
export const dbmToVolts = (dbm) => Math.sqrt(2 * R_OHMS * 1e-3 * 10 ** (dbm / 10));
export const voltsToDbm = (v) => 10 * Math.log10((v * v) / (2 * R_OHMS) / 1e-3);
const fromDb = (db) => 10 ** (db / 20);

export function fft(re, im, sign) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len *= 2) {
    const ang = (sign * 2 * Math.PI) / len, half = len / 2;
    for (let k = 0; k < half; k++) {
      const wr = Math.cos(ang * k), wi = Math.sin(ang * k);
      for (let a = k; a < n; a += len) {
        const b = a + half, tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
      }
    }
  }
}

// sources: [{ id, hz }]. Products are tracked up to `order` per source.
export function createGrid(sources, order = 7) {
  const base = 2 * order + 1;
  const weights = sources.map((_, i) => base ** i);
  const reach = order * weights.reduce((a, b) => a + b, 0);
  let N = 2;
  while (N < 4 * reach) N *= 2; // Spare room keeps strong high-order products from wrapping into real ones.
  const digits = sources.map(() => new Int8Array(N));
  const freq = new Float64Array(N), valid = new Uint8Array(N);
  for (let idx = 0; idx < N; idx++) {
    let r = idx < N / 2 ? idx : idx - N, f = 0;
    for (let s = 0; s < sources.length; s++) {
      const d = (((r + order) % base) + base) % base - order;
      digits[s][idx] = d;
      f += d * sources[s].hz;
      r = (r - d) / base;
    }
    valid[idx] = r === 0 ? 1 : 0;
    freq[idx] = f;
  }
  const indexOf = Object.fromEntries(sources.map((s, i) => [s.id, i]));
  return { sources, order, weights, N, digits, freq, valid, indexOf };
}

// tones: [{ id, dbm, phase }]
export function createSignal(grid, tones) {
  const re = new Float64Array(grid.N), im = new Float64Array(grid.N);
  for (const t of tones) {
    const a = dbmToVolts(t.dbm) / 2, ph = t.phase ?? 0, k = grid.weights[grid.indexOf[t.id]];
    re[k] += a * Math.cos(ph); im[k] += a * Math.sin(ph);
    re[grid.N - k] += a * Math.cos(ph); im[grid.N - k] -= a * Math.sin(ph);
  }
  return { grid, re, im };
}

function timeMap(sig, map) {
  const { grid } = sig, re = sig.re.slice(), im = sig.im.slice();
  fft(re, im, 1);
  for (let n = 0; n < grid.N; n++) re[n] = map(re[n], n);
  im.fill(0);
  fft(re, im, -1);
  for (let k = 0; k < grid.N; k++) {
    if (grid.valid[k]) { re[k] /= grid.N; im[k] /= grid.N; } else { re[k] = 0; im[k] = 0; }
  }
  return { grid, re, im };
}

// A soft limiter whose third-order term matches a chosen intercept. Input and intercept are in volts.
const limiterLevel = (ip3Volts) => ip3Volts * Math.sqrt(3 / 8);
const limit = (x, s) => x / Math.sqrt(1 + (x * x) / (s * s));

// Intercepts are output-referred, as on most amplifier datasheets.
// With psatDbm it follows a Saleh tube curve, which saturates much more sharply than the soft limiter.
export function amplifier(sig, { gainDb, oip3Dbm, oip2Dbm = Infinity, psatDbm }) {
  if (psatDbm !== undefined) {
    const peak = (Math.PI / 4) * dbmToVolts(psatDbm), knee = (2 * peak) / fromDb(gainDb);
    return timeMap(sig, (x) => {
      const r = Math.abs(x) / knee;
      return Math.sign(x) * (r >= 1 ? peak : (peak * 2 * r) / (1 + r * r));
    });
  }
  const g = fromDb(gainDb), s = limiterLevel(dbmToVolts(oip3Dbm - gainDb));
  const a2 = Number.isFinite(oip2Dbm) ? 1 / dbmToVolts(oip2Dbm - gainDb) : 0;
  return timeMap(sig, (x) => g * limit(x + a2 * x * x, s));
}

// `response` returns linear voltage gain for a positive frequency in Hz.
export function filter(sig, response) {
  const { grid } = sig, re = sig.re.slice(), im = sig.im.slice();
  for (let k = 0; k < grid.N; k++) {
    if (!re[k] && !im[k]) continue;
    const h = response(Math.abs(grid.freq[k]));
    re[k] *= h; im[k] *= h;
  }
  return { grid, re, im };
}

export const bandpass = (centerHz, bwHz, poles = 3, lossDb = 0) => (f) => {
  if (f <= 0) return 0;
  return fromDb(-lossDb) / Math.sqrt(1 + ((f * f - centerHz * centerHz) / (f * bwHz)) ** (2 * poles));
};
export const lowpass = (cutoffHz, poles = 3, lossDb = 0) => (f) => fromDb(-lossDb) / Math.sqrt(1 + (f / cutoffHz) ** (2 * poles));

export const MIXER_TYPES = {
  single: { name: 'Single-ended', rfToIfDb: 6, loToIfDb: 10, evenLoDb: 6, iip2OffsetDb: 15 },
  balanced: { name: 'Single-balanced', rfToIfDb: 18, loToIfDb: 25, evenLoDb: 20, iip2OffsetDb: 35 },
  double: { name: 'Double-balanced', rfToIfDb: 30, loToIfDb: 40, evenLoDb: 40, iip2OffsetDb: 55 },
};

// LO harmonics of a diode switch. Low drive rounds the switching edge and raises conversion loss.
function switchHarmonics(beta, order) {
  const P = 1440, c = new Float64Array(order + 1);
  for (let i = 0; i < P; i++) {
    const th = (2 * Math.PI * i) / P, v = Math.tanh(beta * Math.cos(th));
    for (let h = 1; h <= order; h += 2) c[h] += (2 * v * Math.cos(h * th)) / P;
  }
  return c;
}

// Passband loss from RF to the wanted sideband.
export function mixerLossDb({ loDbm, nominalLoDbm = 7, excessLossDb = 2.5 }) {
  return -20 * Math.log10(switchHarmonics(3 * fromDb(loDbm - nominalLoDbm), 1)[1] / 2) + excessLossDb;
}

// A starved LO switches the diodes less fully, so the mixer's intercept falls about 1 dB per dB of missing drive.
export const mixerIip3Dbm = (iip3Dbm, loDbm, nominalLoDbm = 7) => iip3Dbm + Math.min(0, loDbm - nominalLoDbm);

// `lo` names the grid source. The LO tone is supplied here, so it is not part of the RF signal.
export function mixer(sig, { lo, loDbm, nominalLoDbm = 7, type = 'double', excessLossDb = 2.5, iip3Dbm = 15 }) {
  const { grid } = sig, t = MIXER_TYPES[type], w = grid.weights[grid.indexOf[lo]];
  const beta = 3 * fromDb(loDbm - nominalLoDbm);
  const c = switchHarmonics(beta, grid.order);
  const iip3 = mixerIip3Dbm(iip3Dbm, loDbm, nominalLoDbm);
  const s = limiterLevel(dbmToVolts(iip3)), a2 = 1 / dbmToVolts(iip3 + t.iip2OffsetDb);
  const rfLeak = fromDb(-t.rfToIfDb), even = fromDb(-t.evenLoDb), loLeak = dbmToVolts(loDbm - t.loToIfDb);
  const scale = fromDb(-excessLossDb), P = (2 * Math.PI * w) / grid.N;
  const drive = new Float64Array(grid.N), leak = new Float64Array(grid.N);
  for (let n = 0; n < grid.N; n++) {
    const th = P * n;
    let m = rfLeak + even * Math.cos(2 * th);
    for (let h = 1; h <= grid.order; h += 2) m += c[h] * Math.cos(h * th);
    drive[n] = m;
    leak[n] = loLeak * Math.cos(th);
  }
  return timeMap(sig, (x, n) => scale * drive[n] * limit(x + a2 * x * x, s) + leak[n]);
}

const term = (m, id, first) => {
  if (!m) return '';
  const size = Math.abs(m) === 1 ? '' : `${Math.abs(m)}·`;
  return `${first ? (m < 0 ? '−' : '') : m < 0 ? ' − ' : ' + '}${size}${id}`;
};

export function productLabel(sources, m) {
  // Lead with a positive term so "RF − LO" reads the way it is written on a spur chart.
  const order = sources.map((_, i) => i).sort((a, b) => (m[b] > 0) - (m[a] > 0));
  let out = '';
  for (const i of order) if (m[i]) out += term(m[i], sources[i].id, !out);
  return out || 'DC';
}

// Real output tones, strongest first. Products that land on one frequency add with their phases.
export function products(sig, floorDbm = -200) {
  const { grid } = sig, byFreq = new Map();
  for (let k = 1; k < grid.N / 2; k++) {
    if (!grid.valid[k] || (!sig.re[k] && !sig.im[k])) continue;
    let f = grid.freq[k], im = sig.im[k];
    if (f === 0) continue;
    const m = grid.sources.map((_, s) => grid.digits[s][k] * Math.sign(f));
    if (f < 0) { f = -f; im = -im; }
    const key = Math.round(f), mag = Math.hypot(sig.re[k], sig.im[k]);
    const entry = byFreq.get(key) ?? { hz: f, re: 0, im: 0, m, best: 0, parts: [] };
    entry.re += sig.re[k]; entry.im += im;
    const order = m.reduce((a, b) => a + Math.abs(b), 0);
    entry.parts.push({ hz: f, dbm: voltsToDbm(2 * mag), m, order, label: productLabel(grid.sources, m) });
    if (mag > entry.best) { entry.best = mag; entry.m = m; entry.order = order; }
    byFreq.set(key, entry);
  }
  const out = [];
  for (const e of byFreq.values()) {
    const dbm = voltsToDbm(2 * Math.hypot(e.re, e.im));
    if (dbm >= floorDbm) out.push({ hz: e.hz, dbm, m: e.m, order: e.order, label: productLabel(grid.sources, e.m), parts: e.parts });
  }
  return out.sort((a, b) => b.dbm - a.dbm);
}

// Level of one specific product, even when another product lands on the same frequency.
export const levelOf = (sig, match) => {
  const part = products(sig).flatMap((x) => x.parts).find((x) => x.m.every((v, i) => v === match[i]) || x.m.every((v, i) => v === -match[i]));
  return part ? part.dbm : -Infinity;
};

// Friis cascade. Each stage: { gainDb, nfDb, oip3Dbm? } (oip3 omitted for a linear stage).
export function cascade(stages) {
  let gain = 1, f = 1, invIip3 = 0;
  stages.forEach((s, i) => {
    const g = 10 ** (s.gainDb / 10), stageF = 10 ** ((s.nfDb ?? Math.max(0, -s.gainDb)) / 10);
    f += i === 0 ? stageF - 1 : (stageF - 1) / gain;
    if (Number.isFinite(s.oip3Dbm)) invIip3 += (gain * g) / 10 ** (s.oip3Dbm / 10);
    gain *= g;
  });
  const gainDb = 10 * Math.log10(gain);
  const iip3Dbm = invIip3 ? -10 * Math.log10(invIip3) : Infinity;
  return { gainDb, nfDb: 10 * Math.log10(f), iip3Dbm, oip3Dbm: iip3Dbm + gainDb };
}
