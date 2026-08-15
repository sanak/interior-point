import type { Feature, FeatureCollection, Position } from "geojson";
import type { Dataset } from "../types.ts";

export const CARTO_LIGHT = "https://basemaps.cartocdn.com/gl/positron-nolabels-gl-style/style.json";
export const CARTO_DARK = "https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json";

export function styleUrl(dark: boolean): string {
  return dark ? CARTO_DARK : CARTO_LIGHT;
}

export function datasetCollection(dataset: Dataset | null): FeatureCollection {
  return { type: "FeatureCollection", features: dataset ? [...dataset.features] : [] };
}

/**
 * The drawn result points. Each carries the index it had in the run's `points` array so a click
 * can be traced back to the exact coordinate — the drawn geometry is quantised by MapLibre's
 * tiler and is not precise enough to display.
 */
export function pointsCollection(points: readonly (Position | null)[]): FeatureCollection {
  const features: Feature[] = [];
  points.forEach((point, index) => {
    if (point === null) return;
    features.push({
      type: "Feature",
      properties: { index },
      geometry: { type: "Point", coordinates: [...point] },
    });
  });
  return { type: "FeatureCollection", features };
}
