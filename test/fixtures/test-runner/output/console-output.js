'use strict';
const { after, afterEach, before, beforeEach, describe, it, test } = require('node:test');

// Not produced inside a test, so it is written straight to stdout.
console.log('module scope');

before(() => console.log('root before hook'));
beforeEach(() => console.log('beforeEach hook'));
after(() => console.log('root after hook'));

test('test with output', () => {
  console.log('log from test');
  console.error('error from test');
});

describe('suite with output', () => {
  console.log('suite body');
  afterEach(() => console.log('afterEach hook in suite'));

  it('nested test with output', () => {
    console.log('log from nested test');
  });
});

test('test with subtests', async (t) => {
  await t.test('subtest with output', () => {
    console.log('log from subtest');
  });
  console.log('log after subtest');
});
