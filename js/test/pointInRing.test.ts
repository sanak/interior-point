/**
 * Ports of JTS's AbstractPointInRingTest, run through both entry points.
 *
 * JUnit expresses this as one abstract test class and two subclasses, each
 * binding the shared cases to a different entry point. vitest has no counterpart,
 * so the cases become a table and each subclass's runPtInRing becomes a function
 * bound to its own describe block.
 *
 * @jts-adapter AbstractPointInRingTest — JUnit's abstract-test-class-plus-two-
 *   subclasses shape becomes a shared case table plus one entry-point function
 *   per subclass.
 */
import type { Geometry } from "geojson";
import { describe, it, expect } from "vitest";

import type { Coordinate } from "../src/geometryAdapter";
import { BOUNDARY, EXTERIOR, INTERIOR } from "../src/location";
import { RayCrossingCounter } from "../src/rayCrossingCounter";
import { locate, SimplePointInAreaLocator } from "../src/simplePointInAreaLocator";
import { parseWkt } from "./utils/wktParser";

interface Case {
  expected: number;
  pt: Coordinate;
  wkt: string;
}

const box = "POLYGON ((0 0, 0 20, 20 20, 20 0, 0 0))";

const complexRing =
  "POLYGON ((-40 80, -40 -80, 20 0, 20 -100, 40 40, 80 -80, 100 80, 140 -20, 120 140, 40 180, 60 40, 0 120, -20 -20, -40 80))";

const comb =
  "POLYGON ((0 0, 0 10, 4 5, 6 10, 7 5, 9 10, 10 5, 13 5, 15 10, 16 3, 17 10, 18 3, 25 10, 30 10, 30 0, 15 0, 14 5, 13 0, 9 0, 8 5, 6 0, 0 0))";

const repeatedPts =
  "POLYGON ((0 0, 0 10, 2 5, 2 5, 2 5, 2 5, 2 5, 3 10, 6 10, 8 5, 8 5, 8 5, 8 5, 10 10, 10 5, 10 5, 10 5, 10 5, 10 0, 0 0))";

/** @jts AbstractPointInRingTest#testBox() */
const testBox: Case[] = [{ expected: INTERIOR, pt: [10, 10], wkt: box }];

/** @jts AbstractPointInRingTest#testComplexRing() */
const testComplexRing: Case[] = [{ expected: INTERIOR, pt: [0, 0], wkt: complexRing }];

/** @jts AbstractPointInRingTest#testComb() */
const testComb: Case[] = [
  { expected: BOUNDARY, pt: [0, 0], wkt: comb },
  { expected: BOUNDARY, pt: [0, 1], wkt: comb },
  // at vertex
  { expected: BOUNDARY, pt: [4, 5], wkt: comb },
  { expected: BOUNDARY, pt: [8, 5], wkt: comb },
  // on horizontal segment
  { expected: BOUNDARY, pt: [11, 5], wkt: comb },
  // on vertical segment
  { expected: BOUNDARY, pt: [30, 5], wkt: comb },
  // on angled segment
  { expected: BOUNDARY, pt: [22, 7], wkt: comb },
  { expected: INTERIOR, pt: [1, 5], wkt: comb },
  { expected: INTERIOR, pt: [5, 5], wkt: comb },
  { expected: INTERIOR, pt: [1, 7], wkt: comb },
  { expected: EXTERIOR, pt: [12, 10], wkt: comb },
  { expected: EXTERIOR, pt: [16, 5], wkt: comb },
  { expected: EXTERIOR, pt: [35, 5], wkt: comb },
];

/** @jts AbstractPointInRingTest#testRepeatedPts() */
const testRepeatedPts: Case[] = [
  { expected: BOUNDARY, pt: [0, 0], wkt: repeatedPts },
  { expected: BOUNDARY, pt: [0, 1], wkt: repeatedPts },
  // at vertex
  { expected: BOUNDARY, pt: [2, 5], wkt: repeatedPts },
  { expected: BOUNDARY, pt: [8, 5], wkt: repeatedPts },
  { expected: BOUNDARY, pt: [10, 5], wkt: repeatedPts },
  { expected: INTERIOR, pt: [1, 5], wkt: repeatedPts },
  { expected: INTERIOR, pt: [3, 5], wkt: repeatedPts },
];

/** @jts AbstractPointInRingTest#testRobustStressTriangles() */
const testRobustStressTriangles: Case[] = [
  {
    expected: EXTERIOR,
    pt: [25.374625374625374, 128.35564435564436],
    wkt: "POLYGON ((0.0 0.0, 0.0 172.0, 100.0 0.0, 0.0 0.0))",
  },
  {
    expected: INTERIOR,
    pt: [97.96039603960396, 782.0],
    wkt: "POLYGON ((642.0 815.0, 69.0 764.0, 394.0 966.0, 642.0 815.0))",
  },
];

/** @jts AbstractPointInRingTest#testRobustTriangle() */
const testRobustTriangle: Case[] = [
  {
    expected: EXTERIOR,
    pt: [3.166572116932842, 48.5390194687463],
    wkt: "POLYGON ((2.152214146946829 50.470470727186765, 18.381941666723034 19.567250592139274, 2.390837642830135 49.228045261718165, 2.152214146946829 50.470470727186765))",
  },
];

const groups: [string, Case[]][] = [
  ["testBox", testBox],
  ["testComplexRing", testComplexRing],
  ["testComb", testComb],
  ["testRepeatedPts", testRepeatedPts],
  ["testRobustStressTriangles", testRobustStressTriangles],
  ["testRobustTriangle", testRobustTriangle],
];

const NAMES: Record<number, string> = { [INTERIOR]: "INTERIOR", [BOUNDARY]: "BOUNDARY", [EXTERIOR]: "EXTERIOR" };

/**
 * Entry point 1. JTS passes `geom.getCoordinates()`, which for these
 * single-ring polygons is the shell; the ports have no whole-geometry coordinate
 * accessor, so the shell is read directly.
 *
 * @jts RayCrossingCounterTest#runPtInRing(int,Coordinate,String)
 */
function runPtInRingRayCrossingCounter(c: Case): number {
  const geom = parseWkt(c.wkt);
  if (geom.type !== "Polygon") throw new Error(`expected a Polygon, got ${geom.type}`);
  return RayCrossingCounter.locatePointInRingCoordinateCoordinates(c.pt, geom.coordinates[0]);
}

describe("RayCrossingCounter.locatePointInRing", () => {
  for (const [name, cases] of groups) {
    describe(name, () => {
      cases.forEach((c, i) => {
        it(`case ${i}: (${c.pt[0]}, ${c.pt[1]}) is ${NAMES[c.expected]}`, () => {
          expect(runPtInRingRayCrossingCounter(c)).toBe(c.expected);
        });
      });
    });
  }
});

/**
 * Entry point 2, which additionally exercises the polygon/hole walk and both
 * envelope short-circuits.
 *
 * @jts SimplePointInAreaLocatorTest#runPtInRing(int,Coordinate,String)
 */
function runPtInRingLocator(c: Case): number {
  return new SimplePointInAreaLocator(parseWkt(c.wkt)).locate(c.pt);
}

describe("SimplePointInAreaLocator#locate", () => {
  for (const [name, cases] of groups) {
    describe(name, () => {
      cases.forEach((c, i) => {
        it(`case ${i}: (${c.pt[0]}, ${c.pt[1]}) is ${NAMES[c.expected]}`, () => {
          expect(runPtInRingLocator(c)).toBe(c.expected);
        });
      });
    });
  }
});

it("runs all 25 of JTS's assertions", () => {
  expect(groups.reduce((n, [, cases]) => n + cases.length, 0)).toBe(25);
});

describe("SimplePointInAreaLocator#locate — beyond the shared cases", () => {
  // The 25 shared cases are all single-ring polygons, so the hole walk and the
  // multipolygon branch need their own coverage. Expected values follow JTS's
  // locatePointInPolygon directly: BOUNDARY on a hole's edge, EXTERIOR inside a
  // hole, INTERIOR anywhere else within the shell.
  const withHole: Geometry = {
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
        [6, 2],
        [6, 6],
        [2, 6],
        [2, 2],
      ],
    ],
  };

  it("reports a point inside a hole as exterior", () => {
    expect(locate([4, 4], withHole)).toBe(EXTERIOR);
  });

  it("reports a point on a hole's edge as boundary", () => {
    expect(locate([2, 4], withHole)).toBe(BOUNDARY);
  });

  it("reports a point between the shell and the hole as interior", () => {
    expect(locate([1, 1], withHole)).toBe(INTERIOR);
  });

  it("finds the containing member of a multipolygon", () => {
    const multi: Geometry = {
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0],
          ],
        ],
        [
          [
            [5, 5],
            [8, 5],
            [8, 8],
            [5, 8],
            [5, 5],
          ],
        ],
      ],
    };
    expect(locate([6, 6], multi)).toBe(INTERIOR);
    expect(locate([0.5, 0.5], multi)).toBe(INTERIOR);
    expect(locate([3, 3], multi)).toBe(EXTERIOR);
  });

  it("recurses into a nested collection", () => {
    const nested: Geometry = {
      type: "GeometryCollection",
      geometries: [
        { type: "GeometryCollection", geometries: [withHole] },
        { type: "Point", coordinates: [100, 100] },
      ],
    };
    expect(locate([1, 1], nested)).toBe(INTERIOR);
    expect(locate([4, 4], nested)).toBe(EXTERIOR);
  });

  it("reports an empty geometry as exterior", () => {
    expect(locate([0, 0], { type: "MultiPolygon", coordinates: [] })).toBe(EXTERIOR);
    // A member with one empty ring is not "empty" by GeoJSON's shape but has no
    // envelope, so it takes the intersects-nothing path rather than reading
    // coordinates[0][0].
    expect(locate([0, 0], { type: "MultiPolygon", coordinates: [[[]]] })).toBe(EXTERIOR);
  });

  it("reports a point outside the whole-geometry envelope as exterior", () => {
    // The fast path in locate(), before locateInGeometry is reached at all.
    expect(locate([1000, 1000], withHole)).toBe(EXTERIOR);
  });
});
