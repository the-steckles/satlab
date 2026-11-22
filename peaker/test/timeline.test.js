import test from 'node:test';
import assert from 'node:assert/strict';
import { beamwidthDeg, gainDbi, offAxisDeg } from '../src/antenna.js';
import { describeRecord, recordView } from '../src/explain.js';
import { chipFor, findChip, groupOf, nextGroup, prevGroup } from '../src/timeline.js';
import { createAutoPeak, createStepTrack } from '../src/track.js';

const D = 2.4, F = 11.7e9, HP = beamwidthDeg(D, F), NOISE = -100;
const sat = { az: 120, el: 40 };
const read = (p) => NOISE + 35 + gainDbi(offAxisDeg(p.az, p.el, sat.az, sat.el), D, F) - gainDbi(0, D, F);

function peakRun(pattern = 'spiral') {
  const c = createAutoPeak({ az: 120.5, el: 40.4, beamwidthDeg: HP, radiusDeg: 2, noiseDbm: NOISE, pattern });
  for (let i = 0; i < 20000 && c.phase !== 'done'; i++) c.update(read(c.target()));
  assert.equal(c.phase, 'done');
  return c.run;
}

function trackRun(cycles) {
  const t = createStepTrack({ az: 120.05, el: 40.03, beamwidthDeg: HP, noiseDbm: NOISE, dwell: 2, intervalS: 5 });
  for (let i = 0; i < 5000 && t.cycles < cycles; i++) { t.advance(0.2); t.update(read(t.target())); }
  return t.run;
}

test('auto-peak records every search point, 18 refine readings, and the result', () => {
  const run = peakRun();
  const count = (stage) => run.records.filter((r) => r.stage === stage).length;
  assert.equal(count('search'), run.path.length);
  assert.equal(count('measure'), 18);
  assert.equal(count('done'), 1);
  assert.equal(run.records.at(-1).stage, 'done');
  const passes = run.records.filter((r) => r.stage === 'measure').map((r) => r.pass);
  assert.deepEqual([...new Set(passes)], [1, 2, 3]);
});

test('each third reading carries the fit and the move it caused', () => {
  const m = peakRun().records.filter((r) => r.stage === 'measure');
  m.forEach((r, i) => {
    assert.equal(r.point, i % 3);
    assert.equal(r.samples.length, (i % 3) + 1);
    if (r.point === 2) {
      assert.ok(r.fit && r.newCenter);
      assert.ok(r.fits[r.axis] === r.fit);
    } else assert.equal(r.fit, null);
  });
});

test('step-track records follow the stage chips in order', () => {
  const run = trackRun(2);
  const first = run.records.filter((r) => r.cycle === 1).map((r) => chipFor(run, r));
  assert.deepEqual(first, [0, 1, 2, 3, 4, 5, 6]);
});

test('group navigation moves between passes and cycles', () => {
  const run = trackRun(3);
  const { records } = run;
  const second = records.findIndex((r) => r.cycle === 2);
  const third = records.findIndex((r) => r.cycle === 3);
  assert.equal(nextGroup(records, 0), second);
  assert.equal(nextGroup(records, second + 2), third);
  assert.equal(prevGroup(records, second + 2), second);
  assert.equal(prevGroup(records, second), 0);
  assert.equal(prevGroup(records, 0), 0);
  assert.equal(nextGroup(records, records.length - 1), records.length - 1);
});

test('clicking a stage jumps within the current pass, or to the nearest one that has it', () => {
  const run = peakRun();
  const { records } = run;
  const firstRefine = records.findIndex((r) => r.stage === 'measure');
  assert.equal(findChip(run, records.length - 1, 1), firstRefine);
  assert.equal(findChip(run, records.findIndex((r) => r.pass === 3) + 2, 1), records.findIndex((r) => r.pass === 3));
  assert.equal(findChip(run, 0, 1), firstRefine);
  assert.equal(findChip(run, firstRefine + 4, 0), 0);
  assert.equal(findChip(run, 0, 2), records.length - 1);
  assert.equal(groupOf(records[0]), 'search');

  const track = trackRun(3);
  const inTwo = track.records.findIndex((r) => r.cycle === 2) + 1;
  const elMinus = findChip(track, inTwo, 4);
  assert.equal(track.records[elMinus].cycle, 2);
  assert.equal(track.records[elMinus].axis, 'el');
  assert.equal(track.records[elMinus].point, 1);
});

test('every recorded reading has a description and a plot view', () => {
  for (const run of [peakRun(), peakRun('raster'), trackRun(2)]) {
    for (const r of run.records) {
      const d = describeRecord(run, r);
      assert.ok(d.title && d.text && !/undefined|NaN/.test(d.title + d.text), d.title);
      assert.equal(d.active, chipFor(run, r));
      assert.ok(recordView(run, r).phase);
    }
  }
});

test('search playback only shows points measured up to that reading', () => {
  const run = peakRun();
  const r = run.records[10];
  const v = recordView(run, r);
  assert.equal(v.measured.filter(Number.isFinite).length, 11);
  assert.equal(v.index, 10);
});

test('the fit description states the real move', () => {
  const run = peakRun();
  const r = run.records.find((x) => x.stage === 'measure' && x.point === 2);
  const text = describeRecord(run, r).text;
  assert.match(text, new RegExp(r.oldCenter[r.axis].toFixed(3)));
  assert.match(text, new RegExp(r.newCenter[r.axis].toFixed(3)));
});
