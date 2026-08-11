import type { Geometry, Position } from "geojson";
import type { Adapter } from "../types.ts";
import initGeosJs from "geos-wasm";
import { geojsonToGeosGeom, geosGeomToGeojson } from "geos-wasm/helpers";

type Geos = Awaited<ReturnType<typeof initGeosJs>>;

let geos: Geos | null = null;
let initPromise: Promise<void> | null = null;

async function load(): Promise<void> {
  initPromise ??= (async () => {
    geos = await initGeosJs();
  })();
  await initPromise;
}

function loaded(): Geos {
  if (geos === null) {
    throw new Error("geos-wasm adapter used before load()");
  }
  return geos;
}

export const geosWasmAdapter: Adapter = {
  id: "geos-wasm",
  label: "GEOS (WASM)",
  call: "GEOSPointOnSurface",
  load,
  interiorPoint(geometry: Geometry): Position | null {
    const lib = loaded();
    const inputPtr = geojsonToGeosGeom(geometry, lib);
    try {
      const surfacePtr = lib.GEOSPointOnSurface(inputPtr);
      try {
        const point = geosGeomToGeojson(surfacePtr, lib) as { coordinates: Position };
        return point.coordinates;
      } finally {
        lib.GEOSGeom_destroy(surfacePtr);
      }
    } finally {
      lib.GEOSGeom_destroy(inputPtr);
    }
  },
};
