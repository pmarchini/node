'use strict';
require('../common');
const fixtures = require('../common/fixtures');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');

test('--test-fail-fast stops execution after first failure', async () => {
  const fixture = fixtures.path('test-runner', 'fail-fast-fixture.js');
  const args = [
    '--test',
    '--test-fail-fast',
    '--test-reporter=tap',
    fixture,
  ];
  const child = spawnSync(process.execPath, args);
  const stdout = child.stdout.toString();
  
  // Should only see the first failing test, not subsequent tests
  assert.match(stdout, /not ok 1 - failing test 1/);
  assert.doesNotMatch(stdout, /failing test 2/);
  assert.doesNotMatch(stdout, /failing test 3/);
  
  // Exit code should indicate failure
  assert.strictEqual(child.status, 1);
});

test('--test-fail-fast allows passing tests to continue', async () => {
  const fixture = fixtures.path('test-runner', 'fail-fast-pass-then-fail.js');
  const args = [
    '--test',
    '--test-fail-fast',
    '--test-reporter=tap',
    fixture,
  ];
  const child = spawnSync(process.execPath, args);
  const stdout = child.stdout.toString();
  
  // Should see passing tests until first failure
  assert.match(stdout, /ok 1 - passing test 1/);
  assert.match(stdout, /ok 2 - passing test 2/);
  assert.match(stdout, /not ok 3 - failing test/);
  assert.doesNotMatch(stdout, /test after failure/);
  
  assert.strictEqual(child.status, 1);
});

test('normal test execution without --test-fail-fast runs all tests', async () => {
  const fixture = fixtures.path('test-runner', 'fail-fast-fixture.js');
  const args = [
    '--test',
    '--test-reporter=tap',
    fixture,
  ];
  const child = spawnSync(process.execPath, args);
  const stdout = child.stdout.toString();
  
  // Should see all tests including those after failures
  assert.match(stdout, /not ok 1 - failing test 1/);
  assert.match(stdout, /not ok 2 - failing test 2/);
  assert.match(stdout, /not ok 3 - failing test 3/);
  
  assert.strictEqual(child.status, 1);
});

test('--test-fail-fast with multiple files stops after first file failure', async () => {
  const fixtures_path = fixtures.path('test-runner');
  const args = [
    '--test',
    '--test-fail-fast',
    '--test-reporter=tap',
    `${fixtures_path}/fail-fast-file1.js`,
    `${fixtures_path}/fail-fast-file2.js`,
    `${fixtures_path}/fail-fast-file3.js`,
  ];
  const child = spawnSync(process.execPath, args);
  const stdout = child.stdout.toString();
  
  // First file should run and fail
  assert.match(stdout, /fail-fast-file1\.js/);
  // Subsequent files should not run if first file fails
  assert.doesNotMatch(stdout, /fail-fast-file2\.js/);
  assert.doesNotMatch(stdout, /fail-fast-file3\.js/);
  
  assert.strictEqual(child.status, 1);
});
