import '../common/index.mjs';
import * as fixtures from '../common/fixtures.mjs';
import assert from 'node:assert';
import { run, test } from 'node:test';

const aFile = fixtures.path('test-runner', 'bail', 'a.mjs');
const bFile = fixtures.path('test-runner', 'bail', 'b.mjs');

test('run() bail option must be a boolean', () => {
  assert.throws(() => run({ bail: 'nope' }), { code: 'ERR_INVALID_ARG_TYPE' });
});

test('run() bail option is not supported with watch mode', () => {
  assert.throws(
    () => run({ bail: true, watch: true }),
    { code: 'ERR_INVALID_ARG_VALUE' },
  );
});

test('run() with bail stops after the first failing file', async () => {
  const stream = run({
    files: [aFile, bFile],
    concurrency: 1,
    bail: true,
  });

  let bailouts = 0;
  let passed = 0;
  let failed = 0;

  for await (const event of stream) {
    if (event.type === 'test:bailout') {
      bailouts++;
    } else if (event.data.nesting !== 0) {
      continue;
    } else if (event.type === 'test:pass') {
      passed++;
    } else if (event.type === 'test:fail') {
      failed++;
    }
  }

  assert.strictEqual(bailouts, 1);
  // Only the first file runs: one passing test, then the failure bails the
  // run. The second file never reports a passing test.
  assert.strictEqual(passed, 1);
  assert.ok(failed >= 1);
});

test('run() without bail runs every file', async () => {
  const stream = run({
    files: [aFile, bFile],
    concurrency: 1,
  });

  let bailouts = 0;
  let passed = 0;

  for await (const event of stream) {
    if (event.type === 'test:bailout') {
      bailouts++;
    } else if (event.data.nesting === 0 && event.type === 'test:pass') {
      passed++;
    }
  }

  assert.strictEqual(bailouts, 0);
  // a-passing, a-after-failure, and b-passing all run.
  assert.strictEqual(passed, 3);
});
