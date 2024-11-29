'use strict';

const { run } = require('node:test');
const fixtures = require('../../test/common/fixtures');
const { mustCall, mustNotCall } = require('../../test/common');
const common = require('../common');

const files = [fixtures.path('test-runner', 'coverage.js')];

const bench = common.createBenchmark(main, {
  n: [50],
});

function main({ n }) {
  bench.start();
  runBench(n).then(() => {
    bench.end(n);
  });
}

async function runBench(n) {
  for (let i = 0; i < n; i++) {
    const stream = run({ files, coverage: true });
    stream.on('test:fail', mustNotCall());
    stream.on('test:pass', mustCall());
    stream.on('test:coverage', mustCall());
    // eslint-disable-next-line no-unused-vars
    for await (const _ of stream);
  }
}
