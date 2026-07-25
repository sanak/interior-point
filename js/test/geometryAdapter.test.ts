import { describe, expect, it } from "vitest";
import type { Geometry } from "geojson";
import { dimension, distance, envelopeInternal, isGeometryEmpty } from "../src/geometryAdapter";

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
