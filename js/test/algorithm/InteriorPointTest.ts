/**
 * Integration tests for interiorPoint() dispatcher.
 *
 * Loads test cases directly from JTS TestInteriorPoint.xml (24 cases from XML)
 * plus extra cases from InteriorPointTest.java that are not in the XML.
 * Mirrors JTS InteriorPointTest.java: single test file, all via dispatcher.
 */
import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import type { Geometry } from "geojson";
import { AssertionFailedError } from "../../src/Assert";
import { interiorPoint } from "../../src/algorithm/InteriorPoint";
import { parseXmlTestCases } from "../utils/XmlTestParser";

const xmlPath = resolve(__dirname, "../../../upstream/jts/resources/testxml/general/TestInteriorPoint.xml");
const testCases = parseXmlTestCases(xmlPath, "getInteriorPoint");

/**
 * @jts-adapter GeometryTestCase — JUnit-bound test infrastructure; vitest plus
 *   the XML parsers fill the role. JTS drives these cases through
 *   GeometryTestCase's XML runner, which has no counterpart here.
 */
describe("InteriorPoint - TestInteriorPoint.xml", () => {
  it("loads all 24 upstream cases", () => {
    expect(testCases).toHaveLength(24);
  });

  for (const tc of testCases) {
    it(tc.desc, () => {
      const result = interiorPoint(tc.input);
      expect(result).toEqual(tc.expected);
    });
  }
});

describe("InteriorPoint - extra cases (InteriorPointTest.java)", () => {
  /** @jts InteriorPointTest#testPolygonZeroArea() */
  it("zero-area polygon", () => {
    const input: Geometry = {
      type: "Polygon",
      coordinates: [
        [
          [10, 10],
          [10, 10],
          [10, 10],
          [10, 10],
        ],
      ],
    };
    expect(interiorPoint(input)).toEqual([10, 10]);
  });

  /** @jts InteriorPointTest#testMultiLineWithEmpty() */
  it("multiline with empty", () => {
    const input: Geometry = {
      type: "MultiLineString",
      coordinates: [
        [
          [0, 0],
          [1, 1],
        ],
      ],
    };
    expect(interiorPoint(input)).toEqual([0, 0]);
  });

  it("mL - zero length lines, asymmetric (centroid defect regression)", () => {
    // Confirmed against JTS 1.19.0: centroid (6.667, 6.667), interior point (10, 10).
    // The pre-retrofit port returned [0, 0] because it took the first coordinate
    // of the first line instead of treating zero-length lines as points.
    const result = interiorPoint({
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
    expect(result).toEqual([10, 10]);
  });
});

describe("InteriorPointArea - odd scanline crossings (even-crossing assertion)", () => {
  // JTS asserts `0 == crossings.size() % 2`. A closed ring always produces an
  // even count -- crossing the scan line flips inside/outside, and a closed
  // curve returns to where it started -- so only a ring that is not closed can
  // reach the assertion. JTS's LinearRing enforces closure in its constructor;
  // GeoJSON does not, which is why this is reachable here at all. RFC 7946
  // §3.1.6 requires polygon rings to be closed, so these inputs are invalid.
  //
  // Neither TestInteriorPoint.xml (24 cases) nor world.wkt (244 geometries)
  // contains an input that reaches the assertion; both suites pass with it in
  // place. These constructed rings are the coverage the even-crossing assertion needs.

  it("throws on an unclosed triangular ring", () => {
    // Scan line lands at y=5. Only the (10,0)-(10,10) edge crosses it, giving
    // one crossing. Before the retrofit the loop bound was `i < length - 1`,
    // so a single crossing was silently skipped and the zero-area default --
    // the ring's first vertex, [0, 0] -- was returned as if it were interior.
    expect(() =>
      interiorPoint({
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [10, 0],
            [10, 10],
          ],
        ],
      }),
    ).toThrow(AssertionFailedError);
  });

  it("names the robustness failure in the assertion message", () => {
    expect(() =>
      interiorPoint({
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 10],
          ],
        ],
      }),
    ).toThrow("Interior Point robustness failure: odd number of scanline crossings");
  });

  it("does not throw on a self-intersecting but closed ring", () => {
    // A bowtie is invalid too, but it is closed, so the crossing count stays
    // even. The assertion must not fire here -- it guards parity, not validity.
    expect(() =>
      interiorPoint({
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [10, 10],
            [10, 0],
            [0, 10],
            [0, 0],
          ],
        ],
      }),
    ).not.toThrow();
  });
});

describe("InteriorPointArea - polygon with a hole (shared shell envelope)", () => {
  // Shell 0..10 square, hole 2..8 square. The scan line lands at y = 5 and the
  // hole contributes crossings at x = 2 and 8, so the widest section is [0, 2]
  // and the midpoint is (1, 5). If the hole's crossings were dropped the
  // section would be [0, 10] and the midpoint (5, 5) -- inside the hole.
  const withHole: Geometry = {
    type: "Polygon",
    coordinates: [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ],
      [
        [2, 2],
        [2, 8],
        [8, 8],
        [8, 2],
        [2, 2],
      ],
    ],
  };

  it("returns the midpoint of the widest section, outside the hole", () => {
    expect(interiorPoint(withHole)).toEqual([1, 5]);
  });
});
