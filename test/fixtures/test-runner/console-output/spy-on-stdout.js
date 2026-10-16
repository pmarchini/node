'use strict';
const assert = require('node:assert');
const { test } = require('node:test');

test('a spy on process.stdout.write observes console output', (t) => {
  const write = t.mock.method(process.stdout, 'write');

  console.log('seen by the spy');

  assert.deepStrictEqual(write.mock.calls.map((call) => call.arguments[0]), ['seen by the spy\n']);
  write.mock.restore();
  console.log('captured after restore');
});
