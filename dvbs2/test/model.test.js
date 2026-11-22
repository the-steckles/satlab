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
  assert.equal(rx.source, null);
  assert.equal(videoState(rx, p).mode, 'none');
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
  const p = at(7.5), captured = settle(at(12));
  assert.equal(captured.source, 'overlay');
  assert.equal(run(captured, p, 3).source, 'overlay');
  assert.equal(settle(p, 12).source, 'overlay');
  assert.equal(settle(p).source, null, 'the same level does not acquire from below');
});

test('IQ error is large at equal power and recovers after capture', () => {
  const clean = iqSamples(at(-30), settle(at(-30)), 4000);
  const captured = iqSamples(at(12), settle(at(12)), 4000);
  const lost = iqSamples(at(0), settle(at(0)), 4000);
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
  assert.notEqual(settle(at(-3)).source, 'carrier');
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
