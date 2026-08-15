import maplibregl from "maplibre-gl";
import type { GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Position } from "geojson";
import type { Dataset } from "../types.ts";
import { ADAPTER_COLORS, ADAPTERS } from "../adapters/index.ts";
import { boundsOf } from "../data/geometry.ts";
import { datasetCollection, pointsCollection, styleUrl } from "./mapData.ts";
import { attributePopupHtml, pointPopupHtml } from "./popup.ts";

export interface BenchmarkMap {
  setDataset(dataset: Dataset): void;
  setPoints(id: string, points: readonly (Position | null)[]): void;
  setLayerVisible(id: string, visible: boolean): void;
  clearResults(): void;
  destroy(): void;
}

const DATASET_SOURCE = "dataset";

const POINT_LAYER_PREFIX = "points-";

function pointLayerId(id: string): string {
  return `${POINT_LAYER_PREFIX}${id}`;
}

const ADAPTER_LABELS = new Map(ADAPTERS.map((adapter) => [adapter.id, adapter.label]));

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

  // One delegated handler rather than per-layer ones: layers are torn down and rebuilt on every
  // style change, and a handler registered inside restoreLayers would stack up a duplicate each
  // time. queryRenderedFeatures also lets the result points take priority over the polygons
  // they sit on.
  const popup = new maplibregl.Popup({ closeButton: true, maxWidth: "320px" });
  const DATASET_LAYERS = ["dataset-fill", "dataset-circle"];

  const visiblePointLayers = (): string[] => [...points.keys()].map(pointLayerId).filter((id) => map.getLayer(id));

  map.on("click", (event) => {
    // Result points sit on top of the polygons they were computed from, so they are asked first.
    const hit = map.queryRenderedFeatures(event.point, { layers: visiblePointLayers() })[0];
    if (hit) {
      const adapterId = hit.layer.id.slice(POINT_LAYER_PREFIX.length);
      // `id` is 0 for the first feature of every source, so this must be a type test.
      const index = typeof hit.id === "number" ? hit.id : undefined;
      const exact = index === undefined ? undefined : points.get(adapterId)?.[index];
      if (exact) {
        // `RunResult.points` holds one entry per input geometry in order, and a dataset's
        // `features` and `geometries` are built in step, so the same index reaches the feature
        // the point was computed from.
        const source = index === undefined ? undefined : dataset?.features[index];
        popup
          .setLngLat(event.lngLat)
          .setHTML(pointPopupHtml(ADAPTER_LABELS.get(adapterId) ?? adapterId, exact, source?.properties))
          .addTo(map);
        return;
      }
    }

    const layers = DATASET_LAYERS.filter((id) => map.getLayer(id));
    const feature = map.queryRenderedFeatures(event.point, { layers })[0];
    if (!feature) {
      popup.remove();
      return;
    }
    popup.setLngLat(event.lngLat).setHTML(attributePopupHtml(feature.properties)).addTo(map);
  });

  map.on("mousemove", (event) => {
    const layers = [...visiblePointLayers(), ...DATASET_LAYERS.filter((id) => map.getLayer(id))];
    map.getCanvas().style.cursor = map.queryRenderedFeatures(event.point, { layers }).length > 0 ? "pointer" : "";
  });

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
      popup.remove();
      map.remove();
    },
  };
}
