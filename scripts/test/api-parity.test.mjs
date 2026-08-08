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
