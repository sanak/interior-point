/**
 * Integration tests for interiorPoint() dispatcher.
 *
 * Loads test cases directly from JTS TestInteriorPoint.xml (23 cases from XML)
 * plus extra cases from InteriorPointTest.java that are not in the XML.
 * Mirrors JTS InteriorPointTest.java: single test file, all via dispatcher.
 */
import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import type { Geometry } from "geojson";
import { interiorPoint } from "../src/interiorPoint";
import { parseXmlTestCases } from "./utils/xmlTestParser";

const xmlPath = resolve(__dirname, "../../upstream/jts/resources/testxml/general/TestInteriorPoint.xml");
const testCases = parseXmlTestCases(xmlPath, "getInteriorPoint");

describe("InteriorPoint - TestInteriorPoint.xml", () => {
  for (const tc of testCases) {
    it(tc.desc, () => {
      const result = interiorPoint(tc.input);
      expect(result).toEqual(tc.expected);
    });
  }
});

describe("InteriorPoint - extra cases (InteriorPointTest.java)", () => {
  it("zero-area polygon", () => {
    const input: Geometry = {
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
    expect(interiorPoint(input)).toEqual([10, 10]);
  });

  it("multiline with empty", () => {
    const input: Geometry = {
      type: "MultiLineString",
      coordinates: [
        [
          [0, 0],
          [1, 1],
        ],
      ],
    };
    expect(interiorPoint(input)).toEqual([0, 0]);
  });

  it("mL - zero length lines, asymmetric (centroid defect regression)", () => {
    // Confirmed against JTS 1.19.0: centroid (6.667, 6.667), interior point (10, 10).
    // The pre-retrofit port returned [0, 0] because it took the first coordinate
    // of the first line instead of treating zero-length lines as points.
    const result = interiorPoint({
      type: "MultiLineString",
      coordinates: [
        [
          [0, 0],
          [0, 0],
        ],
        [
          [10, 10],
          [10, 10],
        ],
        [
          [10, 10],
          [10, 10],
        ],
      ],
    });
    expect(result).toEqual([10, 10]);
  });
});
