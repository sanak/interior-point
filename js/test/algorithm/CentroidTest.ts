import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { join } from "node:path";
import { getCentroid } from "../../src/algorithm/Centroid.ts";
import type { Coordinate } from "../../src/GeometryAdapter.ts";
import { parseXmlTestCases } from "../utils/XmlTestParser.ts";

const FIXTURE = join(import.meta.dirname, "../../../upstream/jts/resources/testxml/general/TestCentroid.xml");

describe("Centroid", () => {
  const cases = parseXmlTestCases(FIXTURE, "getCentroid");

  it("loads all 38 upstream cases", () => {
    assert.equal(cases.length, 38);
  });

  for (const c of cases) {
    it(`matches JTS for: ${c.desc}`, () => {
      const actual = c.input === null ? null : getCentroid(c.input);
      // Exact comparison, per the exact-comparison rule: both languages evaluate the same IEEE
      // 754 operations in the same order, so any difference is information.
      assert.deepEqual(actual, c.expected);
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
    assert.notEqual(centroid, null);
    // Both ordinates land on 20/3. The band is the one this case has always been
    // held to; it is tighter than TOLERANCE below, which tracks JTS's own constant.
    const BAND = 5e-13;
    assert.ok(Math.abs(centroid![0] - 6.666666666666667) < BAND);
    assert.ok(Math.abs(centroid![1] - 6.666666666666667) < BAND);
  });

  it("returns null for an empty geometry", () => {
    assert.equal(getCentroid({ type: "MultiPoint", coordinates: [] }), null);
  });

  /** @jts-adapter CentroidTest#TOLERANCE */
  const TOLERANCE = 1e-10;

  /**
   * The area of a ring, transcribed from JTS `Area.ofRing(Coordinate[])` — which
   * is what `Geometry.getArea()` calls. Test-local: no ported source module
   * needs `Geometry.getArea()`, so it does not belong in the adapter.
   *
   * The translation by `x0` is load-bearing, not a micro-optimisation. This
   * test's rings are slivers whose coordinates differ only around the 12th
   * decimal place, so the textbook shoelace form
   * `x[i] * y[i + 1] - x[i + 1] * y[i]` loses every significant digit to
   * cancellation: it returns exactly 0 for two of the three rings here and
   * overstates the third by eleven orders of magnitude.
   *
   * @jts-adapter Geometry.getArea()
   */
  function ringArea(ring: Coordinate[]): number {
    if (ring.length < 3) return 0.0;
    let sum = 0.0;
    const x0 = ring[0][0];
    for (let i = 1; i < ring.length - 1; i++) {
      const x = ring[i][0] - x0;
      const y1 = ring[i + 1][1];
      const y2 = ring[i - 1][1];
      sum += x * (y2 - y1);
    }
    return Math.abs(sum / 2.0);
  }

  /** @jts CentroidTest#areaWeightedCentroid(Geometry) */
  function areaWeightedCentroid(polys: Coordinate[][][]): Coordinate {
    const totalArea = polys.reduce((acc, rings) => acc + ringArea(rings[0]), 0);
    let cx = 0;
    let cy = 0;
    for (const rings of polys) {
      const areaFraction = ringArea(rings[0]) / totalArea;
      const componentCentroid = getCentroid({ type: "Polygon", coordinates: rings })!;
      cx += areaFraction * componentCentroid[0];
      cy += areaFraction * componentCentroid[1];
    }
    return [cx, cy];
  }

  /** @jts CentroidTest#testCentroidMultiPolygon() */
  it("computes a MultiPolygon centroid as the area-weighted average of its components", () => {
    // Verify that the computed centroid of a MultiPolygon is equivalent to the
    // area-weighted average of its components.
    const polys: Coordinate[][][] = [
      [
        [
          [-92.661322, 36.58994900000003],
          [-92.66132199999993, 36.58994900000005],
          [-92.66132199999993, 36.589949000000004],
          [-92.661322, 36.589949],
          [-92.661322, 36.58994900000003],
        ],
      ],
      [
        [
          [-92.65560500000008, 36.58708800000005],
          [-92.65560499999992, 36.58708800000005],
          [-92.65560499998745, 36.587087999992576],
          [-92.655605, 36.587088],
          [-92.65560500000008, 36.58708800000005],
        ],
      ],
      [
        [
          [-92.65512450000065, 36.586800000000466],
          [-92.65512449999994, 36.58680000000004],
          [-92.65512449998666, 36.5867999999905],
          [-92.65512450000065, 36.586800000000466],
        ],
      ],
    ];
    const expected = areaWeightedCentroid(polys);
    const actual = getCentroid({ type: "MultiPolygon", coordinates: polys })!;
    assert.ok(Math.abs(actual[0] - expected[0]) < TOLERANCE);
    assert.ok(Math.abs(actual[1] - expected[1]) < TOLERANCE);
  });
});
