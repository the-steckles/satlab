import test from 'node:test';
import assert from 'node:assert/strict';
import { CASES, DEFAULTS, evaluate, interfererBand, iqSamples, lockShare, MODCODS, spectrum, ANSWERS, carrierToImDb, twtaOutput } from '../src/model.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b} ± ${tol}, got ${a}`);
const withI = (i, extra = {}) => ({ ...extra, interferer: { ...DEFAULTS.interferer, on: true, ...i } });
const A = (r) => r.sites.A, B = (r) => r.sites.B;

test('the clear link closes with margin at both sites', () => {
  const r = evaluate({});
  for (const s of [A(r), B(r)]) {
    assert.equal(s.state, 'Locked');
    assert.ok(s.margin > 2 && s.margin < 8, `margin ${s.margin}`);
    near(s.carrierDeltaDb, 0, 1e-9);
    near(s.floorDeltaDb, 0, 1e-9);
  }
});

test('published DVB-S2 thresholds are ordered by robustness', () => {
  const v = Object.values(MODCODS);
  assert.deepEqual(v, [...v].sort((a, b) => a - b));
  assert.equal(MODCODS['QPSK 1/2'], 1);
});

test('carrier to interference follows the set level for an in-band CW', () => {
  near(A(evaluate(withI({ kind: 'cw', icDb: -15, offsetMHz: -8 }))).iDb, 15, 0.05); // Slightly off because a tone also suppresses the carrier.
});

test('noise-like terms combine as C/(N+I)', () => {
  const s = A(evaluate(withI({ kind: 'cw', icDb: -15, offsetMHz: -8 })));
  const total = [s.cnUp, s.cnDown, s.cim, s.iDb].reduce((sum, d) => sum + 10 ** (-d / 10), 0);
  near(s.esn0, -10 * Math.log10(total), 1e-9);
});

test('an interferer away from the carrier does not add in-band interference', () => {
  const s = A(evaluate(withI({ kind: 'cw', icDb: -10, offsetMHz: 0 })));
  assert.equal(s.iDb, Infinity);
});

test('the same power spread wider puts less of it on the carrier', () => {
  // A low level keeps limiter suppression out of the comparison.
  const cw = A(evaluate(withI({ kind: 'cw', icDb: -25, offsetMHz: -8 }))).iDb;
  const wide = A(evaluate(withI({ kind: 'barrage', icDb: -25 }))).iDb;
  near(wide - cw, 10 * Math.log10(36 / 5), 0.05);
});

test('uplink interference reaches both sites and downlink interference only Site A', () => {
  const up = evaluate(withI({ path: 'uplink', icDb: -5 }));
  near(A(up).esn0, B(up).esn0, 1e-9);
  const down = evaluate(withI({ path: 'downlink', icDb: -5 }));
  assert.ok(A(down).esn0 < B(down).esn0 - 3);
  near(B(down).esn0, B(evaluate({})).esn0, 1e-9);
});

test('a strong out-of-carrier uplink signal robs transponder power from the carriers', () => {
  const r = evaluate(withI({ kind: 'cw', icDb: 10, offsetMHz: 0 }));
  assert.equal(A(r).iDb, Infinity);
  assert.ok(r.robbedDb > 3, `robbed ${r.robbedDb}`);
  assert.ok(A(r).carrierDeltaDb < -3);
});

test('a downlink interferer cannot rob transponder power', () => {
  near(evaluate(withI({ path: 'downlink', icDb: 10, offsetMHz: 0 })).robbedDb, 0, 1e-9);
});

test('output power never exceeds saturation', () => {
  for (const iboDb of [20, 3, 0, -10, -20]) assert.ok(evaluate({ iboDb }).tp.pout <= 1);
});

test('rain lowers the carrier and raises the noise, mispointing only lowers the carrier', () => {
  const rain = A(evaluate({ rainDb: 6 })), point = A(evaluate({ mispointDb: 6 }));
  near(rain.carrierDeltaDb, -6, 1e-9);
  near(point.carrierDeltaDb, -6, 1e-9);
  assert.ok(rain.floorDeltaDb > point.floorDeltaDb + 1);
  assert.ok(rain.esn0 < point.esn0);
  near(B(evaluate({ rainDb: 6 })).margin, B(evaluate({})).margin, 1e-9);
});

test('a more robust MODCOD restores margin under interference', () => {
  const i = withI({ kind: 'cw', icDb: -5, offsetMHz: -8 });
  assert.equal(A(evaluate(i)).state, 'Lost');
  assert.equal(A(evaluate({ ...i, modcod: 'QPSK 1/2' })).state, 'Locked');
});

test('moving the carrier away clears the interference', () => {
  const i = withI({ kind: 'cw', icDb: 0, offsetMHz: -8 });
  assert.equal(A(evaluate({ ...i, carrierMHz: -2 })).iDb, Infinity);
});

test('moving your carrier onto the other carrier breaks both', () => {
  const s = A(evaluate({ carrierMHz: 8 }));
  assert.equal(s.state, 'Lost');
  assert.equal(s.neighborState, 'Lost');
  near(s.iDb, 0, 1e-9);
  assert.equal(A(evaluate({ carrierMHz: 2 })).iDb, Infinity);
});

test('a swept interferer moves and locks only part of the time', () => {
  const i = { ...DEFAULTS.interferer, on: true, kind: 'swept', offsetMHz: 0, spanMHz: 30, sweepS: 8 };
  const a = interfererBand(i, 0), b = interfererBand(i, 2);
  assert.notDeepEqual(a, b);
  const share = lockShare(withI({ kind: 'swept', offsetMHz: 0, spanMHz: 30, icDb: 3 }));
  assert.ok(share > 0.5 && share < 1, `share ${share}`);
});

test('the spectrum shows carriers above the noise and the interferer where it is set', () => {
  const s = spectrum(withI({ kind: 'cw', icDb: 0, offsetMHz: 0 }), 'A', 0);
  const at = (mhz) => s.db[Math.round(((mhz - s.lowMHz) / (s.highMHz - s.lowMHz)) * (s.db.length - 1))];
  assert.ok(at(-8) > at(-14) + 10);
  assert.ok(at(0) > at(-8), 'narrow CW has high density');
  assert.ok(at(25) < at(-14), 'outside the transponder falls off');
});

test('each diagnosis case produces its signature', () => {
  const run = (id) => evaluate(CASES.find((c) => c.id === id).set);
  const clean = evaluate({});
  assert.ok(A(run('rain')).carrierDeltaDb < -3 && A(run('rain')).floorDeltaDb > 0.5);
  assert.ok(A(run('mispoint')).carrierDeltaDb < -3 && A(run('mispoint')).floorDeltaDb < 0.5);
  assert.ok(A(run('uplinkI')).margin < 0 && B(run('uplinkI')).margin < 0);
  assert.ok(A(run('uplinkI')).neighborMargin > A(run('uplinkI')).margin + 2);
  assert.ok(A(run('downlinkI')).margin < 0 && B(run('downlinkI')).state === 'Locked');
  near(A(run('downlinkI')).carrierDeltaDb, 0, 1e-9);
  assert.ok(A(run('overdrive')).esn0 < A(clean).esn0 && B(run('overdrive')).neighborEsn0 < B(clean).neighborEsn0);
});

test('sweep span, width, rate and shape change the interferer', () => {
  const base = { ...DEFAULTS.interferer, on: true, kind: 'swept', offsetMHz: 0, spanMHz: 20, sweepWidthMHz: 2, sweepS: 4 };
  assert.deepEqual(interfererBand(base, 2), [9, 11]);
  assert.deepEqual(interfererBand({ ...base, sweepShape: 'saw' }, 1), [-6, -4]);
  assert.deepEqual(interfererBand({ ...base, sweepS: 8 }, 4), [9, 11]);
});

test('narrowband, partial-band and wideband widths are independent', () => {
  const i = { ...DEFAULTS.interferer, on: true, offsetMHz: 2, narrowMHz: 1, bwMHz: 10, wideMHz: 30 };
  assert.deepEqual(interfererBand({ ...i, kind: 'cw' }), [2, 2]);
  assert.deepEqual(interfererBand({ ...i, kind: 'narrow' }), [1.5, 2.5]);
  assert.deepEqual(interfererBand({ ...i, kind: 'partial' }), [-3, 7]);
  assert.deepEqual(interfererBand({ ...i, kind: 'barrage' }), [-13, 17]);
});

test('a CW tone has no bandwidth but delivers all its power', () => {
  const tone = withI({ kind: 'cw', icDb: -10, offsetMHz: -8 });
  near(A(evaluate(tone)).iDb, 10, 0.2);
  assert.equal(A(evaluate(withI({ kind: 'cw', icDb: -10, offsetMHz: 8 }))).iDb, Infinity);
  const clean = spectrum(withI({ kind: 'cw', icDb: -60, offsetMHz: 0 }), 'input', 0), s = spectrum(withI({ kind: 'cw', icDb: 0, offsetMHz: 0 }), 'input', 0);
  assert.equal(s.db.filter((v, n) => v > clean.db[n] + 3).length, 1, 'one analyzer bin');
});

test('a swept tone with zero width still crosses the carrier', () => {
  const share = lockShare(withI({ kind: 'swept', offsetMHz: 0, spanMHz: 30, sweepWidthMHz: 0, icDb: 3 }));
  assert.ok(share > 0.5 && share < 1, `share ${share}`);
});

test('a wider symbol rate lowers Es/N0 at the same power', () => {
  assert.ok(A(evaluate({ rsMHz: 10 })).esn0 < A(evaluate({})).esn0 - 2);
});

test('power shares add up, and robbing lowers both carriers equally', () => {
  const r = evaluate(withI({ kind: 'cw', icDb: 10, offsetMHz: 0 }));
  near(Object.values(r.shares).reduce((a, b) => a + b), 1, 1e-9);
  near(A(r).carrierDeltaDb, -r.robbedDb, 0.01);
});

test('ALC holds total output constant while still robbing power', () => {
  const quiet = evaluate({ alc: true }), hot = evaluate({ ...withI({ kind: 'cw', icDb: 15, offsetMHz: 0 }), alc: true });
  near(hot.tp.pout, quiet.tp.pout, 1e-9);
  assert.ok(hot.robbedDb > 3);
});

test('the IQ cloud spreads as interference rises', () => {
  const clean = iqSamples(evaluate({}), 'A', 4000), hit = iqSamples(evaluate(withI({ kind: 'partial', bwMHz: 6, icDb: 0 })), 'A', 4000);
  assert.ok(clean.merDb > hit.merDb + 4);
  near(clean.merDb, A(evaluate({})).esn0, 0.6);
});

test('a removed second carrier reports as off', () => {
  const s = A(evaluate({ neighborOn: false }));
  assert.equal(s.neighborState, 'Off');
  assert.equal(s.neighborEsn0, null);
});

test('the TWTA saturates at 0 dB backoff and output backoff is smaller than input backoff', () => {
  near(twtaOutput(1), 1, 1e-12);
  for (const ibo of [1, 3, 6, 10]) {
    const obo = -10 * Math.log10(twtaOutput(10 ** (-ibo / 10)));
    assert.ok(obo < ibo, `IBO ${ibo} gave OBO ${obo}`);
  }
  assert.ok(carrierToImDb(1) >= 10 && carrierToImDb(1) <= 14, 'two-carrier C/IM at saturation');
  assert.ok(carrierToImDb(0.25) > carrierToImDb(1) + 10);
});

test('the floor row rises for wideband interference but not for a tone', () => {
  const wide = A(evaluate(withI({ kind: 'barrage', icDb: -7, offsetMHz: 0 })));
  assert.ok(wide.floorDeltaDb > 1.5, `${wide.floorDeltaDb}`);
  assert.ok(Math.abs(A(evaluate(withI({ kind: 'cw', icDb: -7, offsetMHz: -8 }))).floorDeltaDb) < 0.3);
});

test('a tone fades smoothly across the carrier edge', () => {
  const es = (offsetMHz) => A(evaluate(withI({ kind: 'cw', icDb: 0, offsetMHz }))).esn0;
  const center = es(-8), edge = es(-8 + 2.5), outside = es(-8 + 3.1);
  assert.ok(center < edge - 2, 'half power at Rs/2');
  assert.ok(edge < outside - 2, 'rolls off beyond it');
  assert.ok(Math.abs(es(-8 + 2.49) - es(-8 + 2.51)) < 0.5, 'no brick wall');
});

test('a dominant tone suppresses other carriers more than noise-like interference', () => {
  const robbed = (kind) => evaluate(withI({ kind, icDb: 12, offsetMHz: 0, bwMHz: 6 })).robbedDb;
  assert.ok(robbed('cw') > robbed('partial') + 2);
});

test('every diagnosis ticket has a listed answer', () => {
  for (const c of CASES) assert.ok(ANSWERS[c.answer], c.id);
  assert.ok(CASES.some((c) => c.answer === 'none'));
});
