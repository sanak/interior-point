import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { wasmtsAdapter } from "../src/adapters/wasmts.ts";

describe("wasmtsAdapter", () => {
  it("matches ledger row 6", () => {
    assert.equal(wasmtsAdapter.id, "wasmts");
    assert.equal(wasmtsAdapter.label, "wasmts (Java/WASM)");
    assert.equal(wasmtsAdapter.call, "InteriorPoint.getInteriorPoint");
  });
});
