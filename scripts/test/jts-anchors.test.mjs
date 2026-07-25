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

  it("finds zero anchors in the repository today", () => {
    assert.deepEqual(scanPortAnchors(REPO_ROOT), []);
  });
});

describe("checkAnchorsToJava", () => {
  const members = scanJavaDir(REPO_ROOT);

  it("accepts an anchor naming a real member", () => {
    const anchors = [{ kind: "jts", target: "Centroid#getCentroid(Geometry)", path: "js/src/a.ts", line: 1 }];
    assert.deepEqual(checkAnchorsToJava(anchors, REPO_ROOT), []);
  });

  it("rejects an anchor naming a file that is not vendored", () => {
    // RayCrossingCounter is future work, so it is not pinned yet.
    const anchors = [
      {
        kind: "jts",
        target: "RayCrossingCounter#locatePointInRing(Coordinate,Coordinate[])",
        path: "js/src/a.ts",
        line: 1,
      },
    ];
    const violations = checkAnchorsToJava(anchors, REPO_ROOT);
    assert.equal(violations.length, 1);
    assert.equal(violations[0].kind, "unknown-java-file");
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
  // Orientation's 4, CGAlgorithmsDD's 8 and DD's 73. Narrowing to the ported
  // subset is portedMembers' job, exercised separately below.
  const ALL_MEMBERS = 137;

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
  // 52 from the five fully tracked files, plus the 17 members the three
  // partially ported files declare in portedMembers (3 + 4 + 10).
  it("reports the repository's current state: 0 anchors, 69 in-scope members, 69 unported", () => {
    const { violations, counts } = runAnchors(REPO_ROOT);
    assert.deepEqual(counts, { anchors: 0, members: 69, unported: 69 });
    assert.equal(violations.length, 69);
    assert.ok(violations.every((v) => v.kind === "unported"));
  });

  it("keeps a partially ported file's out-of-scope members out of the report", () => {
    const { violations } = runAnchors(REPO_ROOT);
    const dd = violations.filter((v) => v.signature.startsWith("DD#"));
    assert.equal(dd.length, 10, "only DD's ten portedMembers are in scope, not all 73");
    assert.ok(!violations.some((v) => v.signature === "DD#sqrt()"));
  });
});
