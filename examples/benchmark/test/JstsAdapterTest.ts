import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Polygon } from "geojson";
import { jstsAdapter } from "../src/adapters/jsts.ts";

describe("jstsAdapter", () => {
  it("matches ledger row 5", () => {
    assert.equal(jstsAdapter.id, "jsts");
    assert.equal(jstsAdapter.label, "jsts (JS port)");
    assert.equal(jstsAdapter.call, "Geometry#getInteriorPoint");
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
    await jstsAdapter.load();
    const point = jstsAdapter.interiorPoint(square);
    assert.notEqual(point, null);
    const [x, y] = point as [number, number];
    assert.ok(x > 0 && x < 10, `x=${x} not strictly inside`);
    assert.ok(y > 0 && y < 10, `y=${y} not strictly inside`);
  });
});
