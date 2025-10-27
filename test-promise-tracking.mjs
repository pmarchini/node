import test, { describe } from "node:test";
import assert from "node:assert/strict";

describe(`project testing`, async () => {
  test(`this'll hang`, async () => {
    const value = await new Promise((resolve) => {
      console.log(`looks like this'll never resolve()`);
    });
    assert.equal(value, true);
  });
});