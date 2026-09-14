'use strict';
const test = require('node:test');

test('first', () => {
  console.log('log from first');
  console.error('error from first');
});

test('second', () => {
  console.log('log from second');
});
