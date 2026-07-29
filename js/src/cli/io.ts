/**
 * The format boundary of the interior-point CLI. The input half turns an
 * `--input` argument (WKT literal, GeoJSON literal, or file path — stdin when
 * absent) into an `Input` of records; the output half turns the computed
 * points back into bytes.
 *
 * @jts-adapter JTSOpCmd — jtsop (org.locationtech.jtstest.cmd.JTSOpCmd) is the
 *   prior art; the code is original, nothing is ported.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { geoJSONToWkt, wktToGeoJSON } from "betterknown";
import type { Geometry } from "geojson";
import type { OutputFormat } from "./args.ts";
import type { Coordinate } from "../GeometryAdapter.ts";

/** Which envelope the input arrived in; GeoJSON output preserves it. */
export type InputKind = "geometry" | "feature" | "featureCollection";

export interface InputRecord {
  /** GeoJSON permits `Feature.geometry === null`. */
  geometry: Geometry | null;
  /** `properties`, `id`, and foreign members; `null` when kind is "geometry". */
  meta: Record<string, unknown> | null;
}

export interface Input {
  kind: InputKind;
  records: InputRecord[];
}

/** Structurally invalid input: bad JSON, or a `type` this CLI cannot compute on. */
export class InputError extends Error {}

const GEOMETRY_TYPES = new Set([
  "Point",
  "MultiPoint",
  "LineString",
  "MultiLineString",
  "Polygon",
  "MultiPolygon",
  "GeometryCollection",
]);

/**
 * Reads and parses the input. The argument is classified as a GeoJSON literal
 * (leading `{`), an existing file's path, or a WKT literal, in that order; a
 * file's contents are then classified by the same first-character rule. A path
 * that does not exist therefore fails as WKT, which is the diagnostic the
 * caller reports.
 */
export function readInput(inputArg: string | undefined, readStdin: () => string): Input {
  return parseInput(resolveText(inputArg, readStdin));
}

function resolveText(inputArg: string | undefined, readStdin: () => string): string {
  if (inputArg === undefined) {
    return readStdin();
  }
  if (inputArg.trimStart().startsWith("{")) {
    return inputArg;
  }
  if (existsSync(inputArg)) {
    return readFileSync(inputArg, "utf-8");
  }
  return inputArg;
}

function parseInput(text: string): Input {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    return parseGeoJson(trimmed);
  }
  // Whitespace is folded because betterknown rejects a raw newline inside a
  // coordinate list, and a WKT file may wrap its coordinates across lines.
  const geometry = wktToGeoJSON(trimmed.replace(/\s+/g, " "));
  return { kind: "geometry", records: [{ geometry, meta: null }] };
}

function parseGeoJson(text: string): Input {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new InputError(`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
  const type = typeMember(parsed);
  if (type === "FeatureCollection") {
    const features = (parsed as { features?: unknown }).features;
    if (!Array.isArray(features)) {
      throw new InputError("FeatureCollection has no features array");
    }
    return { kind: "featureCollection", records: features.map(featureRecord) };
  }
  if (type === "Feature") {
    return { kind: "feature", records: [featureRecord(parsed)] };
  }
  if (typeof type === "string" && GEOMETRY_TYPES.has(type)) {
    return { kind: "geometry", records: [{ geometry: parsed as Geometry, meta: null }] };
  }
  throw new InputError(`Unsupported GeoJSON type '${String(type)}'`);
}

function typeMember(value: unknown): unknown {
  return typeof value === "object" && value !== null ? (value as { type?: unknown }).type : undefined;
}

/**
 * Splits a Feature into its geometry and everything worth carrying to the
 * output. `properties`, `id`, and foreign members survive; `bbox` is dropped
 * deliberately — it described the input geometry, and carrying it past the
 * substitution would wrap a continent-sized box around a single point.
 */
function featureRecord(feature: unknown): InputRecord {
  if (typeMember(feature) !== "Feature") {
    throw new InputError("FeatureCollection contains a non-Feature member");
  }
  const meta: Record<string, unknown> = {};
  let geometry: Geometry | null = null;
  for (const [key, value] of Object.entries(feature as Record<string, unknown>)) {
    if (key === "geometry") {
      geometry = value as Geometry | null;
    } else if (key !== "type" && key !== "bbox") {
      meta[key] = value;
    }
  }
  return { geometry, meta };
}

/** Where output text goes; `bin/` binds this to stdout, tests to a buffer. */
export type Sink = (text: string) => void;

export interface OutputRecord {
  point: Coordinate | null;
  meta: Record<string, unknown> | null;
}

/**
 * Serialises the computed points back into the envelope the input arrived in.
 * GeoJSON output preserves the envelope; WKT output ignores it and emits one
 * newline-terminated line per record, with zero records yielding an empty string.
 */
export function serialize(kind: InputKind, records: OutputRecord[], format: OutputFormat): string {
  if (format === "wkt") {
    return records.map((record) => pointToWkt(record.point) + "\n").join("");
  }
  switch (kind) {
    case "geometry":
      return JSON.stringify(pointGeometry(records[0].point)) + "\n";
    case "feature":
      return JSON.stringify(toFeature(records[0])) + "\n";
    case "featureCollection":
      return JSON.stringify({ type: "FeatureCollection", features: records.map(toFeature) }) + "\n";
  }
}

/** Writes to `outputPath` when given, otherwise through the caller's sink. */
export function writeOutput(text: string, outputPath: string | undefined, out: Sink): void {
  if (outputPath === undefined) {
    out(text);
  } else {
    writeFileSync(outputPath, text);
  }
}

function pointGeometry(point: Coordinate | null): { type: "Point"; coordinates: Coordinate } | null {
  return point === null ? null : { type: "Point", coordinates: point };
}

function toFeature(record: OutputRecord): Record<string, unknown> {
  return { type: "Feature", ...(record.meta ?? {}), geometry: pointGeometry(record.point) };
}

/**
 * An empty result goes through the same call as every other point: GeoJSON can
 * hold a Point with no coordinates, and betterknown renders it as POINT EMPTY.
 */
function pointToWkt(point: Coordinate | null): string {
  return geoJSONToWkt({ type: "Point", coordinates: point ?? [] });
}
