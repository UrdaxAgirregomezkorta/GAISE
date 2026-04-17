import test from 'node:test';
import assert from 'node:assert/strict';
import { isNormalizationNoiseChange } from '../src/dashboard-db.js';

function asDiff(diff) {
  return JSON.stringify(diff);
}

test('detects normalization noise when visible price did not change and priceNum was divided by 1000', () => {
  const change = {
    change_type: 'price_changed',
    diff_json: asDiff([
      { field: 'priceNum', old: 16000, new: 16 },
      { field: 'price', old: '16.000,00 €', new: '16.000,00 €' }
    ])
  };

  assert.equal(isNormalizationNoiseChange(change), true);
});

test('detects normalization noise for floor division by 1000 cases', () => {
  const change = {
    change_type: 'price_changed',
    diff_json: asDiff([
      { field: 'priceNum', old: 367500, new: 367 },
      { field: 'price', old: '367.500,00 €', new: '367.500,00 €' }
    ])
  };

  assert.equal(isNormalizationNoiseChange(change), true);
});

test('does not mark real price change as noise', () => {
  const change = {
    change_type: 'price_changed',
    diff_json: asDiff([
      { field: 'priceNum', old: 510000, new: 480000 },
      { field: 'price', old: '510.000,00 €', new: '480.000,00 €' }
    ])
  };

  assert.equal(isNormalizationNoiseChange(change), false);
});

test('does not mark non-price changes as noise', () => {
  const change = {
    change_type: 'attributes_changed',
    diff_json: asDiff([
      { field: 'title', old: 'Old', new: 'New' }
    ])
  };

  assert.equal(isNormalizationNoiseChange(change), false);
});
