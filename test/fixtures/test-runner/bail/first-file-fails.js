'use strict';
const test = require('node:test');

test('first file - passing test', () => {
  // This test passes
});

test('first file - failing test', () => {
  throw new Error('This test fails intentionally');
});

test('first file - test after failure', () => {
  // This should NOT run if bail is working
});
