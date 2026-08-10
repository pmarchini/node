# Maintaining the test runner

This document describes the internal architecture of the Node.js test runner
(`lib/internal/test_runner/`, roughly 7,400 lines across 14 files as of this
writing), the main sources of complexity a contributor will encounter, and a
phased, low-risk refactoring roadmap intended to make the subsystem more
accessible without changing its observable behavior.

The intended audience is contributors who want to fix bugs or add features in
the test runner and reviewers of test runner pull requests.

## Architecture overview

### Module inventory

| File                  | Lines  | Responsibility                                                                               |
| --------------------- | ------ | -------------------------------------------------------------------------------------------- |
| `test.js`             | \~1500 | `Test`, `Suite`, `TestHook`, `TestContext`, `SuiteContext`, `TestPlan`; execution/scheduling |
| `runner.js`           | \~860  | `node --test` orchestration: discovery, child processes, `FileTest`, watch mode              |
| `harness.js`          | \~390  | Process-wide setup: root test, async-hooks parent resolution, exit handling                  |
| `utils.js`            | \~640  | CLI parsing, reporter resolution, coverage table rendering, shared helpers                   |
| `coverage.js`         | \~690  | `TestCoverage`: V8 coverage collection, merging, source maps, thresholds                     |
| `snapshot.js`         | \~310  | Snapshot testing: `SnapshotFile`, `SnapshotManager`                                          |
| `assert.js`           | \~50   | Registry of assertion functions exposed on `t.assert`                                        |
| `tests_stream.js`     | \~170  | `TestsStream`: the object-mode `Readable` of test events                                     |
| `mock/mock.js`        | \~970  | `MockTracker`, function/method/property/module mocking                                       |
| `mock/mock_timers.js` | \~800  | `MockTimers`: fake timers and `Date`                                                         |
| `mock/loader.js`      | \~200  | Loader-thread hooks backing module mocking                                                   |
| `reporter/*.js`       | \~750  | Built-in reporters (`spec`, `tap`, `dot`, `junit`, `lcov`) and the V8 serializer             |

### In-process execution flow

Every process that runs tests — whether started by `node --test`, by
`node file.test.js`, or as a child of the runner — uses the same in-process
machinery:

```text
 user code: test('name', fn)  /  describe(...)  /  t.test(...)
        |
        v
 lib/test.js  (public facade)
        |
        v
 harness.js: runInParentContext()
   - resolves the parent Test via async hooks:
     testResources.get(executionAsyncId())
   - bootstraps the root Test lazily on first call
        |
        v
 test.js: parent.createSubtest(Test|Suite, ...)
   - builds the tree; Suite bodies run during a "build phase"
        |
        v
 test.js: Test.start() -> run() -> postRun() -> finalize() -> report()
   - concurrency gating, hooks, timeout/abort, plan checks
        |
        v
 tests_stream.js: TestsStream (one per root)
   - object-mode Readable emitting test:* events
        |
        v
 utils.js: setup() -> compose(rootReporter, reporter).pipe(destination)
   - one composed pipeline per --test-reporter/--test-reporter-destination
```

Parent resolution deserves emphasis because it is invisible in the code that
uses it: a nested `test()` call finds its enclosing test not lexically but
through an async-hooks `init` hook that maps every async resource to the test
that created it (`testResources` in `harness.js`). Reporters run inside a
dedicated `AsyncResource` (`reporterScope` in `utils.js`) so that exceptions
thrown by a reporter are attributed to the reporter rather than to whichever
test happened to be running.

### CLI / multi-process flow

```text
 node --test [files...]
        |
        v
 src/node.cc  (redirects main to internal/main/test_runner.js)
        |
        v
 internal/main/test_runner.js
   - parseCommandLine()   (utils.js, memoized singleton)
   - run(options)         (runner.js)
        |
        v
 runner.js: run()
   - discovery: createTestFileList() / --test glob patterns
   - sharding, filtering, watch mode setup
   - isolation 'process' (default): one child process per file
   - isolation 'none': import files in-process via the ESM loader
        |
        v                                child process (per test file)
 FileTest (runner.js) <------------------ node file.test.js
   - spawns child with                     - NODE_TEST_CONTEXT=child-v8
     filtered execArgv                     - reporter/v8-serializer.js
   - parses stdout byte stream:              frames each test:* event:
     [v8 header][u32 length]                 [v8 header][u32 length]
     [v8 header][payload]                    [v8 header][payload]
   - re-emits child events on the
     parent TestsStream
   - re-numbers tests, re-counts
     results into parent counters
```

The parent/child contract is: children are ordinary `node` invocations of the
test file with `NODE_TEST_CONTEXT=child-v8` in the environment, which makes
`parseCommandLine()` select the internal `v8-serializer` reporter; the parent's
`FileTest` deserializes that stream and replays the events into its own tree.
Anything on the child's stdout that is not a well-formed frame is re-emitted as
a synthetic `test:stdout` event.

### The build phase (suites)

`describe()` callbacks run eagerly to _build_ the tree before tests _run_.
This protocol is currently spread across three files, so it is documented here
explicitly:

1. `Suite` construction immediately invokes the suite body
   (`Suite.createBuild()` in `test.js`) and records the resulting promise on
   the harness (`harness.buildSuites`).
2. `startSubtestAfterBootstrap()` (`harness.js`) defers starting any top-level
   test until a microtask drain (`harness.waitForBuildPhase`) has allowed all
   synchronously-declared suites to finish building.
3. `Test.start()` consults `harness.buildPromise` and parks tests that arrive
   while the build phase is still open; `createSubtest()` re-parents (and
   pre-fails) tests declared after their parent has already finished.
4. `runner.js` force-clears `bootstrapPromise`/`buildPromise` between watch
   mode re-runs.

### Ordered reporting

Tests may _finish_ in any order (concurrency), but `test:pass`/`test:fail`
events are emitted in _declaration_ order. The protocol lives in `test.js` and
uses four pieces of state on every `Test`:

* `pendingSubtests` — declared but not yet started (concurrency gate full).
* `readySubtests` — finished but not yet reported (a map keyed by
  `childNumber`).
* `waitingOn` — the `childNumber` the parent will report next.
* `unfinishedSubtests` — used to decide when the parent itself can finish.

`postRun()` marks a test ready; `processReadySubtestRange()` walks forward from
`waitingOn` and reports every consecutively-numbered ready subtest;
`isClearToSend()` recursively asks the ancestor chain whether it is this
subtree's turn. `test:complete` events, by contrast, fire in _completion_
order — the declaration-order guarantee only applies to
`test:pass`/`test:fail`.

## Pain-point inventory

This section records, with evidence, where the complexity concentrates. It is
the motivation for the roadmap in the next section. Line references are as of
this writing and will drift; symbol names are the stable anchors.

### 1. `Test` is a god class

`Test` (`test.js`) is \~855 lines with roughly 30 methods and 48 fields
assigned in the constructor, plus six more fields that are only ever assigned
outside the constructor (`reported`, `buildPhaseFinished`, `buildSuite`,
`hookType`, `parentTest`, `failedSubtests`), so the object shape cannot be
learned from the constructor alone. It simultaneously implements:

* tree construction (`createSubtest`, argument-shape normalization),
* filtering (`applyFilters`, `willBeFilteredByName`),
* concurrency scheduling (`pendingSubtests`, `processPendingSubtests`,
  `activeSubtests` bookkeeping),
* hook orchestration (`createHook`, `computeInheritedHooks`, `runHook`),
* ordered reporting (`isClearToSend`, `finalize`, `readySubtests`),
* and process-exit concerns (`Test.run()` ends with a \~25 line
  `--test-force-exit` branch that awaits reporter teardown and calls
  `process.exit()`; the root's `postRun()` contains a \~77 line global summary
  covering counters, coverage, snapshots, exit codes and watch-mode resets).

Root-versus-child is a runtime `if` rather than a type: a \~59 line constructor
branch produces two structurally different objects, and `this.parent === null`
checks are scattered across at least a dozen call sites. `TestHook` is
constructed _as a root_ (no `parent` option), which silently allocates an
unused `TestsStream` per hook and stores the real parent in a differently-named
field (`parentTest`). Several behaviors are installed by swapping methods on
instances at runtime (`this.run = this.filteredRun`,
`this.report = noop`, `hook.run = runOnce(hook.run, ...)`), which defeats
static reading of call sites.

### 2. `utils.js` is two unrelated modules in one file

`utils.js` contains both the CLI/configuration layer (`parseCommandLine()`,
\~157 lines, memoized into a module-global singleton that other files mutate
in place) and a \~220 line coverage table renderer (`getCoverageReport()` plus
seven private helpers and a color map) whose only consumers are
`reporter/spec.js` and `reporter/tap.js`. All other reporter formatting lives
in `reporter/utils.js`; the coverage table is the odd one out. The file also
hosts genuinely shared helpers (`convertStringToRegExp`,
`createDeferredCallback`, `countCompletedTest`), so every category of
contributor ends up reading all of it.

### 3. Duplicated logic

* The `overrides` object built at every public entry point (`loc`, plus
  argument shuffling) is constructed near-verbatim in seven places across
  `harness.js` and `test.js` (the four `TestContext` hook methods being four
  copies of the same eight-line body).
* Pattern-to-RegExp conversion exists three times (`utils.js` twice,
  `runner.js` once, with different error types).
* Coverage threshold validation exists three times (C++ option parsing,
  `utils.js`, `runner.js`).
* The V8 stream frame format is written in `reporter/v8-serializer.js` and
  independently re-derived byte-by-byte in `runner.js` (header constants and
  manual length decoding).
* Error classification (`isTestFailureError` branching) is duplicated between
  `Test.run()` and `Suite.run()`, and `Suite.run()` is itself a divergent
  \~44 line re-implementation of `Test.run()`.
* Two `indent(nesting)` memoizers exist with different indent units
  (`reporter/utils.js` and `reporter/tap.js`).

### 4. Module-level mutable state

* `parseCommandLine()` memoizes into a module-global that is later mutated in
  place by `internal/main/test_runner.js` (`concurrency`, `globPatterns`,
  `inspectPort`) and by `harness.js` (`cwd`).
* `utils.js` mutates its own built-in reporter registry at runtime to register
  `v8-serializer` when running as a child.
* `test.js` keeps a lazily-created module-global assertion map (`assertObj`)
  that is reset from _inside_ `Test.postRun()` to support watch mode, and a
  shared `noopTestStream` assigned to every filtered test — an object-mode
  `Readable` with unbounded buffering that is never read.
* `snapshot.js` and `mock.js` hold further process-wide singletons
  (`serializerFns`, the shared CJS mock state that permanently replaces
  `Module._load`).

### 5. Latent bugs found while mapping (verified)

* `runner.js` (watch mode, process isolation): a misplaced closing parenthesis
  passes the rejection handler into `SafePromiseAllReturnVoid`'s (ignored)
  extra parameters instead of `PromisePrototypeThen` — watch-mode restart
  failures become unhandled rejections. The `isolation: 'none'` branch
  directly above is nested correctly.
* `utils.js` still contains a `NODE_TEST_CONTEXT === 'child'` TAP branch that
  is unreachable — nothing sets that value anymore (children use `child-v8`).
* `getRunArgs()` (`runner.js`) re-appends `--test-force-exit` even when it
  already survived `filterExecArgv`, duplicating the flag.
* `runTestFile()` awaits child exit and stdout completion but never the
  stderr `readline` interface, so trailing stderr lines can race subtest
  completion.

### 6. Implicit contracts

* `kFilterArgs` in `runner.js` is a hand-maintained list of flags children
  must not re-process; forgetting to update it when adding a CLI flag is a
  silent bug. Because both config-file flags are in the list, options that
  arrive via `--experimental-config-file` reach children only where a
  separate code path forwards them explicitly.
* Name/skip pattern filtering has two disjoint transports: CLI flags survive
  into child argv, while programmatic `run({ testNamePatterns })` re-encodes
  RegExps as CLI flags for children — and is silently ignored under
  `isolation: 'none'` because it never lands in the config the in-process
  filter reads.
* Three different spellings of "no timeout" (`null`, `Infinity`, absent
  config) are handled by different branches.
* `TestPlan.check()` communicates through three channels: returns `undefined`
  on success, throws on failure, returns a promise when waiting.
* The event vocabulary has two authorities: `TestsStream` defines eleven
  typed emitter methods, but four more event types (`test:stdout`,
  `test:stderr`, `test:watch:drained`, `test:watch:restarted`) are injected
  by `runner.js` through the exported `kEmitMessage` symbol, and the runner
  re-emits arbitrary child event types. Only `doc/api/test.md` lists the full
  set.

## Refactoring safety net

What makes refactoring safe here:

* **The golden-output suite.** `test/parallel/test-runner-output.mjs` drives
  \~70 fixture programs against 68 `.snapshot` files, covering all five
  reporters, TTY and non-TTY output, forced colors, and the coverage table at
  eight terminal widths. Any change to output formatting is caught
  byte-for-byte, and intentional changes can be re-baselined with
  `NODE_REGENERATE_SNAPSHOTS=1`. This makes _output-preserving code motion_
  in the reporter/rendering layer close to risk-free.
* `test/parallel/test-runner-v8-deserializer.mjs` brute-forces every possible
  chunk-split offset of the child stream framing.
* The mock suites (\~3,000 lines) and `test-runner-run.mjs` (\~680 lines) are
  largely in-process and assert on behavior directly.

What makes refactoring risky:

* There are no unit tests for `TestsStream`, `parseCommandLine()`, the
  reporter resolution heuristic, or the ordered-reporting protocol — those are
  pinned only indirectly through spawned-process output, so failures surface
  as string diffs far from the cause.
* The scheduling semantics in `test.js` have a demonstrated blast radius: the
  project has previously reverted and re-landed changes to subtest awaiting
  and `test()` return values.

The roadmap below is ordered by this assessment: output-protected code motion
first, semantics-touching work last, gated on new unit tests.

## Refactoring roadmap

Ground rules for every phase:

* Each step is one reviewable pull request with subject `test_runner: ...`.
* Refactor commits change no observable behavior; behavior changes (bug
  fixes) ship as separate, labeled commits and never mix with code motion.
* A refactor PR that touches a `.snapshot` file is a red flag by definition.
* Every commit passes `test/parallel/test-runner-*` locally before review.

### Phase 0 — documentation (no risk)

Land this document. The architecture and protocol write-ups above already
capture knowledge that previously existed only in the code.

### Phase 1 — code motion under golden-output protection (minimal risk)

1. Move the coverage table renderer (`getCoverageReport` and its private
   helpers) out of `utils.js` into `reporter/coverage-table.js`, next to the
   rest of the reporter formatting code. Two consumers change one line each.
2. Move `parseCommandLine()` and its helpers into their own module so that
   `utils.js` shrinks to genuinely shared helpers.

Verification: the full `test-runner-*` suite with zero snapshot changes.

### Phase 2 — bug fixes, one PR each (low risk, behavioral)

1. Fix the watch-mode rejection-handler parenthesis in `runner.js`, with a
   regression test asserting a failed restart reaches
   `triggerUncaughtException`.
2. Remove the unreachable `NODE_TEST_CONTEXT === 'child'` TAP branch.
3. Stop duplicating `--test-force-exit` in child argv.
4. Await the stderr `readline` interface before finishing a `FileTest`.

### Phase 3 — single sources of truth (low risk)

1. Extract the V8 stream frame format (header bytes, length encoding) into
   one module consumed by both `reporter/v8-serializer.js` and `runner.js`;
   the deserializer brute-force test protects this.
2. Collapse the three pattern-to-RegExp conversions into one.
3. Collapse the duplicated coverage-threshold validation in JS (the C++
   validation stays authoritative for option types).
4. Move the failure-taxonomy constants (`kTestCodeFailure`, `kAborted`, ...)
   into a small constants module with a comment per value.
5. Keep one `indent()` memoizer.

### Phase 4 — shrink `Test` from the edges (medium risk)

1. Deduplicate the seven `overrides` constructions behind one helper.
2. Move the root-only global summary (counters, coverage, snapshot writing,
   exit codes, watch reset) out of `Test.postRun()` into the harness, which
   already owns process-wide concerns.
3. Move the `--test-force-exit` tail out of `Test.run()` likewise.
4. Declare every field `Test` uses in its constructor so the object shape is
   readable in one place.

Verification: golden-output suite plus `test-runner-run.mjs` and the mock
suites; no event-ordering changes permitted.

### Phase 5 — semantics-adjacent extraction (high risk, gated)

Do not start until phases 0–4 have landed.

1. First write unit tests for `TestsStream` and for the ordered-reporting
   invariants (declaration-order `test:pass`/`test:fail`, completion-order
   `test:complete`), so the protocol is pinned directly rather than through
   subprocess snapshots.
2. Extract the scheduling/ordered-reporting state machine from `Test` into a
   dedicated collaborator with a named, documented invariant.
3. Consolidate the hook model: one idempotency mechanism, one ownership rule,
   and a declared contract for `TestHook` construction (a hook should not be
   built as a root with a throwaway `TestsStream`).
4. Reconcile `Suite.run()` with `Test.run()` so suites stop re-implementing
   the lifecycle with divergent details.

## Non-goals

* No public API changes. The `node:test` surface, the reporter contract, and
  the event vocabulary stay as documented in `doc/api/test.md`.
* No behavior changes outside the explicitly-labeled Phase 2 bug fixes.
* No new dependencies, and no relaxation of primordials discipline
  (see [primordials](../primordials.md)).
* No rewrite. Every phase leaves the tree shippable and reviewable.

## Appendix: verifying test runner changes

Run the focused suites (a built `node` is required; lib changes are baked into
the binary unless configured with `--node-builtin-modules-path`):

```bash
python3 tools/test.py -j 4 "parallel/test-runner*"
```

The golden-output suite can be run directly for fast, readable diffs:

```bash
out/Release/node test/parallel/test-runner-output.mjs
```

To intentionally re-baseline reporter output after an approved behavior
change (never during a refactor):

```bash
NODE_REGENERATE_SNAPSHOTS=1 out/Release/node test/parallel/test-runner-output.mjs
```
