import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeError } from '../app_unpacked/src/js/data/errors.js';

test('normalizes unknown thrown values into Error instances', () => {
  const error = normalizeError('disk full', 'Storage failed');
  assert.equal(error instanceof Error, true);
  assert.equal(error.message, 'disk full');
});

test('uses fallback text for empty thrown values', () => {
  assert.equal(normalizeError(null, 'Storage failed').message, 'Storage failed');
});
