/**
 * Centroid-first sweep over the three upstream fixtures.
 *
 * The invariant is that swapping `interiorPoint` for `centroidFirstInteriorPoint`
 * changes which point comes back but never how good it is: for every fixture
 * geometry the two agree on whether a point exists at all, and they verify to the
 * same outcome. The branch counts are asserted too, so a change that quietly
 * stopped accepting centroids would fail here rather than pass unnoticed.
 *
 * There is no `@jts` anchor on this file: this surface has no JTS counterpart,
 * neither in the library nor in its tests.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolve } from "node:path";
import type { Geometry } from "geojson";
import { centroidFirstInteriorPoint } from "../src/CentroidFirstInteriorPoint.ts";
import { getCentroid } from "../src/algorithm/Centroid.ts";
import { dimensionNonEmpty, interiorPoint } from "../src/algorithm/InteriorPoint.ts";
import { Verification, verifyInteriorPoint } from "../src/VerifyInteriorPoint.ts";
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
  describe(`centroid-first sweep - ${label}`, () => {
    it(`loads ${expectedCount} geometries`, () => {
      assert.equal(geometries.length, expectedCount);
    });

    geometries.forEach((geometry, index) => {
      it(`geometry[${index}]: verifies exactly as interiorPoint does`, () => {
        const point = centroidFirstInteriorPoint(geometry);
        const fallback = interiorPoint(geometry);
        assert.equal(point === null, fallback === null, `${label}[${index}]: nullity differs`);
        const outcome = verifyInteriorPoint(point, geometry);
        assert.equal(outcome, verifyInteriorPoint(fallback, geometry), `${label}[${index}]: ${outcome}`);
        if (point === null) {
          assert.equal(outcome, Verification.Unverifiable);
          return;
        }
        assert.notEqual(outcome, Verification.OffGeometry, `${label}[${index}]: ${outcome}`);
      });
    });
  });
}

sweep("TestInteriorPoint.xml", interiorPointGeometries, 24);
sweep("TestCentroid.xml", centroidGeometries, 38);
sweep("world.wkt", worldGeometries, 244);

/** How many areal geometries had their centroid accepted. */
function countCentroidBranch(geometries: (Geometry | null)[]): number {
  let accepted = 0;
  for (const geometry of geometries) {
    if (geometry === null) continue;
    const point = centroidFirstInteriorPoint(geometry);
    if (point === null || dimensionNonEmpty(geometry) !== 2) continue;
    const cent = getCentroid(geometry);
    if (cent !== null && cent.length === point.length && cent.every((o, i) => o === point[i])) accepted += 1;
  }
  return accepted;
}

function countOutcomes(geometries: (Geometry | null)[]): Record<Verification, number> {
  const counts: Record<Verification, number> = {
    [Verification.Interior]: 0,
    [Verification.OnGeometry]: 0,
    [Verification.OffGeometry]: 0,
    [Verification.Unverifiable]: 0,
  };
  for (const geometry of geometries) {
    counts[verifyInteriorPoint(centroidFirstInteriorPoint(geometry), geometry)] += 1;
  }
  return counts;
}

describe("centroid-first sweep - totals", () => {
  const all = [...interiorPointGeometries, ...centroidGeometries, ...worldGeometries];

  it("reaches no off-geometry across all 306 fixture geometries", () => {
    assert.equal(all.length, 306);
    assert.deepEqual(countOutcomes(all), {
      [Verification.Interior]: 260,
      [Verification.OnGeometry]: 39,
      [Verification.OffGeometry]: 0,
      [Verification.Unverifiable]: 7,
    });
  });

  it("accepts the centroid for 207 of the 306, per fixture 5, 8 and 194", () => {
    assert.equal(countCentroidBranch(interiorPointGeometries), 5);
    assert.equal(countCentroidBranch(centroidGeometries), 8);
    assert.equal(countCentroidBranch(worldGeometries), 194);
    assert.equal(countCentroidBranch(all), 207);
  });

  it("returns a different point from interiorPoint for 199 of the 306", () => {
    let differ = 0;
    for (const geometry of all) {
      const point = centroidFirstInteriorPoint(geometry);
      const fallback = interiorPoint(geometry);
      if (point === null || fallback === null) continue;
      if (point.length !== fallback.length || !point.every((o, i) => o === fallback[i])) differ += 1;
    }
    assert.equal(differ, 199);
  });
});
