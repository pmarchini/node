'use strict';
const test = require('node:test');

test('sees --custom-flag in process.argv: ' + process.argv.includes('--custom-flag'));
