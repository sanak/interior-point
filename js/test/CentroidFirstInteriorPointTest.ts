/**
 * Unit tests for `centroidFirstInteriorPoint`. Both branches are reached
 * deliberately, and each degenerate case records what the centroid was, where
 * the locator put it, and which point came back.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Geometry } from "geojson";
import { centroidFirstInteriorPoint } from "../src/CentroidFirstInteriorPoint.ts";
import { getCentroid } from "../src/algorithm/Centroid.ts";
import { interiorPoint } from "../src/algorithm/InteriorPoint.ts";
import { locate } from "../src/algorithm/locate/SimplePointInAreaLocator.ts";
import { BOUNDARY, EXTERIOR, INTERIOR } from "../src/geom/Location.ts";
import { isVerified, verifyInteriorPoint } from "../src/VerifyInteriorPoint.ts";

const TRIANGLE: Geometry = {
  type: "Polygon",
  coordinates: [
    [
      [0, 0],
      [10, 0],
      [0, 10],
      [0, 0],
    ],
  ],
};
const L_SHAPE: Geometry = {
  type: "Polygon",
  coordinates: [
    [
      [0, 0],
      [10, 0],
      [10, 4],
      [4, 4],
      [4, 10],
      [0, 10],
      [0, 0],
    ],
  ],
};
const SQUARE: Geometry = {
  type: "Polygon",
  coordinates: [
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ],
  ],
};
const DONUT: Geometry = {
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
      [3, 3],
      [7, 3],
      [7, 7],
      [3, 7],
      [3, 3],
    ],
  ],
};
const C_SHAPE: Geometry = {
  type: "Polygon",
  coordinates: [
    [
      [0, 0],
      [10, 0],
      [10, 2],
      [3, 2],
      [3, 8],
      [10, 8],
      [10, 10],
      [0, 10],
      [0, 0],
    ],
  ],
};
const TWO_SQUARES: Geometry = {
  type: "MultiPolygon",
  coordinates: [
    [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ],
    ],
    [
      [
        [20, 0],
        [30, 0],
        [30, 10],
        [20, 10],
        [20, 0],
      ],
    ],
  ],
};
const SHELL_EQUALS_HOLE: Geometry = {
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
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
      [0, 0],
    ],
  ],
};
const SQUARE_Z: Geometry = {
  type: "Polygon",
  coordinates: [
    [
      [0, 0, 1],
      [4, 0, 2],
      [4, 4, 3],
      [0, 4, 4],
      [0, 0, 1],
    ],
  ],
};
const COLLINEAR_RING_Z: Geometry = {
  type: "Polygon",
  coordinates: [
    [
      [0, 0, 9],
      [5, 0, 9],
      [10, 0, 9],
      [0, 0, 9],
    ],
  ],
};
const HOLE_SWALLOWS_SHELL: Geometry = {
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
      [-5, -5],
      [15, -5],
      [15, 15],
      [-5, 15],
      [-5, -5],
    ],
  ],
};
const POINT: Geometry = { type: "Point", coordinates: [5, 5] };
const LINE: Geometry = {
  type: "LineString",
  coordinates: [
    [0, 0],
    [10, 10],
  ],
};
const LINE_Z: Geometry = {
  type: "LineString",
  coordinates: [
    [0, 0, 5],
    [10, 10, 7],
  ],
};
const MULTI_POINT: Geometry = {
  type: "MultiPoint",
  coordinates: [
    [0, 0],
    [10, 10],
  ],
};
const GC_POINT_LINE: Geometry = { type: "GeometryCollection", geometries: [POINT, LINE] };
const GC_SQUARE_LINE: Geometry = {
  type: "GeometryCollection",
  geometries: [
    {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [4, 0],
          [4, 4],
          [0, 4],
          [0, 0],
        ],
      ],
    },
    LINE,
  ],
};
const GC_COLLINEAR_LINE: Geometry = {
  type: "GeometryCollection",
  geometries: [
    {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [5, 0],
          [10, 0],
          [0, 0],
        ],
      ],
    },
    {
      type: "LineString",
      coordinates: [
        [0, 50],
        [10, 60],
      ],
    },
  ],
};
const GC_LINE_EMPTY_POLYGON: Geometry = {
  type: "GeometryCollection",
  geometries: [LINE, { type: "Polygon", coordinates: [] }],
};

describe("centroidFirstInteriorPoint - empty and null", () => {
  it("returns null for a null geometry", () => {
    assert.equal(centroidFirstInteriorPoint(null), null);
  });
  it("returns null for an empty Point", () => {
    assert.equal(centroidFirstInteriorPoint({ type: "Point", coordinates: [] }), null);
  });
  it("returns null for an empty MultiPolygon", () => {
    assert.equal(centroidFirstInteriorPoint({ type: "MultiPolygon", coordinates: [] }), null);
  });
  it("returns null wherever interiorPoint does", () => {
    const mls: Geometry = { type: "MultiLineString", coordinates: [[]] };
    assert.equal(interiorPoint(mls), null);
    assert.equal(centroidFirstInteriorPoint(mls), null);
  });
});

describe("centroidFirstInteriorPoint - dimensions 0 and 1 delegate", () => {
  const cases: [string, Geometry][] = [
    ["Point", POINT],
    ["LineString", LINE],
    ["LineString Z", LINE_Z],
    ["MultiPoint", MULTI_POINT],
    ["GeometryCollection of Point and LineString", GC_POINT_LINE],
    ["GeometryCollection whose only areal element is empty", GC_LINE_EMPTY_POLYGON],
  ];
  for (const [label, geometry] of cases) {
    it(`returns exactly interiorPoint for ${label}`, () => {
      assert.deepEqual(centroidFirstInteriorPoint(geometry), interiorPoint(geometry));
    });
  }
  it("does not return the centroid of a line", () => {
    assert.deepEqual(getCentroid(LINE), [5, 5]);
    assert.deepEqual(centroidFirstInteriorPoint(LINE), [0, 0]);
  });
  it("keeps a line's Z ordinate, which a centroid never carries", () => {
    assert.deepEqual(getCentroid(LINE_Z), [5, 5]);
    assert.deepEqual(centroidFirstInteriorPoint(LINE_Z), [0, 0, 5]);
  });
  it("would reject every non-areal centroid anyway, so the branch saves the work", () => {
    for (const geometry of [POINT, LINE, MULTI_POINT, GC_POINT_LINE]) {
      assert.equal(locate(getCentroid(geometry)!, geometry), EXTERIOR);
    }
  });
});

describe("centroidFirstInteriorPoint - the centroid is accepted", () => {
  it("returns a triangle's centroid, which is not its interior point", () => {
    assert.equal(locate(getCentroid(TRIANGLE)!, TRIANGLE), INTERIOR);
    assert.deepEqual(centroidFirstInteriorPoint(TRIANGLE), [3.333333333333333, 3.333333333333333]);
    assert.deepEqual(interiorPoint(TRIANGLE), [2.5, 5]);
  });
  it("returns an L-shape's centroid, which lies inside the L", () => {
    assert.deepEqual(centroidFirstInteriorPoint(L_SHAPE), [3.875, 3.875]);
    assert.deepEqual(interiorPoint(L_SHAPE), [2, 7]);
  });
  it("agrees with interiorPoint on a square, where the two coincide", () => {
    assert.deepEqual(centroidFirstInteriorPoint(SQUARE), [5, 5]);
    assert.deepEqual(interiorPoint(SQUARE), [5, 5]);
  });
  it("descends a GeometryCollection to reach an areal element", () => {
    assert.deepEqual(centroidFirstInteriorPoint(GC_SQUARE_LINE), [2, 2]);
  });
  it("drops Z, because a centroid is always two ordinates wide", () => {
    assert.deepEqual(centroidFirstInteriorPoint(SQUARE_Z), [2, 2]);
    assert.deepEqual(interiorPoint(SQUARE_Z), [2, 2]);
  });
  it("returns the centroid array itself, per ordinate equal to getCentroid", () => {
    assert.deepEqual(centroidFirstInteriorPoint(TRIANGLE), getCentroid(TRIANGLE));
  });
});

describe("centroidFirstInteriorPoint - the centroid is rejected", () => {
  it("falls back when the centroid is in a hole", () => {
    assert.deepEqual(getCentroid(DONUT), [5, 5]);
    assert.equal(locate([5, 5], DONUT), EXTERIOR);
    assert.deepEqual(centroidFirstInteriorPoint(DONUT), [1.5, 5]);
  });
  it("falls back when the centroid is outside a concave shell", () => {
    assert.deepEqual(getCentroid(C_SHAPE), [3.913793103448276, 5]);
    assert.equal(locate(getCentroid(C_SHAPE)!, C_SHAPE), EXTERIOR);
    assert.deepEqual(centroidFirstInteriorPoint(C_SHAPE), [1.5, 5]);
  });
  it("falls back when the centroid is in the gap between two parts", () => {
    assert.deepEqual(getCentroid(TWO_SQUARES), [15, 5]);
    assert.deepEqual(centroidFirstInteriorPoint(TWO_SQUARES), [5, 5]);
  });
  it("falls back when a hole cancels the shell", () => {
    assert.deepEqual(getCentroid(SHELL_EQUALS_HOLE), [2, 2]);
    assert.equal(locate([2, 2], SHELL_EQUALS_HOLE), EXTERIOR);
    assert.deepEqual(centroidFirstInteriorPoint(SHELL_EQUALS_HOLE), [0, 0]);
  });
  it("falls back on a boundary centroid, which is what keeps Z", () => {
    assert.deepEqual(getCentroid(COLLINEAR_RING_Z), [5, 0]);
    assert.equal(locate([5, 0], COLLINEAR_RING_Z), BOUNDARY);
    assert.deepEqual(centroidFirstInteriorPoint(COLLINEAR_RING_Z), [0, 0, 9]);
  });
  it("falls back when a zero-area collection sends the centroid to its lineal branch", () => {
    assert.deepEqual(getCentroid(GC_COLLINEAR_LINE), [5, 22.781745930520227]);
    assert.equal(locate(getCentroid(GC_COLLINEAR_LINE)!, GC_COLLINEAR_LINE), EXTERIOR);
    assert.deepEqual(centroidFirstInteriorPoint(GC_COLLINEAR_LINE), [0, 0]);
  });
  it("does not verify its own output: an invalid polygon still yields the fallback", () => {
    assert.deepEqual(getCentroid(HOLE_SWALLOWS_SHELL), [5, 5]);
    assert.equal(locate([5, 5], HOLE_SWALLOWS_SHELL), EXTERIOR);
    assert.deepEqual(centroidFirstInteriorPoint(HOLE_SWALLOWS_SHELL), [-2.5, 5]);
    assert.equal(
      isVerified(verifyInteriorPoint(centroidFirstInteriorPoint(HOLE_SWALLOWS_SHELL), HOLE_SWALLOWS_SHELL)),
      false,
    );
  });
});

describe("centroidFirstInteriorPoint - robustness", () => {
  const throwing: [string, Geometry][] = [
    ["Polygon with one empty ring", { type: "Polygon", coordinates: [[]] }],
    ["MultiPolygon with one empty member", { type: "MultiPolygon", coordinates: [[]] }],
    ["MultiPolygon with one empty ring", { type: "MultiPolygon", coordinates: [[[]]] }],
    [
      "Polygon whose first ring is empty",
      {
        type: "Polygon",
        coordinates: [
          [],
          [
            [0, 0],
            [4, 0],
            [4, 4],
            [0, 4],
            [0, 0],
          ],
        ],
      },
    ],
    [
      "GeometryCollection holding a Polygon with one empty ring",
      { type: "GeometryCollection", geometries: [{ type: "Polygon", coordinates: [[]] }, LINE] },
    ],
  ];
  for (const [label, geometry] of throwing) {
    it(`throws for ${label}, exactly as interiorPoint does`, () => {
      assert.throws(() => interiorPoint(geometry));
      assert.throws(() => centroidFirstInteriorPoint(geometry));
    });
  }
});
