const { test } = require('node:test');

test('file1 failing test', () => {
  throw new Error('This test fails in file 1');
});
