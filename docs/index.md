---
layout: doc
---

# Interior Point

Interior Point computes a representative point guaranteed to lie inside a geometry. It is a faithful port of the [JTS (Java Topology Suite)](https://github.com/locationtech/jts) InteriorPoint algorithm, available as both a TypeScript library and a Rust crate.

<div ref="mapContainer" class="map-container"></div>

## Installation

### TypeScript

```bash
npm install interior-point
```

### Rust

Add to your `Cargo.toml`:

```toml
[dependencies]
interior-point = "0.1"
geo-types = "0.7"
```

or using `cargo add`:

```sh
cargo add interior-point
cargo add geo-types
```

## Usage

### TypeScript

```typescript
import { interiorPoint } from "interior-point";

const polygon = {
  type: "Polygon",
  coordinates: [
    [
      [0, 0],
      [6, 0],
      [6, 2],
      [2, 2],
      [2, 8],
      [0, 8],
      [0, 0],
    ],
  ],
};

const point = interiorPoint(polygon);
console.log(point);
// => [1, 5]
```

### Rust

```rust
use interior_point::interior_point;
use geo_types::{Polygon, LineString};

let poly = Polygon::new(
    LineString::from(vec![
        (0.0, 0.0),
        (6.0, 0.0),
        (6.0, 2.0),
        (2.0, 2.0),
        (2.0, 8.0),
        (0.0, 8.0),
        (0.0, 0.0),
    ]),
    vec![],
);
let result = interior_point(&poly.into());
// => Some(Coord { x: 1.0, y: 5.0 })
```

<script setup>
import { ref, onMounted, watch, onUnmounted } from "vue";
import { useData } from "vitepress";
import { interiorPoint } from "interior-point";

const { isDark } = useData();
const mapContainer = ref(null);
let map = null;

// Carto vector tile styles (no labels)
const CARTO_LIGHT = "https://basemaps.cartocdn.com/gl/positron-nolabels-gl-style/style.json";
const CARTO_DARK = "https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json";

// L-shaped polygon as GeoJSON geometry ([lng, lat] order)
const lPolygon = {
  type: "Polygon",
  coordinates: [
    [
      [132.43, 34.36],
      [132.43, 34.41],
      [132.4425, 34.41],
      [132.4425, 34.37],
      [132.47, 34.37],
      [132.47, 34.36],
      [132.43, 34.36],
    ],
  ],
};

// Compute interior point using the project's own library
const ip = interiorPoint(lPolygon);

// Add GeoJSON source and layers to the map
const addLayers = () => {
  if (!map) return;

  map.addSource("polygon", {
    type: "geojson",
    data: { type: "Feature", properties: {}, geometry: lPolygon },
  });

  map.addLayer({
    id: "polygon-fill",
    type: "fill",
    source: "polygon",
    paint: { "fill-color": "#3b82f6", "fill-opacity": 0.3 },
  });

  map.addLayer({
    id: "polygon-outline",
    type: "line",
    source: "polygon",
    paint: { "line-color": "#2563eb", "line-width": 2 },
  });

  if (ip) {
    map.addSource("interior-point", {
      type: "geojson",
      data: { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: ip } },
    });

    map.addLayer({
      id: "interior-point",
      type: "circle",
      source: "interior-point",
      paint: {
        "circle-color": "#f97316",
        "circle-radius": 7,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
      },
    });
  }
};

onMounted(async () => {
  const maplibregl = await import("maplibre-gl");
  await import("maplibre-gl/dist/maplibre-gl.css");

  map = new maplibregl.Map({
    container: mapContainer.value,
    style: isDark.value ? CARTO_DARK : CARTO_LIGHT,
    center: [132.45, 34.385],
    zoom: 11,
    attributionControl: false,
  });

  map.addControl(new maplibregl.AttributionControl({ compact: true }));

  map.on("style.load", addLayers);

  watch(isDark, (dark) => {
    if (map) map.setStyle(dark ? CARTO_DARK : CARTO_LIGHT);
  });
});

onUnmounted(() => {
  if (map) {
    map.remove();
    map = null;
  }
});
</script>

<style scoped>
.map-container {
  width: 100%;
  aspect-ratio: 2.5 / 1;
  margin: 1.5rem 0;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--vp-c-divider);
  z-index: 0;
}

.map-container :deep(.maplibregl-canvas) {
  border-radius: 8px;
}

.map-container :deep(.maplibregl-ctrl-attrib summary) {
  margin: 0;
}
</style>
