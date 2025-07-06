const { test } = require('node:test');

test('failing test 1', () => {
  throw new Error('This test fails');
});

test('failing test 2', () => {
  throw new Error('This test also fails');
});

test('failing test 3', () => {
  throw new Error('This test fails too');
});
