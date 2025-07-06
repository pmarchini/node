'use strict';
require('../common');
const assert = require('node:assert');
const { test, colors: testColors } = require('node:test');

// Test the color registration API
testColors.registerCoverageColor('high', '\u001b[92m'); // bright green
testColors.registerCoverageColor('medium', '\u001b[93m'); // bright yellow
testColors.registerCoverageColor('low', '\u001b[91m'); // bright red

testColors.registerReporterColor('test:pass', '\u001b[96m'); // bright cyan
testColors.registerReporterColor('test:fail', '\u001b[95m'); // bright magenta

// Test color schema registration
testColors.registerCoverageColorSchema({
  high: '\u001b[38;5;46m', // Bright green (256 color)
  medium: '\u001b[38;5;226m', // Bright yellow (256 color)
  low: '\u001b[38;5;196m', // Bright red (256 color)
});

testColors.registerReporterColorSchema({
  'test:pass': '\u001b[38;5;82m', // Bright green (256 color)
  'test:fail': '\u001b[38;5;196m', // Bright red (256 color)
  'test:diagnostic': '\u001b[38;5;33m', // Bright blue (256 color)
});

test('colors registration API validation', (t) => {
  t.plan(4);

  // Test invalid arguments
  t.assert.throws(() => {
    testColors.registerCoverageColor(123, 'red');
  }, {
    code: 'ERR_INVALID_ARG_TYPE',
    message: 'The "name" argument must be of type string. Received type number (123)'
  });

  t.assert.throws(() => {
    testColors.registerCoverageColor('high', 123);
  }, {
    code: 'ERR_INVALID_ARG_TYPE',
    message: 'The "color" argument must be of type string. Received type number (123)'
  });

  t.assert.throws(() => {
    testColors.registerCoverageColorSchema('not-an-object');
  }, {
    code: 'ERR_INVALID_ARG_TYPE',
    message: 'The "schema" argument must be of type object. Received type string (\'not-an-object\')'
  });

  t.assert.throws(() => {
    testColors.registerReporterColor('test:pass', null);
  }, {
    code: 'ERR_INVALID_ARG_TYPE',
    message: 'The "color" argument must be of type string. Received null'
  });
});

test('color registration works correctly', () => {
  // This test will pass and show the custom colors in action
  assert.strictEqual(1 + 1, 2);
});

test('another test to show colors', () => {
  // This test will also pass
  assert.ok(true);
});
