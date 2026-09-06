import { run } from 'node:test';

const stream = run({ files: [process.argv[2]], isolation: 'none' });

for await (const { type, data } of stream) {
  if (type === 'test:stdout') {
    process.stdout.write(`captured: ${data.message}`);
  }
}

console.log('after run');
