import { describe, expect, it } from "vitest";

import { CLOCKWISE, COLLINEAR, COUNTERCLOCKWISE, index, isCCWCoordinates } from "../src/orientation";

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
    expect(CLOCKWISE).toBe(-1);
    expect(COUNTERCLOCKWISE).toBe(1);
    expect(COLLINEAR).toBe(0);
  });

  it("classifies a counter-clockwise ring", () => {
    expect(isCCWCoordinates(CCW_SQUARE)).toBe(true);
  });

  it("classifies a clockwise ring", () => {
    expect(isCCWCoordinates(CW_SQUARE)).toBe(false);
  });

  it("returns false for a ring with too few points", () => {
    expect(
      isCCWCoordinates([
        [0, 0],
        [1, 1],
        [0, 0],
      ]),
    ).toBe(false);
  });

  it("returns false for a flat ring", () => {
    expect(
      isCCWCoordinates([
        [0, 0],
        [1, 0],
        [2, 0],
        [1, 0],
        [0, 0],
      ]),
    ).toBe(false);
  });

  it("handles a ring with a flat top", () => {
    // Flat cap: the direction of the flat top decides, without consulting index().
    expect(
      isCCWCoordinates([
        [0, 0],
        [2, 0],
        [2, 1],
        [1, 1],
        [0, 1],
        [0, 0],
      ]),
    ).toBe(true);
  });

  it("handles repeated points along the top", () => {
    expect(
      isCCWCoordinates([
        [0, 0],
        [2, 0],
        [2, 1],
        [2, 1],
        [0, 1],
        [0, 0],
      ]),
    ).toBe(true);
  });

  it("delegates the pointed-cap case to the robust index", () => {
    expect(index([0, 0], [1, 0], [0, 1])).toBe(COUNTERCLOCKWISE);
    expect(index([0, 0], [1, 0], [0, -1])).toBe(CLOCKWISE);
    expect(index([0, 0], [1, 0], [2, 0])).toBe(COLLINEAR);
  });
});
