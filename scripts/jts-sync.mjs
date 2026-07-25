#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parseArgs } from "node:util";

import { REPO_ROOT, javaFiles, readPin, sha256, writePin } from "./jts-pin.mjs";
import { findEnclosingMember, scanJavaDir } from "./jts-java-scan.mjs";
import { parseAnchorTarget, runAnchors, scanPortAnchors } from "./jts-anchors.mjs";
import { checkDrift, fetchAllUpstream, unifiedDiff } from "./jts-upstream.mjs";
import { scaffold } from "./jts-scaffold.mjs";

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

const SHA_RE = /^[0-9a-f]{40}$/;
const TAG_RE = /^v?\d+\.\d+/;

/**
 * Fetches everything first, then writes — so a mid-run failure leaves the
 * working tree exactly as it was.
 */
export async function pullUpstream(root, ref, { fetchImpl, today } = {}) {
  const pin = readPin(root);
  const upstream = await fetchAllUpstream(pin, ref, fetchImpl ?? fetch);
  const written = [];
  for (const file of pin.files) {
    const bytes = upstream.get(file.upstreamPath);
    writeFileSync(join(root, file.localPath), bytes);
    file.sha256 = sha256(bytes);
    written.push(file.localPath);
  }
  // A tag also updates nearestTag; a bare sha carries no tag information, so nearestTag is left alone.
  pin.commit = ref;
  if (TAG_RE.test(ref)) pin.nearestTag = ref.replace(/^v/, "");
  pin.syncedAt = today ?? new Date().toISOString().slice(0, 10);
  writePin(pin, root);
  return { written, pin };
}

async function cmdPull(rest, io) {
  const { values } = parseArgs({ args: rest, options: { ref: { type: "string" } }, strict: true });
  if (values.ref === undefined) throw new Error("--ref is required for pull");
  const { written, pin } = await pullUpstream(REPO_ROOT, values.ref, { fetchImpl: io.fetchImpl });
  for (const path of written) io.out(`updated ${path}`);
  io.out(`pin.json now records commit ${pin.commit} (nearestTag ${pin.nearestTag}, syncedAt ${pin.syncedAt})`);
  if (!SHA_RE.test(pin.commit)) {
    io.out(`note: ${pin.commit} is not a 40-character sha — set pin.json's commit to the resolved sha by hand`);
  }
  io.out("review the result with: git diff upstream/");
  return 0;
}

export function locateMember(root, spec) {
  const separator = spec.lastIndexOf(":");
  if (separator === -1) throw new Error(`malformed location "${spec}" — expected <path>:<line>`);
  const line = Number(spec.slice(separator + 1));
  if (!Number.isInteger(line) || line < 1) throw new Error(`malformed location "${spec}" — expected <path>:<line>`);
  const file = basename(spec.slice(0, separator));

  const members = scanJavaDir(root);
  const member = findEnclosingMember(members, file, line);
  if (member === null) return null;

  const overloaded = members.filter((m) => m.file === member.file && m.memberName === member.memberName).length > 1;
  const counterparts = scanPortAnchors(root)
    .filter((anchor) => anchor.kind === "jts")
    .filter((anchor) => {
      const parsed = parseAnchorTarget(anchor.target);
      if (parsed.file !== member.file || parsed.memberName !== member.memberName) return false;
      if (parsed.className !== null && parsed.className !== member.className) return false;
      if (parsed.paramTypes === null) return !overloaded;
      return parsed.paramTypes.join(",") === member.paramTypes.join(",");
    })
    .map((anchor) => ({ path: anchor.path, line: anchor.line }));

  return { member, counterparts };
}

function cmdLocate(rest, io) {
  const [spec] = rest;
  if (spec === undefined) throw new Error("locate needs a location — expected <path>:<line>");
  const found = locateMember(REPO_ROOT, spec);
  if (found === null) {
    io.err(`jts-sync: no member encloses ${spec}`);
    return 1;
  }
  io.out(found.member.signature);
  const localPath = javaFiles(readPin(REPO_ROOT)).get(found.member.file);
  io.out(`  ${localPath}:${found.member.startLine}-${found.member.endLine}`);
  if (found.counterparts.length === 0) io.out("  (no ported counterpart)");
  for (const counterpart of found.counterparts) io.out(`  ${counterpart.path}:${counterpart.line}`);
  return 0;
}

function cmdScaffold(rest, io) {
  const { values } = parseArgs({
    args: rest,
    options: { lang: { type: "string" }, file: { type: "string" } },
    strict: true,
  });
  if (values.lang !== "ts" && values.lang !== "rs") throw new Error("--lang must be ts or rs");
  io.out(scaffold(REPO_ROOT, values.lang, values.file));
  return 0;
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
      case "pull":
        return await cmdPull(rest, { out, err, fetchImpl: io.fetchImpl });
      case "locate":
        return cmdLocate(rest, { out, err });
      case "scaffold":
        return cmdScaffold(rest, { out, err });
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
