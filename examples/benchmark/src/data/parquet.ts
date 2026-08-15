import type { Feature, Geometry } from "geojson";

import type { Dataset } from "../types.ts";
import { isEmptyGeometry } from "./geometry.ts";

/** The column hyparquet decodes GeoParquet geometry into. */
const GEOMETRY_COLUMN = "geometry";

/**
 * hyparquet decodes int64 columns (e.g. GDAL's fid) as BigInt, which neither
 * JSON nor MapLibre's worker postMessage can serialize. GeoJSON has no BigInt
 * type, so this narrows every such value to a plain number.
 */
function toJsonSafe(properties: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    safe[key] = typeof value === "bigint" ? Number(value) : value;
  }
  return safe;
}

/** Reads GeoParquet bytes into a dataset, skipping geometries with no coordinates. */
export async function parquetToDataset(bytes: ArrayBuffer, name: string): Promise<Dataset> {
  // Imported here rather than at module scope so the decoder stays out of the initial
  // bundle — the shipped dataset is GeoJSON and only a dropped file needs this path.
  const [{ parquetReadObjects }, { compressors }] = await Promise.all([
    import("hyparquet"),
    import("hyparquet-compressors"),
  ]);
  const rows = await parquetReadObjects({ file: bytes, compressors });

  const geometries: Geometry[] = [];
  const features: Feature[] = [];
  let skipped = 0;

  for (const row of rows) {
    const geometry = (row as Record<string, unknown>)[GEOMETRY_COLUMN] as Geometry | null | undefined;
    if (!geometry || isEmptyGeometry(geometry)) {
      skipped += 1;
      continue;
    }
    const { [GEOMETRY_COLUMN]: _geometry, ...properties } = row as Record<string, unknown>;
    geometries.push(geometry);
    features.push({ type: "Feature", geometry, properties: toJsonSafe(properties) as Feature["properties"] });
  }

  return { name, geometries, features, skipped };
}
