const { test } = require('node:test');

test('passing test 1', () => {
  // This test passes
});

test('passing test 2', () => {
  // This test also passes
});

test('failing test', () => {
  throw new Error('This test fails');
});

test('test after failure', () => {
  // This test should not run when fail-fast is enabled
});
