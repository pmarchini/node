import { test } from 'node:test';
import assert from 'node:assert';

test('first - passes', () => {});

test('second - fails and bails', () => {
  assert.fail('bail out here');
});

test('third - is cancelled', () => {});
