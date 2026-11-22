import test from 'node:test';
import assert from 'node:assert/strict';
import { besselJ0, besselJ1, beamwidthDeg, envelopeDbi, envelopeStartDeg, gainDbi, offAxisDeg, peakGainDbi, wavelengthM } from '../src/antenna.js';

const D = 2.4, F = 11.7e9;

function firstSidelobe() {
  const hp = beamwidthDeg(D, F);
  let prev = gainDbi(hp, D, F), rising = false, best = null;
  for (let t = hp; t < hp * 6; t += hp / 200) {
    const g = gainDbi(t, D, F);
    if (g > prev) rising = true;
    else if (rising) { best = { theta: t, gain: prev }; break; }
    prev = g;
  }
  return best;
}

test('Bessel functions match reference values', () => {
  assert.ok(Math.abs(besselJ0(2.404825557695773)) < 1e-6);
  assert.ok(Math.abs(besselJ1(3.831705970207512)) < 1e-6);
  assert.ok(Math.abs(besselJ1(1) - 0.44005058574) < 1e-7);
  assert.ok(Math.abs(besselJ0(10) + 0.2459357645) < 1e-6);
});

test('2.4 m Ku peak gain is realistic', () => {
  const g = peakGainDbi(D, F);
  assert.ok(g > 47 && g < 48.2, `gain ${g}`);
});

test('3 dB beamwidth is near 70 lambda/D', () => {
  const expected = (70 * wavelengthM(F)) / D;
  const hp = beamwidthDeg(D, F);
  assert.ok(Math.abs(hp - expected) / expected < 0.08, `${hp} vs ${expected}`);
});

test('first side lobe matches a 10 dB tapered aperture', () => {
  const sl = firstSidelobe();
  const rel = sl.gain - peakGainDbi(D, F);
  assert.ok(rel < -19 && rel > -28, `relative level ${rel}`);
});

test('side-lobe peaks stay under the S.580 envelope', () => {
  for (let t = envelopeStartDeg(D, F); t < 48; t += 0.01) {
    assert.ok(gainDbi(t, D, F) <= envelopeDbi(t) + 0.01, `exceeded at ${t}`);
  }
});

test('beam narrows with frequency and diameter', () => {
  assert.ok(beamwidthDeg(D, 20e9) < beamwidthDeg(D, 4e9));
  assert.ok(beamwidthDeg(9, F) < beamwidthDeg(1.2, F));
});

test('off-axis angle handles azimuth wrap and elevation compression', () => {
  assert.ok(Math.abs(offAxisDeg(359.5, 0, 0.5, 0) - 1) < 1e-6);
  assert.ok(Math.abs(offAxisDeg(10, 60, 11, 60) - 0.5) < 0.001);
});
