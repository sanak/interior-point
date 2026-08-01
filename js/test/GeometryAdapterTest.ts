import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Geometry } from "geojson";
import {
  coordinatesAtDimension,
  dimension,
  distance,
  envelopeInternal,
  envelopeInternalGeometry,
  envelopeIntersectsCoordinate,
  isGeometryEmpty,
} from "../src/GeometryAdapter.ts";

describe("geometryAdapter", () => {
  it("reports the dimension of each geometry type", () => {
    assert.equal(dimension({ type: "Point", coordinates: [0, 0] }), 0);
    assert.equal(dimension({ type: "MultiPoint", coordinates: [[0, 0]] }), 0);
    assert.equal(
      dimension({
        type: "LineString",
        coordinates: [
          [0, 0],
          [1, 1],
        ],
      }),
      1,
    );
    assert.equal(
      dimension({
        type: "MultiLineString",
        coordinates: [
          [
            [0, 0],
            [1, 1],
          ],
        ],
      }),
      1,
    );
    assert.equal(
      dimension({
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 0],
          ],
        ],
      }),
      2,
    );
    assert.equal(
      dimension({
        type: "MultiPolygon",
        coordinates: [
          [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 0],
            ],
          ],
        ],
      }),
      2,
    );
  });

  it("gives a GeometryCollection the highest dimension of its members", () => {
    const gc: Geometry = {
      type: "GeometryCollection",
      geometries: [
        { type: "Point", coordinates: [0, 0] },
        {
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
      ],
    };
    assert.equal(dimension(gc), 2);
  });

  it("detects empty geometries", () => {
    assert.equal(isGeometryEmpty({ type: "Point", coordinates: [] }), true);
    assert.equal(isGeometryEmpty({ type: "Point", coordinates: [0, 0] }), false);
    assert.equal(isGeometryEmpty({ type: "MultiPoint", coordinates: [] }), true);
    assert.equal(isGeometryEmpty({ type: "GeometryCollection", geometries: [] }), true);
    assert.equal(
      isGeometryEmpty({ type: "GeometryCollection", geometries: [{ type: "Point", coordinates: [] }] }),
      true,
    );
  });

  it("computes a ring envelope in one pass", () => {
    assert.deepEqual(
      envelopeInternal([
        [1, 5],
        [3, 2],
        [-1, 4],
        [1, 5],
      ]),
      { minX: -1, minY: 2, maxX: 3, maxY: 5 },
    );
  });

  it("computes Euclidean distance", () => {
    assert.equal(distance([0, 0], [3, 4]), 5);
    assert.equal(distance([1, 1], [1, 1]), 0);
  });
});

describe("envelopeIntersectsCoordinate", () => {
  const env = envelopeInternal([
    [0, 0],
    [10, 4],
  ]);

  it("accepts a point inside the envelope", () => {
    assert.equal(envelopeIntersectsCoordinate(env, [5, 2]), true);
  });

  it("accepts a point on the boundary", () => {
    assert.equal(envelopeIntersectsCoordinate(env, [0, 0]), true);
    assert.equal(envelopeIntersectsCoordinate(env, [10, 4]), true);
  });

  it("rejects a point outside on each side", () => {
    assert.equal(envelopeIntersectsCoordinate(env, [-1, 2]), false);
    assert.equal(envelopeIntersectsCoordinate(env, [11, 2]), false);
    assert.equal(envelopeIntersectsCoordinate(env, [5, -1]), false);
    assert.equal(envelopeIntersectsCoordinate(env, [5, 5]), false);
  });

  it("rejects every point when the envelope is empty", () => {
    assert.equal(envelopeIntersectsCoordinate(envelopeInternal([]), [0, 0]), false);
  });
});

describe("envelopeInternalGeometry", () => {
  it("takes a polygon's envelope from its shell", () => {
    // The hole is inside the shell, so it cannot widen the envelope — which is
    // why JTS's Polygon.computeEnvelopeInternal reads the shell alone.
    const polygon: Geometry = {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
          [0, 0],
        ],
        [
          [2, 2],
          [3, 2],
          [3, 3],
          [2, 2],
        ],
      ],
    };
    assert.deepEqual(envelopeInternalGeometry(polygon), { minX: 0, minY: 0, maxX: 10, maxY: 10 });
  });

  it("unions the members of a multipolygon", () => {
    const multi: Geometry = {
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 0],
          ],
        ],
        [
          [
            [5, 5],
            [7, 5],
            [7, 8],
            [5, 5],
          ],
        ],
      ],
    };
    assert.deepEqual(envelopeInternalGeometry(multi), { minX: 0, minY: 0, maxX: 7, maxY: 8 });
  });

  it("unions the members of a collection across dimensions", () => {
    const gc: Geometry = {
      type: "GeometryCollection",
      geometries: [
        { type: "Point", coordinates: [-3, 1] },
        {
          type: "LineString",
          coordinates: [
            [0, 0],
            [4, 9],
          ],
        },
      ],
    };
    assert.deepEqual(envelopeInternalGeometry(gc), { minX: -3, minY: 0, maxX: 4, maxY: 9 });
  });

  it("returns the empty envelope for an empty geometry", () => {
    assert.deepEqual(envelopeInternalGeometry({ type: "MultiPoint", coordinates: [] }), {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
    });
  });
});

describe("coordinatesAtDimension", () => {
  it("returns a Point's single coordinate at dimension 0", () => {
    assert.deepEqual(coordinatesAtDimension({ type: "Point", coordinates: [5, 5] }, 0), [[5, 5]]);
  });

  it("returns nothing when the element's own dimension differs", () => {
    assert.deepEqual(coordinatesAtDimension({ type: "Point", coordinates: [5, 5] }, 1), []);
    assert.deepEqual(coordinatesAtDimension({ type: "Point", coordinates: [5, 5] }, 2), []);
  });

  it("returns every vertex of a LineString at dimension 1", () => {
    const line: Geometry = {
      type: "LineString",
      coordinates: [
        [0, 0],
        [10, 10],
      ],
    };
    assert.deepEqual(coordinatesAtDimension(line, 1), [
      [0, 0],
      [10, 10],
    ]);
  });

  it("flattens a MultiPoint at dimension 0", () => {
    const points: Geometry = {
      type: "MultiPoint",
      coordinates: [
        [0, 0],
        [10, 10],
      ],
    };
    assert.deepEqual(coordinatesAtDimension(points, 0), [
      [0, 0],
      [10, 10],
    ]);
  });

  it("flattens a MultiLineString's parts in order", () => {
    const lines: Geometry = {
      type: "MultiLineString",
      coordinates: [
        [
          [0, 0],
          [1, 1],
        ],
        [
          [5, 5],
          [6, 6],
        ],
      ],
    };
    assert.deepEqual(coordinatesAtDimension(lines, 1), [
      [0, 0],
      [1, 1],
      [5, 5],
      [6, 6],
    ]);
  });

  it("flattens a polygon's shell and holes at dimension 2", () => {
    const polygon: Geometry = {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [10, 0],
          [0, 0],
        ],
        [
          [2, 2],
          [3, 2],
          [2, 2],
        ],
      ],
    };
    assert.deepEqual(coordinatesAtDimension(polygon, 2), [
      [0, 0],
      [10, 0],
      [0, 0],
      [2, 2],
      [3, 2],
      [2, 2],
    ]);
  });

  it("flattens a MultiPolygon's rings at dimension 2", () => {
    const multi: Geometry = {
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [0, 0],
            [1, 0],
            [0, 0],
          ],
        ],
        [
          [
            [5, 5],
            [6, 5],
            [5, 5],
          ],
        ],
      ],
    };
    assert.deepEqual(coordinatesAtDimension(multi, 2), [
      [0, 0],
      [1, 0],
      [0, 0],
      [5, 5],
      [6, 5],
      [5, 5],
    ]);
  });

  it("descends a GeometryCollection and keeps only the requested dimension", () => {
    const gc: Geometry = {
      type: "GeometryCollection",
      geometries: [
        { type: "Point", coordinates: [5, 5] },
        {
          type: "LineString",
          coordinates: [
            [0, 0],
            [10, 10],
          ],
        },
      ],
    };
    assert.deepEqual(coordinatesAtDimension(gc, 0), [[5, 5]]);
    assert.deepEqual(coordinatesAtDimension(gc, 1), [
      [0, 0],
      [10, 10],
    ]);
    assert.deepEqual(coordinatesAtDimension(gc, 2), []);
  });

  it("descends a nested GeometryCollection in traversal order", () => {
    const gc: Geometry = {
      type: "GeometryCollection",
      geometries: [
        { type: "Point", coordinates: [1, 1] },
        {
          type: "GeometryCollection",
          geometries: [
            { type: "Point", coordinates: [2, 2] },
            { type: "MultiPoint", coordinates: [[3, 3]] },
          ],
        },
        { type: "Point", coordinates: [4, 4] },
      ],
    };
    assert.deepEqual(coordinatesAtDimension(gc, 0), [
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 4],
    ]);
  });

  it("skips empty elements", () => {
    const gc: Geometry = {
      type: "GeometryCollection",
      geometries: [
        { type: "Point", coordinates: [5, 5] },
        { type: "MultiPoint", coordinates: [] },
        { type: "Point", coordinates: [] },
      ],
    };
    assert.deepEqual(coordinatesAtDimension(gc, 0), [[5, 5]]);
  });

  it("returns nothing for an empty geometry", () => {
    assert.deepEqual(coordinatesAtDimension({ type: "GeometryCollection", geometries: [] }, 0), []);
    assert.deepEqual(coordinatesAtDimension({ type: "MultiPoint", coordinates: [] }, 0), []);
  });

  it("keeps the Z ordinate", () => {
    assert.deepEqual(coordinatesAtDimension({ type: "Point", coordinates: [1, 2, 3] }, 0), [[1, 2, 3]]);
  });
});
