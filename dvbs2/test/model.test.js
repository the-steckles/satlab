import test from 'node:test';
import assert from 'node:assert/strict';
import { constellation } from '../../lib/constellation.js';
import { createReceiver, DEFAULTS, iqSamples, levels, MODCODS, monitor, settle, stepReceiver, videoState } from '../src/model.js';

const at = (ratioDb, extra = {}) => ({ ...DEFAULTS, ratioDb, ...extra });
const run = (rx, p, seconds) => { for (let t = 0; t < seconds; t += 0.1) rx = stepReceiver(rx, p, 0.1); return rx; };

test('every constellation has unit average power and the right size', () => {
  for (const [name, size] of [['QPSK 3/4', 4], ['8PSK 2/3', 8], ['16APSK 3/4', 16], ['32APSK 3/4', 32]]) {
    const points = constellation(name);
    assert.equal(points.length, size);
    const power = points.reduce((sum, p) => sum + p.i ** 2 + p.q ** 2, 0) / size;
    assert.ok(Math.abs(power - 1) < 1e-9, name);
  }
});

test('a weak overlay only degrades, and the picture survives', () => {
  const rx = settle(at(-15));
  assert.equal(rx.source, 'carrier');
  assert.equal(videoState(rx, at(-15)).mode, 'carrier');
  assert.ok(levels(at(-15)).carrierEs < levels(at(-30)).carrierEs);
});

test('equal power breaks both signals', () => {
  const p = at(0), l = levels(p), rx = settle(p);
  assert.ok(l.carrierEs < l.need && l.overlayEs < l.need);
  assert.equal(rx.state, 'fecFail');
  assert.equal(videoState(rx, p).mode, 'frozen');
});

test('demod limits do not depend on the MODCOD', () => {
  for (const modcod of Object.keys(MODCODS)) {
    assert.equal(stepReceiver({ state: 'fecFail', source: 'carrier', timer: 0 }, at(-30, { modcod, cnDb: -2 }), 0.1).state, 'fecFail', modcod);
    assert.equal(stepReceiver({ state: 'fecFail', source: 'carrier', timer: 0 }, at(-30, { modcod, cnDb: -4 }), 0.1).state, 'lost', modcod);
  }
});

test('a fade raises the MER alarm against a fixed baseline', () => {
  const p = at(-30, { overlayOn: false, cnDb: 9 });
  assert.equal(monitor(p, settle(p), 10).merAlarm, true);
});

test('a receiver stuck on an undecodable signal moves to one that can decode', () => {
  const p = at(2.8, { modcod: 'QPSK 1/2', cnDb: 24 });
  const rx = run({ state: 'fecFail', source: 'carrier', timer: 0 }, p, 5);
  assert.equal(rx.source, 'overlay');
  assert.notEqual(rx.state, 'fecFail');
});

test('a searching receiver can stop at demod lock with FEC failing', () => {
  const p = at(-30, { cnDb: 3 });
  let rx = { state: 'searching', source: null, timer: 0 };
  rx = run(rx, p, 4);
  assert.equal(rx.state, 'fecFail');
  assert.equal(rx.source, 'carrier');
});

test('MER is decision-directed and raises an alarm when it falls', () => {
  const p = at(-6.5), rx = run(settle(at(-20)), p, 2), iq = iqSamples(p, rx, 3000);
  assert.ok(iq.merDb > levels(p).carrierEs, 'nearest-point MER reads high below threshold');
  assert.equal(monitor(p, rx, 9).merAlarm, true);
  assert.equal(monitor(p, rx, 15.5).merAlarm, false);
});

test('the full ramp goes carrier, lost, then captured with a clean picture', () => {
  let rx = createReceiver();
  const seen = new Set();
  for (let ratioDb = -25; ratioDb <= 12; ratioDb += 0.15) {
    rx = stepReceiver(rx, at(ratioDb), 0.1);
    seen.add(rx.state);
  }
  rx = run(rx, at(12), 4);
  assert.ok(seen.has('lost') && seen.has('searching'));
  assert.equal(rx.state, 'locked');
  assert.equal(rx.source, 'overlay');
  assert.deepEqual(videoState(rx, at(12)), { mode: 'overlay', errors: 0 });
});

test('capture has hysteresis', () => {
  const p = at(-2.5), captured = settle(at(12));
  assert.equal(captured.source, 'overlay');
  assert.equal(run(captured, p, 3).source, 'overlay', 'demod keeps following a signal it could not acquire');
  assert.equal(settle(p, 12).source, 'overlay');
  assert.equal(settle(p).source, 'carrier', 'a receiver that never captured stays on the carrier');
});

test('FEC has no memory: the same signal decodes however it was reached', () => {
  const p = at(-8);
  assert.equal(run(settle(at(-5)), p, 6).state, run(settle(at(-20)), p, 6).state);
  assert.notEqual(run(settle(at(-5)), p, 6).state, 'fecFail');
});

test('IQ error is large at equal power and recovers after capture', () => {
  const clean = iqSamples(at(-30), settle(at(-30)), 4000);
  const captured = iqSamples(at(12), settle(at(12)), 4000);
  const lost = iqSamples(at(0), { state: 'searching', source: null, timer: 0 }, 4000);
  assert.equal(lost.merDb, null);
  assert.equal(lost.tracking, false);
  assert.ok(clean.merDb > 13);
  assert.ok(captured.merDb > 8);
});

test('authentication blocks captured content but cannot prevent RF capture', () => {
  const p = at(12, { authOn: true }), rx = settle(p);
  assert.equal(rx.source, 'overlay');
  assert.equal(videoState(rx, p).mode, 'blocked');
  assert.equal(monitor(p, rx).authResult, 'FAILED');
  assert.equal(monitor(p, rx).idAlarm, true);
});

test('a more robust MODCOD survives a stronger overlay', () => {
  assert.equal(settle(at(-3, { modcod: 'QPSK 1/2' })).source, 'carrier');
  assert.ok(MODCODS['QPSK 1/2'] < levels(at(-3, { modcod: 'QPSK 1/2' })).carrierEs);
  assert.equal(settle(at(-3)).state, 'fecFail');
});

test('just below threshold the demodulator holds while FEC fails', () => {
  const p = at(-6.5), rx = run(settle(at(-20)), p, 2);
  assert.equal(rx.state, 'fecFail');
  assert.equal(rx.source, 'carrier');
  assert.equal(iqSamples(p, rx, 200).tracking, true);
  assert.equal(videoState(rx, p).mode, 'frozen');
});

test('the picture is clean just above threshold', () => {
  const p = at(-7.5), rx = run(settle(at(-20)), p, 2);
  assert.ok(levels(p).carrierEs > levels(p).need);
  assert.equal(videoState(rx, p).errors, 0);
});

test('an unsynchronized overlay spreads points into clouds, not tone-like rings', () => {
  const p = { ...DEFAULTS, cnDb: 24, overlayOn: true, ratioDb: -12 }, iq = iqSamples(p, settle(p), 3000);
  const err = iq.samples.map((s) => Math.min(...iq.ideal.map((x) => Math.hypot(s.i - x.i, s.q - x.q))));
  const mean = err.reduce((a, b) => a + b, 0) / err.length, sd = Math.sqrt(err.reduce((a, b) => a + (b - mean) ** 2, 0) / err.length);
  // A ring keeps one error size (about 0.17 here). Unsynchronized symbols spread it to about 0.33.
  assert.ok(sd / mean > 0.25, `spread ${(sd / mean).toFixed(2)}`);
});

test('monitoring alarms on an outage even when the level barely moved', () => {
  const p = at(-6.5), m = monitor(p, run(settle(at(-20)), p, 2));
  assert.equal(m.levelAlarm, false);
  assert.equal(m.serviceAlarm, true);
  assert.equal(m.serviceId, 'waiting for FEC');
});

test('identity and signature are unknown until FEC locks', () => {
  const p = at(12, { authOn: true }), m = monitor(p, { state: 'frameSync', source: 'overlay', timer: 0 });
  assert.equal(m.idAlarm, false);
  assert.equal(m.authResult, 'waiting');
});

test('a strong overlay compresses the transponder and pushes the real carrier down', () => {
  const l = levels(at(10));
  assert.ok(l.totalDb > 0 && l.totalDb < 3, `total ${l.totalDb}`);
  assert.ok(l.carrierDb < -5, `carrier ${l.carrierDb}`);
  assert.ok(Math.abs(levels(at(-30)).carrierDb) < 0.05);
});

test('after the overlay falls away the receiver returns to the carrier', () => {
  let rx = settle(at(12));
  assert.equal(rx.source, 'overlay');
  for (let ratioDb = 12; ratioDb >= -25; ratioDb -= 0.15) rx = stepReceiver(rx, at(ratioDb), 0.1);
  rx = run(rx, at(-25), 4);
  assert.equal(rx.source, 'carrier');
  assert.equal(rx.state, 'locked');
});
