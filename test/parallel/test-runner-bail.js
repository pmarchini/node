'use strict';
require('../common');
const assert = require('node:assert');
const { run, describe, it } = require('node:test');
const fixtures = require('../common/fixtures');

describe('--test-bail flag', () => {
  it('should stop running tests after first failure with bail: true', async () => {
    const fixture = fixtures.path('test-runner', 'bail', 'bail-with-nested-tests.js');
    const stream = run({ files: [fixture], bail: true });

    const passedTests = [];
    const failedTests = [];

    stream.on('test:pass', (result) => {
      passedTests.push(result.name);
    });

    stream.on('test:fail', (result) => {
      failedTests.push(result.name);
    });

    // eslint-disable-next-line no-unused-vars
    for await (const _ of stream);

    // First subtest should pass
    assert.ok(passedTests.includes('passing subtest 1'), 'passing subtest 1 should have passed');

    // Second subtest should fail
    assert.ok(failedTests.includes('failing subtest'), 'failing subtest should have failed');

    // Subsequent tests should NOT run due to bail
    assert.ok(!passedTests.includes('subtest after failure'), 'subtest after failure should NOT have run');
    assert.ok(!passedTests.includes('second parent test'), 'second parent test should NOT have run');
  });

  it('should run all tests without bail option', async () => {
    const fixture = fixtures.path('test-runner', 'bail', 'bail-with-nested-tests.js');
    const stream = run({ files: [fixture], bail: false });

    const passedTests = [];
    const failedTests = [];

    stream.on('test:pass', (result) => {
      passedTests.push(result.name);
    });

    stream.on('test:fail', (result) => {
      failedTests.push(result.name);
    });

    // eslint-disable-next-line no-unused-vars
    for await (const _ of stream);

    // First subtest should pass
    assert.ok(passedTests.includes('passing subtest 1'), 'passing subtest 1 should have passed');

    // Second subtest should fail
    assert.ok(failedTests.includes('failing subtest'), 'failing subtest should have failed');

    // Other tests SHOULD run without bail
    assert.ok(passedTests.includes('subtest after failure'), 'subtest after failure should have run');
    assert.ok(passedTests.includes('second parent test'), 'second parent test should have run');
  });

  it('should stop running subsequent files after first failure with bail: true', async () => {
    const firstFile = fixtures.path('test-runner', 'bail', 'first-file-fails.js');
    const secondFile = fixtures.path('test-runner', 'bail', 'second-file.js');
    const stream = run({ files: [firstFile, secondFile], bail: true, concurrency: 1 });

    const passedTests = [];
    const failedTests = [];

    stream.on('test:pass', (result) => {
      passedTests.push(result.name);
    });

    stream.on('test:fail', (result) => {
      failedTests.push(result.name);
    });

    // eslint-disable-next-line no-unused-vars
    for await (const _ of stream);

    // First file's first test should pass
    assert.ok(passedTests.includes('first file - passing test'), 'first file - passing test should have passed');

    // First file's second test should fail
    assert.ok(failedTests.includes('first file - failing test'), 'first file - failing test should have failed');

    // First file's remaining tests should NOT run due to bail
    assert.ok(!passedTests.includes('first file - test after failure'), 'first file - test after failure should NOT have run');

    // Second file's tests should NOT run due to bail
    assert.ok(!passedTests.includes('second file - test 1'), 'second file - test 1 should NOT have run');
    assert.ok(!passedTests.includes('second file - test 2'), 'second file - test 2 should NOT have run');
  });

  it('should run all files without bail option', async () => {
    const firstFile = fixtures.path('test-runner', 'bail', 'first-file-fails.js');
    const secondFile = fixtures.path('test-runner', 'bail', 'second-file.js');
    const stream = run({ files: [firstFile, secondFile], bail: false, concurrency: 1 });

    const passedTests = [];
    const failedTests = [];

    stream.on('test:pass', (result) => {
      passedTests.push(result.name);
    });

    stream.on('test:fail', (result) => {
      failedTests.push(result.name);
    });

    // eslint-disable-next-line no-unused-vars
    for await (const _ of stream);

    // All tests from first file should run
    assert.ok(passedTests.includes('first file - passing test'), 'first file - passing test should have passed');
    assert.ok(failedTests.includes('first file - failing test'), 'first file - failing test should have failed');
    assert.ok(passedTests.includes('first file - test after failure'), 'first file - test after failure should have run');

    // All tests from second file should run
    assert.ok(passedTests.includes('second file - test 1'), 'second file - test 1 should have run');
    assert.ok(passedTests.includes('second file - test 2'), 'second file - test 2 should have run');
  });
});
