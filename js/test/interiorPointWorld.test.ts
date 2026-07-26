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
 */
import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { interiorPoint } from "../src/interiorPoint";
import { INTERIOR } from "../src/location";
import { locate } from "../src/simplePointInAreaLocator";
import { parseWktFile } from "./utils/wktParser";

const wktPath = resolve(__dirname, "../../upstream/jts/resources/testdata/world.wkt");
const geometries = parseWktFile(wktPath);

/** @jts InteriorPointTest#testAll() */
describe("InteriorPoint - world.wkt comprehensive test", () => {
  it(`should parse ${geometries.length} geometries from world.wkt`, () => {
    expect(geometries.length).toBeGreaterThan(0);
  });

  for (let i = 0; i < geometries.length; i++) {
    const geom = geometries[i];
    it(`geometry[${i}] (${geom.type}): interior point lies within geometry`, () => {
      const ip = interiorPoint(geom);
      expect(ip).not.toBeNull();
      expect(locate(ip!, geom)).toBe(INTERIOR);
    });
  }
});
