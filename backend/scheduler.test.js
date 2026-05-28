import test from 'node:test';
import assert from 'node:assert/strict';

import { calculateRandomPublishTime } from './scheduler.js';

test('calculates publish time inside the requested random window', () => {
  for (let index = 0; index < 50; index += 1) {
    const result = calculateRandomPublishTime('2026-05-28', '19:00', 30);
    const min = new Date(2026, 4, 28, 18, 45, 0, 0);
    const max = new Date(2026, 4, 28, 19, 15, 0, 0);

    assert.ok(result >= min);
    assert.ok(result <= max);
  }
});

test('uses the selected local calendar date', () => {
  const result = calculateRandomPublishTime('2026-01-02', '00:05', 0);

  assert.equal(result.getFullYear(), 2026);
  assert.equal(result.getMonth(), 0);
  assert.equal(result.getDate(), 2);
  assert.equal(result.getHours(), 0);
  assert.equal(result.getMinutes(), 5);
});
