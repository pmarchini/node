import { test } from 'node:test';

test('slow-test', async () => {
  await new Promise((resolve) => setTimeout(resolve, 60_000));
});
