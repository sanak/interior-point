/**
 * Comprehensive test using JTS world.wkt data.
 *
 * Verifies that for every geometry in world.wkt, the computed interior
 * point lies within the original geometry. This is the same validation
 * performed in JTS InteriorPointTest.testAll() using g.contains(ip) —
 * and now with the same code, since `locate` is a port of JTS's
 * SimplePointInAreaLocator rather than a third-party predicate.
 *
 * Strict INTERIOR is the right comparison: a point on the boundary is not in the
 * interior, so accepting BOUNDARY would accept a result JTS rejects. All 244
 * geometries were measured as strictly interior.
 *
 * Why hand-roll point-in-polygon instead of keeping a maintained dependency: this port was
 * cross-checked against real JTS 1.19.0 over 263,944 probes across all
 * 8,397 rings of world.wkt (outcome mix 89,390 INTERIOR / 84,792 BOUNDARY / 89,762
 * EXTERIOR). Both ports' `locate` vs JTS `geomLoc` and both ports'
 * `locatePointInRing` vs JTS `ringLoc`: 0 mismatches. `geo::Contains` (the Rust
 * dependency this branch also removed): 0 mismatches. `point-in-polygon-hao` (the
 * dependency this branch removed from this file): 2 mismatches, both at exact edge
 * midpoints — geometry 197 (173.705525, 0.03665), where hao returns 0 ("on the
 * edge") and JTS says INTERIOR, and geometry 221 (98.260525, 0.0090335), where hao
 * returns 0 and JTS says EXTERIOR. Cause: hao translates every coordinate by the
 * query point before calling its exact orient2d, and that subtraction is inexact
 * in IEEE 754, so the translated cross product collapses to exactly -0;
 * untranslated, the orientations are 3.773e-21 and -6.841e-21 — genuinely
 * nonzero, so JTS is right.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolve } from "node:path";
import { interiorPoint } from "../../src/algorithm/InteriorPoint.ts";
import { INTERIOR } from "../../src/geom/Location.ts";
import { locate } from "../../src/algorithm/locate/SimplePointInAreaLocator.ts";
import { parseWktFile } from "../utils/WktParser.ts";

const wktPath = resolve(import.meta.dirname, "../../../upstream/jts/resources/testdata/world.wkt");
const geometries = parseWktFile(wktPath);

/** @jts InteriorPointTest#testAll() */
describe("InteriorPoint - world.wkt comprehensive test", () => {
  it(`should parse ${geometries.length} geometries from world.wkt`, () => {
    assert.ok(geometries.length > 0);
  });

  for (let i = 0; i < geometries.length; i++) {
    const geom = geometries[i];
    it(`geometry[${i}] (${geom.type}): interior point lies within geometry`, () => {
      const ip = interiorPoint(geom);
      assert.notEqual(ip, null);
      assert.equal(locate(ip!, geom), INTERIOR);
    });
  }
});
