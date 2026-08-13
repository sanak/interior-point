import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { flattenGeometry } from "../../../rs/wasm/js/flatten.js";

function flat(geometry: unknown): { coords: number[]; structure: number[] } {
  const [coords, structure] = flattenGeometry(geometry as never);
  return { coords: Array.from(coords), structure: Array.from(structure) };
}

describe("flattenGeometry", () => {
  it("encodes a Point as tag 1 and one position", () => {
    assert.deepEqual(flat({ type: "Point", coordinates: [1, 2] }), { coords: [1, 2], structure: [1] });
  });

  it("encodes a LineString as tag 2 and a vertex count", () => {
    assert.deepEqual(
      flat({
        type: "LineString",
        coordinates: [
          [0, 0],
          [3, 4],
        ],
      }),
      {
        coords: [0, 0, 3, 4],
        structure: [2, 2],
      },
    );
  });

  it("encodes a Polygon with a hole as tag 3, a ring count, then every ring length", () => {
    const polygon = {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [4, 0],
          [4, 4],
          [0, 4],
          [0, 0],
        ],
        [
          [1, 1],
          [2, 1],
          [2, 2],
          [1, 1],
        ],
      ],
    };
    assert.deepEqual(flat(polygon), {
      coords: [0, 0, 4, 0, 4, 4, 0, 4, 0, 0, 1, 1, 2, 1, 2, 2, 1, 1],
      structure: [3, 2, 5, 4],
    });
  });

  it("encodes a MultiPoint as tag 4 and a point count", () => {
    assert.deepEqual(
      flat({
        type: "MultiPoint",
        coordinates: [
          [0, 0],
          [10, 0],
        ],
      }),
      {
        coords: [0, 0, 10, 0],
        structure: [4, 2],
      },
    );
  });

  it("encodes a MultiLineString as tag 5 with the same shape as a Polygon body", () => {
    assert.deepEqual(
      flat({
        type: "MultiLineString",
        coordinates: [
          [
            [0, 0],
            [1, 1],
          ],
          [
            [2, 2],
            [3, 3],
            [4, 4],
          ],
        ],
      }),
      {
        coords: [0, 0, 1, 1, 2, 2, 3, 3, 4, 4],
        structure: [5, 2, 2, 3],
      },
    );
  });

  it("encodes a MultiPolygon as tag 6 with a per-polygon ring count", () => {
    const multi = {
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
            [6, 5],
            [6, 6],
            [5, 5],
          ],
          [
            [5.2, 5.2],
            [5.4, 5.2],
            [5.4, 5.4],
            [5.2, 5.2],
          ],
        ],
      ],
    };
    assert.deepEqual(flat(multi).structure, [6, 2, 1, 4, 2, 4, 4]);
    assert.equal(flat(multi).coords.length, 24);
  });

  it("encodes a GeometryCollection as tag 7 and recurses in order", () => {
    const collection = {
      type: "GeometryCollection",
      geometries: [
        { type: "Point", coordinates: [1, 2] },
        {
          type: "LineString",
          coordinates: [
            [0, 0],
            [3, 4],
          ],
        },
      ],
    };
    assert.deepEqual(flat(collection), { coords: [1, 2, 0, 0, 3, 4], structure: [7, 2, 1, 2, 2] });
  });

  it("encodes an empty geometry as a zero count", () => {
    assert.deepEqual(flat({ type: "Polygon", coordinates: [] }), { coords: [], structure: [3, 0] });
    assert.deepEqual(flat({ type: "MultiPoint", coordinates: [] }), { coords: [], structure: [4, 0] });
  });

  it("unwraps a Feature envelope", () => {
    const feature = { type: "Feature", properties: null, geometry: { type: "Point", coordinates: [1, 2] } };
    assert.deepEqual(flat(feature), { coords: [1, 2], structure: [1] });
  });

  it("drops the third ordinate", () => {
    assert.deepEqual(flat({ type: "Point", coordinates: [1, 2, 3] }), { coords: [1, 2], structure: [1] });
  });

  it("throws on a Feature without a geometry", () => {
    assert.throws(() => flat({ type: "Feature", properties: null, geometry: null }), TypeError);
  });

  it("throws on a FeatureCollection", () => {
    assert.throws(() => flat({ type: "FeatureCollection", features: [] }), TypeError);
  });
});
