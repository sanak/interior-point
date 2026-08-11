import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { geosWasmAdapter } from "../src/adapters/geosWasm.ts";

describe("geosWasmAdapter", () => {
  it("matches ledger row 7", () => {
    assert.equal(geosWasmAdapter.id, "geos-wasm");
    assert.equal(geosWasmAdapter.label, "geos-wasm (C++/WASM)");
    assert.equal(geosWasmAdapter.call, "GEOSPointOnSurface");
  });
});
