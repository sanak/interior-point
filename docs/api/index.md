# API Reference

## TypeScript

Accepts [GeoJSON](https://datatracker.ietf.org/doc/html/rfc7946) geometry objects and returns a `Position` (`[x, y]`) or `null`.

### `interiorPoint(geometry)`

Computes an interior point of the given geometry, dispatching to the appropriate algorithm based on geometry dimension:

- **Area** (Polygon/MultiPolygon): scanline algorithm
- **Line** (LineString/MultiLineString): vertex closest to length-weighted centroid
- **Point** (Point/MultiPoint): point closest to arithmetic-mean centroid
- **GeometryCollection**: uses the highest-dimension component

**Parameters:**

- `geometry: Geometry | null` — A GeoJSON Geometry object, or `null`

**Returns:** `Position | null` — `[x, y]` coordinates inside the geometry, or `null` if empty

```typescript
import { interiorPoint } from "interior-point";

interiorPoint({
  type: "Polygon",
  coordinates: [
    [
      [0, 0],
      [0, 10],
      [10, 10],
      [10, 0],
      [0, 0],
    ],
  ],
});
// => [5, 5]
```

### Type Reference

| Type       | Definition                               |
| ---------- | ---------------------------------------- |
| `Geometry` | GeoJSON `Geometry` from `@types/geojson` |
| `Position` | `[number, number]` (GeoJSON Position)    |

---

## Rust

### `interior_point(geometry)`

Computes an interior point of the given geometry, dispatching by dimension.

**Parameters:**

- `geometry: &Geometry<f64>` — A reference to a `geo_types::Geometry`

**Returns:** `Option<Coord<f64>>` — The interior point coordinate, or `None` if empty

```rust
use interior_point::interior_point;
use geo::{Geometry, Polygon, LineString};

let poly = Polygon::new(
    LineString::from(vec![
        (0.0, 0.0), (0.0, 10.0), (10.0, 10.0), (10.0, 0.0), (0.0, 0.0),
    ]),
    vec![],
);
let result = interior_point(&poly.into());
// => Some(Coord { x: 5.0, y: 5.0 })
```

### Type Reference

| Type            | Definition                            |
| --------------- | ------------------------------------- |
| `Geometry<f64>` | `geo_types::Geometry<f64>`            |
| `Coord<f64>`    | `geo_types::Coord { x: f64, y: f64 }` |
