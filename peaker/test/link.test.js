import test from 'node:test';
import assert from 'node:assert/strict';
import { computeTrace, dopplerHz, fsplDb, noiseDbm, peakNear } from '../src/link.js';
import { isGeostationary, look, makeSatrec, nextPass, subLongitude } from '../src/orbit.js';

const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

const geoOmm = {
  OBJECT_NAME: 'TEST GEO', OBJECT_ID: '2020-001A', EPOCH: '2026-11-21T00:00:00.000000', MEAN_MOTION: 1.00273791,
  ECCENTRICITY: 0.0001, INCLINATION: 0.05, RA_OF_ASC_NODE: 90, ARG_OF_PERICENTER: 0, MEAN_ANOMALY: 0,
  EPHEMERIS_TYPE: 0, CLASSIFICATION_TYPE: 'U', NORAD_CAT_ID: 90001, ELEMENT_SET_NO: 999, REV_AT_EPOCH: 100,
  BSTAR: 0, MEAN_MOTION_DOT: 0, MEAN_MOTION_DDOT: 0,
};
const leoOmm = { ...geoOmm, OBJECT_NAME: 'TEST LEO', NORAD_CAT_ID: 90002, MEAN_MOTION: 15.5, INCLINATION: 51.6, ECCENTRICITY: 0.0005 };

test('free-space loss matches the GEO Ku reference', () => near(fsplDb(38000, 12000), 205.6, 0.1));
test('thermal noise matches kTB', () => near(noiseDbm(290, 1), -174, 0.1));
test('approaching satellite shifts frequency up', () => near(dopplerHz(437e6, -7), 10204, 5));

test('trace shows a CW beacon at the right frequency and level', () => {
  let s = 1;
  const rng = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const t = computeTrace({ centerHz: 11.7e9, spanHz: 1e6, rbwHz: 3000, bins: 801, noiseFloorDbm: -120, carriers: [{ freqHz: 11.7001e9, dbm: -80 }], rng });
  const p = peakNear(t, 11.7e9, 1e6, 11.7001e9, 5000);
  near(p.dbm, -80, 0.5);
  near(p.freqHz, 11.7001e9, 1250);
  const noiseBins = Array.from(t).slice(0, 100).sort((a, b) => a - b)[50];
  assert.ok(noiseBins < -100, `noise median ${noiseBins}`);
});

test('transponder block raises the floor only inside its band', () => {
  const rng = () => 0.5;
  const t = computeTrace({ centerHz: 4e9, spanHz: 100e6, rbwHz: 100e3, bins: 401, noiseFloorDbm: -110, blocks: [{ lowHz: 3.99e9, highHz: 4.01e9, dbmPerHz: -140 }], rng });
  assert.ok(t[200] > t[10] + 15);
});

test('GEO look angles stay fixed and plausible', () => {
  const sat = makeSatrec(geoOmm);
  assert.ok(isGeostationary(geoOmm));
  const when = new Date('2026-11-21T06:00:00Z');
  const station = { lat: 40, lon: subLongitude(sat, when), altM: 50 };
  const a = look(sat, station, when);
  const b = look(sat, station, new Date('2026-11-21T06:10:00Z'));
  near(a.rangeKm, 37510, 100); // law of cosines for a station at 40° latitude
  near(a.el, 43.7, 0.7);
  assert.ok(Math.abs(a.az - b.az) < 0.1 && Math.abs(a.el - b.el) < 0.1);
});

test('next pass finds a LEO rise above the threshold', () => {
  const sat = makeSatrec(leoOmm);
  const station = { lat: 30, lon: -90, altM: 0 };
  const from = new Date('2026-11-21T06:00:00Z');
  const rise = nextPass(sat, station, from, 5);
  assert.ok(rise);
  near(look(sat, station, rise).el, 5, 0.2);
  assert.ok(!isGeostationary(leoOmm));
});
