import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";

import { parquetToDataset } from "../src/data/parquet.ts";

const PARQUET = join(import.meta.dirname, "..", "..", "data", "plateau-hiroshima-bldg.parquet");

// Recorded from the `ogrinfo -so` run in the data preparation task.
const EXPECTED_FEATURES = 6769;

describe("parquetToDataset", () => {
  it("reads every building as a GeoJSON geometry", async () => {
    const bytes = await readFile(PARQUET);
    const dataset = await parquetToDataset(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
      "PLATEAU Hiroshima 2024",
    );

    assert.equal(dataset.name, "PLATEAU Hiroshima 2024");
    assert.equal(dataset.geometries.length, EXPECTED_FEATURES);
    assert.equal(dataset.features.length, dataset.geometries.length);
    assert.equal(dataset.skipped, 0);
  });

  it("returns polygons whose coordinates are Hiroshima longitude/latitude", async () => {
    const bytes = await readFile(PARQUET);
    const dataset = await parquetToDataset(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
      "PLATEAU Hiroshima 2024",
    );

    const first = dataset.geometries[0];
    assert.ok(first.type === "Polygon" || first.type === "MultiPolygon", `unexpected type ${first.type}`);
    const [x, y] = first.type === "Polygon" ? first.coordinates[0][0] : first.coordinates[0][0][0];
    assert.ok(x > 132 && x < 133, `longitude ${x} is outside Hiroshima`);
    assert.ok(y > 34 && y < 35, `latitude ${y} is outside Hiroshima`);
  });
});
