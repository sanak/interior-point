import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";

import { REPO_ROOT, javaFiles, readPin } from "./jts-pin.mjs";
import { scanJavaDir } from "./jts-java-scan.mjs";

export const PORT_DIRS = ["js/src", "js/test", "rs/core/src", "rs/core/tests", "rs/core/benches"];
const SOURCE_EXTENSIONS = [".ts", ".rs"];
const ANCHOR_RE = /@jts(-deviate|-omit|-adapter)?(?:\s+(.*?))?\s*(?:\*\/)?\s*$/;
const RESOLVING_KINDS = new Set(["jts", "jts-omit"]);

export function parseAnchorTarget(target) {
  const head = target
    .trim()
    .split(/\s+—\s+|\s+--\s+/)[0]
    .trim();
  const hash = head.indexOf("#");
  const classPart = hash === -1 ? head : head.slice(0, hash);
  const file = `${classPart.split(".")[0]}.java`;
  const className = classPart.includes(".") ? classPart : null;
  if (hash === -1) return { file, className, memberName: null, paramTypes: null };
  const memberPart = head.slice(hash + 1);
  const open = memberPart.indexOf("(");
  if (open === -1) return { file, className, memberName: memberPart, paramTypes: null };
  const memberName = memberPart.slice(0, open);
  const inner = memberPart.slice(open + 1, memberPart.lastIndexOf(")"));
  const paramTypes = inner.trim() === "" ? [] : inner.split(",").map((t) => t.trim());
  return { file, className, memberName, paramTypes };
}

function walkSourceFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...walkSourceFiles(full));
    else if (SOURCE_EXTENSIONS.some((ext) => entry.endsWith(ext))) found.push(full);
  }
  return found;
}

export function scanPortAnchors(root = REPO_ROOT, dirs = PORT_DIRS) {
  const anchors = [];
  for (const dir of dirs) {
    const full = join(root, dir);
    if (!existsSync(full)) continue;
    for (const file of walkSourceFiles(full).sort()) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((text, index) => {
        const match = ANCHOR_RE.exec(text);
        if (!match) return;
        anchors.push({
          kind: `jts${match[1] ?? ""}`,
          target: (match[2] ?? "").trim(),
          path: relative(root, file).split(sep).join("/"),
          line: index + 1,
        });
      });
    }
  }
  return anchors;
}

/** True when the Java file holds more than one member of this name. */
function isOverloaded(members, file, memberName) {
  return members.filter((m) => m.file === file && m.memberName === memberName).length > 1;
}

/**
 * True when the Java source declares a field of this name. `scanJavaDir` only
 * finds methods, and a constant such as `DD#SPLIT` or `Orientation#CLOCKWISE`
 * carries no parameter list, so a method-shaped `name(` probe cannot see it.
 * Anchoring a constant is worth supporting: `SPLIT = 2^27+1` is exactly the kind
 * of magic number whose provenance the anchors exist to record.
 */
function declaresField(source, memberName) {
  return new RegExp(`\\b${memberName}\\s*=`).test(source);
}

export function checkAnchorsToJava(anchors, root = REPO_ROOT) {
  const members = scanJavaDir(root);
  const vendored = javaFiles(readPin(root));
  const violations = [];
  for (const anchor of anchors) {
    if (anchor.kind !== "jts") continue;
    const parsed = parseAnchorTarget(anchor.target);
    const localPath = vendored.get(parsed.file);
    if (localPath === undefined) {
      violations.push({
        kind: "unknown-java-file",
        message: `${anchor.path}:${anchor.line}: @jts ${anchor.target} names ${parsed.file}, which is not vendored`,
        path: anchor.path,
        line: anchor.line,
      });
      continue;
    }
    const javaPath = join(root, localPath);
    if (parsed.memberName === null) continue;
    // Strict direction: the Java source must literally contain
    // `<member>(` — or, for a constant, declare a field of that name.
    const source = readFileSync(javaPath, "utf8");
    if (!source.includes(`${parsed.memberName}(`) && !declaresField(source, parsed.memberName)) {
      violations.push({
        kind: "unknown-member",
        message: `${anchor.path}:${anchor.line}: @jts ${anchor.target} names no member of ${parsed.file}`,
        path: anchor.path,
        line: anchor.line,
      });
      continue;
    }
    if (parsed.paramTypes === null && isOverloaded(members, parsed.file, parsed.memberName)) {
      violations.push({
        kind: "unknown-member",
        message: `${anchor.path}:${anchor.line}: @jts ${anchor.target} is an overload and must name its parameter types`,
        path: anchor.path,
        line: anchor.line,
      });
    }
  }
  return violations;
}

function anchorCovers(parsed, member, overloaded) {
  if (parsed.file !== member.file) return false;
  if (parsed.memberName !== member.memberName) return false;
  if (parsed.className !== null && parsed.className !== member.className) return false;
  if (parsed.paramTypes === null) return !overloaded;
  return parsed.paramTypes.join(",") === member.paramTypes.join(",");
}

export function checkJavaToAnchors(members, anchors, anchorIgnore = [], portedMembers = new Map()) {
  const resolving = anchors.filter((a) => RESOLVING_KINDS.has(a.kind)).map((a) => parseAnchorTarget(a.target));
  const ignored = new Set(anchorIgnore);
  const violations = [];
  for (const member of members) {
    if (ignored.has(member.signature)) continue;
    // A file that declares portedMembers is a deliberate partial port: only the
    // listed members are in scope. Files without the field require full coverage.
    const scope = portedMembers.get(member.file);
    if (scope !== undefined && !scope.has(member.signature)) continue;
    const overloaded = isOverloaded(members, member.file, member.memberName);
    if (resolving.some((parsed) => anchorCovers(parsed, member, overloaded))) continue;
    violations.push({
      kind: "unported",
      message: `${member.file}:${member.startLine}: ${member.signature} has no @jts anchor and no @jts-omit`,
      signature: member.signature,
      memberName: member.memberName,
    });
  }
  return violations;
}

export function runAnchors(root = REPO_ROOT) {
  const pin = readPin(root);
  const portedMembers = new Map();
  for (const file of pin.files) {
    if (file.portedMembers === undefined) continue;
    portedMembers.set(basename(file.localPath), new Set(file.portedMembers));
  }
  const members = scanJavaDir(root);
  const anchors = scanPortAnchors(root);
  const strict = checkAnchorsToJava(anchors, root);
  const heuristic = checkJavaToAnchors(members, anchors, pin.anchorIgnore, portedMembers);
  // Counting only in-scope members keeps the reported total meaningful: a partial
  // port's 63 out-of-scope members are not a coverage denominator.
  const inScope = members.filter((m) => {
    const scope = portedMembers.get(m.file);
    return scope === undefined || scope.has(m.signature);
  }).length;
  return {
    violations: [...strict, ...heuristic],
    counts: { anchors: anchors.length, members: inScope, unported: heuristic.length },
  };
}
