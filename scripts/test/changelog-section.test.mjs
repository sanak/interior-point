import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import { extractSection, main } from "../changelog-section.mjs";

const CHANGELOG = `# Changelog

## [Unreleased]

### Added

- Something not yet released.

## [0.3.0] - 2026-08-05

### Added

- A published thing.

### Fixed

- A published fix.

## [0.3.0-rc.1] - 2026-08-04

- The candidate.

## 0.2.0

- The plain heading form.
`;

describe("extractSection", () => {
  it("returns the body of a bracketed heading carrying a date", () => {
    const body = extractSection(CHANGELOG, "0.3.0");
    assert.match(body, /A published thing\./);
    assert.match(body, /A published fix\./);
  });

  it("stops at the next second-level heading", () => {
    const body = extractSection(CHANGELOG, "0.3.0");
    assert.doesNotMatch(body, /The candidate\./);
    assert.doesNotMatch(body, /^## /m);
  });

  it("reads a heading written without brackets", () => {
    assert.match(extractSection(CHANGELOG, "0.2.0"), /The plain heading form\./);
  });

  it("reads a pre-release section", () => {
    assert.match(extractSection(CHANGELOG, "0.3.0-rc.1"), /The candidate\./);
  });

  it("does not let a release match its own pre-release", () => {
    const onlyCandidate = "# Changelog\n\n## [0.3.0-rc.1]\n\n- The candidate.\n";
    assert.throws(() => extractSection(onlyCandidate, "0.3.0"), /0\.3\.0/);
  });

  it("treats a dot as a literal, not as any character", () => {
    const lookalike = "# Changelog\n\n## [0x3y0]\n\n- Not the one.\n";
    assert.throws(() => extractSection(lookalike, "0.3.0"), /0\.3\.0/);
  });

  it("rejects a version that is absent", () => {
    assert.throws(() => extractSection(CHANGELOG, "9.9.9"), /9\.9\.9/);
  });

  it("rejects a heading with an empty body", () => {
    const empty = "# Changelog\n\n## [0.3.0]\n\n## [0.2.0]\n\n- Real.\n";
    assert.throws(() => extractSection(empty, "0.3.0"), /0\.3\.0/);
  });
});

const temps = [];
after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

/** Writes a changelog to a throwaway file, since `main` reads from disk rather than a string. */
function changelogFile(content = CHANGELOG) {
  const dir = mkdtempSync(join(tmpdir(), "changelog-section-"));
  temps.push(dir);
  const path = join(dir, "CHANGELOG.md");
  writeFileSync(path, content);
  return path;
}

/** Collects what `main` writes, so a failing run can be shown to have written nothing to stdout. */
function capture() {
  const out = [];
  const err = [];
  return { out, err, io: { out: (s) => out.push(s), err: (s) => err.push(s) } };
}

/**
 * Both release workflows invoke this CLI, not `extractSection`, and they redirect stdout into the
 * file that becomes the Release body. So the exit code is the whole contract: on any non-zero one
 * the redirect leaves an empty file behind, and only the code stops the run before a publish.
 */
describe("main", () => {
  it("writes the section and reports success", () => {
    const { out, err, io } = capture();
    assert.equal(main([changelogFile(), "0.3.0"], io), 0);
    assert.match(out.join("\n"), /A published thing\./);
    assert.deepEqual(err, []);
  });

  it("reports failure for an absent version without writing to stdout", () => {
    const { out, err, io } = capture();
    assert.equal(main([changelogFile(), "9.9.9"], io), 1);
    assert.deepEqual(out, []);
    assert.match(err.join("\n"), /no section for 9\.9\.9/);
  });

  it("reports failure for a heading with an empty body", () => {
    const path = changelogFile("# Changelog\n\n## [Unreleased]\n\n## [0.3.0]\n\n- Real.\n");
    const { out, err, io } = capture();
    assert.equal(main([path, "Unreleased"], io), 1);
    assert.deepEqual(out, []);
    assert.match(err.join("\n"), /empty section for Unreleased/);
  });

  it("reports failure for a changelog that is not there", () => {
    const { out, err, io } = capture();
    assert.equal(main([join(tmpdir(), "no-such-changelog.md"), "0.3.0"], io), 1);
    assert.deepEqual(out, []);
    assert.match(err.join("\n"), /changelog-section:/);
  });

  it("separates a usage error from a lookup failure", () => {
    for (const argv of [[], [changelogFile()]]) {
      const { out, err, io } = capture();
      assert.equal(main(argv, io), 2);
      assert.deepEqual(out, []);
      assert.match(err.join("\n"), /^usage: /);
    }
  });
});
