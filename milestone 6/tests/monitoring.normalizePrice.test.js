import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePrice } from '../src/monitoring.js';

test('normalizePrice parses European values with thousands and decimals', () => {
  assert.equal(normalizePrice('16.000,00 €'), 16000);
  assert.equal(normalizePrice('367.500,00 €'), 367500);
  assert.equal(normalizePrice('1.234.567,89 €'), 1234567);
});

test('normalizePrice parses values without decimals', () => {
  assert.equal(normalizePrice('510.000 €'), 510000);
  assert.equal(normalizePrice('120000 €'), 120000);
});

test('normalizePrice returns null for empty or invalid input', () => {
  assert.equal(normalizePrice(''), null);
  assert.equal(normalizePrice('---'), null);
  assert.equal(normalizePrice(null), null);
});
