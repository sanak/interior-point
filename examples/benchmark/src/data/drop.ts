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
