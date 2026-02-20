'use strict';

const {
  ArrayPrototypeFindIndex,
  ArrayPrototypeIndexOf,
  ArrayPrototypeSlice,
} = primordials;

const {
  markBootstrapComplete,
  prepareTestRunnerMainExecution,
} = require('internal/process/pre_execution');
const { isUsingInspector } = require('internal/util/inspector');
const { run } = require('internal/test_runner/runner');
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

if (isUsingInspector() && options.isolation === 'process') {
  process.emitWarning('Using the inspector with --test forces running at a concurrency of 1. ' +
  'Use the inspectPort option to run with concurrency');
  options.concurrency = 1;
  options.inspectPort = process.debugPort;
}

const cliArgs = ArrayPrototypeSlice(process.argv, 1);
const argSeparatorIndex = ArrayPrototypeIndexOf(cliArgs, '--');

if (argSeparatorIndex !== -1) {
  options.globPatterns = ArrayPrototypeSlice(cliArgs, 0, argSeparatorIndex);
  options.argv = ArrayPrototypeSlice(cliArgs, argSeparatorIndex + 1);
} else {
  const firstUserArgIndex = ArrayPrototypeFindIndex(
    cliArgs,
    (arg) => arg.length > 0 && arg[0] === '-',
  );

  if (firstUserArgIndex === -1) {
    options.globPatterns = cliArgs;
  } else {
    options.globPatterns = ArrayPrototypeSlice(cliArgs, 0, firstUserArgIndex);
    options.argv = ArrayPrototypeSlice(cliArgs, firstUserArgIndex);
  }
}

debug('test runner configuration:', options);
run(options).on('test:summary', (data) => {
  if (!data.success) {
    process.exitCode = kGenericUserError;
  }
});
