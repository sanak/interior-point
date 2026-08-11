import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Geometry } from "geojson";

import { emptySummary, summarizeVerification } from "../src/bench/verify.ts";

const square: Geometry = {
  type: "Polygon",
  coordinates: [
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ],
  ],
};

describe("summarizeVerification", () => {
  it("counts one verdict per geometry", () => {
    const summary = summarizeVerification([[5, 5], [0, 0], [99, 99], null], [square, square, square, square]);

    assert.equal(summary["interior"], 1);
    assert.equal(summary["on-geometry"], 1);
    assert.equal(summary["off-geometry"], 1);
    assert.equal(summary["unverifiable"], 1);
  });

  it("starts every verdict at zero", () => {
    assert.deepEqual(emptySummary(), {
      interior: 0,
      "on-geometry": 0,
      "off-geometry": 0,
      unverifiable: 0,
    });
  });
});
