import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Polygon } from "geojson";
import { ADAPTER_COLORS, ADAPTERS } from "../src/adapters/index.ts";
import { tsCentroidFirstAdapter, tsInteriorPointAdapter } from "../src/adapters/tsInteriorPoint.ts";

describe("ADAPTER_COLORS", () => {
  it("holds one color per ledger row, nine in all", () => {
    assert.equal(Object.keys(ADAPTER_COLORS).length, 9);
    for (const color of Object.values(ADAPTER_COLORS)) {
      assert.match(color, /^#[0-9A-Fa-f]{6}$/);
    }
  });
});

describe("ADAPTERS", () => {
  it("holds rows 1 through 4, in ledger order", () => {
    assert.deepEqual(
      ADAPTERS.map((adapter) => adapter.id),
      ["ts-interior-point", "ts-centroid-first", "rs-interior-point", "rs-centroid-first"],
    );
  });

  it("names the calls the ledger records for rows 1 through 4", () => {
    assert.deepEqual(
      ADAPTERS.map((adapter) => adapter.call),
      ["interiorPoint", "centroidFirstInteriorPoint", "interiorPoint", "centroidFirstInteriorPoint"],
    );
  });

  it("has a color for every registered adapter", () => {
    for (const adapter of ADAPTERS) {
      assert.ok(adapter.id in ADAPTER_COLORS, `no color for ${adapter.id}`);
    }
  });

  // Restricted to the TypeScript rows: rs-interior-point and rs-centroid-first need a real wasm
  // instantiation, which node --test cannot provide. RsWasmAdapterTest.ts checks their static
  // fields instead, and manual browser verification checks the actual wasm call.
  it("throws if interiorPoint is called before load()", () => {
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
    for (const adapter of [tsInteriorPointAdapter, tsCentroidFirstAdapter]) {
      assert.throws(() => adapter.interiorPoint(square));
    }
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
    for (const adapter of [tsInteriorPointAdapter, tsCentroidFirstAdapter]) {
      await adapter.load();
      const point = adapter.interiorPoint(square);
      assert.notEqual(point, null);
      const [x, y] = point as [number, number];
      assert.ok(x > 0 && x < 10, `x=${x} not strictly inside`);
      assert.ok(y > 0 && y < 10, `y=${y} not strictly inside`);
    }
  });
});
