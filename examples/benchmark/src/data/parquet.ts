import type { Feature, Geometry } from "geojson";
import { compressors } from "hyparquet-compressors";
import { parquetReadObjects } from "hyparquet";

import type { Dataset } from "../types.ts";
import { isEmptyGeometry } from "./geometry.ts";

/** The column hyparquet decodes GeoParquet geometry into. */
const GEOMETRY_COLUMN = "geometry";

/** Reads GeoParquet bytes into a dataset, skipping geometries with no coordinates. */
export async function parquetToDataset(bytes: ArrayBuffer, name: string): Promise<Dataset> {
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
    features.push({ type: "Feature", geometry, properties: properties as Feature["properties"] });
  }

  return { name, geometries, features, skipped };
}

/** Fetches a GeoParquet file and reads it into a dataset. */
export async function loadParquetDataset(url: string, name: string): Promise<Dataset> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  return parquetToDataset(await response.arrayBuffer(), name);
}
