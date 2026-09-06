// Logs through the global console from inside the reporter. With
// --test-isolation=none the reporter shares the process with the tests, so its
// output must reach stdout directly instead of becoming a new test:stdout event.
export default async function* loggingReporter(source) {
  for await (const { type } of source) {
    if (type === 'test:stdout' || type === 'test:pass') {
      console.log(`reporter received ${type}`);
    }
  }
}
