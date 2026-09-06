'use strict';
const { run, test } = require('node:test');

test('outer', async () => {
  for await (const { type, data } of run({ files: [process.argv[2]] })) {
    if (type === 'test:pass') {
      console.log(`inner passed: ${data.name}`);
    }
  }
});
