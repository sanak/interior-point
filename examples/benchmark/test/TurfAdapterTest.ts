import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Polygon } from "geojson";
import { turfAdapter } from "../src/adapters/turf.ts";

describe("turfAdapter", () => {
  it("matches ledger row 9", () => {
    assert.equal(turfAdapter.id, "turf");
    assert.equal(turfAdapter.label, "turf (JS)");
    assert.equal(turfAdapter.call, "pointOnFeature");
  });

  it("computes a point inside the unit square after load()", async () => {
    const square: Polygon = {
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
    await turfAdapter.load();
    const point = turfAdapter.interiorPoint(square);
    assert.notEqual(point, null);
    const [x, y] = point as [number, number];
    assert.ok(x > 0 && x < 10, `x=${x} not strictly inside`);
    assert.ok(y > 0 && y < 10, `y=${y} not strictly inside`);
  });
});
