import assert from 'node:assert/strict';
import { test } from 'node:test';

test('interleaved file/argv handling (b)', () => {
  assert.deepStrictEqual(process.argv.slice(2), [
    '--issue-61852-flag-a',
    '--issue-61852-flag-b',
  ]);
  assert.ok(
    !process.argv.some((arg) => arg.endsWith('issue-61852-interleaved-a.mjs')),
    `Unexpected sibling test file path in argv: ${JSON.stringify(process.argv)}`,
  );
});
