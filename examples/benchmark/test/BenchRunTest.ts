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

/** Geometries that name their own position, so a run can report which ones it was handed. */
function indexedDataset(count: number): Dataset {
  const geometries: Geometry[] = Array.from({ length: count }, (_unused, index) => ({
    type: "Point",
    coordinates: [index, 0],
  }));
  return {
    name: "indexed",
    geometries,
    features: geometries.map((geometry) => ({ type: "Feature" as const, properties: {}, geometry })),
    skipped: 0,
  };
}

function indexOf(geometry: Geometry): number {
  return (geometry as { coordinates: Position }).coordinates[0];
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
  it("runs every geometry twice, in order, and times only the second pass", async () => {
    const seen: number[] = [];
    const adapter = fakeAdapter({
      interiorPoint: (geometry) => {
        seen.push(indexOf(geometry));
        return [0, 0];
      },
    });

    const result = await runAdapter(adapter, indexedDataset(8), new Set());

    const inOrder = [0, 1, 2, 3, 4, 5, 6, 7];
    assert.deepEqual(seen, [...inOrder, ...inOrder]);
    assert.equal(result.points.length, 8);
  });

  it("does not count a warm-up failure as an error of the timed pass", async () => {
    // Index 0 is warmed and timed; only the timed call may reach `errors`.
    const adapter = fakeAdapter({
      interiorPoint: (geometry) => {
        if (indexOf(geometry) === 0) throw new Error("boom");
        return [0, 0];
      },
    });

    const result = await runAdapter(adapter, indexedDataset(10), new Set());

    assert.equal(result.errors, 1);
    assert.equal(result.points[0], null);
  });

  it("warms up on every run, not just the first", async () => {
    const loaded = new Set<string>();
    let calls = 0;
    const adapter = fakeAdapter({
      interiorPoint: () => {
        calls += 1;
        return [0, 0];
      },
    });

    await runAdapter(adapter, indexedDataset(20), loaded);
    assert.equal(calls, 40);
    await runAdapter(adapter, indexedDataset(20), loaded);
    assert.equal(calls, 80);
  });

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
        // The second geometry of the timed pass, once the warm-up pass is past.
        if (seen === 5) throw new Error("boom");
        return [5, 5];
      },
    });

    const result = await runAdapter(adapter, dataset(3), new Set());

    assert.equal(seen, 6);
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
