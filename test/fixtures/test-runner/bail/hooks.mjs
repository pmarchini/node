import { test, afterEach } from 'node:test';
import assert from 'node:assert';

afterEach(() => {
  console.log('afterEach-executed');
});

test('h-failing', () => {
  assert.fail('h-failing fails');
});

test('h-cancelled', () => {});
