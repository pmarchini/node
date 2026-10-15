'use strict';
const {
  ArrayPrototypeForEach,
  ArrayPrototypePush,
  FunctionPrototypeBind,
  ObjectDefineProperties,
  PromiseResolve,
  PromiseWithResolvers,
  SafeMap,
  SafePromiseAllReturnVoid,
} = primordials;
const { getCallerLocation } = internalBinding('util');
const {
  createHook,
  executionAsyncId,
} = require('async_hooks');
const { relative } = require('path');
const {
  codes: {
    ERR_TEST_FAILURE,
  },
} = require('internal/errors');
const { exitCodes: { kGenericUserError } } = internalBinding('errors');
const { kBindStreamsLazy } = require('internal/console/constructor');
const Writable = require('internal/streams/writable');
const { kCancelledByParent, Test, Suite } = require('internal/test_runner/test');
const {
  parseCommandLine,
  reporterScope,
  shouldColorizeTestFiles,
  setupGlobalSetupTeardownFunctions,
} = require('internal/test_runner/utils');
const { queueMicrotask } = require('internal/process/task_queues');
const { TIMEOUT_MAX } = require('internal/timers');
const { clearInterval, setInterval } = require('timers');
const { bigint: hrtime } = process.hrtime;
const testResources = new SafeMap();
let globalRoot;
let globalSetupExecuted = false;

testResources.set(reporterScope.asyncId(), reporterScope);

function runningTest() {
  const test = testResources.get(executionAsyncId());
  return test instanceof Test ? test : undefined;
}

// Stands in for process.stdout or process.stderr as the global console's
// stream while a test is running. Each write becomes a test:stdout or
// test:stderr event of that test, so reporters see the output in order with
// the test's other events. It only ever receives writes made inside a test:
// the console resolves its stream on every access, and outside a test it gets
// the real stream, untouched. Writes complete synchronously, so this stream
// never queues a chunk, which keeps the attribution in the writer's context.
class TestOutputStream extends Writable {
  // 'stdout' or 'stderr': the process stream it stands in for, and the name
  // of the TestsStream method that reports it.
  #name;

  constructor(name) {
    super({ __proto__: null, decodeStrings: false });
    this.#name = name;
  }

  // The console asks its stream whether to colorize. The output ends up on the
  // reporter's destination, so answer for that destination, with the decision
  // the runner already makes when it sets FORCE_COLOR for child processes.
  get isTTY() {
    return runningTest()?.root.harness.shouldColorizeTestFiles === true;
  }

  _write(chunk, encoding, callback) {
    const test = runningTest();
    test.root.reporter[this.#name](test.loc?.file, chunk);
    callback();
  }
}

let captureCount = 0;

function releaseConsole() {
  if (--captureCount > 0) {
    return;
  }
  require('internal/console/global')[kBindStreamsLazy](process);
}

// Routes the global console through TestOutputStream while a test is running.
// Trees can nest, as with a run() started from inside a test, so the console
// is captured by the first tree and released when the last one ends.
function captureConsoleOutput() {
  if (captureCount++ > 0) {
    return releaseConsole;
  }

  const streams = {
    __proto__: null,
    stdout: new TestOutputStream('stdout'),
    stderr: new TestOutputStream('stderr'),
  };
  const overrides = { __proto__: null, stdout: undefined, stderr: undefined };
  const accessor = (name) => ({
    __proto__: null,
    configurable: true,
    enumerable: false,
    get() {
      if (runningTest() !== undefined) {
        return streams[name];
      }
      return overrides[name] ?? process[name];
    },
    // Keeps `console._stdout = stream` working as before the capture.
    set(value) { overrides[name] = value; },
  });

  ObjectDefineProperties(require('internal/console/global'), {
    __proto__: null,
    _stdout: accessor('stdout'),
    _stderr: accessor('stderr'),
  });
  return releaseConsole;
}

function createTestTree(rootTestOptions, globalOptions) {
  const buildPhaseDeferred = PromiseWithResolvers();
  const isFilteringByName = globalOptions.testNamePatterns ||
    globalOptions.testSkipPatterns;
  const isFilteringByOnly = (globalOptions.isolation === 'process' || process.env.NODE_TEST_CONTEXT) ?
    globalOptions.only : true;
  const harness = {
    __proto__: null,
    buildPromise: buildPhaseDeferred.promise,
    buildSuites: [],
    isWaitingForBuildPhase: false,
    watching: false,
    config: globalOptions,
    coverage: null,
    resetCounters() {
      harness.counters = {
        __proto__: null,
        tests: 0,
        failed: 0,
        passed: 0,
        cancelled: 0,
        skipped: 0,
        todo: 0,
        topLevel: 0,
        suites: 0,
      };
    },
    success: true,
    counters: null,
    shouldColorizeTestFiles: shouldColorizeTestFiles(globalOptions.destinations),
    teardown: null,
    restoreConsole: null,
    snapshotManager: null,
    isFilteringByName,
    isFilteringByOnly,
    async runBootstrap() {
      if (globalSetupExecuted) {
        return PromiseResolve();
      }
      globalSetupExecuted = true;
      const globalSetupFunctions = await setupGlobalSetupTeardownFunctions(
        globalOptions.globalSetupPath,
        globalOptions.cwd,
      );
      harness.globalTeardownFunction = globalSetupFunctions.globalTeardownFunction;
      if (typeof globalSetupFunctions.globalSetupFunction === 'function') {
        return globalSetupFunctions.globalSetupFunction();
      }
      return PromiseResolve();
    },
    async waitForBuildPhase() {
      if (harness.buildSuites.length > 0) {
        await SafePromiseAllReturnVoid(harness.buildSuites);
      }

      buildPhaseDeferred.resolve();
    },
  };

  harness.resetCounters();
  harness.bootstrapPromise = harness.runBootstrap();
  globalRoot = new Test({
    __proto__: null,
    ...rootTestOptions,
    harness,
    name: '<root>',
  });
  setupProcessState(globalRoot, globalOptions, harness);
  globalRoot.startTime = hrtime();
  return globalRoot;
}

function createProcessEventHandler(eventName, rootTest) {
  return (err) => {
    if (rootTest.harness.bootstrapPromise) {
      // Something went wrong during the asynchronous portion of bootstrapping
      // the test runner. Since the test runner is not setup properly, we can't
      // do anything but throw the error.
      throw err;
    }

    const test = testResources.get(executionAsyncId());

    // Check if this error is coming from a reporter. If it is, throw it.
    if (test === reporterScope) {
      throw err;
    }

    // Check if this error is coming from a test or test hook. If it is, fail the test.
    if (!test || test.finished || test.hookType) {
      // If the test is already finished or the resource that created the error
      // is not mapped to a Test, report this as a top level diagnostic.
      let msg;

      if (test) {
        const name = test.hookType ? `Test hook "${test.hookType}"` : `Test "${test.name}"`;
        let locInfo = '';
        if (test.loc) {
          const relPath = relative(rootTest.config.cwd, test.loc.file);
          locInfo = ` at ${relPath}:${test.loc.line}:${test.loc.column}`;
        }

        msg = `Error: ${name}${locInfo} generated asynchronous ` +
          'activity after the test ended. This activity created the error ' +
          `"${err}" and would have caused the test to fail, but instead ` +
          `triggered an ${eventName} event.`;
      } else {
        msg = 'Error: A resource generated asynchronous activity after ' +
          `the test ended. This activity created the error "${err}" which ` +
          `triggered an ${eventName} event, caught by the test runner.`;
      }

      rootTest.diagnostic(msg);
      rootTest.harness.success = false;
      process.exitCode = kGenericUserError;
      return;
    }

    test.fail(new ERR_TEST_FAILURE(err, eventName));
    test.abortController.abort();
  };
}

function configureCoverage(rootTest, globalOptions) {
  if (!globalOptions.coverage) {
    return null;
  }

  const { setupCoverage } = require('internal/test_runner/coverage');

  try {
    return setupCoverage(globalOptions);
  } catch (err) {
    const msg = `Warning: Code coverage could not be enabled. ${err}`;

    rootTest.diagnostic(msg);
    rootTest.harness.success = false;
    process.exitCode = kGenericUserError;
  }
}

function collectCoverage(rootTest, coverage) {
  if (!coverage) {
    return null;
  }

  let summary = null;

  try {
    summary = coverage.summary();
  } catch (err) {
    rootTest.diagnostic(`Warning: Could not report code coverage. ${err}`);
    rootTest.harness.success = false;
    process.exitCode = kGenericUserError;
  }

  try {
    coverage.cleanup();
  } catch (err) {
    rootTest.diagnostic(`Warning: Could not clean up code coverage. ${err}`);
    rootTest.harness.success = false;
    process.exitCode = kGenericUserError;
  }

  return summary;
}

function setupProcessState(root, globalOptions) {
  const hook = createHook({
    __proto__: null,
    init(asyncId, type, triggerAsyncId, resource) {
      if (resource instanceof Test) {
        testResources.set(asyncId, resource);
        return;
      }

      const parent = testResources.get(triggerAsyncId);

      if (parent !== undefined) {
        testResources.set(asyncId, parent);
      }
    },
    destroy(asyncId) {
      testResources.delete(asyncId);
    },
  });

  hook.enable();

  const exceptionHandler =
    createProcessEventHandler('uncaughtException', root);
  const rejectionHandler =
    createProcessEventHandler('unhandledRejection', root);
  const coverage = configureCoverage(root, globalOptions);
  const exitHandler = async (kill) => {
    if (root.subtests.length === 0 && (root.hooks.before.length > 0 || root.hooks.after.length > 0)) {
      // Run global before/after hooks in case there are no tests
      await root.run();
    }

    if (kill !== true && root.subtestsPromise !== null) {
      // Wait for all subtests to finish, but keep the process alive in case
      // there are no ref'ed handles left.
      const keepAlive = setInterval(() => {}, TIMEOUT_MAX);
      await root.subtestsPromise.promise;
      clearInterval(keepAlive);
    }

    root.postRun(new ERR_TEST_FAILURE(
      'Promise resolution is still pending but the event loop has already resolved',
      kCancelledByParent));

    if (root.harness.globalTeardownFunction) {
      await root.harness.globalTeardownFunction();
      root.harness.globalTeardownFunction = null;
    }

    hook.disable();
    process.removeListener('uncaughtException', exceptionHandler);
    process.removeListener('unhandledRejection', rejectionHandler);
    process.removeListener('beforeExit', exitHandler);
    if (globalOptions.isTestRunner) {
      process.removeListener('SIGINT', terminationHandler);
      process.removeListener('SIGTERM', terminationHandler);
    }
  };

  const terminationHandler = async () => {
    await exitHandler(true);
    process.exit();
  };

  process.on('uncaughtException', exceptionHandler);
  process.on('unhandledRejection', rejectionHandler);
  process.on('beforeExit', exitHandler);
  // TODO(MoLow): Make it configurable to hook when isTestRunner === false.
  if (globalOptions.isTestRunner) {
    process.on('SIGINT', terminationHandler);
    process.on('SIGTERM', terminationHandler);
  }

  root.harness.coverage = FunctionPrototypeBind(collectCoverage, null, root, coverage);
  root.harness.teardown = exitHandler;
  root.harness.restoreConsole = captureConsoleOutput();
}

function lazyBootstrapRoot() {
  if (!globalRoot) {
    // This is where the test runner is bootstrapped when node:test is used
    // without the --test flag or the run() API.
    const entryFile = process.argv?.[1];
    const rootTestOptions = {
      __proto__: null,
      entryFile,
      loc: entryFile ? [1, 1, entryFile] : undefined,
    };
    const globalOptions = parseCommandLine();
    globalOptions.cwd = process.cwd();
    createTestTree(rootTestOptions, globalOptions);
    globalRoot.reporter.on('test:summary', (data) => {
      if (!data.success) {
        process.exitCode = kGenericUserError;
      }
    });
    globalRoot.harness.bootstrapPromise = SafePromiseAllReturnVoid([
      globalRoot.harness.bootstrapPromise,
      globalOptions.setup(globalRoot.reporter),
    ]);
  }
  return globalRoot;
}

async function startSubtestAfterBootstrap(subtest) {
  if (subtest.root.harness.buildPromise) {
    if (subtest.root.harness.bootstrapPromise) {
      await subtest.root.harness.bootstrapPromise;
      subtest.root.harness.bootstrapPromise = null;
    }

    if (subtest.buildSuite) {
      ArrayPrototypePush(subtest.root.harness.buildSuites, subtest.buildSuite);
    }

    if (!subtest.root.harness.isWaitingForBuildPhase) {
      subtest.root.harness.isWaitingForBuildPhase = true;
      queueMicrotask(() => {
        subtest.root.harness.waitForBuildPhase();
      });
    }

    await subtest.root.harness.buildPromise;
    subtest.root.harness.buildPromise = null;
  }

  await subtest.start();
}

function runInParentContext(Factory) {
  function run(name, options, fn, overrides) {
    const parent = testResources.get(executionAsyncId()) || lazyBootstrapRoot();
    const subtest = parent.createSubtest(Factory, name, options, fn, overrides);
    if (parent instanceof Suite) {
      return PromiseResolve();
    }

    return startSubtestAfterBootstrap(subtest);
  }

  const test = (name, options, fn) => {
    const overrides = {
      __proto__: null,
      loc: getCallerLocation(),
    };

    return run(name, options, fn, overrides);
  };
  ArrayPrototypeForEach(['skip', 'todo', 'only'], (keyword) => {
    test[keyword] = (name, options, fn) => {
      const overrides = {
        __proto__: null,
        [keyword]: true,
        loc: getCallerLocation(),
      };

      return run(name, options, fn, overrides);
    };
  });
  return test;
}

function hook(hook) {
  return (fn, options) => {
    const parent = testResources.get(executionAsyncId()) || lazyBootstrapRoot();
    parent.createHook(hook, fn, {
      __proto__: null,
      ...options,
      parent,
      hookType: hook,
      loc: getCallerLocation(),
    });
  };
}

module.exports = {
  createTestTree,
  test: runInParentContext(Test),
  suite: runInParentContext(Suite),
  before: hook('before'),
  after: hook('after'),
  beforeEach: hook('beforeEach'),
  afterEach: hook('afterEach'),
  startSubtestAfterBootstrap,
};
