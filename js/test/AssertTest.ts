import { describe, expect, it } from "vitest";
import { AssertionFailedError, assertTrue } from "../src/Assert";

describe("assertTrue", () => {
  it("does nothing when the assertion holds", () => {
    expect(() => assertTrue(true)).not.toThrow();
    expect(() => assertTrue(true, "unused")).not.toThrow();
  });

  it("throws AssertionFailedError when the assertion fails", () => {
    expect(() => assertTrue(false)).toThrow(AssertionFailedError);
  });

  it("carries the message through", () => {
    expect(() => assertTrue(false, "odd number of scanline crossings")).toThrow("odd number of scanline crossings");
  });

  it("is an Error subclass with a usable name", () => {
    try {
      assertTrue(false, "boom");
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect((e as Error).name).toBe("AssertionFailedError");
    }
  });
});
