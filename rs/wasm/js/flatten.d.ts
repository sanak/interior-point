import type { Feature, Geometry } from "geojson";

/** Flattens a GeoJSON geometry into `[structureLength, ...structure, ...coords]` for the wasm bindings to decode. */
export function flattenGeometry(input: Geometry | Feature): Float64Array;
