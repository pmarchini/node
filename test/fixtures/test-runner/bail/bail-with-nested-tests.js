'use strict';
const test = require('node:test');

test('parent test', async (t) => {
  await t.test('passing subtest 1', () => {
    // This test passes
  });

  await t.test('failing subtest', () => {
    throw new Error('This subtest fails intentionally');
  });

  await t.test('subtest after failure', () => {
    // This should NOT run if bail is working
  });
});

test('second parent test', () => {
  // This should NOT run if bail is working
});
