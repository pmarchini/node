'use strict';
require('./reset-color-depth.js');
// console.clear() is a no-op on a dumb terminal; pin the terminal type so the
// snapshot does not depend on the environment running the tests.
process.env.TERM = 'xterm-256color';
const test = require('node:test');

test('colored output', () => {
  console.log({ value: 1 });
  // On a TTY, clear() writes cursor escape sequences.
  console.clear();
});
