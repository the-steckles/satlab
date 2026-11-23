import test from 'node:test';
import assert from 'node:assert/strict';
import { DEMOD_HOLD_DB, receiverState } from './receiver.js';

test('the receiver states follow one rule at any MODCOD threshold', () => {
  for (const need of [1, 6.62, 12.73]) {
    assert.equal(receiverState(need + 2, need), 'locked');
    assert.equal(receiverState(need + 0.5, need), 'marginal');
    assert.equal(receiverState(need - 0.1, need), 'fecFail');
    assert.equal(receiverState(DEMOD_HOLD_DB - 0.1, need), 'lost');
  }
});
