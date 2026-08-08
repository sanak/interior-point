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
 * Names re-exported by `export { … } from` and `export type { … } from`, plus the
 * names of items the file declares and exports itself. A renamed re-export publishes
 * the name after `as`, which is the one that has to match.
 *
 * `export * from "…"` names nothing here: what it publishes lives in the file it
 * points at, and following that would mean resolving the whole module graph. Rather
 * than pass a file whose surface it cannot see, this throws.
 */
export function extractTsExports(source) {
  const names = new Set();
  for (const match of source.matchAll(/export\s+\*\s*(?:as\s+(\w+)\s+)?from\s+/g)) {
    if (!match[1]) {
      throw new Error(
        `${SOURCES.ts} uses \`export * from\`, whose names cannot be read statically; ` +
          `re-export each name explicitly so this check can see the surface`,
      );
    }
    names.add(match[1]); // `export * as ns from` publishes the one namespace name
  }
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
  const declaration =
    /export\s+(?:declare\s+)?(?:async\s+)?(?:function\*?|const|let|var|class|type|interface|enum)\s+(\w+)/g;
  for (const match of source.matchAll(declaration)) {
    names.add(match[1]);
  }
  return names;
}

/**
 * Names the crate root publishes: the leaf of every `pub use …;`, brace groups
 * expanded, plus any item declared public in the file itself. `pub mod` is left out
 * — a public module is a namespace, not a member of the surface this compares.
 * `pub(crate)` never matches, because the space after `pub` is required.
 *
 * `pub mod` is therefore the way a crate's surface grows past this check: everything
 * public inside such a module — `pub mod cli` and all of it, under the `cli` feature —
 * is reachable from outside the crate without any name of it reaching here.
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

/**
 * The item a `#[wasm_bindgen]` attribute is applied to, skipping any further
 * attributes and any doc or line comment between the two.
 */
const WASM_ITEM_RE = /^(?:\s*(?:#\[[^\]]*\]|\/\/[^\n]*))*\s*pub\s+(fn|struct|enum)\s+(\w+)/;

/** wasm-bindgen's own snake_case-to-camelCase conversion for a function name. */
function toCamelCase(name) {
  return name.replace(/_+([a-zA-Z0-9])/g, (_, first) => first.toUpperCase());
}

/**
 * The JavaScript name wasm-bindgen publishes for each binding. `js_name` can sit
 * anywhere in the attribute's argument list, alongside arguments such as
 * `skip_typescript` on either side of it; `[^)]*` keeps the search from spanning
 * past that one attribute's closing `)]`.
 *
 * An attribute carrying no `js_name` — bare, or with arguments of another kind —
 * publishes the item that follows it just the same, under the name wasm-bindgen
 * derives from the Rust one: a function's snake_case becomes camelCase, while a
 * type keeps the name it was written with.
 */
export function extractWasmExports(source) {
  const names = new Set();
  for (const match of source.matchAll(/#\[wasm_bindgen(?:\(([^)]*)\))?\]/g)) {
    const jsName = (match[1] ?? "").match(/js_name\s*=\s*"([^"]+)"/);
    if (jsName) {
      names.add(jsName[1]);
      continue;
    }
    const item = source.slice(match.index + match[0].length).match(WASM_ITEM_RE);
    if (item) names.add(item[1] === "fn" ? toCamelCase(item[2]) : item[2]);
  }
  return names;
}

/**
 * Compares the declaration against what the sources actually export, in both
 * directions. A name declared but not exported is a stale declaration; a name
 * exported but not declared is a surface someone grew without deciding what the
 * other two targets should do about it. The second direction is the one that
 * catches a new function reaching one target and stopping there.
 *
 * Two members claiming one name for one target is rejected as well: a set would
 * hold the name once either way, so the copy would sit there declaring nothing.
 */
export function checkSurface(surface, actual) {
  const problems = [];
  const members = surface?.members;
  if (!Array.isArray(members)) return [`${SURFACE_PATH} must hold a "members" array`];

  // name -> the label of the member that claimed it first.
  const declared = Object.fromEntries(TARGETS.map((target) => [target, new Map()]));

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
      const claimant = declared[target].get(name);
      if (claimant !== undefined) {
        problems.push(`${SURFACE_PATH}: ${label} and ${claimant} both declare \`${name}\` for ${target}`);
        continue;
      }
      declared[target].set(name, label);
    }
    if (named.length === 0) {
      problems.push(`${SURFACE_PATH}: entry ${index} is absent from every target, so it declares nothing`);
    }
  });

  for (const target of TARGETS) {
    for (const name of declared[target].keys()) {
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
