'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

test('process.argv should include user arg --hello', () => {
  assert.ok(
    process.argv.includes('--hello'),
    `Expected process.argv to include "--hello", got: ${JSON.stringify(process.argv)}`
  );
});
