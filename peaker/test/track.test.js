import test from 'node:test';
import assert from 'node:assert/strict';
import { beamwidthDeg, gainDbi, offAxisDeg } from '../src/antenna.js';
import { createAutoPeak, createStepTrack, parabolicOffset, rasterPoints, spiralPoints } from '../src/track.js';
import { describeController } from '../src/explain.js';

const D = 2.4, F = 11.7e9, HP = beamwidthDeg(D, F);
const NOISE = -100;

function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Beacon 35 dB over noise at peak, with exponential noise power added.
function sensor(sat, rng) {
  const peak = gainDbi(0, D, F);
  return (p) => {
    const carrier = 10 ** ((NOISE + 35 + gainDbi(offAxisDeg(p.az, p.el, sat.az, sat.el), D, F) - peak) / 10);
    const noise = 10 ** (NOISE / 10) * -Math.log(1 - rng()) * 0.25 + 10 ** (NOISE / 10) * 0.75;
    return 10 * Math.log10(carrier + noise);
  };
}

function runPeak(start, sat, seed, pattern = 'spiral') {
  const read = sensor(sat, seeded(seed));
  const c = createAutoPeak({ ...start, beamwidthDeg: HP, radiusDeg: 3, noiseDbm: NOISE, pattern });
  for (let i = 0; i < 20000 && !['done', 'notfound'].includes(c.phase); i++) c.update(read(c.target()));
  return { phase: c.phase, error: offAxisDeg(c.target().az, c.target().el, sat.az, sat.el) };
}

test('parabolic fit finds the vertex', () => {
  const f = (x) => -3 * (x - 0.1) ** 2;
  assert.ok(Math.abs(parabolicOffset(f(-0.5), f(0), f(0.5), 0.5) - 0.1) < 1e-9);
});

test('spiral covers its radius without gaps wider than the spacing', () => {
  const pts = spiralPoints(3, 0.4);
  for (let x = -2; x <= 2; x += 0.25) for (let y = -2; y <= 2; y += 0.25) {
    assert.ok(Math.min(...pts.map((p) => Math.hypot(p.x - x, p.y - y))) < 0.4);
  }
});

test('auto-peak reaches the main lobe from far starts', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const r = seeded(seed * 97);
    const sat = { az: 180, el: 35 };
    const a = r() * 2 * Math.PI, d = 0.8 + r() * 1.8;
    const start = { az: sat.az + (d * Math.cos(a)) / Math.cos((35 * Math.PI) / 180), el: sat.el + d * Math.sin(a) };
    const res = runPeak(start, sat, seed);
    assert.equal(res.phase, 'done');
    assert.ok(res.error < 0.1 * HP, `seed ${seed}: error ${res.error}, limit ${0.1 * HP}`);
  }
});

test('auto-peak escapes a first side lobe', () => {
  const sat = { az: 120, el: 40 };
  const start = { az: sat.az, el: sat.el + HP * 1.65 };
  const res = runPeak(start, sat, 5);
  assert.equal(res.phase, 'done');
  assert.ok(res.error < 0.1 * HP, `error ${res.error}`);
});

test('auto-peak reports no signal instead of inventing a peak', () => {
  const c = createAutoPeak({ az: 10, el: 20, beamwidthDeg: HP, radiusDeg: 1, noiseDbm: NOISE });
  const rng = seeded(3);
  for (let i = 0; i < 5000 && c.phase === 'search'; i++) c.update(NOISE + 10 * Math.log10(0.75 + 0.25 * -Math.log(1 - rng())));
  assert.equal(c.phase, 'notfound');
});

test('step-track holds a moving LEO target', () => {
  const rng = seeded(11);
  const sat = { az: 100, el: 30 };
  const read = (p) => sensor(sat, rng)(p);
  const t = createStepTrack({ az: 100.1, el: 30.05, beamwidthDeg: HP, noiseDbm: NOISE });
  const dt = 0.05; // 20 sweeps per second
  let worst = 0;
  for (let i = 0; i < 2400; i++) {
    sat.az += 0.15 * dt / Math.cos((sat.el * Math.PI) / 180);
    sat.el += 0.05 * dt;
    t.update(read(t.target()));
    if (i > 100) worst = Math.max(worst, offAxisDeg(t.target().az, t.target().el, sat.az, sat.el));
  }
  assert.equal(t.phase, 'tracking');
  assert.ok(worst < HP * 0.6, `worst ${worst}, beamwidth ${HP}`);
});

test('step-track runs one cycle per interval and holds still between cycles', () => {
  const rng = seeded(21);
  const sat = { az: 100, el: 30 };
  const read = sensor(sat, rng);
  const t = createStepTrack({ az: 100.05, el: 30.02, beamwidthDeg: HP, noiseDbm: NOISE, dwell: 6, intervalS: 5 });
  const dt = 1 / 30;
  let moved = 0, previous = null;
  for (let i = 0; i < 30 * 21; i++) {
    t.advance(dt);
    const p = t.target();
    if (t.waiting && previous?.waiting && (p.az !== previous.az || p.el !== previous.el)) moved++;
    previous = { ...p, waiting: t.waiting };
    t.update(read(p));
  }
  assert.ok(t.cycles >= 4 && t.cycles <= 5, `cycles ${t.cycles}`);
  assert.equal(moved, 0);
});

test('explainer follows auto-peak through every phase', () => {
  const sat = { az: 180, el: 40 };
  const read = sensor(sat, seeded(8));
  const c = createAutoPeak({ az: 180.6, el: 40.5, beamwidthDeg: HP, radiusDeg: 3, noiseDbm: NOISE });
  const seen = new Set();
  for (let i = 0; i < 20000 && c.phase !== 'done'; i++) {
    seen.add(describeController(c.explain).steps[describeController(c.explain).active]);
    c.update(read(c.target()));
  }
  seen.add(describeController(c.explain).steps[describeController(c.explain).active]);
  assert.deepEqual([...seen], ['Spiral search', 'Refine', 'Peaked']);
  assert.ok(c.explain.scan.fits.az && c.explain.scan.fits.el);
  assert.ok(Number.isFinite(c.explain.measured[c.explain.bestIndex]));
});

test('explainer names each step-track point in order, then holds', () => {
  const sat = { az: 100, el: 30 };
  const read = sensor(sat, seeded(9));
  const t = createStepTrack({ az: 100, el: 30, beamwidthDeg: HP, noiseDbm: NOISE, dwell: 2, intervalS: 60 });
  const order = [];
  for (let i = 0; i < 20; i++) {
    t.advance(1 / 30);
    const d = describeController(t.explain);
    if (order.at(-1) !== d.steps[d.active]) order.push(d.steps[d.active]);
    t.update(read(t.target()));
  }
  assert.deepEqual(order, ['Az center', 'Az −', 'Az +', 'El center', 'El −', 'El +', 'Hold']);
  assert.match(describeController(t.explain).title, /Holding: next cycle in \d+ s/);
});

test('raster covers its square in connected back-and-forth rows', () => {
  const s = 0.4, pts = rasterPoints(3, s);
  for (let i = 1; i < pts.length; i++) assert.ok(Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) <= s + 1e-9);
  for (let x = -3; x <= 3; x += 0.25) for (let y = -3; y <= 3; y += 0.25) {
    assert.ok(Math.min(...pts.map((p) => Math.hypot(p.x - x, p.y - y))) <= s * Math.SQRT1_2 + 1e-9);
  }
});

test('raster auto-peak reaches the main lobe, including from a side lobe', () => {
  for (let seed = 1; seed <= 6; seed++) {
    const sat = { az: 120, el: 40 };
    const start = { az: sat.az, el: sat.el + HP * (seed === 1 ? 1.65 : 0.5 + seed * 0.4) };
    const res = runPeak(start, sat, seed, 'raster');
    assert.equal(res.phase, 'done');
    assert.ok(res.error < 0.1 * HP, `seed ${seed}: error ${res.error}`);
  }
  const c = createAutoPeak({ az: 10, el: 40, beamwidthDeg: HP, radiusDeg: 1, noiseDbm: NOISE, pattern: 'raster' });
  assert.equal(describeController(c.explain).steps[0], 'Raster scan');
});

test('time per point sets how long a step-track cycle takes', () => {
  const read = sensor({ az: 100, el: 30 }, seeded(5));
  const sweepsPerCycle = (dwell, change) => {
    const t = createStepTrack({ az: 100, el: 30, beamwidthDeg: HP, noiseDbm: NOISE, dwell: 2, intervalS: 1000 });
    if (change) t.setDwell(dwell);
    let n = 0;
    while (t.cycles === 0 && n < 1000) { t.update(read(t.target())); n++; }
    return n;
  };
  assert.equal(sweepsPerCycle(2, false), 12);
  assert.equal(sweepsPerCycle(45, true), 270); // 1.5 s per point at 30 sweeps per second
});

test('explainer has a manual description', () => {
  assert.equal(describeController(null).title, 'Manual pointing');
});

test('step-track reports loss when the target leaves the beam', () => {
  const rng = seeded(4);
  const t = createStepTrack({ az: 100, el: 30, beamwidthDeg: HP, noiseDbm: NOISE });
  for (let i = 0; i < 40; i++) t.update(NOISE + 10 * Math.log10(0.75 + 0.25 * -Math.log(1 - rng())));
  assert.equal(t.phase, 'lost');
});
