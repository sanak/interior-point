import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildProgram,
  collectPrograms,
  extractBlocks,
  parseArgs,
  programSlug,
  splitComment,
  splitStatements,
} from "../docs-examples.mjs";

/** `splitStatements` wants the shape `extractBlocks` produces, with 1-based line numbers. */
function block(language, source, firstLine = 1) {
  return {
    language,
    line: firstLine - 1,
    lines: source.split("\n").map((text, index) => ({ text, line: firstLine + index })),
  };
}

function statements(language, source) {
  return splitStatements(block(language, source), "doc.md");
}

/** The message alone — every failure is reported as `path:line: what went wrong`. */
function reason(fn) {
  try {
    fn();
  } catch (error) {
    return error.message;
  }
  return null;
}

describe("extractBlocks", () => {
  it("keeps only the two languages it runs", () => {
    const blocks = extractBlocks(
      ["```bash", "npm i", "```", "```typescript", "const a = 1;", "```", "```toml", "x = 1", "```"].join("\n"),
    );
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].language, "typescript");
  });

  it("accepts the short info strings as well", () => {
    const blocks = extractBlocks(["```ts", "a;", "```", "```rs", "b;", "```"].join("\n"));
    assert.deepEqual(
      blocks.map((b) => b.language),
      ["typescript", "rust"],
    );
  });

  it("reports the line of the opening fence, so an error can be clicked", () => {
    const blocks = extractBlocks(["# Title", "", "```rust", "let a = 1;", "```"].join("\n"));
    assert.equal(blocks[0].line, 3);
    assert.deepEqual(blocks[0].lines, [{ text: "let a = 1;", line: 4 }]);
  });

  it("does not treat the contents of an unrun block as fences", () => {
    const blocks = extractBlocks(["```bash", "echo '```typescript'", "```", "```ts", "a;", "```"].join("\n"));
    assert.equal(blocks.length, 1);
    assert.deepEqual(blocks[0].lines, [{ text: "a;", line: 5 }]);
  });

  it("accepts a fence whose info string carries a code-group tab title", () => {
    const blocks = extractBlocks(
      [
        "::: code-group",
        "",
        "```typescript [TypeScript]",
        "a;",
        "```",
        "",
        "```rust [Rust]",
        "let b = 1;",
        "```",
        "",
        ":::",
      ].join("\n"),
    );
    assert.deepEqual(
      blocks.map((b) => b.language),
      ["typescript", "rust"],
    );
    assert.deepEqual(blocks[0].lines, [{ text: "a;", line: 4 }]);
    assert.deepEqual(blocks[1].lines, [{ text: "let b = 1;", line: 8 }]);
  });
});

describe("splitComment", () => {
  it("splits at the first `//`", () => {
    assert.deepEqual(splitComment("a; // => 1"), { code: "a; ", comment: " => 1" });
  });

  it("does not see a `//` inside a string", () => {
    assert.deepEqual(splitComment('const url = "https://example.com";'), {
      code: 'const url = "https://example.com";',
      comment: null,
    });
  });

  it("handles an escaped quote before a real comment", () => {
    assert.deepEqual(splitComment('const s = "a\\"b"; // => "a\\"b"'), {
      code: 'const s = "a\\"b"; ',
      comment: ' => "a\\"b"',
    });
  });
});

describe("splitStatements", () => {
  it("binds a trailing `// =>` to the statement on its line", () => {
    const found = statements("typescript", "interiorPoint(null); // => null");
    assert.deepEqual(found, [{ text: "interiorPoint(null);", line: 1, expect: "null" }]);
  });

  it("binds a `// =>` on its own line to the statement before it", () => {
    const found = statements("typescript", ["const point = f(x);", "// => [1, 5]"].join("\n"));
    assert.equal(found.length, 1);
    assert.equal(found[0].expect, "[1, 5]");
  });

  it("keeps a multi-line statement together and reports the line it opened on", () => {
    const found = statements("typescript", ["interiorPoint({", '  type: "Polygon",', "});", "// => [1, 5]"].join("\n"));
    assert.equal(found.length, 1);
    assert.equal(found[0].line, 1);
    assert.equal(found[0].text, ["interiorPoint({", '  type: "Polygon",', "});"].join("\n"));
    assert.equal(found[0].expect, "[1, 5]");
  });

  it("does not end a statement at a `;` nested inside brackets", () => {
    const found = statements("rust", ["let a = f(vec![", "    (0.0, 0.0),", "]);"].join("\n"));
    assert.equal(found.length, 1);
  });

  it("ends a statement only after the trailing method call closes it", () => {
    const found = statements(
      "rust",
      ["let t: Geometry<f64> = Polygon::new(", "    vec![],", ")", ".into();"].join("\n"),
    );
    assert.equal(found.length, 1);
    assert.equal(found[0].text, ["let t: Geometry<f64> = Polygon::new(", "    vec![],", ")", ".into();"].join("\n"));
  });

  it("drops ordinary comments and blank lines", () => {
    const found = statements("typescript", ["// an explanation", "", "f(a); // => 1"].join("\n"));
    assert.deepEqual(found, [{ text: "f(a);", line: 3, expect: "1" }]);
  });

  it("does not mistake a `//` inside a string for an expectation", () => {
    const found = statements("typescript", 'const u = "http://e.com"; // => undefined');
    assert.equal(found[0].expect, "undefined");
    assert.equal(found[0].text, 'const u = "http://e.com";');
  });

  it("rejects a `// =>` with nothing before it", () => {
    assert.match(
      reason(() => statements("typescript", "// => 1")),
      /doc\.md:1: `\/\/ =>` has no statement before it/,
    );
  });

  it("rejects a second `// =>` on one statement", () => {
    const source = ["f(a);", "// => 1", "// => 2"].join("\n");
    assert.match(
      reason(() => statements("typescript", source)),
      /doc\.md:3: .*already has one/,
    );
  });

  it("rejects a `// =>` that interrupts an unfinished statement", () => {
    const source = ["f({", "  // => 1", "});"].join("\n");
    assert.match(
      reason(() => statements("typescript", source)),
      /doc\.md:2: .*unfinished statement/,
    );
  });

  it("rejects a statement that never ends", () => {
    assert.match(
      reason(() => statements("typescript", "f({")),
      /doc\.md:1: statement is never terminated/,
    );
  });
});

describe("the `// =>` convention", () => {
  it("rejects prose after the value, which a comma outside brackets gives away", () => {
    const source = "f(t); // => [2, 2], the centroid, which lies inside";
    assert.match(
      reason(() => statements("typescript", source)),
      /has a comma outside brackets/,
    );
  });

  it("accepts a comma nested inside brackets", () => {
    assert.equal(statements("typescript", "f(a); // => [1, 5]")[0].expect, "[1, 5]");
    assert.equal(
      statements("rust", "f(a); // => Some(Coord { x: 1.0, y: 5.0 })")[0].expect,
      "Some(Coord { x: 1.0, y: 5.0 })",
    );
  });

  it("accepts a comma inside a string", () => {
    assert.equal(statements("typescript", 'f(a); // => "a, b"')[0].expect, '"a, b"');
  });

  it("rejects an empty value", () => {
    assert.match(
      reason(() => statements("typescript", "f(a); // =>")),
      /carries no value/,
    );
  });

  it("rejects unbalanced brackets", () => {
    assert.match(
      reason(() => statements("typescript", "f(a); // => [5")),
      /unbalanced brackets/,
    );
    assert.match(
      reason(() => statements("typescript", "f(a); // => 5]")),
      /unbalanced brackets/,
    );
  });
});

describe("buildProgram, TypeScript", () => {
  const src = "file:///repo/js/src/index.ts";
  const build = (...sources) =>
    buildProgram({
      path: "doc.md",
      language: "typescript",
      blocks: sources.map((source) => block("typescript", source)),
      srcUrl: src,
    });

  it("merges the imports of every block into one, deduplicated and sorted", () => {
    const program = build(
      'import { interiorPoint } from "interior-point";\nconst a = interiorPoint(null);',
      'import { isVerified, interiorPoint } from "interior-point";\nisVerified(a); // => false',
    );
    assert.match(
      program.source,
      /^import \{ interiorPoint, isVerified \} from "file:\/\/\/repo\/js\/src\/index\.ts";$/m,
    );
  });

  it("rewrites the package specifier to the source tree, so nothing has to be built", () => {
    const program = build('import { interiorPoint } from "interior-point";\ninteriorPoint(null); // => null');
    assert.ok(!program.source.includes('from "interior-point"'));
    assert.ok(program.source.includes(src));
  });

  it("refuses an import from anywhere else", () => {
    assert.match(
      reason(() => build('import { readFileSync } from "node:fs";\nreadFileSync("x");')),
      /may only import from "interior-point"/,
    );
  });

  it("checks the value a `console.log` was printing instead of printing it", () => {
    const program = build(
      'import { interiorPoint } from "interior-point";\nconsole.log(interiorPoint(g));\n// => [1, 5]',
    );
    assert.ok(program.source.includes("assert.deepStrictEqual(interiorPoint(g), [1, 5]);"));
    assert.ok(!program.source.includes("console.log"));
  });

  it("keeps a binding and asserts on its name, since later blocks go on using it", () => {
    const program = build(
      'import { interiorPoint } from "interior-point";\nconst point = interiorPoint(g);\n// => [1, 5]',
    );
    assert.ok(program.source.includes("const point = interiorPoint(g);"));
    assert.ok(program.source.includes("assert.deepStrictEqual(point, [1, 5]);"));
  });

  it("counts the blocks joined and the assertions generated", () => {
    const program = build(
      'import { interiorPoint } from "interior-point";\nconst a = interiorPoint(null);',
      "interiorPoint(a); // => null\ninteriorPoint(a); // => null",
    );
    assert.equal(program.blocks, 2);
    assert.equal(program.assertions, 2);
  });

  it("refuses a page whose examples never reach the library", () => {
    assert.match(
      reason(() => build("const a = 1;")),
      /no `import` from the package/,
    );
  });
});

describe("buildProgram, Rust", () => {
  const build = (...sources) =>
    buildProgram({ path: "doc.md", language: "rust", blocks: sources.map((s) => block("rust", s)) });

  it("expands a grouped `use` to one path per item and drops the duplicates", () => {
    const program = build(
      "use geo_types::{Geometry, LineString};\nlet a = 1;",
      "use geo_types::{LineString, Polygon};\nlet b = 2;",
    );
    assert.ok(program.source.includes("use geo_types::Geometry;"));
    assert.ok(program.source.includes("use geo_types::Polygon;"));
    assert.equal(program.source.match(/use geo_types::LineString;/g).length, 1);
  });

  it("adds `Coord`, which every expectation on an `Option<Coord>` names", () => {
    const program = build("use interior_point::interior_point;\ninterior_point(&g); // => None");
    assert.ok(program.source.includes("use geo_types::Coord;"));
  });

  it("refuses a `use` of a crate the examples do not depend on", () => {
    assert.match(
      reason(() => build("use serde_json::Value;\nlet a = 1;")),
      /may not `use` the `serde_json` crate/,
    );
  });

  it("wraps the body in a `main`, since a bin is what cargo runs", () => {
    const program = build("use interior_point::interior_point;\nlet p = interior_point(&g);\n// => None");
    assert.match(program.source, /fn main\(\) \{\n {4}let p = interior_point\(&g\);\n {4}assert_eq!\(p, None\);\n\}/);
  });

  it("leaves a statement that already asserts exactly as written", () => {
    const program = build(
      "use interior_point::verify_interior_point;\nassert!(verify_interior_point(p, g).is_verified());",
    );
    assert.ok(program.source.includes("    assert!(verify_interior_point(p, g).is_verified());"));
  });

  it("indents every line of a multi-line statement", () => {
    const program = build("use geo_types::Polygon;\nlet a = Polygon::new(\n    vec![],\n);");
    assert.ok(program.source.includes("    let a = Polygon::new(\n        vec![],\n    );"));
  });
});

describe("parseArgs", () => {
  it("runs both languages by default", () => {
    assert.deepEqual(parseArgs([]), { only: null });
  });

  it("maps the CLI spelling to the language name", () => {
    assert.deepEqual(parseArgs(["--only=ts"]), { only: "typescript" });
    assert.deepEqual(parseArgs(["--only=rust"]), { only: "rust" });
  });

  it("rejects an unknown flag rather than ignoring it", () => {
    assert.throws(() => parseArgs(["--all"]), /unknown argument: --all/);
    assert.throws(() => parseArgs(["--only=go"]), /--only takes/);
  });
});

describe("programSlug", () => {
  it("is a valid identifier and unique per file and language", () => {
    assert.equal(programSlug({ path: "docs/site/api/index.md", language: "rust" }), "docs_site_api_index_rust");
    assert.notEqual(
      programSlug({ path: "docs/site/index.md", language: "rust" }),
      programSlug({ path: "docs/site/index.md", language: "typescript" }),
    );
  });
});

describe("collectPrograms, against this repository", () => {
  const programs = collectPrograms();

  it("finds a program for every documented pair of file and language", () => {
    assert.deepEqual(
      programs.map((p) => `${p.path} [${p.language}]`),
      [
        "docs/site/api/index.md [typescript]",
        "docs/site/api/index.md [rust]",
        "docs/site/index.md [typescript]",
        "docs/site/index.md [rust]",
        "js/README.md [typescript]",
      ],
    );
  });

  it("leaves `rs/core/README.md` to the doctest that already runs it", () => {
    assert.ok(!programs.some((p) => p.path === "rs/core/README.md"));
  });

  it("checks at least one value in every program it builds", () => {
    for (const program of programs) assert.ok(program.assertions > 0, `${program.path} [${program.language}]`);
  });
});
