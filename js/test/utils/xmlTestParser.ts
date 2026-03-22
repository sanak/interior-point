import { readFileSync } from "node:fs";
import { XMLParser } from "fast-xml-parser";
import { wktToGeoJSON } from "betterknown";
import type { Geometry, Position } from "geojson";

export interface XmlTestCase {
  desc: string;
  input: Geometry | null;
  expected: Position | null;
}

/**
 * Remove EMPTY members from MULTI* WKT strings.
 * `betterknown` handles GEOMETRYCOLLECTION EMPTYs but fails on MULTI* EMPTYs.
 * e.g. "MULTIPOINT((0 0), EMPTY)" → "MULTIPOINT((0 0))"
 */
function stripMultiEmpty(wkt: string): string {
  if (!wkt.match(/^MULTI/i)) return wkt;
  // Remove ", EMPTY" or ",EMPTY" (possibly with spaces)
  return wkt.replace(/,\s*EMPTY/gi, "");
}

/**
 * Normalize whitespace in WKT: collapse newlines, tabs, and multiple spaces into single spaces.
 */
function normalizeWkt(wkt: string): string {
  return wkt.replace(/\s+/g, " ").trim();
}

/**
 * Parse a WKT string into a GeoJSON Geometry, returning null for EMPTY geometries.
 */
function parseWkt(wkt: string): Geometry | null {
  const normalized = normalizeWkt(wkt);
  if (normalized.match(/^\w+\s+EMPTY$/i)) return null;
  const preprocessed = stripMultiEmpty(normalized);
  return wktToGeoJSON(preprocessed) as Geometry;
}

/**
 * Parse a POINT WKT into a [x, y] Position, returning null for POINT EMPTY.
 */
function parseExpectedPoint(wkt: string): Position | null {
  const trimmed = wkt.trim();
  if (trimmed === "POINT EMPTY") return null;
  const match = trimmed.match(/^POINT\s*\(\s*([^\s]+)\s+([^\s]+)\s*\)$/);
  if (!match) throw new Error(`Cannot parse expected point: ${trimmed}`);
  return [parseFloat(match[1]), parseFloat(match[2])];
}

/**
 * Parse JTS TestInteriorPoint.xml and return test cases.
 */
export function parseTestInteriorPointXml(filePath: string): XmlTestCase[] {
  const xml = readFileSync(filePath, "utf-8");
  const parser = new XMLParser({
    ignoreAttributes: false,
    trimValues: true,
  });
  const parsed = parser.parse(xml);

  const cases = parsed.run.case;
  const caseArray = Array.isArray(cases) ? cases : [cases];

  return caseArray.map((c: Record<string, unknown>) => {
    const desc = c.desc as string;
    const inputWkt = c.a as string;
    const opNode = (c.test as Record<string, unknown>).op as Record<string, unknown>;
    const op = (opNode["#text"] ?? opNode) as string;

    return {
      desc,
      input: parseWkt(inputWkt),
      expected: parseExpectedPoint(op),
    };
  });
}
