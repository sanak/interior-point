import type { Adapter } from "../types.ts";
import { geoWasmAdapter } from "./geoWasm.ts";
import { geosWasmAdapter } from "./geosWasm.ts";
import { jstsAdapter } from "./jsts.ts";
import { rsCentroidFirstAdapter, rsInteriorPointAdapter } from "./rsWasm.ts";
import { tsCentroidFirstAdapter, tsInteriorPointAdapter } from "./tsInteriorPoint.ts";
import { turfAdapter } from "./turf.ts";

export const ADAPTER_COLORS: Record<string, string> = {
  "ts-interior-point": "#E69F00",
  "ts-centroid-first": "#56B4E9",
  "rs-interior-point": "#009E73",
  "rs-centroid-first": "#F0E442",
  jsts: "#0072B2",
  wasmts: "#D55E00",
  "geos-wasm": "#CC79A7",
  "geo-wasm": "#000000",
  turf: "#999999",
};

export const ADAPTERS: readonly Adapter[] = [
  tsInteriorPointAdapter,
  tsCentroidFirstAdapter,
  rsInteriorPointAdapter,
  rsCentroidFirstAdapter,
  jstsAdapter,
  geosWasmAdapter,
  geoWasmAdapter,
  turfAdapter,
];
