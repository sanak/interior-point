import { readFileSync } from "node:fs";

/**
 * Matches the heading that opens one version's section: `## [0.3.0]`,
 * `## [0.3.0] - 2026-08-05`, or `## 0.3.0`. The version is escaped rather than
 * interpolated raw, so a dot stands for itself alone, and the trailing boundary
 * is what keeps a request for `0.3.0` off the `0.3.0-rc.1` section.
 */
function headingPattern(version) {
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^## \\[?${escaped}\\]?(?:\\s|$)`);
}

/** The prose under one version's heading, up to the next second-level heading. */
export function extractSection(markdown, version) {
  const pattern = headingPattern(version);
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => pattern.test(line));
  if (start === -1) throw new Error(`no section for ${version}`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith("## "));
  const body = (end === -1 ? rest : rest.slice(0, end)).join("\n").trim();
  if (body === "") throw new Error(`empty section for ${version}`);
  return body;
}

export function main(argv, io = {}) {
  const out = io.out ?? ((s) => console.log(s));
  const err = io.err ?? ((s) => console.error(s));
  const [path, version] = argv;
  if (!path || !version) {
    err("usage: changelog-section.mjs <changelog> <version>");
    return 2;
  }
  try {
    out(extractSection(readFileSync(path, "utf8"), version));
    return 0;
  } catch (error) {
    err(`changelog-section: ${error.message}`);
    return 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = main(process.argv.slice(2));
}
