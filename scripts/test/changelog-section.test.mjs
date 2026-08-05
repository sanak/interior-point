import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { extractSection } from "../changelog-section.mjs";

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
