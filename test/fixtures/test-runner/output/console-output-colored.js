'use strict';
require('./reset-color-depth.js');
const test = require('node:test');

test('colored output', () => {
  console.log({ value: 1 });
  // On a TTY, clear() writes cursor escape sequences.
  console.clear();
});
