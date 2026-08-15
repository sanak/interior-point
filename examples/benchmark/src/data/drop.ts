import type { Feature, Geometry } from "geojson";

import type { Dataset } from "../types.ts";
import { isEmptyGeometry } from "./geometry.ts";

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
 * Reads dropped file text into a dataset. Accepts a FeatureCollection, a single
 * Feature, or a bare geometry, so a file exported by any common tool is usable.
 * Every geometry type is kept — the compared libraries all answer for points and
 * lines as well — and only empty or absent geometries are skipped.
 */
export function parseDroppedGeoJson(text: string, name: string): Dataset {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${name} is not valid JSON.`);
  }

  const features = toFeatures(parsed, name);

  const kept: Feature[] = [];
  const geometries: Geometry[] = [];
  let skipped = 0;

  for (const feature of features) {
    const geometry = feature.geometry;
    if (!geometry || isEmptyGeometry(geometry)) {
      skipped += 1;
      continue;
    }
    kept.push(feature);
    geometries.push(geometry);
  }

  if (geometries.length === 0) throw new Error(`${name} has no non-empty geometries to measure.`);

  return { name, geometries, features: kept, skipped };
}

function toFeatures(parsed: unknown, name: string): Feature[] {
  if (typeof parsed !== "object" || parsed === null || !("type" in parsed)) {
    throw new Error(`${name} is not GeoJSON.`);
  }

  const type = (parsed as { type: unknown }).type;
  if (type === "FeatureCollection") {
    const features = (parsed as { features?: unknown }).features;
    if (!Array.isArray(features)) throw new Error(`${name} is not GeoJSON.`);
    return features as Feature[];
  }
  if (type === "Feature") return [parsed as Feature];
  if (typeof type === "string" && GEOMETRY_TYPES.has(type)) {
    return [{ type: "Feature", properties: {}, geometry: parsed as Geometry }];
  }

  throw new Error(`${name} is not GeoJSON.`);
}

/** Parquet files begin and end with this 4-byte magic number. */
const PARQUET_MAGIC = "PAR1";

function looksLikeParquet(bytes: ArrayBuffer, name: string): boolean {
  if (name.toLowerCase().endsWith(".parquet")) return true;
  if (bytes.byteLength < PARQUET_MAGIC.length) return false;
  const head = new Uint8Array(bytes, 0, PARQUET_MAGIC.length);
  return String.fromCharCode(...head) === PARQUET_MAGIC;
}

/**
 * Reads dropped bytes into a dataset, picking the format from the file name and,
 * failing that, from the leading magic number. GeoParquet pulls hyparquet in on
 * demand: the shipped dataset is GeoJSON, so nothing loads the decoder until a
 * GeoParquet file is actually dropped.
 */
export async function datasetFromBytes(bytes: ArrayBuffer, name: string): Promise<Dataset> {
  if (looksLikeParquet(bytes, name)) {
    const { parquetToDataset } = await import("./parquet.ts");
    return parquetToDataset(bytes, name);
  }
  return parseDroppedGeoJson(new TextDecoder().decode(bytes), name);
}
