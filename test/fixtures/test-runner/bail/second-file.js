'use strict';
const test = require('node:test');

test('second file - test 1', () => {
  // This should NOT run if bail is working (previous file failed)
});

test('second file - test 2', () => {
  // This should NOT run if bail is working
});
