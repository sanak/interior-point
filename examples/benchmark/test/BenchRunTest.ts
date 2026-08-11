import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Geometry, Position } from "geojson";

import { runAdapter } from "../src/bench/run.ts";
import type { Adapter, Dataset } from "../src/types.ts";

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

function dataset(count: number): Dataset {
  const geometries = Array.from({ length: count }, () => square);
  return {
    name: "fake",
    geometries,
    features: geometries.map((geometry) => ({ type: "Feature" as const, properties: {}, geometry })),
    skipped: 0,
  };
}

function fakeAdapter(overrides: Partial<Adapter> = {}): Adapter {
  return {
    id: "fake",
    label: "Fake",
    call: "fake()",
    load: async () => {},
    interiorPoint: (): Position | null => [5, 5],
    ...overrides,
  };
}

describe("runAdapter", () => {
  it("times the load on the first run and reports null afterwards", async () => {
    const loaded = new Set<string>();
    const adapter = fakeAdapter();

    const first = await runAdapter(adapter, dataset(3), loaded);
    const second = await runAdapter(adapter, dataset(3), loaded);

    assert.ok(first.loadMs !== null && first.loadMs >= 0);
    assert.equal(second.loadMs, null);
  });

  it("calls load exactly once across runs", async () => {
    const loaded = new Set<string>();
    let calls = 0;
    const adapter = fakeAdapter({
      load: async () => {
        calls += 1;
      },
    });

    await runAdapter(adapter, dataset(2), loaded);
    await runAdapter(adapter, dataset(2), loaded);

    assert.equal(calls, 1);
  });

  it("stores one point per geometry and derives the rate from the total", async () => {
    const result = await runAdapter(fakeAdapter(), dataset(4), new Set());

    assert.equal(result.adapterId, "fake");
    assert.equal(result.points.length, 4);
    assert.deepEqual(result.points[0], [5, 5]);
    assert.equal(result.errors, 0);
    assert.ok(result.totalMs >= 0);
    assert.ok(result.pointsPerSecond > 0);
    assert.equal(result.verification["interior"], 4);
  });

  it("counts a throwing geometry and keeps going", async () => {
    let seen = 0;
    const adapter = fakeAdapter({
      interiorPoint: () => {
        seen += 1;
        if (seen === 2) throw new Error("boom");
        return [5, 5];
      },
    });

    const result = await runAdapter(adapter, dataset(3), new Set());

    assert.equal(seen, 3);
    assert.equal(result.errors, 1);
    assert.equal(result.points[1], null);
    assert.equal(result.verification["unverifiable"], 1);
    assert.equal(result.verification["interior"], 2);
  });

  it("lets a load failure reach the caller", async () => {
    const loaded = new Set<string>();
    const adapter = fakeAdapter({
      load: async () => {
        throw new Error("no wasm here");
      },
    });

    await assert.rejects(() => runAdapter(adapter, dataset(1), loaded), /no wasm here/);
    assert.equal(loaded.has("fake"), false);
  });
});
