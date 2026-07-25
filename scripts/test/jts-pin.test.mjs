import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import { PIN_PATH, REPO_ROOT, readPin, sha256, verifyVendored, writePin } from "../jts-pin.mjs";

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
    assert.equal(pin.files.length, 8);
    assert.deepEqual(pin.anchorIgnore, []);
  });
});

describe("verifyVendored", () => {
  it("reports every vendored file in the repository as ok", () => {
    const results = verifyVendored(readPin());
    assert.deepEqual(
      results.filter((r) => r.status !== "ok"),
      [],
    );
    assert.equal(results.length, 8);
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
