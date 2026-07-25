#!/usr/bin/env node
import { parseArgs } from "node:util";

import { REPO_ROOT, readPin } from "./jts-pin.mjs";
import { runAnchors } from "./jts-anchors.mjs";
import { checkDrift, unifiedDiff } from "./jts-upstream.mjs";

export const USAGE = `Usage: node scripts/jts-sync.mjs <subcommand> [options]

Subcommands:
  check [--ref <ref>] [--diff]   Verify vendored files and compare them against upstream
                                 (--ref defaults to master, upstream's default branch)
  pull --ref <tag|sha>           Overwrite vendored files from upstream and update pin.json
  anchors                        Check @jts anchor integrity in both directions
  locate <path>:<line>           Print the ported counterpart of a Java line
  scaffold --lang ts|rs [--file <Name.java>]
                                 Emit anchored, empty-bodied skeletons from the vendored Java

Exit codes: 0 clean, 1 findings, 2 operational failure`;

function cmdAnchors(io) {
  const { violations, counts } = runAnchors(REPO_ROOT);
  io.out(`${counts.anchors} anchors, ${counts.members} method declarations, ${counts.unported} unported`);
  for (const violation of violations) io.out(`  ${violation.message}`);
  return violations.length === 0 ? 0 : 1;
}

/** locationtech/jts's default branch is `master`, not `main` — verified against the GitHub API 2026-07-26. */
export const DEFAULT_REF = "master";

async function cmdCheck(rest, io) {
  const { values } = parseArgs({
    args: rest,
    options: { ref: { type: "string", default: DEFAULT_REF }, diff: { type: "boolean", default: false } },
    strict: true,
  });
  const { tampered, drifted } = await checkDrift(REPO_ROOT, values.ref, io.fetchImpl);

  for (const entry of tampered) {
    io.out(`LOCALLY MODIFIED  ${entry.localPath} (expected ${entry.expected}, found ${entry.actual ?? "nothing"})`);
  }
  for (const entry of drifted) {
    io.out(`DRIFTED           ${entry.localPath}`);
    io.out(`                  local    ${entry.localSha ?? "missing"}`);
    io.out(`                  upstream ${entry.upstreamSha}`);
  }
  if (values.diff) {
    for (const entry of drifted) {
      const diff = unifiedDiff(entry.localPath, entry.bytes, REPO_ROOT);
      if (diff !== "") {
        io.out("");
        io.out("```diff");
        io.out(diff.trimEnd());
        io.out("```");
      }
    }
  }
  if (tampered.length === 0 && drifted.length === 0) {
    io.out(`no drift against ${values.ref} (${readPin(REPO_ROOT).files.length} files verified)`);
    return 0;
  }
  return 1;
}

export async function main(argv, io = {}) {
  const out = io.out ?? ((s) => console.log(s));
  const err = io.err ?? ((s) => console.error(s));
  const [subcommand, ...rest] = argv;

  if (subcommand === undefined) {
    err(USAGE);
    return 2;
  }
  if (subcommand === "--help" || subcommand === "-h" || subcommand === "help") {
    out(USAGE);
    return 0;
  }

  try {
    switch (subcommand) {
      case "check":
        return await cmdCheck(rest, { out, err, fetchImpl: io.fetchImpl });
      case "anchors":
        if (rest.length > 0) {
          err("jts-sync: anchors takes no arguments");
          return 2;
        }
        return cmdAnchors({ out, err });
      default:
        err(`jts-sync: unknown subcommand: ${subcommand}`);
        err(USAGE);
        return 2;
    }
  } catch (error) {
    err(`jts-sync: ${error.message}`);
    return 2;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await main(process.argv.slice(2));
}
