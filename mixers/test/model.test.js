import test from 'node:test';
import assert from 'node:assert/strict';
import { imageMHz, noiseFloorDbm, runScene, SCENES, summarize, sweep, wantedMHz } from '../src/model.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b} ± ${tol}, got ${a}`);
const last = (r) => r.nodes.at(-1);

for (const id of Object.keys(SCENES)) {
  test(`${id}: the wanted carrier reaches the output at the cascade gain`, () => {
    const r = runScene(id, {});
    const s = summarize(last(r));
    assert.ok(s.carrier, 'wanted carrier found');
    near(s.carrier.hz / 1e6, r.wantedMHz + (r.params.twoTone ? (r.scene.sign > 0 || r.params.rfMHz > r.params.loMHz ? -r.params.spacingMHz / 2 : r.params.spacingMHz / 2) : 0), r.params.spacingMHz, 'frequency');
    near(s.carrier.dbm, r.params.rfDbm + last(r).gainDb, id === 'satTx' ? 3 : 1.2, 'level');
  });
}

test('scene frequencies match real band plans', () => {
  assert.equal(wantedMHz(SCENES.groundUp, SCENES.groundUp.defaults), 14250);
  assert.equal(wantedMHz(SCENES.satRx, SCENES.satRx.defaults), 12500);
  assert.equal(wantedMHz(SCENES.groundDown, SCENES.groundDown.defaults), 1250);
  assert.equal(imageMHz(SCENES.groundDown.defaults), 9500);
  assert.equal(imageMHz(SCENES.satRx.defaults), 10750);
});

test('the bench labels the classic products', () => {
  const r = runScene('bench', {});
  const list = last(r).products;
  const at = (mhz) => list.find((x) => Math.abs(x.hz / 1e6 - mhz) < 0.01);
  assert.equal(at(300).kind, 'wanted');
  assert.equal(at(300).label, 'F1 − LO');
  assert.equal(at(3700).label, 'F1 + LO');
  assert.equal(at(1700).kind, 'lo');
  assert.equal(at(2000).kind, 'spur');
});

test('the IF filter removes the sum product on the bench', () => {
  const sum = (filtersOn) => last(runScene('bench', { filtersOn })).products.find((x) => Math.abs(x.hz / 1e6 - 3700) < 0.01).dbm;
  assert.ok(sum(true) < sum(false) - 40);
});

test('the LNB image filter protects the IF from an image signal', () => {
  const dbc = (filtersOn) => summarize(last(runScene('groundDown', { filtersOn }))).imageDbc;
  assert.ok(dbc(false) > 0, 'unfiltered image is stronger than the −10 dB weaker carrier');
  assert.ok(dbc(true) < -40, `filtered image ${dbc(true)}`);
});

test('the uplink filter removes the unwanted sideband and LO', () => {
  const output = (filtersOn) => last(runScene('groundUp', { filtersOn })).products;
  const near13 = (list) => list.find((x) => Math.abs(x.hz / 1e6 - 13050) < 0.01).dbm;
  assert.ok(near13(output(true)) < near13(output(false)) - 40);
});

test('a two-tone sweep recovers the bench mixer intercept and a 3:1 slope', () => {
  const s = sweep('bench', {}, 1);
  near(s.iip3, 15, 0.3, 'IIP3');
  const a = s.points[1], b = s.points[4];
  near((b.im3 - a.im3) / (b.pin - a.pin), 3, 0.05, 'slope');
  assert.ok(s.p1dB && s.p1dB.pin < s.iip3 - 5 && s.p1dB.pin > s.iip3 - 16);
});

test('the measured chain intercept agrees with the cascade formula', () => {
  for (const id of ['groundDown', 'satRx', 'groundUp']) {
    const r = runScene(id, { filtersOn: true, twoTone: false, imageOn: false });
    const index = r.nodes.length - 1;
    const s = sweep(id, {}, index);
    near(s.iip3, r.nodes[index].iip3Dbm, 1.5, id);
  }
});

test('TWTA backoff trades output power for lower intermodulation', () => {
  const at = (rfDbm) => summarize(last(runScene('satTx', { rfDbm })));
  const hot = at(-40), backed = at(-50);
  assert.ok(hot.carrier.dbm > backed.carrier.dbm);
  assert.ok(hot.im3Dbc > backed.im3Dbc + 10);
});

test('high-side LO swaps the order of the two tones at the output', () => {
  const r = runScene('bench', { loMHz: 2300, twoTone: true });
  const f1 = last(r).products.find((x) => x.label === 'LO − F1');
  const f2 = last(r).products.find((x) => x.label === 'LO − F2');
  assert.ok(f1.hz > f2.hz);
});

test('edge settings stay finite or report no carrier', () => {
  const zeroIf = runScene('bench', { rfMHz: 1700, loMHz: 1700 });
  assert.equal(summarize(last(zeroIf)).carrier, null);
  assert.ok(sweep('bench', { rfMHz: 1700, loMHz: 1700 }, 1, 5).points.every((p) => !Number.isFinite(p.single)));
  const input = sweep('bench', {}, 0, 5);
  assert.equal(input.oip3, null);
  assert.equal(input.p1dB, null);
  near(input.gain, 0, 1e-9);
  assert.ok(runScene('groundDown', { imageOn: true, twoTone: true }).nodes.length === 6);
});

test('LNA gain sets the cascade noise figure in the LNB', () => {
  const node = last(runScene('groundDown', {}));
  assert.ok(node.nfDb < 1.1 && node.nfDb > 0.7, `NF ${node.nfDb}`);
  near(noiseFloorDbm(node, 1e6), -114 + node.nfDb + node.gainDb, 1e-9);
});
