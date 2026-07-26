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
  return entries.map(parseWkt);
}

/**
 * Parse one WKT string into a GeoJSON geometry. `parseWktFile` splits a file into
 * entries and calls the same conversion; this is the single-string half of it, for
 * tests that carry their WKT inline.
 *
 * Whitespace is collapsed first because `betterknown` rejects a raw newline inside
 * a coordinate list, and `world.wkt`'s entries are wrapped across multiple lines —
 * `parseWktFile` calls this per entry, so every one needs its embedded newlines
 * folded to spaces before conversion.
 */
export function parseWkt(wkt: string): Geometry {
  return wktToGeoJSON(wkt.trim().replace(/\s+/g, " ")) as Geometry;
}
