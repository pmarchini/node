import '../common/index.mjs';
import * as fixtures from '../common/fixtures.mjs';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { describe, it, run } from 'node:test';

const basicFiles = fixtures.path('test-runner', 'isolation-group', 'basic', '*.cjs');
const failingFiles = fixtures.path('test-runner', 'isolation-group', 'failing', '*.cjs');
const exitingFile = fixtures.path('test-runner', 'isolation-group', 'crash', 'exits.cjs');
const slowAndFastFiles = fixtures.path('test-runner', 'isolation-group', 'ordering', '*.cjs');

function runTestCli(...args) {
  const child = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...args]);
  return { status: child.status, stdout: child.stdout.toString(), stderr: child.stderr.toString() };
}

describe('--test-isolation=group', () => {
  it('reports each worker as a shard suite holding its round-robin share of the files', () => {
    const { status, stdout, stderr } = runTestCli('--test-isolation=group', '--test-concurrency=2', basicFiles);

    assert.strictEqual(stderr, '');
    assert.strictEqual(status, 0);
    assert.match(stdout, /^# Subtest: shard 1\/2\n {4}# Subtest: a\.cjs runs in pid \d+\n {4}ok 1 - a\.cjs/m);
    assert.match(stdout, /^ {4}ok 2 - c\.cjs runs in pid \d+\n(.*\n)* {4}1\.\.2\n(.*\n)*ok 1 - shard 1\/2\n/m);
    assert.match(stdout, /^# Subtest: shard 2\/2\n {4}# Subtest: b\.cjs runs in pid \d+\n {4}ok 1 - b\.cjs/m);
    assert.match(stdout, /^ {4}ok 2 - d\.cjs runs in pid \d+\n(.*\n)* {4}1\.\.2\n(.*\n)*ok 2 - shard 2\/2\n/m);
    assert.match(stdout, /^1\.\.2$/m);
    assert.match(stdout, /^# tests 4$/m);
  });

  it('runs the files of one shard in a single process, separate from other shards', () => {
    const { stdout } = runTestCli('--test-isolation=group', '--test-concurrency=2', basicFiles);
    const pidOf = (file) => stdout.match(new RegExp(`ok \\d+ - ${file} runs in pid (\\d+)`))[1];

    assert.strictEqual(pidOf('a.cjs'), pidOf('c.cjs'));
    assert.strictEqual(pidOf('b.cjs'), pidOf('d.cjs'));
    assert.notStrictEqual(pidOf('a.cjs'), pidOf('b.cjs'));
  });

  it('fails the run and marks only the shard whose tests failed', () => {
    const { status, stdout } = runTestCli('--test-isolation=group', '--test-concurrency=2', failingFiles);

    assert.strictEqual(status, 1);
    assert.match(stdout, /^ {4}not ok 1 - fail\.cjs fails$/m);
    assert.match(stdout, /^not ok 1 - shard 1\/2\n {2}---\n {2}duration_ms: .*\n {2}type: 'suite'\n(.*\n)* {2}failureType: 'subtestsFailed'$/m);
    assert.match(stdout, /^ok 2 - shard 2\/2$/m);
    assert.match(stdout, /^# pass 1$/m);
    assert.match(stdout, /^# fail 1$/m);
  });

  it('reports the counts, duration and file count of each shard inside its suite', () => {
    const { stdout } = runTestCli('--test-isolation=group', '--test-concurrency=2', failingFiles);
    const shardOneBlock = stdout.slice(stdout.indexOf('# Subtest: shard 1/2'), stdout.indexOf('not ok 1 - shard 1/2'));

    assert.match(shardOneBlock, /^ {4}# tests 1$/m);
    assert.match(shardOneBlock, /^ {4}# pass 0$/m);
    assert.match(shardOneBlock, /^ {4}# fail 1$/m);
    assert.match(shardOneBlock, /^ {4}# duration_ms \d+(\.\d+)?$/m);
    assert.match(shardOneBlock, /^ {4}# files 1$/m);
  });

  it('splits only the files selected by --test-shard across the workers', () => {
    const { status, stdout } = runTestCli(
      '--test-isolation=group', '--test-concurrency=1', '--test-shard=1/2', basicFiles,
    );

    assert.strictEqual(status, 0);
    assert.match(stdout, /^ {4}ok 1 - a\.cjs runs in pid \d+$/m);
    assert.match(stdout, /^ {4}ok 2 - c\.cjs runs in pid \d+$/m);
    assert.doesNotMatch(stdout, /[bd]\.cjs/);
    assert.match(stdout, /^ok 1 - shard 1\/1$/m);
  });

  it('starts no more workers than there are files', () => {
    const { stdout } = runTestCli('--test-isolation=group', '--test-concurrency=10', basicFiles);

    assert.match(stdout, /^ok 4 - shard 4\/4$/m);
    assert.match(stdout, /^1\.\.4$/m);
  });

  it('reports a worker that exits unexpectedly as a failed shard with its exit code', () => {
    const { status, stdout } = runTestCli('--test-isolation=group', exitingFile);

    assert.strictEqual(status, 1);
    assert.match(stdout, /^not ok 1 - shard 1\/1$/m);
    assert.match(stdout, /^ {2}failureType: 'testCodeFailure'$/m);
    assert.match(stdout, /^ {2}exitCode: 3$/m);
    assert.match(stdout, /^# fail 1$/m);
  });

  it('prints shards in shard order even when a later shard finishes first', () => {
    const { stdout } = runTestCli('--test-isolation=group', '--test-concurrency=2', slowAndFastFiles);

    const slowShardEnd = stdout.indexOf('ok 1 - shard 1/2');
    const fastShardStart = stdout.indexOf('# Subtest: shard 2/2');
    assert.ok(slowShardEnd !== -1 && slowShardEnd < fastShardStart, stdout);
  });

  it('is rejected by run() together with watch mode', () => {
    const files = [fixtures.path('test-runner', 'isolation-group', 'basic', 'a.cjs')];

    assert.throws(() => run({ files, isolation: 'group', watch: true }), {
      code: 'ERR_INVALID_ARG_VALUE',
      message: /'options\.isolation' is not supported with watch mode\. Received 'group'/,
    });
  });

  it('emits shard suites at the top level and their tests one level below through run()', async () => {
    const files = ['a.cjs', 'b.cjs', 'c.cjs', 'd.cjs']
      .map((file) => fixtures.path('test-runner', 'isolation-group', 'basic', file));
    const passed = [];

    const stream = run({ files, isolation: 'group', concurrency: 2 });
    stream.on('test:pass', ({ name, nesting, details }) => {
      passed.push(`${nesting} ${details.type} ${name.replace(/pid \d+$/, 'pid N')}`);
    });
    // eslint-disable-next-line no-unused-vars
    for await (const _ of stream);

    assert.deepStrictEqual(passed, [
      '1 test a.cjs runs in pid N',
      '1 test c.cjs runs in pid N',
      '0 suite shard 1/2',
      '1 test b.cjs runs in pid N',
      '1 test d.cjs runs in pid N',
      '0 suite shard 2/2',
    ]);
  });
});
