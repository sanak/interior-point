<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from "vue";
import { useData } from "vitepress";

import { ROUTE_LABEL, loadGlyphSource } from "./glyphSource.ts";
import { boundsOf, textToCharGeometries, type CharGeometry, type GlyphSource } from "./textGeometry.ts";

const { isDark } = useData();
const mapContainer = ref<HTMLElement | null>(null);
const text = ref("L");
const status = ref("loading outlines…");

let map: import("maplibre-gl").Map | null = null;
let maplibregl: typeof import("maplibre-gl") | null = null;
let glyphSource: GlyphSource | null = null;
let charGeometries: CharGeometry[] = [];

// Carto vector tile styles (no labels)
const CARTO_LIGHT = "https://basemaps.cartocdn.com/gl/positron-nolabels-gl-style/style.json";
const CARTO_DARK = "https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json";

// The string is laid out around this point, an em box spanning this much latitude.
const PLACEMENT = { center: [132.4553, 34.3853] as [number, number], emHeight: 0.05 };

const empty = { type: "FeatureCollection", features: [] } as const;

const polygonData = () => ({
  type: "FeatureCollection" as const,
  features: charGeometries.map(({ char, geometry }) => ({
    type: "Feature" as const,
    properties: { char },
    geometry,
  })),
});

const pointData = () => ({
  type: "FeatureCollection" as const,
  features: charGeometries
    .filter(({ point }) => point !== null)
    .map(({ char, point }) => ({
      type: "Feature" as const,
      properties: { char },
      geometry: { type: "Point" as const, coordinates: point as number[] },
    })),
});

/**
 * Rebuilds every character's geometry, then pushes it at whatever the map already has.
 *
 * A source may have to fetch something before it can answer, so this awaits and
 * then checks that no later keystroke has started its own rebuild — otherwise a
 * slow load could land after a fast one and put stale text on the map.
 */
let rebuildSequence = 0;
const rebuild = async () => {
  if (!glyphSource) return;
  const sequence = ++rebuildSequence;

  if (glyphSource.prepare) {
    const before = status.value;
    status.value = "loading outlines\u2026";
    await glyphSource.prepare(text.value);
    if (sequence !== rebuildSequence) return;
    status.value = before;
  }

  const started = performance.now();
  charGeometries = textToCharGeometries(text.value, glyphSource, PLACEMENT);
  const elapsed = performance.now() - started;

  const vertices = charGeometries.reduce(
    (total, { geometry }) => total + geometry.coordinates.flat().reduce((n, ring) => n + ring.length, 0),
    0,
  );
  status.value = `${charGeometries.length} glyphs · ${vertices} vertices · ${elapsed.toFixed(2)} ms`;

  const polygons = map?.getSource("glyph-polygons") as import("maplibre-gl").GeoJSONSource | undefined;
  const points = map?.getSource("glyph-points") as import("maplibre-gl").GeoJSONSource | undefined;
  polygons?.setData(polygonData());
  points?.setData(pointData());

  const bounds = boundsOf(charGeometries);
  if (map && maplibregl && bounds) {
    map.fitBounds(new maplibregl.LngLatBounds(bounds[0], bounds[1]), {
      padding: { top: 56, bottom: 24, left: 24, right: 24 },
      duration: 0,
    });
  }
};

/** Re-run on every style load, since `setStyle` drops sources and layers with the old one. */
const addLayers = () => {
  if (!map) return;

  map.addSource("glyph-polygons", { type: "geojson", data: charGeometries.length ? polygonData() : empty });
  map.addLayer({
    id: "glyph-fill",
    type: "fill",
    source: "glyph-polygons",
    paint: { "fill-color": "#3b82f6", "fill-opacity": 0.3 },
  });
  map.addLayer({
    id: "glyph-outline",
    type: "line",
    source: "glyph-polygons",
    paint: { "line-color": "#2563eb", "line-width": 2 },
  });

  map.addSource("glyph-points", { type: "geojson", data: charGeometries.length ? pointData() : empty });
  map.addLayer({
    id: "glyph-interior-point",
    type: "circle",
    source: "glyph-points",
    paint: {
      "circle-color": "#f97316",
      "circle-radius": 6,
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2,
    },
  });
};

onMounted(async () => {
  maplibregl = await import("maplibre-gl");
  await import("maplibre-gl/dist/maplibre-gl.css");

  map = new maplibregl.Map({
    container: mapContainer.value as HTMLElement,
    style: isDark.value ? CARTO_DARK : CARTO_LIGHT,
    center: PLACEMENT.center,
    zoom: 11,
    attributionControl: false,
  });

  map.addControl(new maplibregl.AttributionControl({ compact: true }));
  map.on("style.load", addLayers);

  const started = performance.now();
  glyphSource = await loadGlyphSource();
  const loadMs = performance.now() - started;
  status.value = `outlines ready in ${loadMs.toFixed(0)} ms`;
  rebuild();

  watch(text, rebuild);
  watch(isDark, (dark) => map?.setStyle(dark ? CARTO_DARK : CARTO_LIGHT));
});

onUnmounted(() => {
  map?.remove();
  map = null;
});
</script>

<template>
  <div class="map-demo">
    <div ref="mapContainer" class="map-container">
      <input
        v-model="text"
        class="text-input"
        type="text"
        spellcheck="false"
        placeholder="Type text here"
        aria-label="Text to draw on the map"
      />
    </div>
    <p class="status">{{ ROUTE_LABEL }} — {{ status }}</p>
  </div>
</template>

<style scoped>
.map-demo {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
}

.map-container {
  position: relative;
  flex: 1;
  width: 100%;
  min-height: 220px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--vp-c-divider);
  z-index: 0;
}

.text-input {
  position: absolute;
  z-index: 2;
  top: 10px;
  left: 10px;
  right: 10px;
  padding: 6px 10px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
  font-size: 14px;
  /* The map sets a grab cursor over its whole container, this included. */
  cursor: text;
}

.text-input::placeholder {
  color: var(--vp-c-text-3);
}

.status {
  margin: 6px 2px 0;
  font-family: var(--vp-font-family-mono);
  font-size: 11px;
  line-height: 1.4;
  color: var(--vp-c-text-3);
}

.map-container :deep(.maplibregl-canvas) {
  border-radius: 8px;
}

.map-container :deep(.maplibregl-ctrl-attrib summary) {
  margin: 0;
}
</style>
