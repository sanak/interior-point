import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Position } from "geojson";

import { groupPointHits, type PointHit } from "../src/ui/hits.ts";

function hit(
  adapterId: string,
  position: Position,
  properties: Readonly<Record<string, unknown>> | null = null,
  index = 0,
): PointHit {
  return { adapterId, label: adapterId, color: "#000000", index, position, properties };
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
