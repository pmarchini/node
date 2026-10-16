'use strict';
const test = require('node:test');

test('b-exits.cjs kills the worker after earlier results were sent', () => {
  setTimeout(() => process.exit(7), 200);
});
