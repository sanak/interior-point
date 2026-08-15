import type { Feature, FeatureCollection, Position } from "geojson";
import type { Dataset } from "../types.ts";

export const CARTO_LIGHT = "https://basemaps.cartocdn.com/gl/positron-nolabels-gl-style/style.json";
export const CARTO_DARK = "https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json";

export function styleUrl(dark: boolean): string {
  return dark ? CARTO_DARK : CARTO_LIGHT;
}

/**
 * The input features the map draws. Each carries its index in `Dataset.features` as a top-level
 * `id`, which is what `setFeatureState` selects on and what ties a feature to the interior point
 * computed from it. Any `id` a dropped file carried is replaced: only the index has that meaning
 * here. The index cannot live in `properties`, because everything there is rendered into the
 * attribute popup.
 */
export function datasetCollection(dataset: Dataset | null): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: dataset ? dataset.features.map((feature, index) => ({ ...feature, id: index })) : [],
  };
}

/**
 * The drawn result points. Each carries the index it had in the run's `points` array as its
 * top-level `id`, so a click can be traced back to the exact coordinate — the drawn geometry is
 * quantised by MapLibre's tiler and is not precise enough to display. `properties` stays empty:
 * a result point has no attributes of its own.
 */
export function pointsCollection(points: readonly (Position | null)[]): FeatureCollection {
  const features: Feature[] = [];
  points.forEach((point, index) => {
    if (point === null) return;
    features.push({
      type: "Feature",
      id: index,
      properties: {},
      geometry: { type: "Point", coordinates: [...point] },
    });
  });
  return { type: "FeatureCollection", features };
}
