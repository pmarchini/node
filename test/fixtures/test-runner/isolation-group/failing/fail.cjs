'use strict';
const test = require('node:test');

test('fail.cjs fails', () => {
  throw new Error('expected failure');
});
