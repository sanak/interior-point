import maplibregl from "maplibre-gl";
import type { GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Position } from "geojson";
import type { Dataset } from "../types.ts";
import { ADAPTER_COLORS } from "../adapters/index.ts";
import { boundsOf } from "../data/geometry.ts";
import { datasetCollection, pointsCollection, styleUrl } from "./mapData.ts";

export interface BenchmarkMap {
  setDataset(dataset: Dataset): void;
  setPoints(id: string, points: readonly (Position | null)[]): void;
  setLayerVisible(id: string, visible: boolean): void;
  clearResults(): void;
  destroy(): void;
}

const DATASET_SOURCE = "dataset";

function pointLayerId(id: string): string {
  return `points-${id}`;
}

export function createBenchmarkMap(container: HTMLElement): BenchmarkMap {
  const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
  let dataset: Dataset | null = null;
  const points = new Map<string, readonly (Position | null)[]>();
  const hidden = new Set<string>();

  const map = new maplibregl.Map({
    container,
    style: styleUrl(darkQuery.matches),
    center: [132.45, 34.385],
    zoom: 11,
    attributionControl: false,
  });
  map.addControl(new maplibregl.AttributionControl({ compact: true }));

  const addDatasetLayers = (): void => {
    map.addSource(DATASET_SOURCE, { type: "geojson", data: datasetCollection(dataset) });
    map.addLayer({
      id: "dataset-fill",
      type: "fill",
      source: DATASET_SOURCE,
      paint: { "fill-color": "#888888", "fill-opacity": 0.25 },
    });
    map.addLayer({
      id: "dataset-outline",
      type: "line",
      source: DATASET_SOURCE,
      paint: { "line-color": "#888888", "line-width": 1 },
    });
    map.addLayer({
      id: "dataset-circle",
      type: "circle",
      source: DATASET_SOURCE,
      filter: ["==", ["geometry-type"], "Point"],
      paint: { "circle-color": "#888888", "circle-radius": 4 },
    });
  };

  const addPointLayer = (id: string): void => {
    const layer = pointLayerId(id);
    map.addSource(layer, { type: "geojson", data: pointsCollection(points.get(id) ?? []) });
    map.addLayer({
      id: layer,
      type: "circle",
      source: layer,
      layout: { visibility: hidden.has(id) ? "none" : "visible" },
      paint: {
        "circle-color": ADAPTER_COLORS[id] ?? "#888888",
        "circle-radius": 4,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
      },
    });
  };

  // Setting a new style wipes every custom source and layer, so everything is
  // rebuilt from local state on style.load — which also covers the initial load.
  // `styleReady` tracks readiness ourselves instead of calling `map.isStyleLoaded()`:
  // that also goes false while a just-added GeoJSON source is still being tiled,
  // which happens on every `setPoints` call during "Run all" and would otherwise
  // drop a layer for good, since style.load never fires again outside setStyle().
  let styleReady = false;
  const restoreLayers = (): void => {
    styleReady = true;
    addDatasetLayers();
    for (const id of points.keys()) addPointLayer(id);
  };
  map.on("style.load", restoreLayers);

  const onSchemeChange = (event: MediaQueryListEvent): void => {
    styleReady = false;
    map.setStyle(styleUrl(event.matches));
  };
  darkQuery.addEventListener("change", onSchemeChange);

  return {
    setDataset(next: Dataset): void {
      dataset = next;
      const source = map.getSource(DATASET_SOURCE) as GeoJSONSource | undefined;
      if (source) source.setData(datasetCollection(dataset));
      const bounds = boundsOf(dataset.features);
      if (bounds) map.fitBounds(bounds, { padding: 40, maxZoom: 17 });
    },
    setPoints(id: string, next: readonly (Position | null)[]): void {
      const known = points.has(id);
      points.set(id, next);
      if (!styleReady) return; // restoreLayers picks it up on style.load
      if (known) {
        (map.getSource(pointLayerId(id)) as GeoJSONSource).setData(pointsCollection(next));
      } else {
        addPointLayer(id);
      }
    },
    setLayerVisible(id: string, visible: boolean): void {
      if (visible) hidden.delete(id);
      else hidden.add(id);
      if (map.getLayer(pointLayerId(id))) {
        map.setLayoutProperty(pointLayerId(id), "visibility", visible ? "visible" : "none");
      }
    },
    clearResults(): void {
      for (const id of points.keys()) {
        const layer = pointLayerId(id);
        if (map.getLayer(layer)) map.removeLayer(layer);
        if (map.getSource(layer)) map.removeSource(layer);
      }
      points.clear();
    },
    destroy(): void {
      darkQuery.removeEventListener("change", onSchemeChange);
      map.remove();
    },
  };
}
