import { test } from 'node:test';
import assert from 'node:assert';

test('t-failing-todo', { todo: true }, () => {
  assert.fail('t-failing-todo fails');
});

test('t-skipped', { skip: true }, () => {});

test('t-passing', () => {});
