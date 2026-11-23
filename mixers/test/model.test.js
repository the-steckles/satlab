import test from 'node:test';
import assert from 'node:assert/strict';
import { imageMHz, isInverted, loForProduct, noiseFloorDbm, runScene, SCENES, summarize, sweep, wantedMHz, filterEdges, filterLossAtDb, filterSettings, amplifierBackoff, noiseProfile } from '../src/model.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b} ± ${tol}, got ${a}`);
const last = (r) => r.nodes.at(-1);

for (const id of Object.keys(SCENES)) {
  test(`${id}: the wanted carrier reaches the output at the cascade gain`, () => {
    const r = runScene(id, {});
    const s = summarize(last(r));
    assert.ok(s.carrier, 'wanted carrier found');
    near(s.carrier.hz / 1e6, r.wantedMHz, r.params.spacingMHz, 'frequency');
    near(s.carrier.dbm, r.params.rfDbm + last(r).gainDb, id === 'satTx' ? 3 : 1.2, 'level');
  });
}

test('scene frequencies match real band plans', () => {
  assert.equal(wantedMHz(SCENES.groundUp, SCENES.groundUp.defaults), 14250);
  assert.equal(wantedMHz(SCENES.satRx, SCENES.satRx.defaults), 12500);
  assert.equal(wantedMHz(SCENES.groundDown, SCENES.groundDown.defaults), 1750);
  assert.equal(imageMHz(SCENES.groundDown.defaults), 9000);
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

test('every wanted product can be selected in every mixing scene', () => {
  for (const [id, product, loMHz, out] of [
    ['bench', 'sum', 1700, 3700], ['groundUp', 'loMinusRf', 15450, 14250], ['satRx', 'loMinusRf', 26750, 12500], ['groundDown', 'loMinusRf', 14250, 1750],
  ]) {
    const r = runScene(id, { product, loMHz, twoTone: false, imageOn: false });
    const s = summarize(last(r));
    assert.equal(r.wantedMHz, out, id);
    near(s.carrier.hz / 1e6, out, 1e-6, id);
    near(s.carrier.dbm, r.params.rfDbm + last(r).gainDb, 1.2, id);
    assert.equal(s.carrier.label, product === 'sum' ? 'F1 + LO' : 'LO − F1', id);
  }
});

test('the filters follow the selected product', () => {
  const list = last(runScene('bench', { product: 'sum', filtersOn: true })).products;
  const at = (mhz) => list.find((x) => Math.abs(x.hz / 1e6 - mhz) < 0.01)?.dbm ?? -Infinity;
  assert.ok(at(3700) > at(300) + 40);
});

test('image frequency and inversion follow the product', () => {
  const p = { rfMHz: 12000, loMHz: 13250, product: 'loMinusRf' };
  assert.equal(imageMHz(p), 14500);
  assert.equal(isInverted(SCENES.groundDown, p), true);
  assert.equal(isInverted(SCENES.groundDown, { ...p, loMHz: 10750, product: 'rfMinusLo' }), false);
  assert.equal(imageMHz({ rfMHz: 1200, loMHz: 13050, product: 'sum' }), 27300);
  const r = runScene('bench', { product: 'sum', imageOn: true });
  near(summarize(last(r)).image.hz / 1e6, 3700, 0.01);
});

test('the LO solver keeps a chosen output or reports it cannot', () => {
  assert.equal(loForProduct('sum', 1200, 14250), 13050);
  assert.equal(loForProduct('loMinusRf', 1200, 14250), 15450);
  assert.equal(loForProduct('rfMinusLo', 1200, 14250), null);
});

test('a user filter changes the response, gain and rejection', () => {
  const stage = SCENES.groundDown.stages.find((x) => x.id === 'imageFilter');
  const image = (filters) => summarize(last(runScene('groundDown', { filters }))).imageDbc;
  assert.ok(image({ imageFilter: { bwMHz: 8000 } }) > image({}) + 10, 'a wide filter passes the image');
  assert.ok(image({ imageFilter: { poles: 2 } }) > image({}) + 10, 'fewer poles reject it less');
  assert.ok(image({ imageFilter: { on: false } }) > image({}) + 10, 'one filter can be bypassed');
  const f = filterSettings(stage, SCENES.groundDown, { ...SCENES.groundDown.defaults, filters: { imageFilter: { lossDb: 2 } } });
  assert.ok(Math.abs(filterLossAtDb(f, f.centerMHz) - 2) < 1e-9);
  for (const edge of filterEdges(f)) assert.ok(Math.abs(filterLossAtDb(f, edge) - 5.01) < 0.01, '3 dB below the passband at each edge');
});

test('a fixed filter center stops following the signal', () => {
  const stage = SCENES.groundUp.stages.find((x) => x.id === 'rfFilter');
  const center = (filters, rfMHz) => filterSettings(stage, SCENES.groundUp, { ...SCENES.groundUp.defaults, rfMHz, filters }).centerMHz;
  assert.equal(center({}, 1300), 14250, 'a band filter stays where it was built');
  assert.equal(center({ rfFilter: { track: true } }, 1300), 14350, 'tracking is an explicit choice');
  assert.equal(center({ rfFilter: { centerMHz: 14000 } }, 1300), 14000);
});

test('removing the image filter raises the noise figure by about 3 dB after an LNA', () => {
  for (const id of ['satRx', 'groundDown']) {
    const nf = (filtersOn) => last(runScene(id, { filtersOn })).nfDb;
    assert.ok(nf(false) > nf(true) + 2.2, `${id} ${nf(true)} to ${nf(false)}`);
  }
});

test('a carrier outside a fixed band filter is rejected', () => {
  const carrier = (rfMHz) => summarize(runScene('satRx', { rfMHz, holdOutput: false }).nodes[1]).carrier.dbm;
  assert.ok(carrier(16000) < carrier(14250) - 30);
});

test('small-signal gain includes a detuned filter', () => {
  const r = runScene('bench', { filtersOn: true, filters: { ifFilter: { centerMHz: 1000, bwMHz: 100 } } });
  const n = last(r), c = summarize(n).carrier;
  assert.ok(n.gainDb < -40);
  assert.ok(Math.abs(c.dbm - r.params.rfDbm - n.gainDb) < 1.5);
});

test('filter rejection stops at a stopband limit', () => {
  const stage = SCENES.groundDown.stages.find((x) => x.id === 'imageFilter');
  const f = filterSettings(stage, SCENES.groundDown, { ...SCENES.groundDown.defaults, filters: { imageFilter: { poles: 9, bwMHz: 100 } } });
  assert.ok(Math.abs(filterLossAtDb(f, 5000) - (f.lossDb + 80)) < 1e-9);
});

test('an image adds to the carrier in power', () => {
  const r = runScene('bench', { imageOn: true, imageDbm: -10, rfDbm: -10, filtersOn: false });
  const x = last(r).products.find((p) => Math.abs(p.hz / 1e6 - 300) < 0.01);
  const sum = 10 * Math.log10(x.parts.reduce((a, q) => a + 10 ** (q.dbm / 10), 0));
  assert.ok(x.parts.length >= 2);
  near(x.dbm, sum, 1e-9, 'power sum');
});

test('a starved LO lowers the mixer intercept', () => {
  const iip3 = (loDbm) => sweep('bench', { loDbm }, 1, 13).iip3;
  assert.ok(iip3(-3) < iip3(7) - 7);
  near(last(runScene('bench', { loDbm: -3 })).iip3Dbm, iip3(-3), 1.5, 'cascade agrees with the measurement');
});

test('two tones compress at a lower level per tone than one tone', () => {
  const s = sweep('bench', {}, 1);
  assert.ok(s.p1dBTwoTone.pin < s.p1dB.pin - 2);
});

test('TWTA backoff reaches zero near saturation and output backoff is smaller than input backoff', () => {
  const b = (rfDbm) => amplifierBackoff(runScene('satTx', { rfDbm }), 'twta');
  for (const rfDbm of [-62, -52, -45, -40]) assert.ok(b(rfDbm).oboDb < b(rfDbm).iboDb, `${rfDbm}: OBO ${b(rfDbm).oboDb}, IBO ${b(rfDbm).iboDb}`);
  assert.ok(Math.abs(b(-35).iboDb) < 1, `IBO ${b(-35).iboDb}`);
  assert.ok(b(-35).oboDb < 1.5, `OBO ${b(-35).oboDb}`);
  assert.equal(amplifierBackoff(runScene('satTx', {}), 'omux'), null);
});

test('uneven tones make the inversion visible', () => {
  const list = last(runScene('bench', { loMHz: 2300, twoTone: true, unevenTones: true })).products;
  const f1 = list.find((x) => x.label === 'LO − F1'), f2 = list.find((x) => x.label === 'LO − F2');
  assert.ok(f1.hz > f2.hz && f1.dbm > f2.dbm + 4);
});

test('filters shape the noise floor directly after them', () => {
  const r = runScene('groundDown', {}), after = noiseProfile(r, 2, 1e5), before = noiseProfile(r, 1, 1e5);
  assert.ok(after.at(12500) > after.at(9000) + 10);
  assert.equal(before.at(12500), before.at(9000));
});

test('a detuned filter still shows the noise in its own passband', () => {
  const r = runScene('groundDown', { filters: { imageFilter: { centerMHz: 9000 } } });
  const n = noiseProfile(r, r.scene.stages.findIndex((s) => s.id === 'imageFilter') + 1, 1e5);
  assert.ok(n.at(9000) > n.at(12500) + 40, `${n.at(9000)} vs ${n.at(12500)}`);
});

test('output backoff stays non-negative when the TWTA is overdriven', () => {
  const b = amplifierBackoff(runScene('satTx', { rfDbm: -10 }), 'twta');
  assert.ok(b.iboDb < 0 && b.oboDb >= 0, `IBO ${b.iboDb}, OBO ${b.oboDb}`);
});
