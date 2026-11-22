import test from 'node:test';
import assert from 'node:assert/strict';
import { amplifier, bandpass, cascade, createGrid, createSignal, dbmToVolts, fft, filter, levelOf, lowpass, mixer, productLabel, products, voltsToDbm } from './tones.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b} ± ${tol}, got ${a}`);
const twoTone = (dbm, f1 = 1000e6, f2 = 1001e6) => {
  const grid = createGrid([{ id: 'F1', hz: f1 }, { id: 'F2', hz: f2 }]);
  return createSignal(grid, [{ id: 'F1', dbm }, { id: 'F2', dbm }]);
};

test('dBm and peak volts round-trip, with 0 dBm at 0.316 V peak in 50 ohms', () => {
  near(dbmToVolts(0), 0.3162, 1e-3);
  near(voltsToDbm(dbmToVolts(-37.5)), -37.5, 1e-9);
});

test('fft inverts itself', () => {
  const re = Float64Array.from({ length: 64 }, (_, i) => Math.sin(i * 0.7)), im = new Float64Array(64), orig = re.slice();
  fft(re, im, -1); fft(re, im, 1);
  re.forEach((v, i) => near(v / 64, orig[i], 1e-9));
});

test('every product within the order gets its own bin', () => {
  const g = createGrid([{ id: 'A', hz: 1 }, { id: 'B', hz: 100 }, { id: 'C', hz: 10000 }], 5);
  const seen = new Set();
  for (let a = -5; a <= 5; a++) for (let b = -5; b <= 5; b++) for (let c = -5; c <= 5; c++) {
    const idx = ((a * g.weights[0] + b * g.weights[1] + c * g.weights[2]) % g.N + g.N) % g.N;
    assert.ok(!seen.has(idx));
    seen.add(idx);
    assert.deepEqual([g.digits[0][idx], g.digits[1][idx], g.digits[2][idx]], [a, b, c]);
    assert.equal(g.valid[idx], 1);
  }
});

test('a linear level passes through unchanged', () => {
  const p = products(twoTone(-20));
  assert.equal(p.length, 2);
  near(p[0].dbm, -20, 1e-9);
});

test('amplifier adds gain at low level', () => {
  const out = amplifier(twoTone(-50), { gainDb: 20, oip3Dbm: 30 });
  near(levelOf(out, [1, 0]), -30, 0.01);
});

test('third-order products match the OIP3 formula and rise 3 dB per dB', () => {
  const opts = { gainDb: 20, oip3Dbm: 30 };
  const at = (dbm) => {
    const out = amplifier(twoTone(dbm), opts);
    return { c: levelOf(out, [1, 0]), im: levelOf(out, [2, -1]) };
  };
  const a = at(-40), b = at(-30);
  near(a.im, 3 * a.c - 2 * 30, 0.05, 'IM3 level');
  near(b.im - a.im, 30, 0.1, 'slope');
  near(a.c + (a.c - a.im) / 2, 30, 0.05, 'measured OIP3');
});

test('P1dB falls near the expected distance below OIP3', () => {
  const opts = { gainDb: 20, oip3Dbm: 30 };
  const grid = createGrid([{ id: 'F', hz: 1e9 }]);
  let pin = -40;
  for (; pin < 20; pin += 0.05) {
    const out = levelOf(amplifier(createSignal(grid, [{ id: 'F', dbm: pin }]), opts), [1]);
    if (pin + 20 - out >= 1) break;
  }
  near(pin + 19 - 30, -10.5, 2.5, 'P1dB relative to OIP3');
});

test('second-order products match the OIP2 formula', () => {
  const out = amplifier(twoTone(-40), { gainDb: 20, oip3Dbm: 60, oip2Dbm: 40 });
  const c = levelOf(out, [1, 0]), im2 = levelOf(out, [1, 1]);
  near(c + (c - im2), 40, 0.1);
});

const mixGrid = () => createGrid([{ id: 'RF', hz: 12000e6 }, { id: 'LO', hz: 10750e6 }]);
const mix = (type, rfDbm = -30, opts = {}) => mixer(createSignal(mixGrid(), [{ id: 'RF', dbm: rfDbm }]), { lo: 'LO', loDbm: 7, type, ...opts });

test('a mixer produces sum and difference at the expected loss', () => {
  const out = mix('double');
  const diff = products(out).find((p) => Math.abs(p.hz - 1250e6) < 1), sum = products(out).find((p) => Math.abs(p.hz - 22750e6) < 1);
  near(diff.dbm, -30 - 6.5, 0.8, 'conversion loss');
  near(sum.dbm, diff.dbm, 0.2);
  assert.equal(diff.label, 'RF − LO');
});

test('lower LO drive raises conversion loss', () => {
  const at = (loDbm) => levelOf(mix('double', -30, { loDbm }), [1, -1]);
  assert.ok(at(-3) < at(7) - 1);
});

test('better balance suppresses LO and RF feedthrough at the output', () => {
  const feed = (type, m) => levelOf(mix(type), m);
  for (const m of [[0, 1], [1, 0]]) {
    assert.ok(feed('single', m) > feed('balanced', m) + 5);
    assert.ok(feed('balanced', m) > feed('double', m) + 5);
  }
});

test('a double-balanced mixer strongly suppresses even LO harmonic products', () => {
  const even = (type) => levelOf(mix(type), [1, -2]);
  assert.ok(even('single') > even('double') + 20);
  assert.ok(levelOf(mix('double'), [1, -3]) > even('double'), 'odd products stay stronger');
});

test('the image frequency converts to the same IF', () => {
  const grid = createGrid([{ id: 'IMG', hz: 9500e6 }, { id: 'LO', hz: 10750e6 }]);
  const out = mixer(createSignal(grid, [{ id: 'IMG', dbm: -30 }]), { lo: 'LO', loDbm: 7 });
  near(products(out).find((p) => Math.abs(p.hz - 1250e6) < 1).dbm, -36.5, 0.8);
});

test('an image filter removes the image before the mixer', () => {
  const grid = createGrid([{ id: 'IMG', hz: 9500e6 }, { id: 'LO', hz: 10750e6 }]);
  const sig = filter(createSignal(grid, [{ id: 'IMG', dbm: -30 }]), bandpass(12000e6, 1000e6, 4));
  const out = mixer(sig, { lo: 'LO', loDbm: 7 });
  assert.ok(products(out).find((p) => Math.abs(p.hz - 1250e6) < 1).dbm < -70);
});

test('filters have 3 dB at their edge', () => {
  near(20 * Math.log10(bandpass(1000, 100, 3)(1000)), 0, 1e-6);
  near(20 * Math.log10(lowpass(100, 3)(100)), -3.01, 0.01);
});

test('labels read like a spur chart', () => {
  const s = [{ id: 'RF' }, { id: 'LO' }];
  assert.equal(productLabel(s, [1, -1]), 'RF − LO');
  assert.equal(productLabel(s, [-1, 2]), '2·LO − RF');
  assert.equal(productLabel(s, [2, 0]), '2·RF');
});

test('Friis cascade matches hand calculations', () => {
  const r = cascade([{ gainDb: 20, nfDb: 1, oip3Dbm: 20 }, { gainDb: -7, nfDb: 7, oip3Dbm: 5 }, { gainDb: 30, nfDb: 3, oip3Dbm: 30 }]);
  near(r.gainDb, 43, 1e-9);
  const f = 10 ** 0.1 + (10 ** 0.7 - 1) / 100 + (10 ** 0.3 - 1) / (100 * 10 ** -0.7);
  near(r.nfDb, 10 * Math.log10(f), 1e-9);
  const inv = (100 / 100) + (100 * 10 ** -0.7) / 10 ** 0.5 + (10 ** 4.3) / 1000;
  near(r.iip3Dbm, -10 * Math.log10(inv), 1e-6);
});
