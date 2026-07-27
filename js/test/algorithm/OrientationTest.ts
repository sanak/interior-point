import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CLOCKWISE,
  COLLINEAR,
  COUNTERCLOCKWISE,
  LEFT,
  RIGHT,
  STRAIGHT,
  index,
  isCCWCoordinates,
} from "../../src/algorithm/Orientation.ts";

const CCW_SQUARE = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
  [0, 0],
];
const CW_SQUARE = [...CCW_SQUARE].reverse();

describe("Orientation", () => {
  it("names the JTS constants", () => {
    assert.equal(CLOCKWISE, -1);
    assert.equal(COUNTERCLOCKWISE, 1);
    assert.equal(COLLINEAR, 0);
  });

  it("classifies a counter-clockwise ring", () => {
    assert.equal(isCCWCoordinates(CCW_SQUARE), true);
  });

  it("classifies a clockwise ring", () => {
    assert.equal(isCCWCoordinates(CW_SQUARE), false);
  });

  it("returns false for a ring with too few points", () => {
    assert.equal(
      isCCWCoordinates([
        [0, 0],
        [1, 1],
        [0, 0],
      ]),
      false,
    );
  });

  it("returns false for a flat ring", () => {
    assert.equal(
      isCCWCoordinates([
        [0, 0],
        [1, 0],
        [2, 0],
        [1, 0],
        [0, 0],
      ]),
      false,
    );
  });

  it("handles a ring with a flat top", () => {
    // Flat cap: the direction of the flat top decides, without consulting index().
    assert.equal(
      isCCWCoordinates([
        [0, 0],
        [2, 0],
        [2, 1],
        [1, 1],
        [0, 1],
        [0, 0],
      ]),
      true,
    );
  });

  it("handles repeated points along the top", () => {
    assert.equal(
      isCCWCoordinates([
        [0, 0],
        [2, 0],
        [2, 1],
        [2, 1],
        [0, 1],
        [0, 0],
      ]),
      true,
    );
  });

  it("delegates the pointed-cap case to the robust index", () => {
    assert.equal(index([0, 0], [1, 0], [0, 1]), COUNTERCLOCKWISE);
    assert.equal(index([0, 0], [1, 0], [0, -1]), CLOCKWISE);
    assert.equal(index([0, 0], [1, 0], [2, 0]), COLLINEAR);
  });
});

describe("the JTS alias constants", () => {
  it("names each orientation twice, as JTS does", () => {
    assert.equal(RIGHT, CLOCKWISE);
    assert.equal(LEFT, COUNTERCLOCKWISE);
    assert.equal(STRAIGHT, COLLINEAR);
  });
});
