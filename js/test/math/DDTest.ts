import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DD } from "../../src/math/DD.ts";

/** Reproduces CGAlgorithmsDD's unrolled 2x2 determinant so the DD ops are exercised together. */
function det(ax: number, ay: number, bx: number, by: number): number {
  const a = DD.valueOfDouble(ax);
  const b = DD.valueOfDouble(by);
  const c = DD.valueOfDouble(ay);
  const d = DD.valueOfDouble(bx);
  return a.selfMultiplyDD(b).selfSubtractDD(c.selfMultiplyDD(d)).signum();
}

describe("DD", () => {
  it("represents a plain double exactly", () => {
    assert.equal(DD.valueOfDouble(0).signum(), 0);
    assert.equal(DD.valueOfDouble(1.5).signum(), 1);
    assert.equal(DD.valueOfDouble(-1.5).signum(), -1);
  });

  it("keeps the sign of a determinant that cancels to zero in plain f64", () => {
    // With e = 2^-52, every input below is exactly representable and the true
    // determinant is (1+e)^2 - (1+2e) = e^2 = 2^-104: positive, but 51 bits
    // below the ulp of the products, so plain f64 rounds it away entirely.
    // Real JTS DD reports 1 here (verified against jts-core-1.19.0.jar).
    const e = Math.pow(2, -52);
    const ax = 1 + e,
      ay = 1,
      bx = 1 + 2 * e,
      by = 1 + e;
    assert.equal(ax * by - ay * bx, 0); // plain f64 loses it
    assert.equal(det(ax, ay, bx, by), 1); // DD does not
  });

  it("adds without losing the low-order component", () => {
    const dd = DD.valueOfDouble(1);
    dd.selfAddDouble(1e-30);
    // 1 + 1e-30 is exactly 1 in f64, but the DD carries the remainder,
    // so subtracting 1 back must leave a positive value.
    assert.equal(1 + 1e-30 - 1, 0);
    dd.selfSubtractDD(DD.valueOfDouble(1));
    assert.equal(dd.signum(), 1);
  });

  it("treats a determinant of four identical values as collinear", () => {
    // At 1e17 the ulp is 16, so 1e17+1, +2 and +3 all collapse onto 1e17 and the
    // true determinant really is 0. DD agrees, and must not invent a sign.
    assert.equal(1e17 + 1, 1e17);
    assert.equal(det(1e17, 1e17 + 1, 1e17 + 2, 1e17 + 3), 0);
  });
});
