import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { REPO_ROOT } from "./jts-pin.mjs";

/**
 * Flags prose that cites something outside this repository: a machine-local design
 * doc (`§`), a numbered "task", a numbered "rule". This is the same shape of citation
 * that sent 104 comments to a dead end before the porting-rules retrofit — see
 * `docs/jts-porting-rules.md`. Derived by auditing the full 104-citation range rather
 * than guessed: three earlier drafts of this pattern each missed a real class of
 * citation, so narrowing it further without re-running that audit is not safe.
 */
export const CITATION_RE =
  /§(?!3\.1\.6)|\bplans?\b|\btasks?\s*\d|\bthe design\b|\bdesign's\b|\btasks?\s*$|\brules?[- ]\d/i;

/**
 * Whole directories exempt from the scan: `upstream/` is vendored JTS source, never
 * edited (see `upstream/jts/NOTICE.md`), and `docs/site/public/` is copied static /
 * binary assets. Neither holds prose this repository authored.
 */
const EXEMPT_DIRS = ["upstream/", "docs/site/public/"];

/**
 * This module and its test necessarily contain the vocabulary itself — as the
 * regex literal, in doc comments explaining it, and as example strings the tests
 * assert against — so they are exempt from their own scan. Nothing else gets this
 * exemption: a citation appearing anywhere else is real.
 */
const EXEMPT_FILES = new Set(["scripts/jts-citations.mjs", "scripts/test/jts-citations.test.mjs"]);

/**
 * `CITATION_RE`'s own `(?!3\.1\.6)` lookahead would silently wave through a
 * `§3.1.6` citation anywhere in the repository, not just in the two files that
 * actually cite RFC 7946 §3.1.6 (a public, permanent standard, unlike a design
 * doc). That would leave the exemption invisible and unbounded, so this check
 * re-tests every non-exempt-directory line for the literal section number,
 * independently of the lookahead, and only waves it through on the two lines
 * where it belongs. Anywhere else, `§3.1.6` is still a violation.
 */
const RFC_7946_SECTION_RE = /§3\.1\.6\b/;
const RFC_7946_FILES = new Set(["js/CHANGELOG.md", "js/test/interiorPoint.test.ts"]);

function isRfcExempt(path, line) {
  return RFC_7946_FILES.has(path) && RFC_7946_SECTION_RE.test(line);
}

/** Repo-relative, forward-slash-separated paths — what `git ls-files` reports. */
function trackedFiles(root) {
  const result = spawnSync("git", ["ls-files"], { cwd: root, encoding: "utf8" });
  if (result.error) throw new Error(`git ls-files failed: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`git ls-files exited ${result.status}: ${result.stderr}`);
  return result.stdout.split("\n").filter(Boolean);
}

/** A NUL byte is a cheap, reliable enough signal that a tracked file is not text. */
function looksBinary(buffer) {
  return buffer.includes(0);
}

/**
 * Scans every tracked file (minus the directory exemptions above) for the citation
 * vocabulary, line by line, and returns one violation per matching, non-exempt line.
 */
export function scanCitations(root = REPO_ROOT) {
  const violations = [];
  for (const path of trackedFiles(root)) {
    if (EXEMPT_DIRS.some((dir) => path.startsWith(dir))) continue;
    if (EXEMPT_FILES.has(path)) continue;
    let buffer;
    try {
      buffer = readFileSync(join(root, path));
    } catch {
      continue; // staged-but-missing on disk, or a dangling symlink
    }
    if (looksBinary(buffer)) continue;
    const lines = buffer.toString("utf8").split("\n");
    lines.forEach((line, index) => {
      const rogueRfcCitation = RFC_7946_SECTION_RE.test(line) && !isRfcExempt(path, line);
      if (!rogueRfcCitation && !CITATION_RE.test(line)) return;
      violations.push({ path, line: index + 1, text: line.trim() });
    });
  }
  return violations;
}

export function runCitations(root = REPO_ROOT) {
  const violations = scanCitations(root);
  return { violations, counts: { violations: violations.length } };
}

function cmdCitations(io) {
  const { violations, counts } = runCitations(REPO_ROOT);
  io.out(`${counts.violations} out-of-repo citation${counts.violations === 1 ? "" : "s"} found`);
  for (const v of violations) io.out(`  ${v.path}:${v.line}: ${v.text}`);
  return violations.length === 0 ? 0 : 1;
}

export function main(io = {}) {
  const out = io.out ?? ((s) => console.log(s));
  const err = io.err ?? ((s) => console.error(s));
  try {
    return cmdCitations({ out, err });
  } catch (error) {
    err(`jts-citations: ${error.message}`);
    return 2;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = main();
}
