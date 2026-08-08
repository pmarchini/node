import { test } from 'node:test';
import assert from 'node:assert';

test('a-passing', () => {});

test('a-failing', () => {
  assert.fail('a-failing fails');
});

test('a-after-failure', () => {});
