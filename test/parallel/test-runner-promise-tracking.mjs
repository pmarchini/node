import * as common from '../common/index.mjs';
import * as fixtures from '../common/fixtures.mjs';
import { describe, it, run } from 'node:test';

const testFixture = fixtures.path('test-runner', 'promise-tracking', 'index.mjs');

describe('Promise tracking', () => {
  it('should correctly track a pending promise when --test-track-promises is set', async () => {
    const abortController = new AbortController();

    const stream = run(
      {
        files:[testFixture],
        signal: abortController.signal,
        isolation: 'none'
      }
    );

    stream.on('test:fail', common.mustCall());
    stream.on('test:pass', common.mustNotCall());
    stream.on('test:stderr', (data) => {
      console.log(data);
    })
    stream.on('test:stdout', (data) => {
      if(data.message.match(/looks like this will never resolve/)){
        abortController.abort();
      }
      console.log(data);
    })
    stream.on("test:diagnostic", (data) => {
      console.log(data.message);
    })
    // eslint-disable-next-line no-unused-vars
    for await (const _ of stream);
  });

  it.todo('should not track pendind promises when --test-track-promises is not set', () => {})
});

