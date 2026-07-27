import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import { REPO_ROOT } from "../jts-pin.mjs";
import { CITATION_RE, runCitations, scanCitations } from "../jts-citations.mjs";

const temps = [];
after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

/**
 * Builds a throwaway git repo containing the given repo-relative files, so
 * `scanCitations`' `git ls-files` call has something real to report. The files
 * are added but left uncommitted — `git ls-files` reports staged files too.
 */
function fixtureRoot(files) {
  const root = mkdtempSync(join(tmpdir(), "jts-citations-"));
  temps.push(root);
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  execFileSync("git", ["add", "-A"], { cwd: root });
  return root;
}

describe("CITATION_RE", () => {
  it("matches a bare section-symbol citation", () => {
    assert.ok(CITATION_RE.test("see design doc §2.4 for the rationale"));
  });

  it("does not match the RFC 7946 section it is built to exempt", () => {
    assert.ok(!CITATION_RE.test("RFC 7946 §3.1.6 requires polygon rings to be closed"));
  });

  it("matches a bare plan/plans reference", () => {
    assert.ok(CITATION_RE.test("see the plan for details"));
    assert.ok(CITATION_RE.test("per the plans doc"));
  });

  it("matches a numbered task", () => {
    assert.ok(CITATION_RE.test("this is task 12 in the tracker"));
  });

  it("matches a task reference at end of line", () => {
    assert.ok(CITATION_RE.test("carried over from an earlier task"));
  });

  it("matches 'the design' and \"design's\"", () => {
    assert.ok(CITATION_RE.test("as the design intended"));
    assert.ok(CITATION_RE.test("the design's rationale"));
  });

  it("matches a numbered rule in either separator form", () => {
    assert.ok(CITATION_RE.test("per rule 3 above"));
    assert.ok(CITATION_RE.test("the rule-3 extension"));
  });

  it("does not match a rule cited by name", () => {
    assert.ok(!CITATION_RE.test("per the overload-suffix rule"));
    assert.ok(!CITATION_RE.test("this is the unchanged-name rule"));
  });
});

describe("scanCitations", () => {
  it("finds nothing in a clean repo", () => {
    const root = fixtureRoot({ "README.md": "# Hello\n\nNothing to see here.\n" });
    assert.deepEqual(scanCitations(root), []);
  });

  it("flags a section-symbol citation", () => {
    const root = fixtureRoot({ "js/src/a.ts": "// see design doc §2.4\nexport const x = 1;\n" });
    const violations = scanCitations(root);
    assert.equal(violations.length, 1);
    assert.equal(violations[0].line, 1);
  });

  it("flags a bare plan/plans reference", () => {
    const root = fixtureRoot({ "js/src/a.ts": "// follow the plan here\n" });
    assert.equal(scanCitations(root).length, 1);
  });

  it("flags a numbered task", () => {
    const root = fixtureRoot({ "js/src/a.ts": "// see task 7 for context\n" });
    assert.equal(scanCitations(root).length, 1);
  });

  it("flags 'the design' and \"design's\"", () => {
    const root = fixtureRoot({
      "js/src/a.ts": "// as the design says\n// the design's rationale\n",
    });
    assert.equal(scanCitations(root).length, 2);
  });

  it("flags a numbered rule in either separator form", () => {
    const root = fixtureRoot({ "js/src/a.ts": "// per rule 3\n// the rule-1 exception\n" });
    assert.equal(scanCitations(root).length, 2);
  });

  it("exempts RFC 7946 §3.1.6 only in the two files where it is cited", () => {
    const root = fixtureRoot({
      "js/CHANGELOG.md": "RFC 7946 §3.1.6 requires polygon rings to be closed.\n",
      "js/test/algorithm/InteriorPointTest.ts": "// §3.1.6 requires polygon rings to be closed.\n",
      "js/src/other.ts": "// §3.1.6 requires polygon rings to be closed.\n",
    });
    const violations = scanCitations(root);
    assert.deepEqual(
      violations.map((v) => v.path),
      ["js/src/other.ts"],
    );
  });

  it("exempts upstream/ and docs/site/public/ entirely", () => {
    const root = fixtureRoot({
      "upstream/jts/Foo.java": "// per the design §9\n",
      "docs/site/public/foo.txt": "// per the design §9\n",
      "docs/other.md": "// per the design §9\n",
    });
    const violations = scanCitations(root);
    assert.deepEqual(
      violations.map((v) => v.path),
      ["docs/other.md"],
    );
  });

  it("skips binary files instead of throwing", () => {
    const root = fixtureRoot({ "js/src/blob.bin": Buffer.from([0, 1, 2, 3]) });
    assert.deepEqual(scanCitations(root), []);
  });

  it("exempts its own module and test, which cite the vocabulary as an example", () => {
    const root = fixtureRoot({
      "scripts/jts-citations.mjs": "// per rule 3, see the design's plan for task 9\n",
      "scripts/test/jts-citations.test.mjs": "// per rule 3, see the design's plan for task 9\n",
      "scripts/other.mjs": "// per rule 3, see the design's plan for task 9\n",
    });
    const violations = scanCitations(root);
    assert.deepEqual(
      violations.map((v) => v.path),
      ["scripts/other.mjs"],
    );
  });

  it("reports the repository's current tree as clean", () => {
    assert.deepEqual(scanCitations(REPO_ROOT), []);
  });
});

describe("runCitations", () => {
  it("counts violations alongside the list", () => {
    const root = fixtureRoot({ "js/src/a.ts": "// per rule 3\n" });
    const { violations, counts } = runCitations(root);
    assert.equal(violations.length, 1);
    assert.equal(counts.violations, 1);
  });
});
