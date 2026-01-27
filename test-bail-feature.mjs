import { test } from 'node:test';

test('parent test', async (t) => {
  await t.test('passing subtest 1', () => {
    console.log('subtest 1 passed');
  });

  await t.test('failing subtest', () => {
    throw new Error('This subtest fails intentionally');
  });

  await t.test('subtest after failure', () => {
    console.log('This should NOT run if bail works');
  });
});

test('second parent test', () => {
  console.log('This test should NOT run if bail works');
});
