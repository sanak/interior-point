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
use geo::{Polygon, LineString};

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
import { ref, onMounted } from "vue";
import { interiorPoint } from "interior-point";

const mapContainer = ref(null);

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

onMounted(async () => {
  const L = await import("leaflet");
  await import("leaflet/dist/leaflet.css");

  const map = L.map(mapContainer.value, { attributionControl: false }).setView(
    [34.39, 132.45],
    12
  );

  L.control.attribution({ prefix: false }).addTo(map);

  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(map);

  // L-shaped polygon (blue, semi-transparent)
  L.geoJSON(
    { type: "Feature", properties: {}, geometry: lPolygon },
    {
      style: {
        color: "#2563eb",
        weight: 2,
        fillColor: "#3b82f6",
        fillOpacity: 0.3,
      },
    }
  ).addTo(map);

  // Interior point marker (orange)
  if (ip) {
    L.circleMarker([ip[1], ip[0]], {
      radius: 7,
      fillColor: "#f97316",
      color: "#ffffff",
      weight: 2,
      fillOpacity: 1,
    }).addTo(map);
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
</style>
