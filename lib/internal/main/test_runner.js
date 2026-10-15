'use strict';

const {
  ArrayPrototypeSlice,
} = primordials;

const {
  markBootstrapComplete,
  prepareTestRunnerMainExecution,
} = require('internal/process/pre_execution');
const { isUsingInspector } = require('internal/util/inspector');
const { kShardWorkerEnv, run } = require('internal/test_runner/runner');
const { parseCommandLine } = require('internal/test_runner/utils');
const { exitCodes: { kGenericUserError } } = internalBinding('errors');
let debug = require('internal/util/debuglog').debuglog('test_runner', (fn) => {
  debug = fn;
});

const options = parseCommandLine();
const isTestIsolationDisabled = options.isolation === 'none';
// We set initializeModules to false as we want to load user modules in the test runner run function
// if we are running with --test-isolation=none
prepareTestRunnerMainExecution(!isTestIsolationDisabled);
markBootstrapComplete();

if (isUsingInspector() && options.isolation !== 'none') {
  process.emitWarning('Using the inspector with --test forces running at a concurrency of 1. ' +
  'Use the inspectPort option to run with concurrency');
  options.concurrency = 1;
  options.inspectPort = process.debugPort;
}

function startTestRun(runOptions) {
  debug('test runner configuration:', runOptions);
  run(runOptions).on('test:summary', (data) => {
    if (!data.success) {
      process.exitCode = kGenericUserError;
    }
  });
}

if (process.env[kShardWorkerEnv] === '1') {
  // Keep test code that spawns `node --test` from also acting as a worker.
  delete process.env[kShardWorkerEnv];
  process.once('message', (files) => {
    process.disconnect();
    // The parent already applied --test-shard; it must not filter again here.
    startTestRun({ __proto__: null, ...options, files, shard: undefined });
  });
} else {
  options.globPatterns = ArrayPrototypeSlice(process.argv, 1);
  startTestRun(options);
}
