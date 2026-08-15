import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rsCentroidFirstAdapter, rsInteriorPointAdapter } from "../src/adapters/rsWasm.ts";

describe("rsInteriorPointAdapter", () => {
  it("matches ledger row 3", () => {
    assert.equal(rsInteriorPointAdapter.id, "rs-interior-point");
    assert.equal(rsInteriorPointAdapter.label, "interior-point (Rust/WASM)");
    assert.equal(rsInteriorPointAdapter.call, "interiorPoint");
  });
});

describe("rsCentroidFirstAdapter", () => {
  it("matches ledger row 4", () => {
    assert.equal(rsCentroidFirstAdapter.id, "rs-centroid-first");
    assert.equal(rsCentroidFirstAdapter.label, "interior-point (Rust/WASM)′");
    assert.equal(rsCentroidFirstAdapter.call, "centroidFirstInteriorPoint");
  });

  it("is a distinct object from rsInteriorPointAdapter", () => {
    assert.notEqual(rsCentroidFirstAdapter, rsInteriorPointAdapter);
  });
});
