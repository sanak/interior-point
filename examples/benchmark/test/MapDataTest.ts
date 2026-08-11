import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Feature, Position } from "geojson";
import type { Dataset } from "../src/types.ts";
import { CARTO_DARK, CARTO_LIGHT, datasetCollection, pointsCollection, styleUrl } from "../src/ui/mapData.ts";

describe("styleUrl", () => {
  it("picks the dark basemap for a dark scheme", () => {
    assert.equal(styleUrl(true), CARTO_DARK);
  });

  it("picks the light basemap otherwise", () => {
    assert.equal(styleUrl(false), CARTO_LIGHT);
  });
});

describe("pointsCollection", () => {
  it("drops nulls and wraps the rest as Point features", () => {
    const points: readonly (Position | null)[] = [[1, 2], null, [3, 4]];
    const collection = pointsCollection(points);
    assert.equal(collection.features.length, 2);
    assert.deepEqual(
      collection.features.map((feature) => feature.geometry),
      [
        { type: "Point", coordinates: [1, 2] },
        { type: "Point", coordinates: [3, 4] },
      ],
    );
  });

  it("returns an empty collection for no points", () => {
    assert.deepEqual(pointsCollection([]), { type: "FeatureCollection", features: [] });
  });
});

describe("datasetCollection", () => {
  it("returns an empty collection for a missing dataset", () => {
    assert.deepEqual(datasetCollection(null), { type: "FeatureCollection", features: [] });
  });

  it("passes the dataset features through", () => {
    const feature: Feature = {
      type: "Feature",
      properties: {},
      geometry: { type: "Point", coordinates: [0, 0] },
    };
    const dataset: Dataset = { name: "one point", geometries: [feature.geometry], features: [feature], skipped: 0 };
    assert.deepEqual(datasetCollection(dataset).features, [feature]);
  });
});
