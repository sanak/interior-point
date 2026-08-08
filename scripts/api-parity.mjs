import { readFileSync } from "node:fs";
import { join } from "node:path";

import { REPO_ROOT } from "./jts-pin.mjs";

/** The declaration every published name has to appear in. */
export const SURFACE_PATH = "scripts/api-surface.json";

/** The one file per target that names its whole published surface. */
export const SOURCES = {
  ts: "js/src/index.ts",
  rs: "rs/core/src/lib.rs",
  wasm: "rs/wasm/src/lib.rs",
};

export const TARGETS = ["ts", "rs", "wasm"];

/** Where a member records why it is deliberately absent from a target. */
const NOTE_KEYS = { ts: "tsNote", rs: "rsNote", wasm: "wasmNote" };

/**
 * Names re-exported by `export { … } from` and `export type { … } from`. A renamed
 * re-export publishes the name after `as`, which is the one that has to match.
 */
export function extractTsExports(source) {
  const names = new Set();
  for (const match of source.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}\s*from\s+/g)) {
    for (const part of match[1].split(",")) {
      const name = part
        .trim()
        .split(/\s+as\s+/)
        .pop()
        .trim();
      if (name) names.add(name);
    }
  }
  return names;
}

/**
 * Names the crate root publishes: the leaf of every `pub use …;`, brace groups
 * expanded, plus any item declared public in the file itself. `pub mod` is left out
 * — a public module is a namespace, not a member of the surface this compares.
 * `pub(crate)` never matches, because the space after `pub` is required.
 */
export function extractRustExports(source) {
  const names = new Set();
  for (const match of source.matchAll(/^\s*pub use\s+([^;]+);/gm)) {
    const path = match[1].trim();
    const braced = path.match(/\{([^}]*)\}\s*$/);
    for (const leaf of braced ? braced[1].split(",") : [path]) {
      const name = leaf.trim().split("::").pop().trim();
      if (name) names.add(name);
    }
  }
  for (const match of source.matchAll(/^\s*pub\s+(?:fn|struct|enum|trait|type|const|static)\s+(\w+)/gm)) {
    names.add(match[1]);
  }
  return names;
}

/** The JavaScript name wasm-bindgen publishes for each binding. */
export function extractWasmExports(source) {
  const names = new Set();
  for (const match of source.matchAll(/#\[wasm_bindgen\(js_name\s*=\s*"([^"]+)"\)\]/g)) {
    names.add(match[1]);
  }
  return names;
}

/**
 * Compares the declaration against what the sources actually export, in both
 * directions. A name declared but not exported is a stale declaration; a name
 * exported but not declared is a surface someone grew without deciding what the
 * other two targets should do about it. The second direction is the one that
 * catches a new function reaching one target and stopping there.
 */
export function checkSurface(surface, actual) {
  const problems = [];
  const members = surface?.members;
  if (!Array.isArray(members)) return [`${SURFACE_PATH} must hold a "members" array`];

  const declared = Object.fromEntries(TARGETS.map((target) => [target, new Set()]));

  members.forEach((member, index) => {
    const named = TARGETS.filter((target) => typeof member[target] === "string" && member[target] !== "");
    const label = named.length > 0 ? `\`${member[named[0]]}\`` : `entry ${index}`;
    for (const target of TARGETS) {
      if (!(target in member)) {
        problems.push(`${SURFACE_PATH}: ${label} is missing the "${target}" key`);
        continue;
      }
      const name = member[target];
      if (name === null) {
        const note = member[NOTE_KEYS[target]];
        if (typeof note !== "string" || note.trim() === "") {
          problems.push(
            `${SURFACE_PATH} marks ${label} absent for ${target} without a "${NOTE_KEYS[target]}" saying why`,
          );
        }
        continue;
      }
      if (typeof name !== "string" || name === "") {
        problems.push(`${SURFACE_PATH}: ${label}'s "${target}" has to be a name or null`);
        continue;
      }
      declared[target].add(name);
    }
    if (named.length === 0) {
      problems.push(`${SURFACE_PATH}: entry ${index} is absent from every target, so it declares nothing`);
    }
  });

  for (const target of TARGETS) {
    for (const name of declared[target]) {
      if (actual[target].has(name)) continue;
      problems.push(`${SURFACE_PATH} declares \`${name}\` for ${target}, but ${SOURCES[target]} does not export it`);
    }
    for (const name of actual[target]) {
      if (declared[target].has(name)) continue;
      problems.push(`${SOURCES[target]} exports \`${name}\`, which ${SURFACE_PATH} does not declare`);
    }
  }
  return problems;
}

export function readSurface(root = REPO_ROOT) {
  return JSON.parse(readFileSync(join(root, SURFACE_PATH), "utf8"));
}

export function readActual(root = REPO_ROOT) {
  const read = (target) => readFileSync(join(root, SOURCES[target]), "utf8");
  return {
    ts: extractTsExports(read("ts")),
    rs: extractRustExports(read("rs")),
    wasm: extractWasmExports(read("wasm")),
  };
}

export function runParity(root = REPO_ROOT) {
  const problems = checkSurface(readSurface(root), readActual(root));
  return { problems, counts: { problems: problems.length } };
}

function cmdParity(io) {
  const { problems, counts } = runParity(REPO_ROOT);
  io.out(`${counts.problems} API surface mismatch${counts.problems === 1 ? "" : "es"} found`);
  for (const problem of problems) io.out(`  ${problem}`);
  return problems.length === 0 ? 0 : 1;
}

export function main(io = {}) {
  const out = io.out ?? ((s) => console.log(s));
  const err = io.err ?? ((s) => console.error(s));
  try {
    return cmdParity({ out, err });
  } catch (error) {
    err(`api-parity: ${error.message}`);
    return 2;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = main();
}
