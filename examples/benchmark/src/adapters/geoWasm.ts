import type { Geometry, Position } from "geojson";
import type { Adapter } from "../types.ts";

type GeoWasmModule = typeof import("geo-wasm");

let lib: GeoWasmModule | null = null;
let initPromise: Promise<void> | null = null;

async function load(): Promise<void> {
  initPromise ??= (async () => {
    const wasm = await import("geo-wasm");
    await wasm.default();
    lib = wasm;
  })();
  await initPromise;
}

function loaded(): GeoWasmModule {
  if (lib === null) {
    throw new Error("geo-wasm adapter used before load()");
  }
  return lib;
}

export const geoWasmAdapter: Adapter = {
  id: "geo-wasm",
  label: "geo (Rust/WASM)",
  call: "interior_point",
  load,
  interiorPoint(geometry: Geometry): Position | null {
    return loaded().interior_point(geometry) as Position | null;
  },
};
