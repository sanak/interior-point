/**
 * Unit tests for the verify surface. Every one of the four outcomes is reached
 * deliberately, including `off-geometry`, which the algorithm does not produce
 * on its own for a well-formed input and which is therefore reached both with a
 * fabricated point and with one invalid polygon.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Geometry, LineString } from "geojson";
import { dimension } from "../src/GeometryAdapter.ts";
import { interiorPoint } from "../src/algorithm/InteriorPoint.ts";
import { InteriorPointVerification, isVerified, verifyInteriorPoint } from "../src/VerifyInteriorPoint.ts";

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

const ZERO_AREA_POLYGON: Geometry = {
  type: "Polygon",
  coordinates: [
    [
      [10, 10],
      [10, 10],
      [10, 10],
      [10, 10],
    ],
  ],
};

const COLLAPSED_TRIANGLE: Geometry = {
  type: "Polygon",
  coordinates: [
    [
      [0, 0],
      [10, 0],
      [0, 0],
    ],
  ],
};

// The hole is larger than the shell, so the widest interior interval of the scan
// line falls between the two rings, outside the polygon. The computed point is
// [-2.5, 5] and the locator answers EXTERIOR.
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

const MULTI_POINT: Geometry = {
  type: "MultiPoint",
  coordinates: [
    [0, 0],
    [10, 10],
  ],
};

const COLLECTION: Geometry = { type: "GeometryCollection", geometries: [POINT, LINE] };

describe("InteriorPointVerification", () => {
  it("spells its four values exactly as the CLI prints them", () => {
    assert.equal(InteriorPointVerification.Interior, "interior");
    assert.equal(InteriorPointVerification.OnGeometry, "on-geometry");
    assert.equal(InteriorPointVerification.OffGeometry, "off-geometry");
    assert.equal(InteriorPointVerification.Unverifiable, "unverifiable");
  });
});

describe("verifyInteriorPoint - interior", () => {
  it("reports interior for a square's own interior point", () => {
    assert.deepEqual(interiorPoint(SQUARE), [5, 5]);
    assert.equal(verifyInteriorPoint(interiorPoint(SQUARE), SQUARE), InteriorPointVerification.Interior);
  });

  it("reports interior for a point handed in directly", () => {
    assert.equal(verifyInteriorPoint([1, 1], SQUARE), InteriorPointVerification.Interior);
  });
});

describe("verifyInteriorPoint - on-geometry, areal", () => {
  it("reports on-geometry for a zero-area polygon", () => {
    assert.deepEqual(interiorPoint(ZERO_AREA_POLYGON), [10, 10]);
    assert.equal(
      verifyInteriorPoint(interiorPoint(ZERO_AREA_POLYGON), ZERO_AREA_POLYGON),
      InteriorPointVerification.OnGeometry,
    );
  });

  it("reports on-geometry for a collapsed triangle", () => {
    assert.deepEqual(interiorPoint(COLLAPSED_TRIANGLE), [0, 0]);
    assert.equal(
      verifyInteriorPoint(interiorPoint(COLLAPSED_TRIANGLE), COLLAPSED_TRIANGLE),
      InteriorPointVerification.OnGeometry,
    );
  });

  it("reports on-geometry for a point on the square's boundary", () => {
    assert.equal(verifyInteriorPoint([0, 5], SQUARE), InteriorPointVerification.OnGeometry);
  });
});

describe("verifyInteriorPoint - on-geometry, non-areal", () => {
  const cases: [string, Geometry][] = [
    ["POINT (5 5)", POINT],
    ["LINESTRING (0 0, 10 10)", LINE],
    ["MULTIPOINT ((0 0), (10 10))", MULTI_POINT],
    ["GEOMETRYCOLLECTION (POINT (5 5), LINESTRING (0 0, 10 10))", COLLECTION],
  ];

  for (const [label, geometry] of cases) {
    it(`reports on-geometry for ${label}`, () => {
      const point = interiorPoint(geometry);
      assert.notEqual(point, null);
      assert.equal(verifyInteriorPoint(point, geometry), InteriorPointVerification.OnGeometry);
    });
  }
});

describe("verifyInteriorPoint - off-geometry", () => {
  it("reports off-geometry for a fabricated point outside the square", () => {
    assert.equal(verifyInteriorPoint([100, 100], SQUARE), InteriorPointVerification.OffGeometry);
  });

  it("reports off-geometry for a computed point outside an invalid polygon", () => {
    assert.deepEqual(interiorPoint(HOLE_SWALLOWS_SHELL), [-2.5, 5]);
    assert.equal(
      verifyInteriorPoint(interiorPoint(HOLE_SWALLOWS_SHELL), HOLE_SWALLOWS_SHELL),
      InteriorPointVerification.OffGeometry,
    );
  });

  it("reports off-geometry for a point on a segment that is not a vertex", () => {
    assert.equal(verifyInteriorPoint([5, 5], LINE), InteriorPointVerification.OffGeometry);
  });

  it("reports off-geometry when the ordinate counts differ", () => {
    assert.equal(verifyInteriorPoint([0, 0, 0], LINE), InteriorPointVerification.OffGeometry);
  });

  it("reports off-geometry for a point that is a vertex of a lower-dimension element only", () => {
    assert.equal(verifyInteriorPoint([5, 5], COLLECTION), InteriorPointVerification.OffGeometry);
  });
});

describe("verifyInteriorPoint - unverifiable", () => {
  it("reports unverifiable for a null point", () => {
    assert.equal(verifyInteriorPoint(null, SQUARE), InteriorPointVerification.Unverifiable);
  });

  it("reports unverifiable for a null geometry", () => {
    assert.equal(verifyInteriorPoint([5, 5], null), InteriorPointVerification.Unverifiable);
  });

  it("reports unverifiable when both are null", () => {
    assert.equal(verifyInteriorPoint(null, null), InteriorPointVerification.Unverifiable);
  });

  it("reports unverifiable for an empty geometry", () => {
    const empty: Geometry = { type: "Point", coordinates: [] };
    assert.equal(interiorPoint(empty), null);
    assert.equal(verifyInteriorPoint(interiorPoint(empty), empty), InteriorPointVerification.Unverifiable);
  });

  it("reports unverifiable for a MultiLineString whose only part is empty", () => {
    const mls: Geometry = { type: "MultiLineString", coordinates: [[]] };
    assert.equal(interiorPoint(mls), null);
    assert.equal(verifyInteriorPoint(interiorPoint(mls), mls), InteriorPointVerification.Unverifiable);
  });

  it("reports unverifiable when every element is empty, even with a fabricated point", () => {
    const emptyCollection: Geometry = { type: "GeometryCollection", geometries: [] };
    assert.equal(verifyInteriorPoint([0, 0], emptyCollection), InteriorPointVerification.Unverifiable);
  });
});

describe("verifyInteriorPoint - dispatch", () => {
  it("follows the non-empty dimension, not the geometry's own dimension", () => {
    const gc: Geometry = {
      type: "GeometryCollection",
      geometries: [
        { type: "Point", coordinates: [5, 5] },
        { type: "LineString", coordinates: [] },
      ],
    };
    // The collection's own dimension is 1, because the empty LineString counts
    // toward it. The point comes from the Point, so comparing against dimension-1
    // elements would find no vertices at all and call a correct point off-geometry.
    assert.equal(dimension(gc), 1);
    assert.deepEqual(interiorPoint(gc), [5, 5]);
    assert.equal(verifyInteriorPoint(interiorPoint(gc), gc), InteriorPointVerification.OnGeometry);
  });
});

describe("verifyInteriorPoint - comparison", () => {
  it("compares per ordinate, not by reference", () => {
    const line: LineString = {
      type: "LineString",
      coordinates: [
        [0, 0],
        [10, 10],
      ],
    };
    const point = interiorPoint(line);
    // The algorithm stores a fresh array, so the returned value is never the same
    // object as the vertex it came from; `===` on the arrays would never be true.
    assert.notEqual(point, line.coordinates[0]);
    assert.deepEqual(point, [0, 0]);
    assert.equal(verifyInteriorPoint(point, line), InteriorPointVerification.OnGeometry);
  });

  it("accepts a structurally equal coordinate from an unrelated array", () => {
    assert.equal(verifyInteriorPoint([0, 0], LINE), InteriorPointVerification.OnGeometry);
  });

  it("keeps the Z ordinate in the comparison", () => {
    const line: Geometry = {
      type: "LineString",
      coordinates: [
        [0, 0, 5],
        [10, 10, 7],
      ],
    };
    assert.deepEqual(interiorPoint(line), [0, 0, 5]);
    assert.equal(verifyInteriorPoint(interiorPoint(line), line), InteriorPointVerification.OnGeometry);
    assert.equal(verifyInteriorPoint([0, 0, 9], line), InteriorPointVerification.OffGeometry);
    assert.equal(verifyInteriorPoint([0, 0], line), InteriorPointVerification.OffGeometry);
  });
});

describe("isVerified", () => {
  it("passes interior and on-geometry", () => {
    assert.equal(isVerified(InteriorPointVerification.Interior), true);
    assert.equal(isVerified(InteriorPointVerification.OnGeometry), true);
  });

  it("fails off-geometry and unverifiable", () => {
    assert.equal(isVerified(InteriorPointVerification.OffGeometry), false);
    assert.equal(isVerified(InteriorPointVerification.Unverifiable), false);
  });
});
