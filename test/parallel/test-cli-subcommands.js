'use strict';

require('../common');

const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fixtures = require('../common/fixtures');
const { join } = require('node:path');
const { describe, it } = require('node:test');

const testOptionFixtureFile = fixtures.path(join('options-as-flags', 'test-option.cjs'));

function getLineFromOutput(stdout, line) {
  const match = stdout.split('\n').find((outputLine) => outputLine === line);
  assert.notStrictEqual(match, undefined);
  return match;
}

describe('CLI subcommands', () => {
  it('supports parsing Node.js flags after the test subcommand', () => {
    const child = spawnSync(process.execPath, [
      '--no-warnings',
      '--expose-internals',
      'test',
      '--test-isolation=none',
      testOptionFixtureFile,
    ], { encoding: 'utf8' });

    assert.strictEqual(child.status, 0);
    assert.strictEqual(getLineFromOutput(child.stdout, 'true'), 'true');
  });

  it('rejects mixing reserved subcommands', () => {
    const child = spawnSync(process.execPath, [
      'test',
      'inspect',
    ], { encoding: 'utf8' });

    assert.notStrictEqual(child.status, 0);
    assert.match(
      child.stderr,
      /cannot specify subcommand 'inspect' after subcommand 'test'/,
    );
  });
});
