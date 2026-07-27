import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AssertionFailedError, assertTrue } from "../src/Assert.ts";

describe("assertTrue", () => {
  it("does nothing when the assertion holds", () => {
    assert.doesNotThrow(() => assertTrue(true));
    assert.doesNotThrow(() => assertTrue(true, "unused"));
  });

  it("throws AssertionFailedError when the assertion fails", () => {
    assert.throws(() => assertTrue(false), AssertionFailedError);
  });

  it("carries the message through", () => {
    assert.throws(() => assertTrue(false, "odd number of scanline crossings"), {
      message: "odd number of scanline crossings",
    });
  });

  it("is an Error subclass with a usable name", () => {
    try {
      assertTrue(false, "boom");
    } catch (e) {
      assert.ok(e instanceof Error);
      assert.equal((e as Error).name, "AssertionFailedError");
    }
  });
});
