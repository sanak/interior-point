import { describe, expect, it } from "vitest";
import type { Geometry } from "geojson";
import {
  dimension,
  distance,
  envelopeInternal,
  envelopeInternalGeometry,
  envelopeIntersectsCoordinate,
  isGeometryEmpty,
} from "../src/GeometryAdapter";

describe("geometryAdapter", () => {
  it("reports the dimension of each geometry type", () => {
    expect(dimension({ type: "Point", coordinates: [0, 0] })).toBe(0);
    expect(dimension({ type: "MultiPoint", coordinates: [[0, 0]] })).toBe(0);
    expect(
      dimension({
        type: "LineString",
        coordinates: [
          [0, 0],
          [1, 1],
        ],
      }),
    ).toBe(1);
    expect(
      dimension({
        type: "MultiLineString",
        coordinates: [
          [
            [0, 0],
            [1, 1],
          ],
        ],
      }),
    ).toBe(1);
    expect(
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
    ).toBe(2);
    expect(
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
    ).toBe(2);
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
    expect(dimension(gc)).toBe(2);
  });

  it("detects empty geometries", () => {
    expect(isGeometryEmpty({ type: "Point", coordinates: [] })).toBe(true);
    expect(isGeometryEmpty({ type: "Point", coordinates: [0, 0] })).toBe(false);
    expect(isGeometryEmpty({ type: "MultiPoint", coordinates: [] })).toBe(true);
    expect(isGeometryEmpty({ type: "GeometryCollection", geometries: [] })).toBe(true);
    expect(isGeometryEmpty({ type: "GeometryCollection", geometries: [{ type: "Point", coordinates: [] }] })).toBe(
      true,
    );
  });

  it("computes a ring envelope in one pass", () => {
    expect(
      envelopeInternal([
        [1, 5],
        [3, 2],
        [-1, 4],
        [1, 5],
      ]),
    ).toEqual({ minX: -1, minY: 2, maxX: 3, maxY: 5 });
  });

  it("computes Euclidean distance", () => {
    expect(distance([0, 0], [3, 4])).toBe(5);
    expect(distance([1, 1], [1, 1])).toBe(0);
  });
});

describe("envelopeIntersectsCoordinate", () => {
  const env = envelopeInternal([
    [0, 0],
    [10, 4],
  ]);

  it("accepts a point inside the envelope", () => {
    expect(envelopeIntersectsCoordinate(env, [5, 2])).toBe(true);
  });

  it("accepts a point on the boundary", () => {
    expect(envelopeIntersectsCoordinate(env, [0, 0])).toBe(true);
    expect(envelopeIntersectsCoordinate(env, [10, 4])).toBe(true);
  });

  it("rejects a point outside on each side", () => {
    expect(envelopeIntersectsCoordinate(env, [-1, 2])).toBe(false);
    expect(envelopeIntersectsCoordinate(env, [11, 2])).toBe(false);
    expect(envelopeIntersectsCoordinate(env, [5, -1])).toBe(false);
    expect(envelopeIntersectsCoordinate(env, [5, 5])).toBe(false);
  });

  it("rejects every point when the envelope is empty", () => {
    expect(envelopeIntersectsCoordinate(envelopeInternal([]), [0, 0])).toBe(false);
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
    expect(envelopeInternalGeometry(polygon)).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
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
    expect(envelopeInternalGeometry(multi)).toEqual({ minX: 0, minY: 0, maxX: 7, maxY: 8 });
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
    expect(envelopeInternalGeometry(gc)).toEqual({ minX: -3, minY: 0, maxX: 4, maxY: 9 });
  });

  it("returns the empty envelope for an empty geometry", () => {
    expect(envelopeInternalGeometry({ type: "MultiPoint", coordinates: [] })).toEqual({
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
    });
  });
});
