# Node.js Test Runner Flow Diagrams

## 1. Test Runner `run` Entry Point Flow

This diagram shows the execution flow when running the test runner through the `run` function, typically triggered by the `--test` command line flag or by programmatically calling `run()`.

```mermaid
flowchart TD
    A["run entry point<br>lib/internal/main/test_runner.js"] --> B["parseCommandLine"]
    B --> C["run function<br>from internal/test_runner/runner"]
    
    C --> D["createTestTree"]
    D --> E["Create root Test instance"]
    E --> F["setupProcessState"]
    F --> G["Configure hooks, error handlers<br>and coverage"]
    
    C --> H["Load test files<br>from globPatterns"]
    H --> I["For each matching file"]
    I --> J["Create subtest for file"]
    J --> K["startSubtestAfterBootstrap"]
    
    K --> L{"Has global setup?"}
    L -->|Yes| M["Run globalSetup function"]
    M --> N["Wait for bootstrap"]
    L -->|No| N
    
    N --> O["Wait for build phase"]
    O --> P["subtest.start"]
    P --> Q["Execute tests<br>recursively"]
    
    Q --> R["Handle test completions"]
    R --> S["Report test results"]
    S --> T["Run global teardown<br>if configured"]
    T --> U["Process exit"]
```

## 2. Execution of a Test File without `run` Function (Lazy Bootstrap)

This diagram illustrates what happens when a test file is executed directly (e.g., `node test.js`) without using the `run` function or `--test` flag.

```mermaid
flowchart TD
    A["User imports node:test<br>in a test file"] --> B["require('node:test')"]
    B --> C["Access test function"]
    C --> D["Call test function<br>test('my test', fn)"]
    
    D --> E["runInParentContext"]
    E --> F{"globalRoot exists?"}
    F -->|No| G["lazyBootstrapRoot"]
    F -->|Yes| H["Use existing root"]
    
    G --> I["Create rootTestOptions<br>with entryFile"]
    I --> J["Parse command line args"]
    J --> K["createTestTree"]
    K --> L["Create root Test"]
    L --> M["setupProcessState"]
    
    G --> N["Set up reporter"]
    N --> O["Set bootstrapPromise"]
    
    E --> P["Create subtest"]
    P --> Q["startSubtestAfterBootstrap"]
    
    Q --> R{"Has buildPromise?"}
    R -->|Yes| S["Wait for global setup"]
    S --> T["Wait for bootstrap"]
    T --> U["Add to buildSuites"]
    U --> V["Wait for build phase"]
    R -->|No| W["subtest.start"]
    V --> W
    
    W --> X["Execute test"]
    X --> Y["Report results"]
```

## 3. Event Sequence in TestsStream

This diagram shows the sequence of events emitted by the TestsStream during test execution, illustrating how test progress is communicated to reporters.

```mermaid
sequenceDiagram
    participant Test as Test Instance
    participant Stream as TestsStream
    participant Reporter as Reporter
    participant Parent as Parent Test
    
    Note over Test,Reporter: Test Lifecycle Events
    
    Test->>Stream: enqueue
    Stream->>Reporter: test:enqueue
    Note right of Reporter: Test is queued for execution
    
    Test->>Stream: dequeue
    Stream->>Reporter: test:dequeue
    Note right of Reporter: Test is now starting execution
    
    Test->>Stream: start
    Stream->>Reporter: test:start
    Note right of Reporter: Test has begun execution
    
    alt Test with assertion plan
        Test->>Stream: plan
        Stream->>Reporter: test:plan
        Note right of Reporter: Expected number of assertions
    end
    
    opt Diagnostic messages
        Test->>Stream: diagnostic
        Stream->>Reporter: test:diagnostic
        Note right of Reporter: Diagnostic info during test
    end
    
    alt Passing test
        Test->>Stream: ok
        Stream->>Reporter: test:pass
        Note right of Reporter: Test passed
    else Failing test
        Test->>Stream: fail
        Stream->>Reporter: test:fail
        Note right of Reporter: Test failed
    end
    
    Test->>Stream: complete
    Stream->>Reporter: test:complete
    Note right of Reporter: Test completed execution
    
    opt Code coverage report
        Test->>Stream: coverage
        Stream->>Reporter: test:coverage
        Note right of Reporter: Code coverage info
    end
    
    Test->>Stream: summary
    Stream->>Reporter: test:summary
    Note right of Reporter: Summary of test results
    
    Stream->>Parent: Report completion
    Parent->>Parent: Process next test
```

## 4. Test Tree Structure

This diagram shows the class structure of the test tree in the Node.js test runner.

```mermaid
classDiagram
    class AsyncResource {
        <<Node.js>>
    }
    
    AsyncResource <|-- Test
    
    class Test {
        +name: string
        +parent: Test|null
        +root: Test
        +harness: object
        +subtests: Test[]
        +entryFile: string
        +startTime: bigint
        +endTime: bigint
        +passed: boolean
        +error: Error|null
        +cancelled: boolean
        +diagnostics: string[]
        +activeSubtests: number
        +concurrency: number
        +abortController: AbortController
        +signal: AbortSignal
        +pendingSubtests: array
        +readySubtests: Map
        +unfinishedSubtests: Set
        +finished: boolean
        +run() Promise
        +skip(message)
        +todo(message)
        +diagnostic(message)
        +fail(err)
        +pass()
        +createSubtest()
        +postRun(pendingSubtestsError)
        +finalize()
    }
    
    Test <|-- Suite
    Test <|-- TestHook
    
    class Suite {
        +reportedType: "suite"
        +buildSuite: Promise
        +buildPhaseFinished: boolean
        +createBuild() Promise
        +run() Promise
    }
    
    class TestHook {
        +reportedType: "hook"
        +hookType: string
        +run(args) Promise
    }
    
    class TestContext {
        -test: Test
        +signal: AbortSignal
        +name: string
        +filePath: string
        +fullName: string
        +diagnostic(message)
        +test(name, options, fn)
        +plan(count, options)
        +skip(message)
        +todo(message)
        +before(fn, options)
        +after(fn, options)
        +beforeEach(fn, options)
        +afterEach(fn, options)
    }
    
    class SuiteContext {
        -suite: Suite
        +signal: AbortSignal
        +name: string
        +filePath: string
        +fullName: string
    }
    
    class TestsStream {
        -buffer: array
        -canPush: boolean
        +fail(nesting, loc, testNumber, name, details, directive)
        +ok(nesting, loc, testNumber, name, details, directive)
        +complete(nesting, loc, testNumber, name, details, directive)
        +plan(nesting, loc, count)
        +enqueue(nesting, loc, name, type)
        +dequeue(nesting, loc, name, type)
        +start(nesting, loc, name)
        +diagnostic(nesting, loc, message)
        +coverage(nesting, loc, summary)
        +summary(nesting, file, success, counts, duration_ms)
    }
```

## 5. Fail Fast Implementation Proposal

A fail-fast mechanism would allow the test runner to stop executing tests as soon as one test fails, regardless of concurrency settings. Here's a proposal for implementing this feature in Node.js test runner:

### Proposal: Fail-Fast Implementation with Concurrency Support

```mermaid
flowchart TD
    A["Test Execution Start"] --> B["Initialize failFastTriggered flag"]
    B --> C["Configure AbortController for fail-fast"]
    C --> D["Set up test event listeners"]
    D --> E["Begin test execution"]
    
    E --> F{"Test fails?"}
    F -->|No| G["Continue execution"]
    F -->|Yes| H{"failFast enabled?"}
    
    H -->|No| G
    H -->|Yes| I["Set failFastTriggered flag"]
    I --> J["Signal global abort"]
    J --> K["Cancel pending tests"]
    K --> L["Wait for active tests to complete"]
    L --> M["Report results"]
    M --> N["Exit"]
```

### Implementation Documentation

#### Overview

The fail-fast implementation would introduce a new option to the test runner that, when enabled, stops all test execution as soon as any test fails. This requires careful handling of concurrent tests.

#### Configuration Options

```javascript
// Example configuration with fail-fast enabled
test.run({
  files: ['test/*.js'],
  concurrency: 4,  // Allow 4 tests to run concurrently
  failFast: true   // Stop all tests on first failure
});
```

#### Key Components

1. **Global Abort Controller**
   - A shared AbortController that can trigger abort signals for all pending and future tests
   - Connected to all tests via signal propagation

2. **Failure Detection**
   - Listen to the TestsStream for 'test:fail' events
   - When a failure is detected and fail-fast is enabled, trigger the abort controller

3. **Test Queue Management**
   - Maintain a list of queued but not yet started tests
   - When fail-fast triggers, clear this queue and prevent new tests from being added

4. **Active Test Handling**
   - Allow tests already in progress to complete naturally
   - Abort or skip all tests waiting to be executed

#### Code Implementation Strategy

1. Add a new `failFast` option to the test runner configuration
2. Create a centralized failure tracker in the harness object
3. Enhance the test run and scheduling logic:

```javascript
// Pseudo-code for fail-fast implementation
class TestHarness {
  constructor(options) {
    this.failFast = !!options.failFast;
    this.failFastTriggered = false;
    this.failFastController = new AbortController();
    // ...other initialization
  }
  
  onTestFailure(test) {
    // Regular failure handling
    // ...
    
    // Fail-fast handling
    if (this.failFast && !this.failFastTriggered) {
      this.failFastTriggered = true;
      this.failFastController.abort();
      this.cancelPendingTests();
      this.reportFailFast(test);
    }
  }
  
  cancelPendingTests() {
    for (const test of this.pendingSubtests) {
      test.skip(`Test skipped due to fail-fast after failure in ${this.failFastTriggeringTest.name}`);
    }
    this.pendingSubtests = [];
  }
  
  createTest(options) {
    const test = new Test({
      ...options,
      // Combine the fail-fast signal with the test's own signal
      signal: options.signal ? 
        AbortSignal.any([options.signal, this.failFastController.signal]) :
        this.failFastController.signal
    });
    
    if (this.failFastTriggered) {
      test.skip('Test skipped due to prior failure with fail-fast enabled');
      return test;
    }
    
    // Normal test creation continues
    return test;
  }
}
```

#### Challenges and Considerations

1. **Race Conditions**: With concurrent tests, multiple failures might be detected simultaneously
   - Solution: Use atomic operations to ensure only the first failure triggers fail-fast

2. **Cleanup**: Even when stopping test execution, ensure proper resource cleanup
   - Solution: Run cleanup hooks for skipped tests and ensure teardown occurs

3. **Reporting**: Clearly indicate that tests were skipped due to fail-fast
   - Solution: Add a specific skip reason for tests not executed due to fail-fast

4. **Performance**: Maintain the performance benefits of concurrent execution until a failure occurs
   - Solution: Use efficient signaling mechanisms rather than polling

This implementation balances the immediate response needed for fail-fast with the complexities of concurrent test execution in Node.js.

## 6. Fail Fast Controller and Skip Mechanism Integration

This section explains how the proposed failFastController would interact with the existing test.skip mechanism to effectively stop test execution on the first failure while maintaining the test tree's integrity.

```mermaid
sequenceDiagram
    participant TestRunner as Test Runner
    participant Harness as Test Harness
    participant FailingTest as Failing Test
    participant TestsStream as Tests Stream
    participant PendingTests as Pending Tests
    participant AbortController as Fail Fast Controller
    
    Note over TestRunner,AbortController: Initialization Phase
    TestRunner->>Harness: Create harness with failFast: true
    Harness->>AbortController: Create failFastController
    
    Note over TestRunner,AbortController: Test Execution Phase
    TestRunner->>FailingTest: run()
    FailingTest->>TestsStream: fail(error)
    TestsStream->>Harness: emit 'test:fail' event
    
    Note over Harness: Fail Fast Triggering
    Harness->>Harness: Check failFast option is true
    Harness->>Harness: Set failFastTriggered flag
    Harness->>AbortController: abort()
    
    Note over TestRunner,AbortController: Signal Propagation
    AbortController-->>PendingTests: Signal abort event
    
    par Process Pending Tests
        Harness->>PendingTests: cancelPendingTests()
        loop For each pending test
            Harness->>PendingTests: test.skip("Test skipped due to fail-fast")
        end
    and Future Test Creation
        TestRunner->>Harness: createTest(options)
        Harness->>Harness: Check failFastTriggered
        Harness->>PendingTests: test.skip("Test skipped due to prior failure")
    end
    
    Note over TestRunner,AbortController: Completion and Reporting
    Harness->>TestsStream: Report skipped tests
    Harness->>TestRunner: Complete execution with failure
```

### How Skip Mechanism Works with Fail Fast

The integration between the failFastController and test.skip works through several key components:

1. **Signal-Based Communication**:
   - When a test fails and fail-fast is enabled, the failFastController's abort() method is called
   - This signals to all connected tests that execution should stop
   - Tests that are already running but listening to this signal can terminate early

2. **Skip Status Application**:
   - Tests use the skip() method to mark themselves as skipped without counting as failures
   - The skip method accepts a message explaining why the test was skipped
   - In fail-fast mode, tests are skipped with a clear message indicating they were skipped due to a prior test failure

3. **Test State Management**:
   ```javascript
   // Simplified implementation of how a test responds to fail-fast signals
   class Test {
     constructor(options) {
       // ...existing initialization
       
       // Connect to the fail-fast controller if available
       if (options.failFastSignal) {
         options.failFastSignal.addEventListener('abort', () => {
           if (!this.startTime) {
             // Test hasn't started yet - skip it entirely
             this.skip(`Skipped due to fail-fast after failure in ${options.failingTestName}`);
           } else if (!this.endTime) {
             // Test is in progress - attempt to abort it
             this.abortController.abort();
           }
         });
       }
     }
     
     // ...existing methods
   }
   ```

4. **Different Handling Based on Test State**:

   The system handles tests differently based on their current state when fail-fast is triggered:

   | Test State | Action Taken | Implementation Mechanism |
   |------------|-------------|--------------------------|
   | Not yet queued | Never created | TestHarness checks failFastTriggered before creating |
   | Queued, not started | Skipped | Removed from pendingSubtests queue, marked as skipped |
   | Currently running | Aborted | Test's own AbortController is triggered |
   | Completed | No action | Test has already reported its result |

5. **Preserving Test Tree Structure**:
   - Even when tests are skipped due to fail-fast, they remain in the test tree
   - This ensures that the test hierarchy is preserved for accurate reporting
   - The skipped tests are reported with a special directive indicating they were skipped due to fail-fast

6. **Handling Edge Cases**:
   - If a test is in the middle of setup when fail-fast is triggered, teardown functions still run
   - If multiple tests fail simultaneously in concurrent mode, only the first triggers fail-fast
   - Tests that are marked to "only" run still respect the fail-fast signal

This integration ensures that the test runner can quickly abort on first failure while still maintaining proper test structure, cleanup, and reporting.

## 7. Test Failure Communication Flow

This section clarifies how test failures are communicated throughout the test runner system, which doesn't only happen in the postRun of the root test.

```mermaid
flowchart TD
    A["Test execution encounters error"] --> B["Test.fail() method called"]
    B --> C["Sets test.passed = false and test.error"]
    
    D["Test.run() completes"] --> E["Test.postRun() called"]
    E --> F["Test reports results"]
    
    F --> G["Test.report() called during finalize"]
    G --> H{"test.passed?"}
    
    H -->|Yes| I["reporter.ok() called"]
    H -->|No| J["reporter.fail() called"]
    
    J --> K["TestsStream emits 'test:fail' event"]
    K --> L["Reporter receives failure"]
    L --> M["Error details displayed to user"]
    
    N["Active test aborted by signal"] --> O["Test.#abortHandler called"]
    O --> P["Test.fail() called with AbortError"]
    P --> B
    
    Q["Hook failure occurs"] --> R["Error with kHookFailure type"]
    R --> B
    
    S["Uncaught exception in test"] --> T["Error with kTestCodeFailure type"]
    T --> B
    
    U["Test timeout occurs"] --> V["Error with kTestTimeoutFailure type"] 
    V --> B
```

### Test Failure Communication Details

The test:fail events are communicated at different points in the test lifecycle:

1. **Immediate Failure Recording**:
   - When `test.fail(err)` is called, it sets `test.passed = false` and stores the error
   - This happens as soon as a failure is detected, not just in postRun
   - Sources of failure include: assertion failures, exceptions, timeouts, hook failures

2. **Failure Reporting**:
   - The actual emission of the test:fail event happens during the reporting phase
   - In the Test.report() method, it checks if the test passed:
   ```javascript
   if (this.passed) {
     this.reporter.ok(this.nesting, this.loc, this.testNumber, this.name, report.details, report.directive);
   } else {
     this.reporter.fail(this.nesting, this.loc, this.testNumber, this.name, report.details, report.directive);
   }
   ```

3. **TestsStream Processing**:
   - The TestsStream.fail() method is what actually emits the 'test:fail' event:
   ```javascript
   fail(nesting, loc, testNumber, name, details, directive) {
     this[kEmitMessage]('test:fail', {
       __proto__: null,
       name,
       nesting,
       testNumber,
       details,
       ...loc,
       ...directive,
     });
   }
   ```
   - The kEmitMessage method both emits the event and pushes it to the stream

4. **Parent Test Notification**:
   - After a subtest finalizes, the parent test is notified through:
   ```javascript
   this.parent.addReadySubtest(this);
   ```
   - This propagates up the test tree, allowing parent tests to fail if subtests fail

5. **Asynchronous Failure Detection**:
   - Process-level handlers for 'uncaughtException' and 'unhandledRejection' can also trigger test failures
   - These are mapped to the appropriate test via the asyncId tracking system

This multi-layered approach ensures that failures are properly recorded, propagated, and reported throughout the test execution lifecycle.

## 8. Bail/Fail-Fast Implementation Flow with Concurrent Test Files

This section details the exact function calls and flow when a bail option is triggered by a subtest failure while test files are running concurrently.

### Test Process Isolation Architecture

```mermaid
flowchart TD
    MTP["Main Test Process"] --> |"spawns"| TF1P["Test File 1 Process"]
    MTP --> |"spawns"| TF2P["Test File 2 Process"]
    MTP --> |"spawns"| TF3P["Test File 3 Process"]
    
    subgraph MainProcess["Main Process"]
        MTP["Main Test Process"]
        MH["Main Harness"]
        MREPORTER["Main Reporter"]
        MTP --> MH
        MH --> MREPORTER
    end
    
    subgraph TestFile1["Test File 1 Process"]
        TF1P["Test File 1 Process"]
        TF1H["File 1 Harness"]
        TF1["Test File 1 Root Test"]
        TF1S["Subtests"]
        TF1P --> TF1H
        TF1H --> TF1
        TF1 --> TF1S
    end
    
    subgraph TestFile2["Test File 2 Process"]
        TF2P["Test File 2 Process"]
        TF2H["File 2 Harness"]
        TF2["Test File 2 Root Test"]
        TF2S["Subtests"]
        TF2P --> TF2H
        TF2H --> TF2
        TF2 --> TF2S
    end
    
    subgraph TestFile3["Test File 3 Process"]
        TF3P["Test File 3 Process"]
        TF3H["File 3 Harness"]
        TF3["Test File 3 Root Test"]
        TF3S["Subtests"]
        TF3P --> TF3H
        TF3H --> TF3
        TF3 --> TF3S
    end
    
    TF1P -->|"test results"| MTP
    TF2P -->|"test results"| MTP
    TF3P -->|"test results"| MTP
```

### Current Implementation Analysis

After analyzing `runner.js`, I found that:

1. The child processes don't immediately send failure messages via IPC to the main process
2. Test results are currently communicated through:
   - TestsStream serializes test events into the child's stdout
   - The parent process (FileTest class) parses these messages from stdout
   - The failure message is only processed at the end of the complete test file

```mermaid
sequenceDiagram
    participant MP as Main Process
    participant TF1 as Test File 1 Process
    participant TF2 as Test File 2 Process
    
    Note over MP,TF2: Current Implementation
    
    MP->>TF1: Spawn process with test file
    MP->>TF2: Spawn process with test file
    
    Note over TF1: Test Failure Occurs
    TF1->>TF1: Subtest.fail()
    TF1->>TF1: Local test keeps running
    TF1->>TF1: Continue running all tests in file
    
    TF1->>MP: Write serialized test events to stdout
    Note right of MP: Main process parses events from stdout
    
    MP->>MP: Process test events (including failures)
    
    Note over TF1: Test File Completes
    TF1->>MP: Process exits with non-zero exit code
    MP->>MP: Detect exit code, consider file failed
    
    Note over MP: No Early Termination Currently
    MP->>TF2: Test File 2 continues running
    
    TF2->>MP: Complete all tests regardless of failures elsewhere
    MP->>MP: Collect and report all results
```

### Proposed Bail Implementation with IPC

To implement bail-out correctly, we need to add direct IPC communication:

```mermaid
sequenceDiagram
    participant MP as Main Process
    participant TF1 as Test File 1 Process
    participant TF2 as Test File 2 Process
    
    Note over MP,TF2: Proposed Implementation
    
    MP->>TF1: Spawn process with test file
    MP->>TF2: Spawn process with test file
    
    Note over TF1: Test Failure Occurs
    TF1->>TF1: Subtest.fail()
    TF1->>TF1: TestsStream emits 'test:fail' event
    
    TF1->>MP: Immediately send IPC message: { type: 'test:bail', data: failureData }
    Note right of MP: Main process receives bail notification
    
    MP->>MP: Set bailTriggered flag
    MP->>TF2: Send SIGTERM signal
    
    TF2->>TF2: Handle graceful termination
    TF2->>TF2: Run cleanup handlers
    TF2->>MP: Send partial results before exit
    
    MP->>MP: Report bailed test results
    MP->>MP: Exit with error code
```

### Implementation Strategy for Bail with IPC

Based on the analysis of `runner.js`, these changes would be needed:

1. **Child Process Modifications**:
   ```javascript
   // In the child process
   
   // Listen for test:fail events
   const onTestFail = (data) => {
     if (process.send && options.bail) {
       // Send immediate notification to parent via IPC
       process.send({ 
         type: 'test:bail', 
         testName: data.name,
         file: data.file,
         details: data.details 
       });
     }
   };
   
   reporter.on('test:fail', onTestFail);
   ```

2. **Parent Process Modifications in runner.js**:
   ```javascript
   // In FileTest class or runTestFile function
   
   // Set up IPC message handling
   if (options.bail) {
     child.on('message', (message) => {
       if (message.type === 'test:bail') {
         // Report the failure
         subtest.addToReport({
           type: 'test:diagnostic',
           data: { 
             file: path, 
             message: `Bail out! Test failed in ${message.file}: ${message.testName}` 
           }
         });
         
         // Kill all other running processes
         for (const [otherPath, otherProcess] of runningProcesses) {
           if (otherPath !== path && otherProcess.connected) {
             otherProcess.kill('SIGTERM');
           }
         }
       }
     });
   }
   ```

3. **Main Runner Modifications**:
   ```javascript
   // Add bail option to runTestFile options
   function runTestFile(path, filesWatcher, opts) {
     // ...existing setup code...
     
     const env = { 
       __proto__: null, 
       ...process.env, 
       NODE_TEST_CONTEXT: 'child-v8',
       NODE_TEST_BAIL: opts.bail ? '1' : undefined 
     };
     
     // ...existing code...
   }
   ```

### Implementation Integration Points for Process Isolation

To implement bail/fail-fast functionality correctly with process isolation, these are the key integration points:

1. **Main Process (Runner)**:
   - Add `bail` option to the command-line arguments and runner configuration
   - Pass bail configuration to each child process via environment variables
   - Set up explicit IPC communication to receive immediate test failures
   - Implement a bailout handler that terminates other processes
   - Track which processes are still running
   - Collect and aggregate results from processes that were terminated early

2. **Child Process (Test File)**:
   - Add listeners for test:fail events on the TestsStream
   - Send immediate IPC notifications when failures occur and bail is enabled
   - Handle termination signals gracefully
   - Ensure results are reported before exit even during early termination

3. **Process Communication**:
   - Define clear message protocol for bail notifications
   - Use process.send() for immediate failure communication
   - Continue using stdout for complete test results

This implementation would allow the test runner to immediately stop other test processes as soon as a test fails in one process, without waiting for the entire test file to complete.
