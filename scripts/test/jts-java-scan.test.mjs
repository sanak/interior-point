import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { REPO_ROOT } from "../jts-pin.mjs";
import { findEnclosingMember, scanJavaDir, scanMembers, stripComments } from "../jts-java-scan.mjs";

describe("stripComments", () => {
  it("removes line and block comments but preserves line count", () => {
    const src = ["/* header", " * banner", " */", "int a = 1; // trailing", "int b = 2;"].join("\n");
    const out = stripComments(src);
    assert.equal(out.split("\n").length, src.split("\n").length);
    assert.ok(!out.includes("banner"));
    assert.ok(!out.includes("trailing"));
    assert.ok(out.includes("int b = 2;"));
  });

  it("does not treat comment markers inside string or char literals as comments", () => {
    const src = "String s = \"a // b /* c */ d\"; char slash = '/'; // gone";
    const out = stripComments(src);
    assert.ok(out.includes('"a // b /* c */ d"'));
    assert.ok(out.includes("'/'"));
    assert.ok(!out.includes("gone"));
  });

  it("respects escaped quotes inside strings", () => {
    const out = stripComments('String s = "he said \\"// hi\\""; // gone');
    assert.ok(out.includes('\\"// hi\\"'));
    assert.ok(!out.includes("gone"));
  });
});

const SYNTHETIC = `/*
 * license
 */
package p;

public class Outer {

  private Coordinate field = new Coordinate(); // initialiser, not a method

  /**
   * Doc for one.
   *
   * @param a a value
   */
  public static int one(int a) {
    if (a > 0) {
      return a;
    }
    return 0;
  }

  public Outer(Geometry g)
  {
    process(g);
  }

  private void two(Coordinate p0,
                   Coordinate p1,
                   double y)
  {
    for (int i = 0; i < 2; i++) {
      use(p0, p1, y);
    }
  }

  private static class Inner {
    private void three(Coordinate[] pts) {
    }
  }
}
`;

describe("scanMembers", () => {
  const members = scanMembers(SYNTHETIC, "Outer.java");

  it("finds exactly the four real members", () => {
    assert.deepEqual(
      members.map((m) => m.memberName),
      ["one", "Outer", "two", "three"],
    );
  });

  it("does not mistake a field initialiser containing parentheses for a method", () => {
    assert.ok(!members.some((m) => m.memberName === "field"));
  });

  it("records the dotted class path for inner classes", () => {
    assert.equal(members.at(-1).className, "Outer.Inner");
    assert.equal(members[0].className, "Outer");
  });

  it("parses parameter types across a multi-line signature", () => {
    const two = members.find((m) => m.memberName === "two");
    assert.deepEqual(two.paramTypes, ["Coordinate", "Coordinate", "double"]);
    assert.equal(two.signature, "Outer#two(Coordinate,Coordinate,double)");
  });

  it("records parameter names alongside their types", () => {
    const two = members.find((m) => m.memberName === "two");
    assert.deepEqual(two.paramNames, ["p0", "p1", "y"]);
    assert.deepEqual(members.at(-1).paramNames, ["pts"]);
    assert.deepEqual(members[0].paramNames, ["a"]);
  });

  it("keeps array types intact", () => {
    assert.deepEqual(members.at(-1).paramTypes, ["Coordinate[]"]);
    assert.equal(members.at(-1).signature, "Outer.Inner#three(Coordinate[])");
  });

  it("marks the constructor and records modifiers and return types", () => {
    const ctor = members.find((m) => m.memberName === "Outer");
    assert.equal(ctor.isConstructor, true);
    assert.equal(ctor.returnType, null);
    const one = members[0];
    assert.deepEqual(one.modifiers, ["public", "static"]);
    assert.equal(one.returnType, "int");
    assert.equal(one.isConstructor, false);
  });

  it("captures the preceding javadoc block, trimmed", () => {
    assert.deepEqual(members[0].javadoc, ["/**", "* Doc for one.", "*", "* @param a a value", "*/"]);
    assert.deepEqual(members.find((m) => m.memberName === "two").javadoc, []);
  });

  it("spans the member body from declaration line to closing brace", () => {
    const one = members[0];
    assert.equal(SYNTHETIC.split("\n")[one.startLine - 1].trim(), "public static int one(int a) {");
    assert.equal(SYNTHETIC.split("\n")[one.endLine - 1].trim(), "}");
    assert.ok(one.endLine > one.startLine);
  });
});

describe("scanJavaDir against the vendored JTS sources", () => {
  const members = scanJavaDir(REPO_ROOT);

  it("finds every member of every pinned Java file", () => {
    const perFile = {};
    for (const m of members) perFile[m.file] = (perFile[m.file] ?? 0) + 1;
    // Centroid, InteriorPoint, InteriorPointArea, InteriorPointLine and
    // InteriorPointPoint are the original 52 in-scope members. The rest are partially
    // ported — the robust predicate stack plus CentroidTest — scanned in full and
    // narrowed to their ported subsets by pin.json's portedMembers.
    assert.deepEqual(perFile, {
      "CGAlgorithmsDD.java": 8,
      "Centroid.java": 13,
      "CentroidTest.java": 3,
      "DD.java": 73,
      "InteriorPoint.java": 4,
      "InteriorPointArea.java": 22,
      "InteriorPointLine.java": 8,
      "InteriorPointPoint.java": 5,
      "Orientation.java": 4,
    });
    assert.equal(members.length, 140);
  });

  it("scans a vendored file that lives outside algorithm/", () => {
    // DD.java is org.locationtech.jts.math.DD, so it vendors to upstream/jts/math/.
    assert.ok(members.some((m) => m.file === "DD.java" && m.signature === "DD#selfAdd(double,double)"));
  });

  it("excludes the two methods inside the commented-out block of InteriorPointArea", () => {
    assert.ok(!members.some((m) => m.memberName === "checkIntersectionDD"));
    assert.ok(!members.some((m) => m.memberName === "intersectionDD"));
  });

  it("resolves both intersectsHorizontalLine overloads inside the inner class", () => {
    const overloads = members.filter((m) => m.memberName === "intersectsHorizontalLine");
    assert.deepEqual(overloads.map((m) => m.signature).sort(), [
      "InteriorPointArea.InteriorPointPolygon#intersectsHorizontalLine(Coordinate,Coordinate,double)",
      "InteriorPointArea.InteriorPointPolygon#intersectsHorizontalLine(Envelope,double)",
    ]);
  });

  it("finds the three inner classes", () => {
    const classes = new Set(members.map((m) => m.className));
    assert.ok(classes.has("InteriorPoint.DimensionNonEmptyFilter"));
    assert.ok(classes.has("InteriorPointArea.InteriorPointPolygon"));
    assert.ok(classes.has("InteriorPointArea.ScanLineYOrdinateFinder"));
  });
});

describe("findEnclosingMember", () => {
  const members = scanJavaDir(REPO_ROOT);

  it("maps InteriorPointArea.java:262 to findBestMidpoint", () => {
    const hit = findEnclosingMember(members, "InteriorPointArea.java", 262);
    assert.equal(hit.signature, "InteriorPointArea.InteriorPointPolygon#findBestMidpoint(List<Double>)");
    assert.equal(hit.startLine, 251);
    assert.equal(hit.endLine, 275);
  });

  it("returns null for a line outside every member", () => {
    assert.equal(findEnclosingMember(members, "InteriorPointArea.java", 1), null);
  });

  it("returns null for an unknown file", () => {
    assert.equal(findEnclosingMember(members, "Nope.java", 10), null);
  });
});
