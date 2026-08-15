import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { parseDroppedGeoJson } from "../src/data/drop.ts";

const SHIPPED_GEOJSON = join(import.meta.dirname, "..", "..", "data", "plateau-hiroshima-bldg.geojson");

const collection = JSON.stringify({
  type: "FeatureCollection",
  features: [
    { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [1, 2] } },
    {
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: [
          [0, 0],
          [1, 1],
        ],
      },
    },
    {
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 0],
          ],
        ],
      },
    },
    { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [] } },
    { type: "Feature", properties: {}, geometry: null },
  ],
});

describe("parseDroppedGeoJson", () => {
  it("keeps every non-empty geometry type, not only polygons", () => {
    const dataset = parseDroppedGeoJson(collection, "sample.geojson");

    assert.equal(dataset.name, "sample.geojson");
    assert.deepEqual(
      dataset.geometries.map((geometry) => geometry.type),
      ["Point", "LineString", "Polygon"],
    );
  });

  it("counts the empty and missing geometries it skipped", () => {
    const dataset = parseDroppedGeoJson(collection, "sample.geojson");

    assert.equal(dataset.skipped, 2);
    assert.equal(dataset.features.length, 3);
  });

  it("accepts a bare geometry as a one-feature dataset", () => {
    const dataset = parseDroppedGeoJson(JSON.stringify({ type: "Point", coordinates: [3, 4] }), "point.json");

    assert.equal(dataset.geometries.length, 1);
    assert.deepEqual(dataset.features[0].geometry, { type: "Point", coordinates: [3, 4] });
  });

  it("rejects text that is not JSON", () => {
    assert.throws(() => parseDroppedGeoJson("not json", "bad.json"), /not valid JSON/);
  });

  it("rejects JSON that is not GeoJSON", () => {
    assert.throws(() => parseDroppedGeoJson(JSON.stringify({ hello: "world" }), "bad.json"), /not GeoJSON/);
  });

  it("rejects a collection with nothing left to measure", () => {
    const empty = JSON.stringify({ type: "FeatureCollection", features: [] });

    assert.throws(() => parseDroppedGeoJson(empty, "empty.geojson"), /no non-empty geometries/);
  });
});

describe("the shipped GeoJSON dataset", () => {
  it("parses into 6769 geometries with their attributes intact", () => {
    const dataset = parseDroppedGeoJson(readFileSync(SHIPPED_GEOJSON, "utf8"), "PLATEAU Hiroshima buildings");
    assert.equal(dataset.geometries.length, 6769);
    assert.equal(dataset.skipped, 0);
    assert.equal(dataset.features[0]?.properties?.building_id, "34100-bldg-370791");
    assert.equal(dataset.features[0]?.properties?.measured_height, 35.3);
  });
});
