import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { geoWasmAdapter } from "../src/adapters/geoWasm.ts";

describe("geoWasmAdapter", () => {
  it("matches ledger row 8", () => {
    assert.equal(geoWasmAdapter.id, "geo-wasm");
    assert.equal(geoWasmAdapter.label, "geo (Rust/WASM)");
    assert.equal(geoWasmAdapter.call, "interior_point");
  });
});
