import assert from 'node:assert/strict';
import { test } from 'node:test';

test('process.argv should include user-provided args', () => {
  assert.ok(
    process.argv.includes('--hello'),
    `Expected process.argv to include "--hello", got: ${JSON.stringify(process.argv)}`,
  );
});
