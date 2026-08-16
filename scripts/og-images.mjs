#!/usr/bin/env node
// Regenerates the Open Graph images from the real pages, in dark mode, at 1200x630.
//
// Unlike every other script in this directory this one is not a CI guard: it needs a browser and a
// network, so it is run by hand and its output is committed. See CLAUDE.md.

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

export const TARGETS = [
  { name: "docs", publish: "docs/site/public/og-image.png" },
  { name: "benchmark-table", publish: "examples/benchmark/public/og-image.png" },
  { name: "benchmark-map-table", publish: "examples/benchmark/public/og-image.png" },
];

/**
 * Turns argv into the two choices this script offers.
 *
 * `--write` is only accepted beside `--only` because the two benchmark targets publish to the same
 * path: without it, a run of every target would leave the second one on disk and no record of which.
 */
export function parseArgs(argv, names) {
  let only = null;
  let write = false;
  for (const arg of argv) {
    if (arg === "--write") {
      write = true;
    } else if (arg.startsWith("--only=")) {
      only = arg.slice("--only=".length);
      if (!names.includes(only)) {
        throw new Error(`unknown target: ${only}`);
      }
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (write && only === null) {
    throw new Error("--write requires --only");
  }
  return { only, write };
}

export function resolveOutputPath(target, write) {
  return write ? target.publish : `tmp/og/${target.name}.png`;
}

export { OG_WIDTH, OG_HEIGHT };
