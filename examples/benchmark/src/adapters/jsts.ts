import type { Geometry, Position } from "geojson";
import type { Adapter } from "../types.ts";
import GeoJSONReader from "jsts/org/locationtech/jts/io/GeoJSONReader.js";
// Side-effect import: monkey-patches Geometry.prototype.getInteriorPoint. Without it the method
// does not exist at runtime, even though src/jsts.d.ts types it as present.
import "jsts/org/locationtech/jts/monkey.js";

const reader = new GeoJSONReader();

export const jstsAdapter: Adapter = {
  id: "jsts",
  label: "jsts (JS port)",
  call: "Geometry#getInteriorPoint",
  async load(): Promise<void> {},
  interiorPoint(geometry: Geometry): Position | null {
    const point = reader.read(geometry).getInteriorPoint();
    return [point.getX(), point.getY()];
  },
};
