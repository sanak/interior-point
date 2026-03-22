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
