import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatPacificDate, pacificDate, pacificInputValue, parsePacificInput } from '../lib/pacific-time.ts';

test('Pacific follow-ups follow winter and summer UTC offsets', () => {
  assert.equal(parsePacificInput('2026-01-19T09:30'), '2026-01-19T17:30:00.000Z');
  assert.equal(parsePacificInput('2026-07-20T09:30'), '2026-07-20T16:30:00.000Z');
  assert.equal(pacificInputValue('2026-07-20T07:00:00Z'), '2026-07-20T00:00');
  assert.equal(pacificDate('2026-07-20T06:59:59Z'), '2026-07-19');
  assert.equal(formatPacificDate('2026-07-20T06:59:59Z'), 'Jul 19, 2026');
});

test('DST gaps are rejected and the repeated hour uses the first occurrence', () => {
  assert.equal(parsePacificInput('2026-03-08T02:30'), null);
  assert.equal(parsePacificInput('2026-11-01T01:30'), '2026-11-01T08:30:00.000Z');
  assert.equal(parsePacificInput('2026-02-30T09:30'), null);
});
