'use strict';
const test = require('node:test');
const { setTimeout } = require('node:timers/promises');

test('a-slow.cjs passes after a delay', async () => {
  await setTimeout(500);
});
