<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from "vue";
import { useData } from "vitepress";

import { loadGlyphSource } from "./glyphSource.ts";
import { boundsOf, textToCharGeometries, type CharGeometry, type GlyphSource } from "./textGeometry.ts";

const { isDark } = useData();
const mapContainer = ref<HTMLElement | null>(null);
const text = ref("L");

let map: import("maplibre-gl").Map | null = null;
let maplibregl: typeof import("maplibre-gl") | null = null;
let glyphSource: GlyphSource | null = null;
let charGeometries: CharGeometry[] = [];

// Carto vector tile styles (no labels)
const CARTO_LIGHT = "https://basemaps.cartocdn.com/gl/positron-nolabels-gl-style/style.json";
const CARTO_DARK = "https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json";

// The string is laid out around this point, an em box spanning this much latitude.
const PLACEMENT = { center: [132.4553, 34.3853] as [number, number], emHeight: 0.05 };

/**
 * Room `fitBounds` has to leave for the two things floating over the map.
 *
 * Neither is part of the map's own layout, so nothing else would keep the text
 * from being drawn under them. The input occupies the first 44px — 10px of offset
 * and 34px of its own height — and MapLibre's attribution the last 44px, being a
 * 24px control inside a 10px margin. The rest of each figure is breathing room.
 *
 * The attribution is left in the state MapLibre gives it. Collapsing it to its
 * info button would put the basemap's required credit behind a click, which is
 * not this component's call to make, so the text moves out of its way instead.
 */
const FIT_PADDING = { top: 56, bottom: 52, left: 24, right: 24 };

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
    await glyphSource.prepare(text.value);
    if (sequence !== rebuildSequence) return;
  }

  charGeometries = textToCharGeometries(text.value, glyphSource, PLACEMENT);

  const polygons = map?.getSource("glyph-polygons") as import("maplibre-gl").GeoJSONSource | undefined;
  const points = map?.getSource("glyph-points") as import("maplibre-gl").GeoJSONSource | undefined;
  polygons?.setData(polygonData());
  points?.setData(pointData());

  const bounds = boundsOf(charGeometries);
  if (map && maplibregl && bounds) {
    map.fitBounds(new maplibregl.LngLatBounds(bounds[0], bounds[1]), {
      padding: FIT_PADDING,
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

  glyphSource = await loadGlyphSource();
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
  </div>
</template>

<style scoped>
.map-demo {
  width: 100%;
  height: 100%;
}

.map-container {
  position: relative;
  width: 100%;
  height: 100%;
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

.map-container :deep(.maplibregl-canvas) {
  border-radius: 8px;
}

.map-container :deep(.maplibregl-ctrl-attrib summary) {
  margin: 0;
}
</style>
