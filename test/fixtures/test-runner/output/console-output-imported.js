'use strict';
const test = require('node:test');
const { logFromModule } = require('./console-output-logger.js');

test('output from an imported function', () => {
  logFromModule('logged by the imported function');
});
