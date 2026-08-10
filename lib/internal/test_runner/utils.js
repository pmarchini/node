'use strict';
const {
  ArrayPrototypeJoin,
  ArrayPrototypeMap,
  ArrayPrototypePush,
  ArrayPrototypeSome,
  NumberParseInt,
  ObjectGetOwnPropertyDescriptor,
  PromiseWithResolvers,
  RegExp,
  RegExpPrototypeExec,
  SafeMap,
  SafePromiseAllReturnArrayLike,
  StringPrototypeSplit,
} = primordials;

const { AsyncResource } = require('async_hooks');
const { sep, resolve } = require('path');
const { createWriteStream } = require('fs');
const { pathToFileURL } = require('internal/url');
const { getOptionValue } = require('internal/options');
const { shouldColorize } = require('internal/util/colors');

const {
  codes: {
    ERR_INVALID_ARG_VALUE,
    ERR_TEST_FAILURE,
  },
  kIsNodeError,
} = require('internal/errors');
const { compose } = require('stream');
const {
  validateInteger,
  validateFunction,
} = require('internal/validators');
const { validatePath } = require('internal/fs/utils');
const { kEmptyObject } = require('internal/util');

const kMultipleCallbackInvocations = 'multipleCallbackInvocations';
const kRegExpPattern = /^\/(.*)\/([a-z]*)$/;

const kPatterns = ['test', 'test/**/*', 'test-*', '*[._-]test'];
const kFileExtensions = ['js', 'mjs', 'cjs'];
if (getOptionValue('--experimental-strip-types')) {
  ArrayPrototypePush(kFileExtensions, 'ts', 'mts', 'cts');
}
const kDefaultPattern = `**/{${ArrayPrototypeJoin(kPatterns, ',')}}.{${ArrayPrototypeJoin(kFileExtensions, ',')}}`;

function createDeferredCallback() {
  let calledCount = 0;
  const { promise, resolve, reject } = PromiseWithResolvers();
  const cb = (err) => {
    calledCount++;

    // If the callback is called a second time, let the user know, but
    // don't let them know more than once.
    if (calledCount > 1) {
      if (calledCount === 2) {
        throw new ERR_TEST_FAILURE(
          'callback invoked multiple times',
          kMultipleCallbackInvocations,
        );
      }

      return;
    }

    if (err) {
      return reject(err);
    }

    resolve();
  };

  return { __proto__: null, promise, cb };
}

function isTestFailureError(err) {
  return err?.code === 'ERR_TEST_FAILURE' && kIsNodeError in err;
}

function convertStringToRegExp(str, name) {
  const match = RegExpPrototypeExec(kRegExpPattern, str);
  const pattern = match?.[1] ?? str;
  const flags = match?.[2] || '';

  try {
    return new RegExp(pattern, flags);
  } catch (err) {
    const msg = err?.message;

    throw new ERR_INVALID_ARG_VALUE(
      name,
      str,
      `is an invalid regular expression.${msg ? ` ${msg}` : ''}`,
    );
  }
}

const kBuiltinDestinations = new SafeMap([
  ['stdout', process.stdout],
  ['stderr', process.stderr],
]);

const kBuiltinReporters = new SafeMap([
  ['spec', 'internal/test_runner/reporter/spec'],
  ['dot', 'internal/test_runner/reporter/dot'],
  ['tap', 'internal/test_runner/reporter/tap'],
  ['junit', 'internal/test_runner/reporter/junit'],
  ['lcov', 'internal/test_runner/reporter/lcov'],
]);

const kDefaultReporter = 'spec';
const kDefaultDestination = 'stdout';

function tryBuiltinReporter(name) {
  const builtinPath = kBuiltinReporters.get(name);

  if (builtinPath === undefined) {
    return;
  }

  return require(builtinPath);
}

function shouldColorizeTestFiles(destinations) {
  // This function assumes only built-in destinations (stdout/stderr) supports coloring
  return ArrayPrototypeSome(destinations, (_, index) => {
    const destination = kBuiltinDestinations.get(destinations[index]);
    return destination && shouldColorize(destination);
  });
}

async function getReportersMap(reporters, destinations) {
  return SafePromiseAllReturnArrayLike(reporters, async (name, i) => {
    const destination = kBuiltinDestinations.get(destinations[i]) ??
      createWriteStream(destinations[i], { __proto__: null, flush: true });

    // Load the test reporter passed to --test-reporter
    let reporter = tryBuiltinReporter(name);

    if (reporter === undefined) {
      let parentURL;

      try {
        parentURL = pathToFileURL(process.cwd() + '/').href;
      } catch {
        parentURL = 'file:///';
      }

      const cascadedLoader = require('internal/modules/esm/loader').getOrInitializeCascadedLoader();
      reporter = await cascadedLoader.import(name, parentURL, { __proto__: null });
    }

    if (reporter?.default) {
      reporter = reporter.default;
    }

    if (reporter?.prototype && ObjectGetOwnPropertyDescriptor(reporter.prototype, 'constructor')) {
      reporter = new reporter();
    }

    if (!reporter) {
      throw new ERR_INVALID_ARG_VALUE('Reporter', name, 'is not a valid reporter');
    }

    return { __proto__: null, reporter, destination };
  });
}

const reporterScope = new AsyncResource('TestReporterScope');
let globalTestOptions;

function parseCommandLine() {
  if (globalTestOptions) {
    return globalTestOptions;
  }

  const isTestRunner = getOptionValue('--test');
  const coverage = getOptionValue('--experimental-test-coverage');
  const forceExit = getOptionValue('--test-force-exit');
  const sourceMaps = getOptionValue('--enable-source-maps');
  const updateSnapshots = getOptionValue('--test-update-snapshots');
  const watch = getOptionValue('--watch');
  const timeout = getOptionValue('--test-timeout') || Infinity;
  const isChildProcess = process.env.NODE_TEST_CONTEXT === 'child';
  const isChildProcessV8 = process.env.NODE_TEST_CONTEXT === 'child-v8';
  let globalSetupPath;
  let concurrency;
  let coverageExcludeGlobs;
  let coverageIncludeGlobs;
  let lineCoverage;
  let branchCoverage;
  let functionCoverage;
  let destinations;
  let isolation;
  let only = getOptionValue('--test-only');
  let reporters;
  let shard;
  let testNamePatterns = mapPatternFlagToRegExArray('--test-name-pattern');
  let testSkipPatterns = mapPatternFlagToRegExArray('--test-skip-pattern');

  if (isChildProcessV8) {
    kBuiltinReporters.set('v8-serializer', 'internal/test_runner/reporter/v8-serializer');
    reporters = ['v8-serializer'];
    destinations = [kDefaultDestination];
  } else if (isChildProcess) {
    reporters = ['tap'];
    destinations = [kDefaultDestination];
  } else {
    destinations = getOptionValue('--test-reporter-destination');
    reporters = getOptionValue('--test-reporter');
    globalSetupPath = getOptionValue('--test-global-setup');
    if (reporters.length === 0 && destinations.length === 0) {
      ArrayPrototypePush(reporters, kDefaultReporter);
    }

    if (reporters.length === 1 && destinations.length === 0) {
      ArrayPrototypePush(destinations, kDefaultDestination);
    }

    if (destinations.length !== reporters.length) {
      throw new ERR_INVALID_ARG_VALUE(
        '--test-reporter',
        reporters,
        'must match the number of specified \'--test-reporter-destination\'',
      );
    }
  }

  if (isTestRunner) {
    isolation = getOptionValue('--test-isolation');

    if (isolation === 'none') {
      concurrency = 1;
    } else {
      concurrency = getOptionValue('--test-concurrency') || true;
      only = false;
      testNamePatterns = null;
      testSkipPatterns = null;
    }

    const shardOption = getOptionValue('--test-shard');
    if (shardOption) {
      if (!RegExpPrototypeExec(/^\d+\/\d+$/, shardOption)) {
        throw new ERR_INVALID_ARG_VALUE(
          '--test-shard',
          shardOption,
          'must be in the form of <index>/<total>',
        );
      }

      const indexAndTotal = StringPrototypeSplit(shardOption, '/', 2);
      shard = {
        __proto__: null,
        index: NumberParseInt(indexAndTotal[0], 10),
        total: NumberParseInt(indexAndTotal[1], 10),
      };
    }
  } else {
    concurrency = 1;
    const testNamePatternFlag = getOptionValue('--test-name-pattern');
    only = getOptionValue('--test-only');
    testNamePatterns = testNamePatternFlag?.length > 0 ?
      ArrayPrototypeMap(
        testNamePatternFlag,
        (re) => convertStringToRegExp(re, '--test-name-pattern'),
      ) : null;
    const testSkipPatternFlag = getOptionValue('--test-skip-pattern');
    testSkipPatterns = testSkipPatternFlag?.length > 0 ?
      ArrayPrototypeMap(testSkipPatternFlag, (re) => convertStringToRegExp(re, '--test-skip-pattern')) : null;
  }

  if (coverage) {
    coverageExcludeGlobs = getOptionValue('--test-coverage-exclude');
    if (!coverageExcludeGlobs || coverageExcludeGlobs.length === 0) {
      // TODO(pmarchini): this default should follow something similar to c8 defaults
      // Default exclusions should be also exported to be used by other tools / users
      coverageExcludeGlobs = [kDefaultPattern];
    }
    coverageIncludeGlobs = getOptionValue('--test-coverage-include');

    branchCoverage = getOptionValue('--test-coverage-branches');
    lineCoverage = getOptionValue('--test-coverage-lines');
    functionCoverage = getOptionValue('--test-coverage-functions');

    validateInteger(branchCoverage, '--test-coverage-branches', 0, 100);
    validateInteger(lineCoverage, '--test-coverage-lines', 0, 100);
    validateInteger(functionCoverage, '--test-coverage-functions', 0, 100);
  }

  const setup = reporterScope.bind(async (rootReporter) => {
    const reportersMap = await getReportersMap(reporters, destinations);

    for (let i = 0; i < reportersMap.length; i++) {
      const { reporter, destination } = reportersMap[i];
      compose(rootReporter, reporter).pipe(destination);
    }

    reporterScope.reporters = reportersMap;
  });

  globalTestOptions = {
    __proto__: null,
    isTestRunner,
    concurrency,
    coverage,
    coverageExcludeGlobs,
    coverageIncludeGlobs,
    destinations,
    forceExit,
    isolation,
    branchCoverage,
    functionCoverage,
    lineCoverage,
    only,
    reporters,
    setup,
    globalSetupPath,
    shard,
    sourceMaps,
    testNamePatterns,
    testSkipPatterns,
    timeout,
    updateSnapshots,
    watch,
  };

  return globalTestOptions;
}

function mapPatternFlagToRegExArray(flagName) {
  const patterns = getOptionValue(flagName);

  if (patterns?.length > 0) {
    return ArrayPrototypeMap(patterns, (re) => convertStringToRegExp(re, flagName));
  }

  return null;
}

function countCompletedTest(test, harness = test.root.harness) {
  if (test.nesting === 0) {
    harness.counters.topLevel++;
  }
  if (test.reportedType === 'suite') {
    harness.counters.suites++;
    return;
  }
  // Check SKIP and TODO tests first, as those should not be counted as
  // failures.
  if (test.skipped) {
    harness.counters.skipped++;
  } else if (test.isTodo) {
    harness.counters.todo++;
  } else if (test.cancelled) {
    harness.counters.cancelled++;
    harness.success = false;
  } else if (!test.passed) {
    harness.counters.failed++;
    harness.success = false;
  } else {
    harness.counters.passed++;
  }
  harness.counters.tests++;
}


async function setupGlobalSetupTeardownFunctions(globalSetupPath, cwd) {
  let globalSetupFunction;
  let globalTeardownFunction;
  if (globalSetupPath) {
    validatePath(globalSetupPath, 'options.globalSetupPath');
    const fileURL = pathToFileURL(resolve(cwd, globalSetupPath));
    const cascadedLoader = require('internal/modules/esm/loader').getOrInitializeCascadedLoader();
    const globalSetupModule = await cascadedLoader
      .import(fileURL, pathToFileURL(cwd + sep).href, kEmptyObject);
    if (globalSetupModule.globalSetup) {
      validateFunction(globalSetupModule.globalSetup, 'globalSetupModule.globalSetup');
      globalSetupFunction = globalSetupModule.globalSetup;
    }
    if (globalSetupModule.globalTeardown) {
      validateFunction(globalSetupModule.globalTeardown, 'globalSetupModule.globalTeardown');
      globalTeardownFunction = globalSetupModule.globalTeardown;
    }
  }
  return { __proto__: null, globalSetupFunction, globalTeardownFunction };
}

module.exports = {
  convertStringToRegExp,
  countCompletedTest,
  createDeferredCallback,
  isTestFailureError,
  kDefaultPattern,
  parseCommandLine,
  reporterScope,
  shouldColorizeTestFiles,
  setupGlobalSetupTeardownFunctions,
};
