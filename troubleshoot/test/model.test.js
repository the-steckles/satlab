import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzerLevels, bestModcod, buildReport, captureRangeMHz, CHECKS, firstFault, isInverted, lBandMHz, modemState, REPORT_EXAMPLE, REPORT_FIELDS, TICKETS } from '../src/model.js';

const good = { lnbPower: true, freqMHz: 1750, rsMsps: 5, inverted: false, modcod: '8PSK 2/3' };
const sig = { rfMHz: 12500, loMHz: 10750, freqMHz: 1750, rsMsps: 5, esN0Db: 14, levelDbm: -48 };

test('L-band and spectral sense follow the LNB plan', () => {
  assert.equal(lBandMHz(12500, 10750), 1750);
  assert.equal(lBandMHz(12500, 14250), 1750);
  assert.equal(isInverted(12500, 10750), false);
  assert.equal(isInverted(12500, 14250), true);
});

test('the modem locks only when every check passes, reporting the first failure', () => {
  assert.equal(modemState(good, sig).state, 'locked');
  assert.equal(modemState({ ...good, lnbPower: false }, sig).failing, 'power');
  assert.equal(modemState(good, { ...sig, levelDbm: -90 }).failing, 'power');
  assert.equal(modemState({ ...good, freqMHz: 1760 }, sig).failing, 'frequency');
  assert.equal(modemState({ ...good, rsMsps: 5.1 }, sig).failing, 'symbolRate');
  assert.equal(modemState({ ...good, inverted: true }, sig).failing, 'inversion');
  assert.equal(modemState({ ...good, freqMHz: 1760, rsMsps: 7 }, sig).failing, 'frequency', 'the earlier check wins');
});

test('a small frequency error inside the search range still locks', () => {
  assert.equal(modemState({ ...good, freqMHz: 1750 + captureRangeMHz(5) * 0.9 }, sig).state, 'locked');
});

test('demod lock survives just below the FEC threshold', () => {
  const near = modemState({ ...good, modcod: '16APSK 3/4' }, { ...sig, esN0Db: 9.5 });
  assert.equal(near.state, 'fecFail');
  assert.equal(near.failing, 'quality');
  assert.equal(modemState({ ...good, modcod: '32APSK 3/4' }, { ...sig, esN0Db: 6 }).state, 'fecFail', 'the PLHEADER still locks');
  assert.equal(modemState({ ...good, modcod: '16APSK 3/4' }, { ...sig, esN0Db: -4 }).state, 'searching');
});

test('every ticket starts broken on a known check and can be fixed', () => {
  const ids = CHECKS.map(([id]) => id);
  const seen = new Set();
  for (const t of TICKETS) {
    const start = modemState(t.start, t.signal);
    assert.notEqual(start.state, 'locked', t.title);
    assert.ok(ids.includes(start.failing), t.title);
    seen.add(start.failing);
    const fixed = { ...t.start, lnbPower: true, freqMHz: t.signal.freqMHz, rsMsps: t.signal.rsMsps, inverted: isInverted(t.signal.rfMHz, t.signal.loMHz), modcod: start.failing === 'quality' ? bestModcod(t.signal.esN0Db, t.signal.rsMsps) : t.start.modcod };
    assert.equal(modemState(fixed, t.signal).state, 'locked', t.title);
  }
  assert.deepEqual([...seen].sort(), [...ids].sort(), 'every check is practiced');
});

test('the report lists all fields and what is still required', () => {
  const empty = buildReport({});
  assert.equal(empty.missing.length, REPORT_FIELDS.filter((f) => f[2]).length);
  assert.match(empty.text, /Downlink RF center \(MHz\): not provided/);
  const full = buildReport(Object.fromEntries(REPORT_FIELDS.map(([id]) => [id, `value-${id}`])));
  assert.deepEqual(full.missing, []);
  assert.match(full.text, /Polarization: value-polarization/);
  assert.equal(buildReport({ start: '   ' }).missing.includes('Interference start time (UTC)'), true);
  assert.deepEqual(buildReport({ frequency: 'banana', bandwidth: '6' }).invalid, ['Downlink RF center (MHz)']);
  assert.deepEqual(buildReport(REPORT_EXAMPLE).missing, []);
  assert.deepEqual(buildReport(REPORT_EXAMPLE).invalid, []);
});

test('the search band uses the configured symbol rate', () => {
  const s = { ...sig, freqMHz: 1751.6 };
  assert.equal(modemState({ ...good, rsMsps: 5 }, s).failing, 'frequency', 'outside the drawn 1.25 MHz band');
  assert.equal(modemState({ ...good, rsMsps: 10 }, s).failing, 'symbolRate', 'inside the drawn 2.5 MHz band');
});

test('the analyzer floor belongs to the site, and rain does not lower it', () => {
  const narrow = analyzerLevels({ ...sig, rsMsps: 2.4 }), wide = analyzerLevels({ ...sig, rsMsps: 9 });
  assert.equal(narrow.floorDbm, wide.floorDbm);
  assert.equal(narrow.peakDbm, wide.peakDbm);
  assert.ok(Math.abs(wide.totalDbm - narrow.totalDbm - 5.74) < 0.01, 'a wider carrier at equal density has more total power');
  assert.ok(analyzerLevels(TICKETS[5].signal).floorDbm > analyzerLevels(TICKETS[0].signal).floorDbm);
  assert.ok(Math.abs(TICKETS[0].signal.levelDbm + 48) < 0.02);
});

test('report checks formats and flags an L-band frequency', () => {
  for (const frequency of ['Infinity', '0x10', '1e9']) assert.deepEqual(buildReport({ frequency }).invalid, ['Downlink RF center (MHz)'], frequency);
  assert.deepEqual(buildReport({ start: 'yesterday-ish' }).invalid, ['Interference start time (UTC)']);
  for (const start of ['2026-99-99 99:99', '2026-03-14 09:20 garbage', '2026-02-30 09:20']) assert.equal(buildReport({ start }).invalid.length, 1, start);
  for (const start of ['2026-03-14 09:20', '2026-03-14 09:20 UTC', '2026-03-14T09:20:30Z']) assert.deepEqual(buildReport({ start }).invalid, [], start);
  assert.deepEqual(buildReport({ bandwidth: '.5', frequency: '12500.' }).invalid, []);
  assert.match(buildReport({ frequency: '1750' }).warning, /L-band/);
  assert.equal(buildReport({ frequency: '12500' }).warning, '');
});

test('the best MODCOD keeps 1 dB of margin', () => {
  assert.equal(bestModcod(9.5, 5), '8PSK 3/4');
  assert.equal(bestModcod(0, 5), null);
});

test('the two-fault ticket reveals its second fault after the first is fixed', () => {
  const t = TICKETS.at(-1);
  assert.equal(firstFault(t), 'frequency');
  assert.equal(modemState({ ...t.start, freqMHz: t.signal.freqMHz }, t.signal).failing, 'inversion');
});
