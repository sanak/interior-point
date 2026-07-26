import type { Geometry } from "geojson";
import { readFileSync } from "node:fs";
import { wktToGeoJSON } from "betterknown";

/**
 * Parse a WKT file containing one geometry per entry, separated by blank lines.
 * Uses the `betterknown` library for WKT → GeoJSON conversion.
 */
export function parseWktFile(filePath: string): Geometry[] {
  const text = readFileSync(filePath, "utf-8");
  const entries = text.split(/\n\s*\n/).filter((s) => s.trim().length > 0);
  return entries.map((entry) => wktToGeoJSON(entry.trim().replace(/\s+/g, " ")) as Geometry);
}

/**
 * Parse one WKT string into a GeoJSON geometry. `parseWktFile` splits a file into
 * entries and calls the same conversion; this is the single-string half of it, for
 * tests that carry their WKT inline.
 *
 * Whitespace is collapsed first because JTS's own fixtures contain runs of spaces
 * inside coordinate lists — `AbstractPointInRingTest.testComplexRing` has one.
 */
export function parseWkt(wkt: string): Geometry {
  return wktToGeoJSON(wkt.trim().replace(/\s+/g, " ")) as Geometry;
}
