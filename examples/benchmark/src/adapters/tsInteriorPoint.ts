import type { Geometry, Position } from "geojson";
import type { Adapter } from "../types.ts";

type InteriorPointModule = typeof import("interior-point");

let lib: InteriorPointModule | null = null;

async function load(): Promise<void> {
  lib ??= await import("interior-point");
}

function loaded(): InteriorPointModule {
  if (lib === null) {
    throw new Error("interior-point adapters used before load()");
  }
  return lib;
}

export const tsInteriorPointAdapter: Adapter = {
  id: "ts-interior-point",
  label: "interior-point (TS)",
  call: "interiorPoint",
  load,
  interiorPoint(geometry: Geometry): Position | null {
    return loaded().interiorPoint(geometry) ?? null;
  },
};

export const tsCentroidFirstAdapter: Adapter = {
  id: "ts-centroid-first",
  label: "interior-point (TS)",
  call: "centroidFirstInteriorPoint",
  load,
  interiorPoint(geometry: Geometry): Position | null {
    return loaded().centroidFirstInteriorPoint(geometry) ?? null;
  },
};
