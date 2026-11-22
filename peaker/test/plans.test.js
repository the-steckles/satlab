import test from 'node:test';
import assert from 'node:assert/strict';
import { matchSatellite, nameKeys, parseBeaconCell, parseBeaconTable, parseLongitude, parseTransponders, validateTransponders } from '../scripts/parse-plans.mjs';
import { bandOf, bandsFor, estimatedBeacon, resolveBeacons } from '../src/frequencies.js';

test('parses longitudes', () => {
  assert.equal(parseLongitude('72,1°E'), 72.1);
  assert.equal(parseLongitude('167,2°W'), -167.2);
});

test('parses comma decimals and multiple beacons', () => {
  assert.deepEqual(parseBeaconCell('11199,50 H / 11700,10 H / 12500,00 V'), [
    { freqMHz: 11199.5, pol: 'H', beam: '' },
    { freqMHz: 11700.1, pol: 'H', beam: '' },
    { freqMHz: 12500, pol: 'V', beam: '' },
  ]);
});

test('merges "or" alternatives and keeps entries missing a slash', () => {
  const r = parseBeaconCell('4197,25 L (WH or Global) or 4197,25 V (Global) 4198,25 L (WH or Global)');
  assert.equal(r.length, 2);
  assert.equal(r[0].pol, 'L/V');
  assert.equal(r[0].beam, 'WH/Global');
  assert.equal(r[1].freqMHz, 4198.25);
  assert.equal(parseBeaconCell('19700,50 L or R')[0].pol, 'L/R');
  assert.equal(parseBeaconCell('3737,90')[0].pol, '');
});

test('parses a real-format table row', () => {
  const [row] = parseBeaconTable('<table><tr><th>70,5°E</th><td><a href="http://x/E70B.html">Eutelsat 70B</a></td><td><span>11199,50 H /\n 11700,10 H</span></td></tr></table>');
  assert.equal(row.lon, 70.5);
  assert.equal(row.name, 'Eutelsat 70B');
  assert.equal(row.url, 'http://x/E70B.html');
  assert.equal(row.beacons.length, 2);
});

test('matches names through typos, aliases and longitude', () => {
  const catalog = [
    { norad: 1, keys: nameKeys('INTELSAT 10-02'), lon: -1.0 },
    { norad: 2, keys: nameKeys('THOR 7'), lon: -0.7 },
    { norad: 3, keys: nameKeys('THOR 7'), lon: 50 },
  ];
  assert.equal(matchSatellite({ name: 'Intalsat 10-02', lon: -1 }, catalog), 1);
  assert.equal(matchSatellite({ name: 'Thor 7', lon: -0.7 }, catalog), 2);
  assert.equal(matchSatellite({ name: 'Thor 7', lon: 120 }, catalog), null);
  assert.equal(matchSatellite({ name: 'Odd', lon: 0 }, catalog, { Odd: 9 }), 9);
});

test('parses Amazonas 3 style transponder layout', () => {
  const t = (str, x, y, rotated = false) => ({ str, x, y, rotated });
  const items = [
    t('Downlink', 550, 733), t('3661,00', 363, 638, true), t('3722,00', 424, 638, true), t('54', 378, 630),
    t('Vertical', 268, 619), t('C1', 352, 615), t('3625', 290, 603), t('Horizontal', 268, 590), t('C11', 340, 590),
    t('3652,00', 354, 536, true), t('3713,00', 415, 536, true),
  ];
  const list = validateTransponders(parseTransponders(items));
  assert.deepEqual(list[0], { centerMHz: 3652, bwMHz: 54, pol: 'H' });
  assert.deepEqual(list[1], { centerMHz: 3661, bwMHz: 54, pol: 'V' });
  assert.equal(list.length, 4);
});

test('applies width labels rightward and corrects unlabeled rows (Amazonas 3 Ku)', () => {
  const t = (str, x, y, rotated = false) => ({ str, x, y, rotated });
  const f = (list, y) => list.map(([v, x]) => t(`${v},00`, x, y, true));
  const items = [
    t('Downlink', 550, 733), t('54', 588, 430), t('36', 813, 430), t('Vertical', 126, 419), t('Horizontal', 126, 390),
    ...f([[11738, 573], [11799, 634], [11860, 695], [11921, 756], [11972, 807], [12012, 847]], 438),
    ...f([[11738, 573], [11799, 634], [11851, 686], [11891, 726], [11931, 766], [11972, 807]], 330),
  ];
  const list = validateTransponders(parseTransponders(items));
  const bw = (pol, c) => list.find((x) => x.pol === pol && x.centerMHz === c).bwMHz;
  assert.equal(bw('V', 11921), 54);
  assert.equal(bw('V', 11972), 36);
  assert.equal(bw('H', 11799), 54);
  assert.equal(bw('H', 11851), 36);
});

test('rejects overlapping channels', () => {
  assert.equal(validateTransponders([
    { centerMHz: 3700, bwMHz: 54, pol: 'V', row: 1 },
    { centerMHz: 3710, bwMHz: 54, pol: 'V', row: 1 },
  ]), null);
});

test('resolves beacons in priority order', () => {
  const data = {
    plans: { 7: { url: 'u', beacons: [{ freqMHz: 11700.25, pol: 'H', beam: '' }, { freqMHz: 4199.75, pol: 'H', beam: '' }] } },
    transmitters: { 7: [{ freqMHz: 11800, mode: 'CW' }], 8: [{ freqMHz: 437.5, mode: 'FM' }, { freqMHz: 436, mode: 'CW' }] },
  };
  const ku = resolveBeacons(7, 'Ku', data);
  assert.equal(ku.length, 1);
  assert.equal(ku[0].source, 'Frequency Plan Satellites');
  assert.equal(resolveBeacons(8, 'UHF', data)[0].freqMHz, 436);
  assert.equal(resolveBeacons(8, 'Ku', data)[0].source, 'Estimated');
  assert.deepEqual(bandsFor(7, data).known, ['C', 'Ku']);
});

test('estimated beacons are stable and in band', () => {
  for (const b of ['VHF', 'UHF', 'L', 'S', 'C', 'X', 'Ku', 'Ka']) {
    for (const n of [1, 25544, 41036, 99999]) {
      const e = estimatedBeacon(n, b);
      assert.deepEqual(e, estimatedBeacon(n, b));
      assert.equal(bandOf(e.freqMHz), b);
    }
  }
});
