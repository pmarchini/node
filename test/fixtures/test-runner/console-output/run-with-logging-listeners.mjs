import { run } from 'node:test';

// Listeners run synchronously while the test that emitted the event is still
// executing. What they log must reach stdout directly instead of becoming a
// new event, or they would feed themselves forever.
const stream = run({ files: [process.argv[2]], isolation: 'none' });
stream.on('test:stdout', ({ message }) => console.log(`listener saw stdout: ${message.trim()}`));
stream.on('test:pass', ({ name }) => console.log(`listener saw pass: ${name}`));

// eslint-disable-next-line no-unused-vars
for await (const _ of stream);
