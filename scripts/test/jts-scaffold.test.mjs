import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { REPO_ROOT } from "../jts-pin.mjs";
import { scanJavaDir } from "../jts-java-scan.mjs";
import { emitRs, emitTs, overloadSuffix, portedName, resolveNames, rsType, toSnake, tsType } from "../jts-scaffold.mjs";

describe("toSnake", () => {
  it("converts camelCase to snake_case", () => {
    assert.equal(toSnake("intersectsHorizontalLineEnvelope"), "intersects_horizontal_line_envelope");
    assert.equal(toSnake("getCentroid"), "get_centroid");
    assert.equal(toSnake("avg"), "avg");
    assert.equal(toSnake("area2"), "area2");
  });

  it("splits an internal acronym from the word that follows it", () => {
    assert.equal(toSnake("isCCWCoordinates"), "is_ccw_coordinates");
    assert.equal(toSnake("isCCWCoordinateSequence"), "is_ccw_coordinate_sequence");
    assert.equal(toSnake("isCCW"), "is_ccw");
  });

  it("keeps a trailing acronym whole", () => {
    assert.equal(toSnake("selfMultiplyDD"), "self_multiply_dd");
    assert.equal(toSnake("selfSubtractDD"), "self_subtract_dd");
  });
});

describe("overloadSuffix", () => {
  it("PascalCases the first parameter's type", () => {
    assert.equal(overloadSuffix(["Envelope", "double"]), "Envelope");
    assert.equal(overloadSuffix(["double", "double"]), "Double");
  });

  it("pluralises array types", () => {
    assert.equal(overloadSuffix(["Coordinate[]"]), "Coordinates");
  });

  it("throws for a nullary member, so the rule's limit is visible rather than silent", () => {
    assert.throws(() => overloadSuffix([]), /nullary/);
  });
});

describe("portedName", () => {
  it("appends every parameter type when the first one does not disambiguate", () => {
    const members = [
      { file: "DD.java", className: "DD", memberName: "selfAdd", paramTypes: ["double"], modifiers: [] },
      { file: "DD.java", className: "DD", memberName: "selfAdd", paramTypes: ["double", "double"], modifiers: [] },
      { file: "DD.java", className: "DD", memberName: "signum", paramTypes: [], modifiers: [] },
    ];
    assert.equal(portedName(members[0], members), "selfAddDouble");
    assert.equal(portedName(members[1], members), "selfAddDoubleDouble");
    assert.equal(portedName(members[2], members), "signum");
  });

  it("does not treat same-named methods of different classes as overloads", () => {
    // InteriorPointArea.java really does have three unrelated `process` methods.
    const members = [
      { file: "A.java", className: "A", memberName: "process", paramTypes: ["Geometry"], modifiers: [] },
      { file: "A.java", className: "A.Inner", memberName: "process", paramTypes: [], modifiers: [] },
      { file: "A.java", className: "A.Other", memberName: "process", paramTypes: ["LineString"], modifiers: [] },
    ];
    for (const m of members) assert.equal(portedName(m, members), "process");
  });

  it("leaves the naming table unchanged", () => {
    const members = [
      {
        file: "InteriorPointLine.java",
        className: "InteriorPointLine",
        memberName: "addInterior",
        paramTypes: ["Geometry"],
        modifiers: [],
      },
      {
        file: "InteriorPointLine.java",
        className: "InteriorPointLine",
        memberName: "addInterior",
        paramTypes: ["Coordinate[]"],
        modifiers: [],
      },
    ];
    assert.equal(portedName(members[0], members), "addInteriorGeometry");
    assert.equal(portedName(members[1], members), "addInteriorCoordinates");
  });

  it("keeps the factory/getter pair unsuffixed", () => {
    const members = [
      {
        file: "DD.java",
        className: "DD",
        memberName: "getValue",
        paramTypes: ["double"],
        modifiers: ["public", "static"],
      },
      { file: "DD.java", className: "DD", memberName: "getValue", paramTypes: ["double"], modifiers: ["public"] },
    ];
    for (const m of members) assert.equal(portedName(m, members), "getValue");
  });

  it("leaves a constructor overload set unsuffixed, since the emitters name it structurally", () => {
    // DD.java declares five DD constructors, one of them nullary — the overload-suffix rule cannot
    // suffix that, and neither emitter would use the name if it could.
    const members = [
      { file: "DD.java", className: "DD", memberName: "DD", paramTypes: [], modifiers: [], isConstructor: true },
      {
        file: "DD.java",
        className: "DD",
        memberName: "DD",
        paramTypes: ["double"],
        modifiers: [],
        isConstructor: true,
      },
      {
        file: "DD.java",
        className: "DD",
        memberName: "DD",
        paramTypes: ["double", "double"],
        modifiers: [],
        isConstructor: true,
      },
    ];
    for (const m of members) assert.equal(portedName(m, members), "DD");
  });

  it("throws for a nullary member inside a real overload set, rather than colliding silently", () => {
    const members = [
      { file: "DD.java", className: "DD", memberName: "sqr", paramTypes: [], modifiers: [] },
      { file: "DD.java", className: "DD", memberName: "sqr", paramTypes: ["double"], modifiers: [] },
    ];
    assert.throws(() => portedName(members[0], members), /nullary/);
  });
});

describe("resolveNames against the naming table", () => {
  const members = scanJavaDir(REPO_ROOT);
  const names = resolveNames(members);
  // The naming table keys rows by file, not by the inner class that actually declares the member.
  const lookup = (row) => {
    const matches = members.filter(
      (m) => `${m.file.slice(0, -".java".length)}#${m.memberName}(${m.paramTypes.join(",")})` === row,
    );
    assert.equal(matches.length, 1, `expected exactly one member for ${row}, found ${matches.length}`);
    return names.get(matches[0]);
  };

  // Every mechanically derivable row of the naming table.
  const TABLE = [
    [
      "InteriorPointArea#intersectsHorizontalLine(Envelope,double)",
      "intersectsHorizontalLineEnvelope",
      "intersects_horizontal_line_envelope",
    ],
    [
      "InteriorPointArea#intersectsHorizontalLine(Coordinate,Coordinate,double)",
      "intersectsHorizontalLineCoordinate",
      "intersects_horizontal_line_coordinate",
    ],
    ["InteriorPointLine#addInterior(Geometry)", "addInteriorGeometry", "add_interior_geometry"],
    ["InteriorPointLine#addInterior(Coordinate[])", "addInteriorCoordinates", "add_interior_coordinates"],
    ["InteriorPointLine#addEndpoints(Geometry)", "addEndpointsGeometry", "add_endpoints_geometry"],
    ["InteriorPointLine#addEndpoints(Coordinate[])", "addEndpointsCoordinates", "add_endpoints_coordinates"],
    ["InteriorPointPoint#add(Geometry)", "addGeometry", "add_geometry"],
    ["InteriorPointPoint#add(Coordinate)", "addCoordinate", "add_coordinate"],
    ["Centroid#add(Geometry)", "addGeometry", "add_geometry"],
    ["Centroid#add(Polygon)", "addPolygon", "add_polygon"],
    ["Centroid#getCentroid(Geometry)", "getCentroid", "get_centroid"],
  ];

  for (const [row, ts, rs] of TABLE) {
    it(`maps ${row} to ${ts} / ${rs}`, () => {
      assert.deepEqual(lookup(row), { ts, rs });
    });
  }

  it("does not suffix a static factory paired with an instance getter", () => {
    for (const file of ["InteriorPointArea", "InteriorPointLine", "InteriorPointPoint"]) {
      const pair = members.filter(
        (m) => m.file === `${file}.java` && m.memberName === "getInteriorPoint" && m.className === file,
      );
      assert.equal(pair.length, 2, `${file} should have a static/instance getInteriorPoint pair`);
      for (const member of pair) assert.equal(names.get(member).ts, "getInteriorPoint");
    }
  });

  // Measured 2026-07-26: this pair is a fifth factory/getter case the naming table does not list.
  it("treats ScanLineYOrdinateFinder#getScanLineY as a factory/getter pair too", () => {
    const pair = members.filter(
      (m) => m.className === "InteriorPointArea.ScanLineYOrdinateFinder" && m.memberName === "getScanLineY",
    );
    assert.equal(pair.length, 2);
    for (const member of pair) assert.deepEqual(names.get(member), { ts: "getScanLineY", rs: "get_scan_line_y" });
  });

  const ORIGINAL_FILES = [
    "InteriorPoint.java",
    "InteriorPointArea.java",
    "InteriorPointLine.java",
    "InteriorPointPoint.java",
    "Centroid.java",
  ];

  it("suffixes exactly the five overload sets the naming table lists", () => {
    const suffixed = members.filter((m) => ORIGINAL_FILES.includes(m.file) && names.get(m).ts !== m.memberName);
    assert.deepEqual([...new Set(suffixed.map((m) => `${m.className}#${m.memberName}`))].sort(), [
      "Centroid#add",
      "InteriorPointArea.InteriorPointPolygon#intersectsHorizontalLine",
      "InteriorPointLine#addEndpoints",
      "InteriorPointLine#addInterior",
      "InteriorPointPoint#add",
    ]);
    assert.equal(suffixed.length, 10);
  });

  // The names the robust predicate ports actually use, derived rather than chosen.
  it("derives the ported names of the robust predicate stack", () => {
    const lookup = (signature) => names.get(members.find((m) => m.signature === signature));
    assert.deepEqual(lookup("Orientation#isCCW(Coordinate[])"), {
      ts: "isCCWCoordinates",
      rs: "is_ccw_coordinates",
    });
    assert.deepEqual(lookup("Orientation#isCCW(CoordinateSequence)"), {
      ts: "isCCWCoordinateSequence",
      rs: "is_ccw_coordinate_sequence",
    });
    assert.deepEqual(lookup("Orientation#index(Coordinate,Coordinate,Coordinate)"), { ts: "index", rs: "index" });
    assert.deepEqual(lookup("CGAlgorithmsDD#orientationIndex(Coordinate,Coordinate,Coordinate)"), {
      ts: "orientationIndexCoordinate",
      rs: "orientation_index_coordinate",
    });
    assert.deepEqual(lookup("CGAlgorithmsDD#orientationIndex(double,double,double,double,double,double)"), {
      ts: "orientationIndexDouble",
      rs: "orientation_index_double",
    });
    // The overload-suffix rule's extension: these two share a first parameter type.
    assert.deepEqual(lookup("DD#selfAdd(double)"), { ts: "selfAddDouble", rs: "self_add_double" });
    assert.deepEqual(lookup("DD#selfAdd(double,double)"), {
      ts: "selfAddDoubleDouble",
      rs: "self_add_double_double",
    });
    assert.deepEqual(lookup("DD#selfMultiply(DD)"), { ts: "selfMultiplyDD", rs: "self_multiply_dd" });
    assert.deepEqual(lookup("DD#selfSubtract(DD)"), { ts: "selfSubtractDD", rs: "self_subtract_dd" });
    assert.deepEqual(lookup("DD#valueOf(double)"), { ts: "valueOfDouble", rs: "value_of_double" });
    assert.deepEqual(lookup("DD#signum()"), { ts: "signum", rs: "signum" });
  });

  it("assigns a name to every one of the 185 members", () => {
    assert.equal(names.size, 185);
    for (const member of members) {
      assert.match(names.get(member).ts, /^\w+$/);
      assert.match(names.get(member).rs, /^[a-z0-9_]+$/);
    }
  });
});

describe("type mapping", () => {
  it("maps the adapter-boundary types", () => {
    assert.equal(tsType("Coordinate"), "Coordinate");
    assert.equal(rsType("Coordinate"), "Coord<f64>");
    assert.equal(tsType("Envelope"), "Envelope");
    assert.equal(rsType("Envelope"), "Rect<f64>");
    assert.equal(tsType("double"), "number");
    assert.equal(rsType("double"), "f64");
    assert.equal(tsType("Coordinate[]"), "Coordinate[]");
    assert.equal(rsType("Coordinate[]"), "&[Coord<f64>]");
    assert.equal(tsType(null), "void");
    assert.equal(rsType(null), "()");
  });

  it("passes an unmapped Java type through verbatim so it is visible in the output", () => {
    assert.equal(tsType("SomeUnknownType"), "SomeUnknownType");
    assert.equal(rsType("SomeUnknownType"), "SomeUnknownType");
  });
});

describe("emitters", () => {
  const members = scanJavaDir(REPO_ROOT).filter((m) => m.file === "InteriorPointPoint.java");

  it("emits anchored TypeScript skeletons with unimplemented bodies", () => {
    const output = emitTs(members);
    assert.match(output, /\/\*\* @jts InteriorPointPoint#add\(Coordinate\) \*\//);
    assert.match(output, /addCoordinate\(point: Coordinate\): void \{/);
    assert.match(output, /throw new Error\("not ported"\);/);
    assert.match(output, /class InteriorPointPoint \{/);
  });

  it("emits anchored Rust skeletons with todo bodies", () => {
    const output = emitRs(members);
    assert.match(output, /\/\/\/ @jts InteriorPointPoint#add\(Coordinate\)/);
    assert.match(output, /fn add_coordinate\(&mut self, point: Coord<f64>\)/);
    assert.match(output, /todo!\(\)/);
    assert.match(output, /impl InteriorPointPoint \{/);
  });

  it("carries the ported javadoc across", () => {
    assert.match(emitTs(members), /Computes an interior point/);
  });

  it("flags a static factory whose module-level name collides, per the factory/getter exception", () => {
    const area = scanJavaDir(REPO_ROOT).filter((m) => m.file === "InteriorPointArea.java");
    assert.match(emitTs(area), /TODO\(@jts-deviate\)/);
  });

  const line = scanJavaDir(REPO_ROOT).filter((m) => m.file === "InteriorPointLine.java");

  it("gives a Rust constructor no self receiver", () => {
    assert.match(emitRs(line), /fn new\(g: Geometry<f64>\)/);
  });

  it("emits no trailing separator in a nullary Rust signature", () => {
    assert.match(emitRs(line), /fn get_interior_point\(&mut self\) -> Coord<f64>/);
    assert.ok(!emitRs(line).includes(", )"));
  });
});
