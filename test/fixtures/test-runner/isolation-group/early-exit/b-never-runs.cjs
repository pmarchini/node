'use strict';
const test = require('node:test');

test('b-never-runs.cjs fails', () => {
  throw new Error('this test is skipped by the early exit');
});
