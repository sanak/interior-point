import type { Geometry, Position } from "geojson";
import type { Adapter } from "../types.ts";
import { pointOnFeature } from "@turf/point-on-feature";

export const turfAdapter: Adapter = {
  id: "turf",
  label: "turf (JS)",
  call: "pointOnFeature",
  async load(): Promise<void> {},
  interiorPoint(geometry: Geometry): Position | null {
    return pointOnFeature(geometry).geometry.coordinates;
  },
};
