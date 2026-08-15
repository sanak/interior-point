import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Feature, Position } from "geojson";

import { groupPointHits, pointLayerId, resolveHits, type PointHit, type QueriedFeature } from "../src/ui/hits.ts";
import type { Adapter, Dataset } from "../src/types.ts";

function hit(
  adapterId: string,
  position: Position,
  properties: Readonly<Record<string, unknown>> | null = null,
  index = 0,
): PointHit {
  return { adapterId, label: adapterId, color: "#000000", index, position, properties };
}

/** A minimal adapter: `resolveHits` only reads `id`, `label` and the colour lookup. */
function adapter(id: string): Adapter {
  return {
    id,
    label: id,
    call: "",
    load: () => Promise.resolve(),
    interiorPoint: () => null,
  };
}

function feature(layerId: string, id?: string | number): QueriedFeature {
  return { layer: { id: layerId }, id };
}

describe("groupPointHits", () => {
  it("folds hits that agree on the coordinate and the attributes into one group", () => {
    const groups = groupPointHits([hit("a", [1, 2], { k: "v" }), hit("b", [1, 2], { k: "v" })]);
    assert.equal(groups.length, 1);
    assert.deepEqual(
      groups[0].labels.map((label) => label.label),
      ["a", "b"],
    );
    assert.deepEqual(groups[0].position, [1, 2]);
    assert.deepEqual(groups[0].properties, { k: "v" });
  });

  it("splits hits whose coordinates differ in the last place", () => {
    const groups = groupPointHits([hit("a", [1, 2]), hit("b", [1, 2.0000000000001])]);
    assert.equal(groups.length, 2);
  });

  it("splits hits carrying different attributes even at the same coordinate", () => {
    const groups = groupPointHits([hit("a", [1, 2], { k: "v" }), hit("b", [1, 2], { k: "w" })]);
    assert.equal(groups.length, 2);
  });

  it("treats an absent attribute set as its own key rather than matching every other", () => {
    const groups = groupPointHits([hit("a", [1, 2], null), hit("b", [1, 2], { k: "v" })]);
    assert.equal(groups.length, 2);
  });

  it("orders the groups by where each first appears, so the caller's order decides", () => {
    const groups = groupPointHits([hit("a", [3, 4]), hit("b", [1, 2]), hit("c", [3, 4])]);
    assert.deepEqual(
      groups.map((group) => group.labels.map((label) => label.label)),
      [["a", "c"], ["b"]],
    );
  });

  it("carries each hit's colour through to its label", () => {
    const hits = [{ ...hit("a", [1, 2]), color: "#E69F00" }];
    assert.deepEqual(groupPointHits(hits)[0].labels, [{ label: "a", color: "#E69F00" }]);
  });

  it("returns nothing for no hits", () => {
    assert.deepEqual(groupPointHits([]), []);
  });
});

describe("resolveHits", () => {
  const colors = { a: "#111111", b: "#222222" };

  it("orders hits by the adapter registry, regardless of the order features arrive in", () => {
    const adapters = [adapter("a"), adapter("b")];
    const points = new Map([
      ["a", [[1, 2]]],
      ["b", [[3, 4]]],
    ]);
    const features = [feature(pointLayerId("b"), 0), feature(pointLayerId("a"), 0)];
    const hits = resolveHits(features, { adapters, colors, points, dataset: null });
    assert.deepEqual(
      hits.map((h) => h.adapterId),
      ["a", "b"],
    );
  });

  it("skips a feature whose id is not a number, but keeps one whose id is 0", () => {
    const adapters = [adapter("a")];
    const points = new Map([
      [
        "a",
        [
          [1, 2],
          [3, 4],
        ],
      ],
    ]);
    const features = [feature(pointLayerId("a"), "not-a-number"), feature(pointLayerId("a"), 0)];
    const hits = resolveHits(features, { adapters, colors, points, dataset: null });
    assert.equal(hits.length, 1);
    assert.equal(hits[0].index, 0);
    assert.deepEqual(hits[0].position, [1, 2]);
  });

  it("drops a feature whose index is past the end of that adapter's points array", () => {
    const adapters = [adapter("a")];
    const points = new Map([["a", [[1, 2]]]]);
    const features = [feature(pointLayerId("a"), 5)];
    const hits = resolveHits(features, { adapters, colors, points, dataset: null });
    assert.deepEqual(hits, []);
  });

  it("ignores a feature whose layer id matches no adapter", () => {
    const adapters = [adapter("a")];
    const points = new Map([["a", [[1, 2]]]]);
    const features = [feature("points-unknown", 0)];
    const hits = resolveHits(features, { adapters, colors, points, dataset: null });
    assert.deepEqual(hits, []);
  });

  it("reads properties from dataset.features[id], and null when there is no dataset", () => {
    const adapters = [adapter("a")];
    const points = new Map([["a", [[1, 2]]]]);
    const features = [feature(pointLayerId("a"), 0)];

    const withoutDataset = resolveHits(features, { adapters, colors, points, dataset: null });
    assert.equal(withoutDataset[0].properties, null);

    const dataset: Dataset = {
      name: "test",
      geometries: [],
      features: [{ type: "Feature", geometry: null, properties: { k: "v" } } as unknown as Feature],
      skipped: 0,
    };
    const withDataset = resolveHits(features, { adapters, colors, points, dataset });
    assert.deepEqual(withDataset[0].properties, { k: "v" });
  });
});
