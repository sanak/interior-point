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

export function pointsCollection(points: readonly (Position | null)[]): FeatureCollection {
  const features: Feature[] = points
    .filter((point): point is Position => point !== null)
    .map((point) => ({
      type: "Feature",
      properties: {},
      geometry: { type: "Point", coordinates: [...point] },
    }));
  return { type: "FeatureCollection", features };
}
