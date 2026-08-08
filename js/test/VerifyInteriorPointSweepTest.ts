/**
 * Verify sweep over the three upstream fixtures: every non-null interior point
 * must lie on or in the geometry it was computed from, and a null one must be
 * reported as unverifiable rather than as a failure.
 *
 * This runs beside the world test, which keeps its strict INTERIOR assertion.
 * Replacing that with this one would weaken it, because this one also admits a
 * point on the boundary.
 *
 * @jts InteriorPointTest#checkInteriorPoint(Geometry)
 * @jts-deviate predicate — JTS asserts `g.contains(ip)`; this asserts the outcome is not
 *   `OffGeometry`, because `contains` is false for `LINESTRING (0 0, 10 10)`: its interior point is
 *   the endpoint, i.e. the line's boundary.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolve } from "node:path";
import type { Geometry } from "geojson";
import { interiorPoint } from "../src/algorithm/InteriorPoint.ts";
import { InteriorPointVerification, verifyInteriorPoint } from "../src/VerifyInteriorPoint.ts";
import { parseXmlTestCases } from "./utils/XmlTestParser.ts";
import { parseWktFile } from "./utils/WktParser.ts";

const repoRoot = resolve(import.meta.dirname, "../..");

const interiorPointGeometries = parseXmlTestCases(
  resolve(repoRoot, "upstream/jts/resources/testxml/general/TestInteriorPoint.xml"),
  "getInteriorPoint",
).map((tc) => tc.input);

const centroidGeometries = parseXmlTestCases(
  resolve(repoRoot, "upstream/jts/resources/testxml/general/TestCentroid.xml"),
  "getCentroid",
).map((tc) => tc.input);

const worldGeometries: (Geometry | null)[] = parseWktFile(
  resolve(repoRoot, "upstream/jts/resources/testdata/world.wkt"),
);

function sweep(label: string, geometries: (Geometry | null)[], expectedCount: number): void {
  describe(`verify sweep - ${label}`, () => {
    it(`loads ${expectedCount} geometries`, () => {
      assert.equal(geometries.length, expectedCount);
    });

    geometries.forEach((geometry, index) => {
      it(`geometry[${index}]: a non-null interior point verifies`, () => {
        const point = interiorPoint(geometry);
        const outcome = verifyInteriorPoint(point, geometry);
        if (point === null) {
          assert.equal(outcome, InteriorPointVerification.Unverifiable);
          return;
        }
        assert.notEqual(outcome, InteriorPointVerification.OffGeometry, `${label}[${index}]: ${outcome}`);
      });
    });
  });
}

sweep("TestInteriorPoint.xml", interiorPointGeometries, 24);
sweep("TestCentroid.xml", centroidGeometries, 38);
sweep("world.wkt", worldGeometries, 244);

function countOutcomes(geometries: (Geometry | null)[]): Record<InteriorPointVerification, number> {
  const counts: Record<InteriorPointVerification, number> = {
    [InteriorPointVerification.Interior]: 0,
    [InteriorPointVerification.OnGeometry]: 0,
    [InteriorPointVerification.OffGeometry]: 0,
    [InteriorPointVerification.Unverifiable]: 0,
  };
  for (const geometry of geometries) {
    counts[verifyInteriorPoint(interiorPoint(geometry), geometry)] += 1;
  }
  return counts;
}

describe("verify sweep - totals", () => {
  it("reaches no off-geometry across all 306 fixture geometries", () => {
    const all = [...interiorPointGeometries, ...centroidGeometries, ...worldGeometries];
    assert.equal(all.length, 306);
    assert.deepEqual(countOutcomes(all), {
      [InteriorPointVerification.Interior]: 260,
      [InteriorPointVerification.OnGeometry]: 39,
      [InteriorPointVerification.OffGeometry]: 0,
      [InteriorPointVerification.Unverifiable]: 7,
    });
  });
});
