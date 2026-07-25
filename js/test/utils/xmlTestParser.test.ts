import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { parseXmlTestCases } from "./xmlTestParser";

const FIXTURES = join(import.meta.dirname, "../../../upstream/jts/resources/testxml/general");

describe("parseXmlTestCases", () => {
  it("parses the 24 interior point cases", () => {
    const cases = parseXmlTestCases(join(FIXTURES, "TestInteriorPoint.xml"), "getInteriorPoint");
    expect(cases).toHaveLength(24);
    expect(cases[0].desc).toBe("P - empty");
    expect(cases[0].input).toBeNull();
    expect(cases[0].expected).toBeNull();
  });

  it("parses the 38 centroid cases", () => {
    const cases = parseXmlTestCases(join(FIXTURES, "TestCentroid.xml"), "getCentroid");
    expect(cases).toHaveLength(38);
    expect(cases[1].expected).toEqual([10, 10]);
  });

  it("rejects a fixture whose op does not match", () => {
    expect(() => parseXmlTestCases(join(FIXTURES, "TestCentroid.xml"), "getInteriorPoint")).toThrow(/getCentroid/);
  });
});
