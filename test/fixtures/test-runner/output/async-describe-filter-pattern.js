// Flags: --test --test-name-pattern="some test"
const { describe, test } = require("node:test");

describe("async describe", async (t) => {
  await test("some test");
});

describe("sync describe", () => {
  test("some test");
});