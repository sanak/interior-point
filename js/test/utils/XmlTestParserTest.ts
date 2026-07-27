import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { join } from "node:path";
import { parseXmlTestCases } from "./XmlTestParser.ts";

const FIXTURES = join(import.meta.dirname, "../../../upstream/jts/resources/testxml/general");

describe("parseXmlTestCases", () => {
  it("parses the 24 interior point cases", () => {
    const cases = parseXmlTestCases(join(FIXTURES, "TestInteriorPoint.xml"), "getInteriorPoint");
    assert.equal(cases.length, 24);
    assert.equal(cases[0].desc, "P - empty");
    assert.equal(cases[0].input, null);
    assert.equal(cases[0].expected, null);
  });

  it("parses the 38 centroid cases", () => {
    const cases = parseXmlTestCases(join(FIXTURES, "TestCentroid.xml"), "getCentroid");
    assert.equal(cases.length, 38);
    assert.deepEqual(cases[1].expected, [10, 10]);
  });

  it("rejects a fixture whose op does not match", () => {
    assert.throws(() => parseXmlTestCases(join(FIXTURES, "TestCentroid.xml"), "getInteriorPoint"), /getCentroid/);
  });
});
