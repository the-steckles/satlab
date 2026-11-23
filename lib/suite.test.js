import test from 'node:test';
import assert from 'node:assert/strict';
import { LABS, parseLesson, splitTerms, TERMS } from './suite.js';

test('lesson links accept only a valid one-based number', () => {
  assert.equal(parseLesson('?lesson=3', 5), 2);
  for (const bad of ['', '?lesson=0', '?lesson=6', '?lesson=-1', '?lesson=2.5', '?lesson=abc', '?lesson=1e1']) assert.equal(parseLesson(bad, 5), 0, bad);
});

test('the learning path and glossary are complete', () => {
  assert.deepEqual(LABS.map((x) => x.id), ['peaker', 'mixers', 'linkbudget', 'interference', 'dvbs2', 'troubleshoot']);
  for (const term of ['C/N', 'Es/N0', 'MER', 'IBO', 'OBO', 'RBW', 'MODCOD', 'TWTA', 'LDPC']) assert.ok(TERMS[term], term);
});

test('only the first use of a glossary term becomes a link', () => {
  const parts = splitTerms('The LO drives it. The LO and IF differ. Es/N0 is not Es/(N+I).');
  assert.deepEqual(parts.filter((p) => typeof p !== 'string').map((p) => p.term), ['LO', 'IF', 'Es/N0', 'Es/(N+I)']);
  assert.equal(parts.map((p) => (typeof p === 'string' ? p : p.text)).join(''), 'The LO drives it. The LO and IF differ. Es/N0 is not Es/(N+I).');
});

test('term links match whole words and lower-case word terms', () => {
  assert.deepEqual(splitTerms('LOW IFS BLOCK'), ['LOW IFS BLOCK']);
  assert.equal(splitTerms('Check the beacon')[1].term, 'Beacon');
});

test('simple plurals link to their term and keep their spelling', () => {
  const [, part] = splitTerms('Two side lobes');
  assert.deepEqual(part, { term: 'Side lobe', text: 'side lobes' });
  assert.equal(splitTerms('All MODCODs')[1].term, 'MODCOD');
});
