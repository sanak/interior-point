import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { REPO_ROOT } from "./jts-pin.mjs";

/**
 * Compiles and runs the TypeScript and Rust examples in this repository's Markdown, and
 * checks every `// =>` against what the code actually produces.
 *
 * The whole thing rests on one property of the examples as written: what follows `// =>`
 * is already a valid expression in the language of the block it annotates. `[1, 5]` is a
 * TypeScript expression; `Some(Coord { x: 1.0, y: 5.0 })` is a Rust one. So an example
 * needs no separate expected-value file — the comment is the assertion, and the
 * translation to one is mechanical.
 *
 * The two languages are not checked to the same depth. Rust examples become a real crate
 * and go through `cargo`, so a mistyped call fails to build. TypeScript examples run under
 * tsx, which erases types without checking them — deliberately, because the examples pass
 * bare object literals where a `Geometry` is expected and annotating every one of them to
 * satisfy `tsc` would make the documentation worse to read. The TypeScript half therefore
 * catches wrong values and runtime errors, not type errors.
 *
 * `rs/core/README.md` is exempt: `rs/core/src/lib.rs` pulls it in with `include_str!`, so
 * `cargo test --doc` already compiles and runs it.
 */

/** Vendored JTS sources and copied static assets — no prose this repository authored. */
const EXEMPT_DIRS = ["upstream/", "docs/site/public/"];

/**
 * `rs/core/README.md` reaches the same guarantee by a shorter route: `lib.rs` carries
 * `#![doc = include_str!("../README.md")]`, which makes its example a doctest. Running it
 * here as well would compile it twice and let the two copies disagree about which one is
 * authoritative.
 */
const EXEMPT_FILES = new Set(["rs/core/README.md"]);

/** Info strings that mark a block this script owns, mapped to the language it generates. */
const LANGUAGES = new Map([
  ["typescript", "typescript"],
  ["ts", "typescript"],
  ["rust", "rust"],
  ["rs", "rust"],
]);

/** The crates an example may `use`. Anything else is a typo or an unstated dependency. */
const ALLOWED_RUST_CRATES = new Set(["geo_types", "interior_point"]);

/** The one module an example may import from. The generated program rewrites it to `js/src`. */
const TS_PACKAGE = "interior-point";

class DocsExampleError extends Error {}

function fail(location, message) {
  throw new DocsExampleError(`${location}: ${message}`);
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

/**
 * Fenced blocks whose info string names a language this script runs, in document order.
 * `line` is 1-based and points at the opening fence, so an error can be clicked.
 */
export function extractBlocks(markdown) {
  const lines = markdown.split("\n");
  const blocks = [];
  let open = null;
  lines.forEach((text, index) => {
    const fence = /^```(\S*)\s*$/.exec(text);
    if (!fence) {
      if (open) open.lines.push({ text, line: index + 1 });
      return;
    }
    if (open) {
      blocks.push(open);
      open = null;
      return;
    }
    const language = LANGUAGES.get(fence[1].toLowerCase());
    if (language) open = { language, line: index + 1, lines: [] };
    else open = { language: null, line: index + 1, lines: [] };
  });
  return blocks.filter((block) => block.language !== null);
}

// ---------------------------------------------------------------------------
// Statement splitting
// ---------------------------------------------------------------------------

/**
 * Splits a line into the code before any `//` and the comment after it, skipping over
 * double-quoted strings so a `//` inside one is not mistaken for a comment. Both
 * languages agree on this much of their lexical grammar; nothing in the examples needs
 * more (no block comments, no raw strings, no char literals).
 */
export function splitComment(text) {
  let inString = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") i += 1;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "/" && text[i + 1] === "/") return { code: text.slice(0, i), comment: text.slice(i + 2) };
  }
  return { code: text, comment: null };
}

/** Net bracket depth contributed by a run of code, strings excluded. */
function depthDelta(code) {
  let delta = 0;
  let inString = false;
  for (let i = 0; i < code.length; i += 1) {
    const ch = code[i];
    if (inString) {
      if (ch === "\\") i += 1;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "(" || ch === "[" || ch === "{") delta += 1;
    else if (ch === ")" || ch === "]" || ch === "}") delta -= 1;
  }
  return delta;
}

/** The text after `// =>`, or `null` when the comment is ordinary prose. */
function expectationOf(comment) {
  if (comment === null) return null;
  const match = /^\s*=>(.*)$/.exec(comment);
  return match ? match[1].trim() : null;
}

/**
 * Rejects an expectation that is not a single expression. A comma outside every bracket
 * is the signal: `[1, 5]`'s comma is nested, while `[1, 5], because the centroid is on an
 * edge` has one at the top level, where neither language accepts it. Explanations belong
 * in the prose around the block or in an ordinary comment on its own line.
 */
function checkExpectation(value, location) {
  if (value === "") fail(location, "`// =>` carries no value");
  let depth = 0;
  let inString = false;
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (inString) {
      if (ch === "\\") i += 1;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "(" || ch === "[" || ch === "{") depth += 1;
    else if (ch === ")" || ch === "]" || ch === "}") depth -= 1;
    else if (ch === "," && depth === 0)
      fail(location, `\`// =>\` holds one value and nothing else, but this one has a comma outside brackets: ${value}`);
    if (depth < 0) fail(location, `unbalanced brackets in \`// =>\`: ${value}`);
  }
  if (depth !== 0) fail(location, `unbalanced brackets in \`// =>\`: ${value}`);
  return value;
}

/**
 * Groups a block's lines into statements, each ending at a `;` outside every bracket, and
 * attaches the `// =>` that annotates it. Both placements bind to the same statement: at
 * the end of the line that completes it, or alone on the line after. The second is what a
 * multi-line call needs, since its closing `});` is a poor place to hang a value.
 */
export function splitStatements(block, path) {
  const statements = [];
  let buffer = [];
  let depth = 0;
  let trailing = null;
  let openedAt = null;

  for (const { text, line } of block.lines) {
    const location = `${path}:${line}`;
    const { code, comment } = splitComment(text);
    const expectation = expectationOf(comment);
    const hasCode = code.trim() !== "";

    if (!hasCode) {
      if (expectation === null) continue;
      if (buffer.length > 0) fail(location, "`// =>` interrupts an unfinished statement");
      const previous = statements[statements.length - 1];
      if (!previous) fail(location, "`// =>` has no statement before it");
      if (previous.expect !== null) fail(location, "the statement before this `// =>` already has one");
      previous.expect = checkExpectation(expectation, location);
      continue;
    }

    if (buffer.length === 0) openedAt = line;
    buffer.push(code.replace(/\s+$/, ""));
    depth += depthDelta(code);
    if (expectation !== null) trailing = { value: expectation, location };

    if (depth !== 0 || !code.trimEnd().endsWith(";")) {
      if (trailing) fail(trailing.location, "`// =>` interrupts an unfinished statement");
      continue;
    }
    statements.push({
      text: buffer.join("\n"),
      line: openedAt,
      expect: trailing === null ? null : checkExpectation(trailing.value, trailing.location),
    });
    buffer = [];
    trailing = null;
  }

  if (buffer.length > 0) fail(`${path}:${openedAt}`, "statement is never terminated by `;`");
  return statements;
}

// ---------------------------------------------------------------------------
// Statement classification
// ---------------------------------------------------------------------------

const TS_BINDING_RE = /^(?:const|let)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=/;
const RUST_BINDING_RE = /^let\s+(?:mut\s+)?([A-Za-z_][\w]*)\s*(?::[^=]+)?=/;
const TS_IMPORT_RE = /^import\s*\{([^}]*)\}\s*from\s*"([^"]+)";$/;
const RUST_USE_GROUP_RE = /^use\s+([A-Za-z_][\w:]*?)::\{([^}]*)\};$/;
const RUST_USE_SINGLE_RE = /^use\s+([A-Za-z_][\w]*)((?:::[A-Za-z_][\w]*)+);$/;

/** `console.log(x);` unwrapped to `x`, or `null` when the statement is something else. */
function unwrapConsoleLog(text) {
  const prefix = "console.log(";
  if (!text.startsWith(prefix) || !text.endsWith(");")) return null;
  const inner = text.slice(prefix.length, -2);
  return depthDelta(inner) === 0 ? inner.trim() : null;
}

/** The names an `import` brings in, checked against the one module an example may use. */
function parseTsImport(text, location) {
  const match = TS_IMPORT_RE.exec(text);
  if (!match) fail(location, `unsupported import form — write \`import { a, b } from "${TS_PACKAGE}";\`: ${text}`);
  if (match[2] !== TS_PACKAGE) fail(location, `examples may only import from "${TS_PACKAGE}", not "${match[2]}"`);
  return match[1]
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
}

/** A `use` expanded to one fully qualified path per item, so duplicates collapse by string. */
function parseRustUse(text, location) {
  const group = RUST_USE_GROUP_RE.exec(text);
  if (group) {
    const crate = group[1].split("::")[0];
    if (!ALLOWED_RUST_CRATES.has(crate)) fail(location, `examples may not \`use\` the \`${crate}\` crate`);
    return group[2]
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean)
      .map((name) => `${group[1]}::${name}`);
  }
  const single = RUST_USE_SINGLE_RE.exec(text);
  if (!single) fail(location, `unsupported use form: ${text}`);
  if (!ALLOWED_RUST_CRATES.has(single[1])) fail(location, `examples may not \`use\` the \`${single[1]}\` crate`);
  return [`${single[1]}${single[2]}`];
}

/**
 * Turns one statement into the lines the generated program runs. A binding is kept and
 * asserted on by name, because later blocks in the same file go on using it; anything
 * else with an expectation becomes the assertion itself, `console.log` included — the
 * examples print to show a value, and the generated program checks it instead.
 */
function emitStatement(statement, language, path) {
  const location = `${path}:${statement.line}`;
  const text = statement.text.trim();
  const assertEq =
    language === "rust"
      ? (actual, expected) => `assert_eq!(${actual}, ${expected});`
      : (actual, expected) => `assert.deepStrictEqual(${actual}, ${expected});`;

  const binding = (language === "rust" ? RUST_BINDING_RE : TS_BINDING_RE).exec(text);
  if (binding) return statement.expect === null ? [text] : [text, assertEq(binding[1], statement.expect)];

  if (statement.expect === null) return [text];

  const logged = language === "typescript" ? unwrapConsoleLog(text) : null;
  const actual = logged ?? text.replace(/;$/, "");
  if (actual.trim() === "") fail(location, "nothing to check against this `// =>`");
  return [assertEq(actual, statement.expect)];
}

// ---------------------------------------------------------------------------
// Program generation
// ---------------------------------------------------------------------------

/**
 * Concatenates every block of one language in one file into a single program. The blocks
 * of a page are written to be read in order — a later one goes on using a binding an
 * earlier one introduced — so joining them is what makes the page's own narrative the
 * thing under test, rather than each fragment in isolation.
 */
export function buildProgram({ path, language, blocks, srcUrl }) {
  const imports = new Set();
  const body = [];
  let assertions = 0;

  for (const block of blocks) {
    for (const statement of splitStatements(block, path)) {
      const text = statement.text.trim();
      const isImport = language === "rust" ? text.startsWith("use ") : text.startsWith("import ");
      if (isImport) {
        const location = `${path}:${statement.line}`;
        if (statement.expect !== null) fail(location, "an import cannot carry a `// =>`");
        const names = language === "rust" ? parseRustUse(text, location) : parseTsImport(text, location);
        for (const name of names) imports.add(name);
        continue;
      }
      if (statement.expect !== null) assertions += 1;
      body.push(...emitStatement(statement, language, path));
    }
  }

  const source =
    language === "rust" ? renderRust(imports, body) : renderTypeScript(imports, body, srcUrl, path, blocks);
  return { path, language, blocks: blocks.length, assertions, source };
}

function renderRust(imports, body) {
  // Every expectation on an `Option<Coord<f64>>` names `Coord`, whether or not the example
  // it came from had to import it. Redundant with a documented `use` — the set absorbs that.
  const uses = [...new Set([...imports, "geo_types::Coord"])].sort();
  return [
    "// Generated by scripts/docs-examples.mjs. Edit the Markdown, not this file.",
    "#![allow(unused_imports, unused_variables)]",
    ...uses.map((path) => `use ${path};`),
    "",
    "fn main() {",
    ...body.map((line) => line.replace(/^/gm, "    ")),
    "}",
    "",
  ].join("\n");
}

function renderTypeScript(imports, body, srcUrl, path, blocks) {
  if (imports.size === 0 && blocks.length > 0) {
    // Not a hard error on its own, but every TypeScript example here calls the library.
    fail(path, "no `import` from the package — the generated program would test nothing");
  }
  const names = [...imports].sort();
  return [
    "// Generated by scripts/docs-examples.mjs. Edit the Markdown, not this file.",
    'import assert from "node:assert/strict";',
    `import { ${names.join(", ")} } from ${JSON.stringify(srcUrl)};`,
    "",
    ...body,
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Collection
// ---------------------------------------------------------------------------

/** Repo-relative, forward-slash-separated paths — what `git ls-files` reports. */
function trackedMarkdown(root) {
  const result = spawnSync("git", ["ls-files", "*.md"], { cwd: root, encoding: "utf8" });
  if (result.error) throw new Error(`git ls-files failed: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`git ls-files exited ${result.status}: ${result.stderr}`);
  return result.stdout.split("\n").filter(Boolean);
}

/** One program per (file, language) pair that has at least one block, in path order. */
export function collectPrograms(root = REPO_ROOT) {
  const srcUrl = pathToFileURL(join(root, "js", "src", "index.ts")).href;
  const programs = [];
  for (const path of trackedMarkdown(root)) {
    if (EXEMPT_DIRS.some((dir) => path.startsWith(dir))) continue;
    if (EXEMPT_FILES.has(path)) continue;
    const blocks = extractBlocks(readFileSync(join(root, path), "utf8"));
    for (const language of ["typescript", "rust"]) {
      const matching = blocks.filter((block) => block.language === language);
      if (matching.length === 0) continue;
      programs.push(buildProgram({ path, language, blocks: matching, srcUrl }));
    }
  }
  return programs;
}

/** A filename stem unique per program, since the Rust crate puts them all in one `src/bin`. */
export function programSlug(program) {
  return `${program.path.replace(/\.md$/, "").replace(/[^A-Za-z0-9]+/g, "_")}_${program.language}`;
}

// ---------------------------------------------------------------------------
// Running
// ---------------------------------------------------------------------------

/** Writes only when the content differs, so cargo's mtime check does not rebuild the world. */
function writeIfChanged(file, content) {
  try {
    if (readFileSync(file, "utf8") === content) return;
  } catch {
    // absent or unreadable — write it
  }
  writeFileSync(file, content);
}

/**
 * Runs the TypeScript programs under tsx, against `js/src` rather than a build of it. The
 * import specifier the examples show is rewritten to a file URL, which is how `js/test`
 * already reaches the library, so nothing has to be built first. `js/` is the working
 * directory because that is where `--import tsx` resolves from.
 */
function runTypeScript(programs, root, io) {
  const dir = mkdtempSync(join(tmpdir(), "docs-examples-"));
  try {
    let failures = 0;
    for (const program of programs) {
      const file = join(dir, `${programSlug(program)}.ts`);
      writeFileSync(file, program.source);
      const result = spawnSync(process.execPath, ["--import", "tsx", file], {
        cwd: join(root, "js"),
        encoding: "utf8",
      });
      failures += report(program, result, io, file);
    }
    return failures;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Runs the Rust programs as bins of a throwaway crate with a path dependency on `rs/core`.
 * The crate lives under `rs/target`, which is ignored by git and picked up by the CI Rust
 * cache, so the second run compiles nothing. Its own `[workspace]` table keeps cargo from
 * reading it as a stray member of the workspace it sits inside.
 */
function runRust(programs, root, io) {
  const crate = join(root, "rs", "target", "docs-examples", "crate");
  const target = join(root, "rs", "target", "docs-examples", "target");
  mkdirSync(join(crate, "src", "bin"), { recursive: true });
  writeIfChanged(
    join(crate, "Cargo.toml"),
    [
      "# Generated by scripts/docs-examples.mjs.",
      "[package]",
      'name = "docs-examples"',
      'version = "0.0.0"',
      'edition = "2024"',
      "publish = false",
      "",
      "[dependencies]",
      `interior-point = { path = ${JSON.stringify(join(root, "rs", "core"))} }`,
      'geo-types = "0.7"',
      "",
      "[workspace]",
      "",
    ].join("\n"),
  );

  let failures = 0;
  for (const program of programs) {
    const slug = programSlug(program);
    const file = join(crate, "src", "bin", `${slug}.rs`);
    writeIfChanged(file, program.source);
    const result = spawnSync("cargo", ["run", "--quiet", "--bin", slug], {
      cwd: crate,
      encoding: "utf8",
      env: { ...process.env, CARGO_TARGET_DIR: target },
    });
    failures += report(program, result, io, file);
  }
  return failures;
}

function report(program, result, io, generated) {
  const label = `${program.path} [${program.language}]`;
  const counts = `${program.blocks} block${program.blocks === 1 ? "" : "s"}, ${program.assertions} assertion${
    program.assertions === 1 ? "" : "s"
  }`;
  if (result.error) {
    io.err(`FAIL ${label}: ${result.error.message}`);
    return 1;
  }
  if (result.status === 0) {
    io.out(`ok   ${label} — ${counts}`);
    return 0;
  }
  io.err(`FAIL ${label} — ${counts}`);
  io.err(`     generated program: ${generated}`);
  for (const line of `${result.stdout}${result.stderr}`.split("\n")) if (line !== "") io.err(`     ${line}`);
  return 1;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export function parseArgs(argv) {
  const options = { only: null };
  for (const arg of argv) {
    const match = /^--only=(.+)$/.exec(arg);
    if (!match) throw new DocsExampleError(`unknown argument: ${arg}`);
    if (match[1] !== "ts" && match[1] !== "rust") throw new DocsExampleError(`--only takes \`ts\` or \`rust\``);
    options.only = match[1] === "ts" ? "typescript" : "rust";
  }
  return options;
}

export function main(io = {}, argv = process.argv.slice(2), root = REPO_ROOT) {
  const out = io.out ?? ((s) => console.log(s));
  const err = io.err ?? ((s) => console.error(s));
  try {
    const { only } = parseArgs(argv);
    const programs = collectPrograms(root).filter((p) => only === null || p.language === only);
    if (programs.length === 0) {
      err("docs-examples: no example programs found");
      return 2;
    }
    let failures = 0;
    const typescript = programs.filter((p) => p.language === "typescript");
    const rust = programs.filter((p) => p.language === "rust");
    if (typescript.length > 0) failures += runTypeScript(typescript, root, { out, err });
    if (rust.length > 0) failures += runRust(rust, root, { out, err });
    const total = programs.reduce((sum, p) => sum + p.assertions, 0);
    out(`${programs.length} program${programs.length === 1 ? "" : "s"}, ${total} assertions, ${failures} failing`);
    return failures === 0 ? 0 : 1;
  } catch (error) {
    if (error instanceof DocsExampleError) {
      err(`docs-examples: ${error.message}`);
      return 1;
    }
    err(`docs-examples: ${error.message}`);
    return 2;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = main();
}

export { DocsExampleError };
