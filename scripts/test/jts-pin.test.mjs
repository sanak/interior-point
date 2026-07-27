import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import { PIN_PATH, REPO_ROOT, javaFiles, readPin, sha256, verifyVendored, writePin } from "../jts-pin.mjs";

const temps = [];
function tempRoot() {
  const dir = mkdtempSync(join(tmpdir(), "jts-sync-"));
  temps.push(dir);
  return dir;
}
after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

describe("sha256", () => {
  it("matches the known digest of the empty input", () => {
    assert.equal(sha256(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("hashes a Buffer and its utf8 string identically", () => {
    assert.equal(sha256(Buffer.from("abc", "utf8")), sha256("abc"));
  });
});

describe("readPin", () => {
  it("reads the repository's real pin", () => {
    const pin = readPin();
    assert.equal(pin.commit, "123a182e6e5a9cc8caed8ff037e4f824a5ce74ee");
    assert.equal(pin.nearestTag, "1.20.0");
    assert.equal(pin.files.length, 20);
    assert.deepEqual(pin.anchorIgnore, []);
  });
});

describe("javaFiles", () => {
  it("maps vendored java basenames to their local paths", () => {
    const pin = {
      files: [
        { localPath: "upstream/jts/algorithm/Centroid.java" },
        { localPath: "upstream/jts/math/DD.java" },
        { localPath: "upstream/jts/resources/testdata/world.wkt" },
      ],
    };
    const map = javaFiles(pin);
    assert.equal(map.get("Centroid.java"), "upstream/jts/algorithm/Centroid.java");
    assert.equal(map.get("DD.java"), "upstream/jts/math/DD.java");
    assert.equal(map.has("world.wkt"), false);
  });

  it("covers every java file the repository pins", () => {
    const map = javaFiles(readPin());
    assert.deepEqual(
      [...map.keys()].sort(),
      readPin()
        .files.filter((f) => f.localPath.endsWith(".java"))
        .map((f) => f.localPath.split("/").at(-1))
        .sort(),
    );
  });
});

describe("verifyVendored", () => {
  it("reports every vendored file in the repository as ok", () => {
    const results = verifyVendored(readPin());
    assert.deepEqual(
      results.filter((r) => r.status !== "ok"),
      [],
    );
    assert.equal(results.length, 20);
  });

  it("records a ported member subset for each partially ported file", () => {
    const byPath = new Map(readPin().files.map((f) => [f.localPath, f]));
    assert.equal(byPath.get("upstream/jts/main/algorithm/Orientation.java").portedMembers.length, 3);
    assert.equal(byPath.get("upstream/jts/main/algorithm/CGAlgorithmsDD.java").portedMembers.length, 4);
    assert.equal(byPath.get("upstream/jts/main/math/DD.java").portedMembers.length, 10);
    // The five fully tracked files declare no subset, so every member stays in scope.
    assert.equal(byPath.get("upstream/jts/main/algorithm/Centroid.java").portedMembers, undefined);
    assert.equal(byPath.get("upstream/jts/main/geom/Location.java").portedMembers.length, 3);
    assert.equal(byPath.get("upstream/jts/main/algorithm/RayCrossingCounter.java").portedMembers.length, 7);
    assert.equal(byPath.get("upstream/jts/main/algorithm/PointLocation.java").portedMembers.length, 2);
    assert.equal(
      byPath.get("upstream/jts/main/algorithm/locate/SimplePointInAreaLocator.java").portedMembers.length,
      6,
    );
    assert.equal(byPath.get("upstream/jts/test/algorithm/AbstractPointInRingTest.java").portedMembers.length, 6);
    assert.equal(byPath.get("upstream/jts/test/algorithm/RayCrossingCounterTest.java").portedMembers.length, 1);
    assert.equal(
      byPath.get("upstream/jts/test/algorithm/locate/SimplePointInAreaLocatorTest.java").portedMembers.length,
      1,
    );
  });

  it("reports a locally edited file as modified", () => {
    const root = tempRoot();
    mkdirSync(join(root, "upstream/jts/algorithm"), { recursive: true });
    writeFileSync(join(root, "upstream/jts/algorithm/A.java"), "tampered");
    const pin = {
      files: [{ upstreamPath: "u/A.java", localPath: "upstream/jts/algorithm/A.java", sha256: sha256("original") }],
    };
    assert.deepEqual(verifyVendored(pin, root), [
      {
        localPath: "upstream/jts/algorithm/A.java",
        expected: sha256("original"),
        actual: sha256("tampered"),
        status: "modified",
      },
    ]);
  });

  it("reports an absent file as missing", () => {
    const root = tempRoot();
    const pin = {
      files: [{ upstreamPath: "u/B.java", localPath: "upstream/jts/algorithm/B.java", sha256: "deadbeef" }],
    };
    assert.deepEqual(verifyVendored(pin, root), [
      { localPath: "upstream/jts/algorithm/B.java", expected: "deadbeef", actual: null, status: "missing" },
    ]);
  });
});

describe("writePin", () => {
  it("round-trips and emits Prettier-compatible JSON", () => {
    const root = tempRoot();
    mkdirSync(join(root, "upstream/jts"), { recursive: true });
    const pin = readPin();
    pin.syncedAt = "2026-01-02";
    writePin(pin, root);
    const text = readFileSync(join(root, PIN_PATH), "utf8");
    assert.ok(text.endsWith("}\n"), "must end with exactly one trailing newline");
    assert.ok(text.includes('\n  "commit":'), "must use two-space indentation");
    assert.deepEqual(readPin(root), pin);
  });
});

describe("REPO_ROOT", () => {
  it("points at the repository root", () => {
    assert.ok(readFileSync(join(REPO_ROOT, "pnpm-workspace.yaml"), "utf8").includes("packages:"));
  });
});
