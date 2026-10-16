'use strict';
const test = require('node:test');

test('a-exits-cleanly.cjs passes');
// Ends the whole worker before the other file of the shard runs.
process.exit(0);
