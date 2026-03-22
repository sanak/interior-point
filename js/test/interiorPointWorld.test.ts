/**
 * Comprehensive test using JTS world.wkt data.
 *
 * Verifies that for every geometry in world.wkt, the computed interior
 * point lies within the original geometry. This is the same validation
 * performed in JTS InteriorPointTest.testAll() using g.contains(ip).
 */
import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import inside from "point-in-polygon-hao";
import type { Geometry, Position } from "geojson";
import { interiorPoint } from "../src/interiorPoint";
import { parseWktFile } from "./utils/wktParser";

const wktPath = resolve(__dirname, "../../testdata/wkt/world.wkt");
const geometries = parseWktFile(wktPath);

/**
 * Check if a point lies inside a geometry (Polygon or MultiPolygon).
 * Uses point-in-polygon-hao (returns true/false/0 where 0 = on edge).
 *
 * Equivalent to JTS Geometry.contains(Point).
 */
function containsPoint(geometry: Geometry, point: Position): boolean {
  switch (geometry.type) {
    case "Polygon":
      return inside(point, geometry.coordinates) !== false;
    case "MultiPolygon":
      return geometry.coordinates.some((poly) => inside(point, poly) !== false);
    default:
      return false;
  }
}

describe("InteriorPoint - world.wkt comprehensive test", () => {
  it(`should parse ${geometries.length} geometries from world.wkt`, () => {
    expect(geometries.length).toBeGreaterThan(0);
  });

  for (let i = 0; i < geometries.length; i++) {
    const geom = geometries[i];
    it(`geometry[${i}] (${geom.type}): interior point lies within geometry`, () => {
      const ip = interiorPoint(geom);
      expect(ip).not.toBeNull();
      expect(containsPoint(geom, ip!)).toBe(true);
    });
  }
});
