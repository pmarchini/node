import '../common/index.mjs';
import * as fixtures from '../common/fixtures.mjs';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const aFile = fixtures.path('test-runner', 'bail', 'a.mjs');
const bFile = fixtures.path('test-runner', 'bail', 'b.mjs');
const hooksFile = fixtures.path('test-runner', 'bail', 'hooks.mjs');
const slowFile = fixtures.path('test-runner', 'bail', 'slow.mjs');
const todoSkipFile = fixtures.path('test-runner', 'bail', 'todo-skip.mjs');

function countBailouts(output) {
  return (output.match(/Bail out!/g) || []).length;
}

test('all tests run without --test-bail', () => {
  const cp = spawnSync(process.execPath, [
    '--test',
    '--test-reporter=tap',
    '--test-concurrency=1',
    aFile,
    bFile,
  ]);
  const stdout = cp.stdout.toString();
  assert.strictEqual(countBailouts(stdout), 0);
  assert.match(stdout, /a-after-failure/);
  assert.match(stdout, /b-passing/);
  assert.strictEqual(cp.status, 1);
});

test('--test-bail stops the run on the first failing file', () => {
  const cp = spawnSync(process.execPath, [
    '--test',
    '--test-bail',
    '--test-reporter=tap',
    '--test-concurrency=1',
    aFile,
    bFile,
  ]);
  const stdout = cp.stdout.toString();
  assert.strictEqual(countBailouts(stdout), 1);
  assert.match(stdout, /not ok \d+ - a-failing/);
  // The second file is cancelled without running any of its tests.
  assert.doesNotMatch(stdout, /b-passing/);
  assert.match(stdout, /test run bailed out/);
  assert.strictEqual(cp.status, 1);
});

test('--test-bail stops the run with isolation none', () => {
  const cp = spawnSync(process.execPath, [
    '--test',
    '--test-bail',
    '--test-isolation=none',
    '--test-reporter=tap',
    aFile,
    bFile,
  ]);
  const stdout = cp.stdout.toString();
  assert.strictEqual(countBailouts(stdout), 1);
  assert.match(stdout, /not ok \d+ - a-failing/);
  // The tests queued after the failure are cancelled instead of running.
  assert.match(stdout, /not ok \d+ - b-passing/);
  assert.match(stdout, /test run bailed out/);
  assert.strictEqual(cp.status, 1);
});

test('--test-bail works when running a single file without --test', () => {
  const cp = spawnSync(process.execPath, [
    '--test-bail',
    '--test-reporter=tap',
    hooksFile,
  ]);
  const stdout = cp.stdout.toString();
  assert.strictEqual(countBailouts(stdout), 1);
  assert.match(stdout, /not ok \d+ - h-failing/);
  assert.match(stdout, /not ok \d+ - h-cancelled/);
  assert.match(stdout, /test run bailed out/);
  // The afterEach() hook of the failing test still runs.
  assert.match(stdout, /afterEach-executed/);
  assert.strictEqual(cp.status, 1);
});

test('--test-bail does not bail on failing todo or skipped tests', () => {
  const cp = spawnSync(process.execPath, [
    '--test',
    '--test-bail',
    '--test-reporter=tap',
    '--test-concurrency=1',
    todoSkipFile,
    bFile,
  ]);
  const stdout = cp.stdout.toString();
  assert.strictEqual(countBailouts(stdout), 0);
  assert.match(stdout, /t-passing/);
  assert.match(stdout, /b-passing/);
  assert.strictEqual(cp.status, 0);
});

test('--test-bail terminates test files that are still running', () => {
  const cp = spawnSync(process.execPath, [
    '--test',
    '--test-bail',
    '--test-reporter=tap',
    '--test-concurrency=2',
    aFile,
    slowFile,
  ], { timeout: 30_000 });
  const stdout = cp.stdout.toString();
  assert.strictEqual(cp.signal, null);
  assert.strictEqual(countBailouts(stdout), 1);
  assert.match(stdout, /not ok \d+ - a-failing/);
  assert.doesNotMatch(stdout, /^ok \d+ - slow-test/m);
  assert.strictEqual(cp.status, 1);
});

test('--test-bail cannot be combined with --watch', () => {
  const cp = spawnSync(process.execPath, [
    '--watch',
    '--test',
    '--test-bail',
    bFile,
  ]);
  assert.match(
    cp.stderr.toString(),
    /either --watch or --test-bail can be used, not both/,
  );
  assert.strictEqual(cp.status, 9);
});
