import type { Geometry, Position } from "geojson";
import type { Adapter } from "../types.ts";

type RsWasmModule = typeof import("interior-point-wasm");

let lib: RsWasmModule | null = null;
let initPromise: Promise<void> | null = null;

async function load(): Promise<void> {
  initPromise ??= (async () => {
    const wasm = await import("interior-point-wasm");
    await wasm.default();
    lib = wasm;
  })();
  await initPromise;
}

function loaded(): RsWasmModule {
  if (lib === null) {
    throw new Error("rs-wasm adapters used before load()");
  }
  return lib;
}

export const rsInteriorPointAdapter: Adapter = {
  id: "rs-interior-point",
  label: "interior-point (Rust/WASM)",
  call: "interiorPoint",
  load,
  interiorPoint(geometry: Geometry): Position | null {
    return loaded().interiorPoint(geometry) as Position | null;
  },
};

export const rsCentroidFirstAdapter: Adapter = {
  id: "rs-centroid-first",
  label: "interior-point (Rust/WASM)′",
  call: "centroidFirstInteriorPoint",
  load,
  interiorPoint(geometry: Geometry): Position | null {
    return loaded().centroidFirstInteriorPoint(geometry) as Position | null;
  },
};
