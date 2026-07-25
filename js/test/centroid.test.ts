import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { getCentroid } from "../src/centroid";
import { parseXmlTestCases } from "./utils/xmlTestParser";

const FIXTURE = join(import.meta.dirname, "../../upstream/jts/resources/testxml/general/TestCentroid.xml");

describe("Centroid", () => {
  const cases = parseXmlTestCases(FIXTURE, "getCentroid");

  it("loads all 38 upstream cases", () => {
    expect(cases).toHaveLength(38);
  });

  for (const c of cases) {
    it(`matches JTS for: ${c.desc}`, () => {
      const actual = c.input === null ? null : getCentroid(c.input);
      // Exact comparison, per the exact-comparison rule: both languages evaluate the same IEEE
      // 754 operations in the same order, so any difference is information.
      expect(actual).toEqual(c.expected);
    });
  }

  it("treats zero-length lines as points", () => {
    // JTS 1.19.0 gives (6.666666666666667, 6.666666666666667) here; the
    // pre-retrofit inline centroid gave (0, 0).
    const centroid = getCentroid({
      type: "MultiLineString",
      coordinates: [
        [
          [0, 0],
          [0, 0],
        ],
        [
          [10, 10],
          [10, 10],
        ],
        [
          [10, 10],
          [10, 10],
        ],
      ],
    });
    expect(centroid).not.toBeNull();
    expect(centroid![0]).toBeCloseTo(6.666666666666667, 12);
    expect(centroid![1]).toBeCloseTo(6.666666666666667, 12);
  });

  it("returns null for an empty geometry", () => {
    expect(getCentroid({ type: "MultiPoint", coordinates: [] })).toBeNull();
  });
});
