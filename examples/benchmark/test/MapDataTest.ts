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

describe("pointsCollection ids", () => {
  it("carries the index each point had in the original array, skipping nulls", () => {
    const collection = pointsCollection([null, [1, 2], null, [3, 4]]);
    assert.equal(collection.features.length, 2);
    assert.equal(collection.features[0]?.id, 1);
    assert.equal(collection.features[1]?.id, 3);
  });

  // id 0 is falsy, so a truthiness test would drop the first feature of every dataset.
  it("gives the first point the id 0 rather than omitting it", () => {
    assert.equal(pointsCollection([[1, 2]]).features[0]?.id, 0);
  });

  it("leaves properties empty so no attribute table shows an index", () => {
    assert.deepEqual(pointsCollection([[1, 2]]).features[0]?.properties, {});
  });
});

describe("datasetCollection ids", () => {
  const featureAt = (x: number): Feature => ({
    type: "Feature",
    properties: {},
    geometry: { type: "Point", coordinates: [x, 0] },
  });

  it("numbers the features by their position in the dataset", () => {
    const features = [featureAt(0), featureAt(1)];
    const dataset: Dataset = {
      name: "two points",
      geometries: features.map((feature) => feature.geometry),
      features,
      skipped: 0,
    };
    assert.deepEqual(
      datasetCollection(dataset).features.map((feature) => feature.id),
      [0, 1],
    );
  });

  it("overwrites an id the dropped file carried, since only the index ties a feature to its point", () => {
    const feature: Feature = { ...featureAt(0), id: "from-the-file" };
    const dataset: Dataset = { name: "one point", geometries: [feature.geometry], features: [feature], skipped: 0 };
    assert.equal(datasetCollection(dataset).features[0]?.id, 0);
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
    assert.deepEqual(datasetCollection(dataset).features, [{ ...feature, id: 0 }]);
  });
});
