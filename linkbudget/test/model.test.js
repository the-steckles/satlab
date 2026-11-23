import test from 'node:test';
import assert from 'node:assert/strict';
import { backoffCurve, bestModcod, budget, DEFAULTS, pointingLossDb, pointingToleranceDeg, rainMarginDb, slantRangeKm, sumInverseDb } from '../src/model.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b} ± ${tol}, got ${a}`);

test('slant range matches geostationary geometry', () => {
  near(slantRangeKm(90), 35786, 0.5);
  near(slantRangeKm(0), 41679, 5);
});

test('path loss and EIRP follow the standard formulas', () => {
  const b = budget({ txElDeg: 90, txPowerW: 100, txLossDb: 1 });
  near(b.upPathDb, 92.45 + 20 * Math.log10(14.25) + 20 * Math.log10(35786), 0.05);
  near(b.eirpUpDbw, 20 - 1 + b.txGainDbi, 1e-9);
});

test('C/N0 terms combine as reciprocals and the total is below every term', () => {
  near(sumInverseDb(20, 20), 16.99, 0.01);
  assert.equal(sumInverseDb(20, Infinity), 20);
  const b = budget({});
  near(b.cn0DbHz, sumInverseDb(b.cn0UpDbHz, b.cn0DownDbHz, b.cim0DbHz, b.distortion0DbHz), 1e-9);
  assert.ok(b.cn0DbHz < Math.min(b.cn0UpDbHz, b.cn0DownDbHz, b.cim0DbHz));
});

test('the signal quality measures relate correctly', () => {
  const b = budget({ modcod: '8PSK 2/3', rsMsps: 10 });
  near(b.esN0Db, b.cn0DbHz - 70, 1e-9);
  near(b.ebN0Db, b.esN0Db - 10 * Math.log10(2), 1e-9, '8PSK 2/3 carries 2 bits per symbol');
  near(b.cnOccupiedDb, b.esN0Db - 10 * Math.log10(1.2), 1e-9);
  assert.ok(b.merDb < b.esN0Db && b.merDb < 28);
});

test('the default link closes with sensible operating values', () => {
  const b = budget({});
  assert.ok(b.marginDb > 3 && b.marginDb < 12, `margin ${b.marginDb}`);
  assert.ok(b.iboDb > 3 && b.iboDb < 10, `IBO ${b.iboDb}`);
  assert.ok(b.oboDb < b.iboDb);
});

test('rain lowers the signal, raises the noise and has a limit', () => {
  const clear = budget({}), wet = budget({ downRainDb: 4 });
  assert.ok(wet.tsysK > clear.tsysK + 100);
  assert.ok(clear.cn0DownDbHz - wet.cn0DownDbHz > 4, 'costs more than the fade alone');
  const limit = rainMarginDb({});
  near(budget({ downRainDb: limit }).marginDb, 0, 1e-3);
});

test('pointing loss is 3 dB at half the beamwidth and sets the tolerance', () => {
  const b = budget({}), t = pointingToleranceDeg({});
  near(pointingLossDb(b.rxBeamDeg / 2, 1.2, 12.5e9), 3, 0.01);
  near(pointingLossDb(t.oneDbDeg, 1.2, 12.5e9), 1, 1e-6);
  near(budget({ rxPointDeg: t.closesDeg }).marginDb, 0, 1e-3);
  assert.ok(pointingToleranceDeg({ rxDishM: 4.5 }).oneDbDeg < t.oneDbDeg, 'a bigger dish needs tighter pointing');
});

test('Es/N0 has a best backoff between saturation and deep backoff', () => {
  const c = backoffCurve({});
  assert.ok(c.best.iboDb > 0 && c.best.iboDb < 15, `best ${c.best.iboDb}`);
  assert.ok(c.best.esN0 > c.rows[0].esN0 && c.best.esN0 > c.rows.at(-1).esN0);
  near(c.operatingIbo, budget({}).iboDb, 1e-9);
});

test('a lone carrier has no intermodulation term', () => {
  const b = budget({ otherCarriers: 0 });
  assert.equal(b.cimDb, Infinity);
  assert.ok(b.esN0Db > budget({}).esN0Db);
});

test('pointing loss has a floor set by the antenna pattern', () => {
  const b = budget({ rxDishM: 9, rxPointDeg: 1.5 });
  assert.ok(b.rxPointLossDb > 20 && b.rxPointLossDb < 70, `loss ${b.rxPointLossDb}`);
  assert.ok(budget({ txDishM: 13, txPointDeg: 0.4 }).iboDb < 80);
});

test('rain margin does not depend on the rain currently set', () => {
  near(rainMarginDb({ downRainDb: 8 }), rainMarginDb({}), 1e-9);
  assert.ok(rainMarginDb({ downRainDb: 8 }) > 3);
});

test('raising your carrier takes power from fixed neighbors', () => {
  const base = budget({ otherCarriers: 5 }), hot = budget({ otherCarriers: 5, txPowerW: 80 });
  assert.ok(hot.eirpDownDbw > base.eirpDownDbw + 3);
  assert.ok(hot.neighborEirpDbw < base.neighborEirpDbw);
  near(hot.neighborFluxDbWm2, base.neighborFluxDbWm2, 1e-9);
});

test('a fade on your uplink does not clean up intermodulation', () => {
  const clear = budget({ otherCarriers: 5 }), faded = budget({ otherCarriers: 5, upRainDb: 6 });
  assert.ok(faded.cimDb < clear.cimDb - 3, `C/IM ${clear.cimDb} to ${faded.cimDb}`);
  assert.ok(faded.iboDb - clear.iboDb < 3);
});

test('an overdriven lone carrier is penalized and the best point is not a plot edge', () => {
  const b = budget({ otherCarriers: 0, txPowerW: 400 });
  assert.equal(b.overdriven, true);
  assert.ok(b.marginDb < budget({ otherCarriers: 0 }).marginDb);
  const c = backoffCurve({ otherCarriers: 0, txPowerW: 400 });
  assert.equal(c.bestAtEdge, false);
  assert.ok(c.best.iboDb > 0, `best ${c.best.iboDb}`);
});

test('adding carriers never rescues an overdriven carrier', () => {
  for (const otherCarriers of [1, 5]) {
    const hot = budget({ otherCarriers, txPowerW: 400 }), nominal = budget({ otherCarriers });
    assert.ok(hot.overdriven);
    assert.ok(hot.esN0Db < nominal.esN0Db, `${otherCarriers} others: ${hot.esN0Db} vs ${nominal.esN0Db}`);
    assert.equal(backoffCurve({ otherCarriers, txPowerW: 400 }).bestAtEdge, false);
  }
});

test('denser modulations need more backoff when alone', () => {
  const best = (modcod) => backoffCurve({ otherCarriers: 0, modcod }).best.iboDb;
  assert.ok(best('32APSK 3/4') >= best('QPSK 3/4'));
});

test('the analyzer reading converts back to C/N', () => {
  const b = budget({});
  near(10 * Math.log10(10 ** (b.analyzerDeltaDb / 10) - 1), b.analyzerCnDb, 1e-9);
  const hot = budget({ otherCarriers: 0, txPowerW: 400 });
  assert.ok(hot.analyzerDeltaDb > hot.esN0Db + 10, 'overdrive distortion does not show on the analyzer');
});

test('a recommended MODCOD closes when it is selected', () => {
  for (const txPowerW of [20, 200, 400]) {
    const pick = bestModcod({ otherCarriers: 0, txPowerW, modcod: 'QPSK 1/2' });
    if (pick) assert.ok(budget({ otherCarriers: 0, txPowerW, modcod: pick }).marginDb >= 1, `${txPowerW} W ${pick}`);
  }
});

test('neighbors that overdrive the whole plot do not crash the curve', () => {
  const c = backoffCurve({ otherCarriers: 5, sfdDbWm2: -99 });
  assert.equal(c.rows.length, 0);
  assert.equal(c.best, null);
});

test('the MODCOD choice keeps the requested reserve', () => {
  const b = budget({});
  const pick = bestModcod({});
  assert.ok(budget({ modcod: pick }).marginDb >= 1);
  assert.equal(bestModcod({ txPowerW: 1, rxDishM: 0.6, downRainDb: 15 }), null);
  assert.ok(Number.isFinite(b.mbps));
  assert.equal(DEFAULTS.modcod, '16APSK 3/4');
});
