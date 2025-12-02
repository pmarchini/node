import test, { describe } from "node:test";
import assert from "node:assert/strict";

describe(`promises tracking`, async () => {
  test(`this'll hang`, async () => {
    await new Promise((resolve) => {
      console.log(`looks like this will never resolve()`);
    });
    assert.equal(true, true);
  });
});
