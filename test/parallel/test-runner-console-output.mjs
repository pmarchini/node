import * as common from '../common/index.mjs';
import * as fixtures from '../common/fixtures.mjs';
import { deepStrictEqual, strictEqual } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const logInTest = fixtures.path('test-runner', 'console-output', 'log-in-test.js');

function runNode(args) {
  const child = spawnSync(process.execPath, args, { timeout: common.platformTimeout(30_000) });

  strictEqual(child.stderr.toString(), '');
  strictEqual(child.status, 0);
  return child.stdout.toString().split('\n').map((line) => line.trim());
}

const mentionsATest = (line) => /first|second/.test(line);

// TAP announces a test (`# Subtest:`) once it has finished, so a test's own
// output comes right before its announcement and never mixes with another test's.
const expectedTapOrder = [
  '# log from first',
  '# error from first',
  '# Subtest: first',
  'ok 1 - first',
  '# log from second',
  '# Subtest: second',
  'ok 2 - second',
];

test('console output is reported in order with its test when tests run in child processes', () => {
  const lines = runNode(['--test', '--test-reporter=tap', logInTest]);

  deepStrictEqual(lines.filter(mentionsATest), expectedTapOrder);
});

test('console output is reported in order with its test when tests run in the current process', () => {
  const lines = runNode(['--test', '--test-isolation=none', '--test-reporter=tap', logInTest]);

  deepStrictEqual(lines.filter(mentionsATest), expectedTapOrder);
});

test('a reporter running in the test process writes its console output straight to stdout', () => {
  const reporter = fixtures.fileURL('test-runner', 'console-output', 'logging-reporter.mjs');

  const lines = runNode(['--test', '--test-isolation=none', `--test-reporter=${reporter}`, logInTest]);

  deepStrictEqual(lines, [
    'reporter received test:stdout',
    'reporter received test:pass',
    'reporter received test:stdout',
    'reporter received test:pass',
    '',
  ]);
});

test('console output after run() has finished is written straight to stdout', () => {
  const script = fixtures.path('test-runner', 'console-output', 'run-then-log.mjs');

  const lines = runNode([script, logInTest]);

  deepStrictEqual(lines, [
    'captured: log from first',
    'captured: log from second',
    'after run',
    '',
  ]);
});
