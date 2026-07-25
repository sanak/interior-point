#!/usr/bin/env node
import { REPO_ROOT } from "./jts-pin.mjs";
import { runAnchors } from "./jts-anchors.mjs";

export const USAGE = `Usage: node scripts/jts-sync.mjs <subcommand> [options]

Subcommands:
  check [--ref <ref>] [--diff]   Verify vendored files and compare them against upstream
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
