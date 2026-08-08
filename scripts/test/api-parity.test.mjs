import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  SOURCES,
  SURFACE_PATH,
  checkSurface,
  extractRustExports,
  extractTsExports,
  extractWasmExports,
  runParity,
} from "../api-parity.mjs";

const TS_SOURCE = `export { interiorPoint } from "./algorithm/InteriorPoint.ts";
export { verifyInteriorPoint, Verification } from "./VerifyInteriorPoint.ts";
export { inner as outer } from "./Renamed.ts";
export type { Coordinate } from "./GeometryAdapter.ts";
`;

const RS_SOURCE = `mod algorithm;
pub mod cli;
pub use algorithm::interior_point::interior_point;
pub use verify_interior_point::{Verification, verify_interior_point};
pub enum Exposed {}
pub(crate) fn hidden() {}
`;

const WASM_SOURCE = `#[wasm_bindgen(js_name = "interiorPoint")]
pub fn interior_point_wasm() {}

#[wasm_bindgen(js_name = "verifyInteriorPoint")]
pub fn verify_interior_point_wasm() {}
`;

/** Builds the `actual` argument `checkSurface` takes, from plain arrays. */
function actualOf({ ts = [], rs = [], wasm = [] }) {
  return { ts: new Set(ts), rs: new Set(rs), wasm: new Set(wasm) };
}

describe("extractTsExports", () => {
  it("reads value and type re-exports alike", () => {
    const names = extractTsExports(TS_SOURCE);
    assert.ok(names.has("interiorPoint"));
    assert.ok(names.has("Verification"));
    assert.ok(names.has("Coordinate"));
  });

  it("takes the outward name of a renamed re-export", () => {
    const names = extractTsExports(TS_SOURCE);
    assert.ok(names.has("outer"));
    assert.ok(!names.has("inner"));
  });

  it("reads a function declared and exported in the file itself", () => {
    assert.ok(extractTsExports(`export function helper() {}\n`).has("helper"));
  });

  it("reads a locally declared type alias, class and constant", () => {
    const source = `export type Verdict = string;\nexport class Box {}\nexport const LIMIT = 1;\n`;
    const names = extractTsExports(source);
    assert.deepEqual([...names].sort(), ["Box", "LIMIT", "Verdict"]);
  });

  it("refuses a star re-export it cannot enumerate", () => {
    assert.throws(() => extractTsExports(`export * from "./Everything.ts";\n`), /cannot be read statically/);
  });

  it("takes the namespace name of an aliased star re-export", () => {
    assert.ok(extractTsExports(`export * as adapter from "./GeometryAdapter.ts";\n`).has("adapter"));
  });
});

describe("extractRustExports", () => {
  it("expands a braced re-export into its leaves", () => {
    const names = extractRustExports(RS_SOURCE);
    assert.ok(names.has("Verification"));
    assert.ok(names.has("verify_interior_point"));
  });

  it("takes the last path segment of an unbraced re-export", () => {
    assert.ok(extractRustExports(RS_SOURCE).has("interior_point"));
  });

  it("reads an item declared public in the file itself", () => {
    assert.ok(extractRustExports(RS_SOURCE).has("Exposed"));
  });

  it("ignores crate-visible items and module declarations", () => {
    const names = extractRustExports(RS_SOURCE);
    assert.ok(!names.has("hidden"));
    assert.ok(!names.has("cli"));
    assert.ok(!names.has("algorithm"));
  });
});

describe("extractWasmExports", () => {
  it("reads the JavaScript name off each binding", () => {
    const names = extractWasmExports(WASM_SOURCE);
    assert.deepEqual([...names].sort(), ["interiorPoint", "verifyInteriorPoint"]);
  });

  it("finds js_name that follows another argument", () => {
    const source = `#[wasm_bindgen(skip_typescript, js_name = "afterArg")]\npub fn foo() {}\n`;
    assert.ok(extractWasmExports(source).has("afterArg"));
  });

  it("finds js_name that precedes another argument", () => {
    const source = `#[wasm_bindgen(js_name = "beforeArg", skip_typescript)]\npub fn bar() {}\n`;
    assert.ok(extractWasmExports(source).has("beforeArg"));
  });

  it("keeps the Rust name of a function bound by a bare attribute", () => {
    const source = `/// Doc comment.\n#[wasm_bindgen]\npub fn boundary_point() {}\n`;
    assert.deepEqual([...extractWasmExports(source)], ["boundary_point"]);
  });

  it("leaves every underscore in a bare-attribute function name alone", () => {
    // wasm-bindgen renames nothing without `js_name`, so `a_b_c_d` reaches
    // JavaScript spelled exactly that way.
    const source = `#[wasm_bindgen]\npub fn a_b_c_d() {}\n\n#[wasm_bindgen]\npub fn _foo() {}\n`;
    assert.deepEqual([...extractWasmExports(source)].sort(), ["_foo", "a_b_c_d"]);
  });

  it("keeps the name of a type bound by a bare attribute", () => {
    const source = `#[wasm_bindgen]\npub struct Verification {}\n\n#[wasm_bindgen]\npub enum Verdict {}\n`;
    assert.deepEqual([...extractWasmExports(source)].sort(), ["Verdict", "Verification"]);
  });

  it("reads the item name through an attribute holding other arguments", () => {
    const source = `#[wasm_bindgen(skip_typescript)]\npub fn hidden_from_dts() {}\n`;
    assert.ok(extractWasmExports(source).has("hidden_from_dts"));
  });

  it("ignores an attribute on an item that is not published", () => {
    assert.deepEqual([...extractWasmExports(`#[wasm_bindgen]\nfn private_helper() {}\n`)], []);
  });
});

describe("checkSurface", () => {
  const aligned = {
    members: [{ ts: "interiorPoint", rs: "interior_point", wasm: "interiorPoint" }],
  };
  const alignedActual = actualOf({ ts: ["interiorPoint"], rs: ["interior_point"], wasm: ["interiorPoint"] });

  it("accepts a surface that lines up with every source", () => {
    assert.deepEqual(checkSurface(aligned, alignedActual), []);
  });

  it("accepts a deliberate absence carrying a note", () => {
    const surface = {
      members: [{ ts: "Coordinate", rs: null, wasm: null, rsNote: "no alias here", wasmNote: "plain arrays" }],
    };
    assert.deepEqual(checkSurface(surface, actualOf({ ts: ["Coordinate"] })), []);
  });

  it("flags a declared name the source does not export", () => {
    const problems = checkSurface(aligned, actualOf({ ts: ["interiorPoint"], rs: [], wasm: ["interiorPoint"] }));
    assert.equal(problems.length, 1);
    assert.match(problems[0], /declares `interior_point` for rs/);
    assert.match(problems[0], new RegExp(SOURCES.rs.replace(/[/.]/g, "\\$&")));
  });

  it("flags a source export the surface does not declare", () => {
    const actual = actualOf({
      ts: ["interiorPoint", "stray"],
      rs: ["interior_point"],
      wasm: ["interiorPoint"],
    });
    const problems = checkSurface(aligned, actual);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /exports `stray`/);
  });

  it("flags an absence with no note explaining it", () => {
    const surface = { members: [{ ts: "Coordinate", rs: null, wasm: null, wasmNote: "plain arrays" }] };
    const problems = checkSurface(surface, actualOf({ ts: ["Coordinate"] }));
    assert.equal(problems.length, 1);
    assert.match(problems[0], /"rsNote"/);
  });

  it("flags two members claiming one name for one target", () => {
    const surface = {
      members: [
        { ts: "interiorPoint", rs: "interior_point", wasm: "interiorPoint" },
        { ts: "interiorPoint", rs: "another_name", wasm: null, wasmNote: "plain arrays" },
      ],
    };
    const actual = actualOf({
      ts: ["interiorPoint"],
      rs: ["interior_point", "another_name"],
      wasm: ["interiorPoint"],
    });
    const problems = checkSurface(surface, actual);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /both declare `interiorPoint` for ts/);
  });

  it("flags an entry absent from every target", () => {
    const surface = {
      members: [{ ts: null, rs: null, wasm: null, tsNote: "a", rsNote: "b", wasmNote: "c" }],
    };
    const problems = checkSurface(surface, actualOf({}));
    assert.equal(problems.length, 1);
    assert.match(problems[0], /declares nothing/);
  });

  it("flags a member missing a target key outright", () => {
    const surface = { members: [{ ts: "interiorPoint", rs: "interior_point" }] };
    const problems = checkSurface(surface, actualOf({ ts: ["interiorPoint"], rs: ["interior_point"] }));
    assert.equal(problems.length, 1);
    assert.match(problems[0], /missing the "wasm" key/);
  });

  it("reports every problem rather than stopping at the first", () => {
    const problems = checkSurface(aligned, actualOf({ ts: [], rs: [], wasm: [] }));
    assert.equal(problems.length, 3);
  });

  it("rejects a surface with no members array", () => {
    const problems = checkSurface({}, actualOf({}));
    assert.equal(problems.length, 1);
    assert.match(problems[0], new RegExp(SURFACE_PATH.replace(/[/.]/g, "\\$&")));
  });
});

describe("runParity", () => {
  it("finds this repository's own surfaces in agreement", () => {
    const { problems, counts } = runParity();
    assert.deepEqual(problems, []);
    assert.equal(counts.problems, 0);
  });
});
