import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import { REPO_ROOT } from "../jts-pin.mjs";
import { scanJavaDir } from "../jts-java-scan.mjs";
import {
  checkAnchorsToJava,
  checkJavaToAnchors,
  parseAnchorTarget,
  runAnchors,
  scanPortAnchors,
} from "../jts-anchors.mjs";

const temps = [];
after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

/** Builds a throwaway repo root containing the given repo-relative files. */
function fixtureRoot(files) {
  const root = mkdtempSync(join(tmpdir(), "jts-sync-"));
  temps.push(root);
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

describe("parseAnchorTarget", () => {
  it("parses a file-and-member anchor", () => {
    assert.deepEqual(parseAnchorTarget("InteriorPoint#getInteriorPoint"), {
      file: "InteriorPoint.java",
      className: null,
      memberName: "getInteriorPoint",
      paramTypes: null,
    });
  });

  it("parses an inner class and a parameter list", () => {
    assert.deepEqual(
      parseAnchorTarget("InteriorPointArea.InteriorPointPolygon#intersectsHorizontalLine(Envelope,double)"),
      {
        file: "InteriorPointArea.java",
        className: "InteriorPointArea.InteriorPointPolygon",
        memberName: "intersectsHorizontalLine",
        paramTypes: ["Envelope", "double"],
      },
    );
  });

  it("parses a class-only anchor", () => {
    assert.deepEqual(parseAnchorTarget("Centroid"), {
      file: "Centroid.java",
      className: null,
      memberName: null,
      paramTypes: null,
    });
  });
});

describe("scanPortAnchors", () => {
  it("indexes each tag kind with its repo-relative path and line", () => {
    const root = fixtureRoot({
      "js/src/a.ts": [
        "/** @jts Centroid#getCentroid(Geometry) */",
        "export function getCentroid() {}",
        "/** @jts-deviate name collides with three other modules */",
        "export function x() {}",
      ].join("\n"),
      "rs/core/src/a.rs": [
        "/// @jts Centroid#getCentroid(Geometry)",
        "pub fn get_centroid() {}",
        "/// @jts-omit Centroid#area2(Coordinate,Coordinate,Coordinate) — unreachable",
        "/// @jts-adapter Assert.isTrue",
      ].join("\n"),
    });
    const anchors = scanPortAnchors(root);
    assert.deepEqual(
      anchors.map((a) => [a.kind, a.path, a.line]),
      [
        ["jts", "js/src/a.ts", 1],
        ["jts-deviate", "js/src/a.ts", 3],
        ["jts", "rs/core/src/a.rs", 1],
        ["jts-omit", "rs/core/src/a.rs", 3],
        ["jts-adapter", "rs/core/src/a.rs", 4],
      ],
    );
    assert.equal(anchors[0].target, "Centroid#getCentroid(Geometry)");
  });

  it("skips directories that do not exist", () => {
    assert.deepEqual(scanPortAnchors(fixtureRoot({})), []);
  });

  it("finds anchors in every ported module in both languages", () => {
    // Asserted by path rather than by total, so adding an anchor to a new
    // module does not break this test.
    const byPath = new Map();
    for (const a of scanPortAnchors(REPO_ROOT)) byPath.set(a.path, (byPath.get(a.path) ?? 0) + 1);
    for (const path of [
      "js/src/math/DD.ts",
      "js/src/algorithm/CGAlgorithmsDD.ts",
      "js/src/algorithm/Orientation.ts",
      "js/src/algorithm/InteriorPoint.ts",
      "js/src/algorithm/InteriorPointArea.ts",
      "js/src/algorithm/InteriorPointLine.ts",
      "js/src/algorithm/InteriorPointPoint.ts",
      "js/src/geom/Location.ts",
      "js/src/algorithm/RayCrossingCounter.ts",
      "js/src/algorithm/PointLocation.ts",
      "js/src/algorithm/locate/SimplePointInAreaLocator.ts",
      "rs/core/src/math/dd.rs",
      "rs/core/src/algorithm/cg_algorithms_dd.rs",
      "rs/core/src/algorithm/orientation.rs",
      "rs/core/src/algorithm/interior_point.rs",
      "rs/core/src/algorithm/interior_point_area.rs",
      "rs/core/src/algorithm/interior_point_line.rs",
      "rs/core/src/algorithm/interior_point_point.rs",
      "rs/core/src/geom/location.rs",
      "rs/core/src/algorithm/ray_crossing_counter.rs",
      "rs/core/src/algorithm/point_location.rs",
      "rs/core/src/algorithm/locate/simple_point_in_area_locator.rs",
    ]) {
      assert.ok((byPath.get(path) ?? 0) > 0, `${path} should carry @jts anchors`);
    }
  });

  it("records the deviate and adapter tags the ports carry", () => {
    const kinds = scanPortAnchors(REPO_ROOT).reduce((o, a) => ({ ...o, [a.kind]: (o[a.kind] ?? 0) + 1 }), {});
    assert.ok(kinds["jts"] > 0);
    // selfSubtract's dropped NaN guard in both languages (2), Rust's CentroidTest
    // module placement (1), the seven factory/getter-rule module-level factories per
    // language (14 — four getInteriorPoint, ScanLineYOrdinateFinder#getScanLineY,
    // and DimensionNonEmptyFilter, of which the last is one tag carrying two
    // anchors), less the two that the factory/getter rule double-counts, plus Rust's
    // odd-crossings test placement (1), plus the ring envelope sharing notes
    // per language (6 — InteriorPointPolygon's shellEnvelope field, scanRing's
    // env parameter, and ScanLineYOrdinateFinder's shellEnvelope parameter),
    // plus the locator port's four: SimplePointInAreaLocator#locateInGeometry's
    // GeometryCollectionIterator-to-recursion note and its MultiPolygon note,
    // in both languages. The world-test port adds one: the Rust world test's placement note
    // after its move into `rs/core/src/` to reach the gated locator modules. Plus one more:
    // `rs/core/src/test/mod.rs`'s module-placement note explaining why these tests
    // cannot live in `rs/core/tests/`.
    assert.equal(kinds["jts-deviate"], 28);
    // The geometry adapters (6 in TypeScript, 4 in Rust — Rust needs no
    // Coordinate or Envelope alias but does define its own ring envelope, since
    // geo's BoundingRect is a dev-dependency), the Assert shim's 3,
    // CoordinateSequence in both languages, Coordinate#equals2D in TypeScript,
    // CentroidTest's TOLERANCE and getArea() in both, and the JUnit-bound test
    // infrastructure GeometryTestCase and InteriorPointAreaPerfTest stand in
    // for, in both languages, plus the point-in-polygon stack's whole-geometry
    // envelope and point-in-envelope helpers, in both languages (4). The RayCrossingCounter port adds
    // four more: RayCrossingCounter#locatePointInRing(Coordinate,CoordinateSequence)
    // in both languages, and AbstractPointInRingTest's JUnit-shape note in both
    // languages' case-table test files. The locator port adds none: its two @jts-deviate
    // records are @jts-deviate, not @jts-adapter.
    assert.equal(kinds["jts-adapter"], 32);
  });
});

describe("checkAnchorsToJava", () => {
  const members = scanJavaDir(REPO_ROOT);

  it("accepts an anchor naming a real member", () => {
    const anchors = [{ kind: "jts", target: "Centroid#getCentroid(Geometry)", path: "js/src/a.ts", line: 1 }];
    assert.deepEqual(checkAnchorsToJava(anchors, REPO_ROOT), []);
  });

  it("rejects an anchor naming a file that is not vendored", () => {
    // IndexedPointInAreaLocator is a deliberate non-goal: the point-in-polygon
    // port covers SimplePointInAreaLocator only, so this class stays unpinned. It
    // replaced RayCrossingCounter here, which became a vendored file in this PR.
    const anchors = [
      {
        kind: "jts",
        target: "IndexedPointInAreaLocator#locate(Coordinate)",
        path: "js/src/a.ts",
        line: 1,
      },
    ];
    const violations = checkAnchorsToJava(anchors, REPO_ROOT);
    assert.equal(violations.length, 1);
    assert.equal(violations[0].kind, "unknown-java-file");
  });

  it("accepts an anchor naming a constant, which carries no parameter list", () => {
    // scanJavaDir only finds methods, so a `name(` probe cannot see these.
    const anchors = [
      { kind: "jts", target: "DD#SPLIT", path: "js/src/dd.ts", line: 1 },
      { kind: "jts", target: "Orientation#CLOCKWISE", path: "js/src/orientation.ts", line: 2 },
      { kind: "jts", target: "CGAlgorithmsDD#DP_SAFE_EPSILON", path: "js/src/cgAlgorithmsDD.ts", line: 3 },
    ];
    assert.deepEqual(checkAnchorsToJava(anchors, REPO_ROOT), []);
  });

  it("still rejects an anchor naming neither a method nor a field", () => {
    const anchors = [{ kind: "jts", target: "DD#NO_SUCH_CONSTANT", path: "js/src/dd.ts", line: 1 }];
    const violations = checkAnchorsToJava(anchors, REPO_ROOT);
    assert.equal(violations.length, 1);
    assert.equal(violations[0].kind, "unknown-member");
  });

  it("rejects an anchor naming a member the Java file does not contain", () => {
    const anchors = [{ kind: "jts", target: "Centroid#noSuchMember", path: "js/src/a.ts", line: 1 }];
    const violations = checkAnchorsToJava(anchors, REPO_ROOT);
    assert.equal(violations.length, 1);
    assert.equal(violations[0].kind, "unknown-member");
  });

  it("rejects a bare anchor for an overloaded member", () => {
    const anchors = [{ kind: "jts", target: "Centroid#add", path: "js/src/a.ts", line: 1 }];
    const violations = checkAnchorsToJava(anchors, REPO_ROOT);
    assert.equal(violations.length, 1);
    assert.match(violations[0].message, /overload/);
  });

  it("ignores prose-only tags", () => {
    const anchors = [
      { kind: "jts-deviate", target: "the geometry model has no filter interface", path: "js/src/a.ts", line: 1 },
      { kind: "jts-adapter", target: "Assert.isTrue", path: "js/src/a.ts", line: 2 },
    ];
    assert.deepEqual(checkAnchorsToJava(anchors, REPO_ROOT), []);
    void members;
  });
});

describe("checkJavaToAnchors", () => {
  const members = scanJavaDir(REPO_ROOT);

  // Every member of every vendored file: 52 from the five original files plus
  // Orientation's 4, CGAlgorithmsDD's 8, DD's 74, CentroidTest's 3,
  // InteriorPointTest's 8, and the point-in-polygon stack's 36 (Location 1,
  // PointLocation 5, RayCrossingCounter 8, SimplePointInAreaLocator 8,
  // AbstractPointInRingTest 7, RayCrossingCounterTest 4,
  // SimplePointInAreaLocatorTest 3). Narrowing to the ported subset is
  // portedMembers' job, exercised separately below.
  const ALL_MEMBERS = 185;

  it("reports every member as unported when no anchors exist", () => {
    assert.equal(checkJavaToAnchors(members, [], []).length, ALL_MEMBERS);
  });

  it("clears a member covered by an exact anchor", () => {
    const anchors = [{ kind: "jts", target: "Centroid#add(Polygon)", path: "js/src/a.ts", line: 1 }];
    const violations = checkJavaToAnchors(members, anchors, []);
    assert.equal(violations.length, ALL_MEMBERS - 1);
    assert.ok(!violations.some((v) => v.signature === "Centroid#add(Polygon)"));
  });

  it("clears a member recorded as deliberately omitted", () => {
    const anchors = [{ kind: "jts-omit", target: "Centroid#add(Polygon) — unreachable", path: "js/src/a.ts", line: 1 }];
    assert.ok(!checkJavaToAnchors(members, anchors, []).some((v) => v.signature === "Centroid#add(Polygon)"));
  });

  it("clears a member listed in anchorIgnore", () => {
    const ignored = ["Centroid#add(Polygon)"];
    assert.ok(!checkJavaToAnchors(members, [], ignored).some((v) => v.signature === "Centroid#add(Polygon)"));
  });

  it("only requires anchors for portedMembers when the file declares them", () => {
    const members = [
      {
        file: "DD.java",
        className: "DD",
        memberName: "signum",
        paramTypes: [],
        signature: "DD#signum()",
        startLine: 1,
      },
      { file: "DD.java", className: "DD", memberName: "sqrt", paramTypes: [], signature: "DD#sqrt()", startLine: 2 },
    ];
    const anchors = [{ kind: "jts", target: "DD#signum()", path: "js/src/dd.ts", line: 5 }];
    const ported = new Map([["DD.java", new Set(["DD#signum()"])]]);
    assert.deepEqual(checkJavaToAnchors(members, anchors, [], ported), []);
  });

  it("still requires every member of a file that declares no portedMembers", () => {
    const members = [
      {
        file: "DD.java",
        className: "DD",
        memberName: "signum",
        paramTypes: [],
        signature: "DD#signum()",
        startLine: 1,
      },
      { file: "DD.java", className: "DD", memberName: "sqrt", paramTypes: [], signature: "DD#sqrt()", startLine: 2 },
    ];
    const anchors = [{ kind: "jts", target: "DD#signum()", path: "js/src/dd.ts", line: 5 }];
    const violations = checkJavaToAnchors(members, anchors, [], new Map());
    assert.equal(violations.length, 1);
    assert.equal(violations[0].signature, "DD#sqrt()");
  });

  it("reports a portedMember that has no anchor", () => {
    const members = [
      {
        file: "DD.java",
        className: "DD",
        memberName: "signum",
        paramTypes: [],
        signature: "DD#signum()",
        startLine: 1,
      },
    ];
    const ported = new Map([["DD.java", new Set(["DD#signum()"])]]);
    const violations = checkJavaToAnchors(members, [], [], ported);
    assert.equal(violations.length, 1);
    assert.equal(violations[0].signature, "DD#signum()");
  });

  it("leaves a file without portedMembers fully in scope when another file declares them", () => {
    // The field is per-file: declaring it on DD.java must not narrow Centroid.java.
    const ported = new Map([["DD.java", new Set([])]]);
    const violations = checkJavaToAnchors(members, [], [], ported);
    const files = new Set(violations.map((v) => v.signature.split("#")[0]));
    assert.ok(!files.has("DD"), "DD declares an empty ported subset, so none of its members are in scope");
    assert.ok(files.has("Centroid"), "Centroid declares no subset, so all of its members stay in scope");
    assert.equal(violations.length, members.filter((m) => m.file !== "DD.java").length);
  });

  it("does not let a bare anchor cover an overloaded member", () => {
    const anchors = [{ kind: "jts", target: "Centroid#add", path: "js/src/a.ts", line: 1 }];
    const covered = checkJavaToAnchors(members, anchors, []).filter((v) => v.signature.startsWith("Centroid#add("));
    assert.equal(covered.length, 2);
  });

  it("lets a bare anchor cover a member whose name is unique in its file", () => {
    const anchors = [{ kind: "jts", target: "Centroid#area2", path: "js/src/a.ts", line: 1 }];
    assert.ok(!checkJavaToAnchors(members, anchors, []).some((v) => v.memberName === "area2"));
  });
});

describe("runAnchors", () => {
  // In scope: 52 from the five fully tracked files, plus the 45 members the
  // twelve partially ported files declare in portedMembers (Orientation 3,
  // CGAlgorithmsDD 4, DD 10, CentroidTest 2, InteriorPointTest 3,
  // SimplePointInAreaLocator 6, RayCrossingCounter 7, PointLocation 2,
  // AbstractPointInRingTest 6, RayCrossingCounterTest 1,
  // SimplePointInAreaLocatorTest 1; Location declares 3 constants, which
  // scanJavaDir never yields as members and which therefore contribute 0).
  //
  // The locator port added PointLocation's 2 and SimplePointInAreaLocator's 6, and drove
  // all 25 of JTS's AbstractPointInRingTest assertions through entry point 2
  // (SimplePointInAreaLocatorTest's 1), closing the port: 0 of the 97 in-scope
  // members are unported.
  it("reports the repository's current state: 97 in-scope members, 0 unported", () => {
    const { violations, counts } = runAnchors(REPO_ROOT);
    assert.equal(counts.members, 97);
    assert.equal(counts.unported, 0);
    assert.equal(violations.length, 0);
    assert.ok(counts.anchors > 0);
  });

  it("keeps a partially ported file's out-of-scope members out of the report", () => {
    const { violations } = runAnchors(REPO_ROOT);
    // DD's ten portedMembers are all anchored, and its other 63 are out of scope,
    // so DD contributes nothing either way.
    assert.deepEqual(
      violations.filter((v) => v.signature.startsWith("DD#")),
      [],
    );
    assert.ok(!violations.some((v) => v.signature === "DD#sqrt()"));
  });
});
