---
layout: doc
---

# Getting Started

Interior Point computes a representative point guaranteed to lie inside a geometry. It is a faithful port of the [JTS (Java Topology Suite)](https://github.com/locationtech/jts) InteriorPoint algorithm, available as both a TypeScript library and a Rust crate.

## TypeScript

### Installation

```bash
npm install interior-point
```

### Usage

```typescript
import { interiorPoint } from "interior-point";

const polygon = {
  type: "Polygon" as const,
  coordinates: [
    [
      [0, 0],
      [0, 10],
      [10, 10],
      [10, 0],
      [0, 0],
    ],
  ],
};

const point = interiorPoint(polygon);
// => [5, 5]
```

The main `interiorPoint` function automatically dispatches based on geometry type. You can also call the specialized functions directly:

```typescript
import { interiorPointArea, interiorPointLine, interiorPointPoint } from "interior-point";

// Polygon — scanline algorithm
const areaResult = interiorPointArea(polygon);

// LineString — vertex closest to centroid
const line = {
  type: "LineString" as const,
  coordinates: [
    [0, 0],
    [10, 10],
  ],
};
const lineResult = interiorPointLine(line);

// Point / MultiPoint — point closest to centroid
const mp = {
  type: "MultiPoint" as const,
  coordinates: [
    [0, 0],
    [10, 10],
  ],
};
const pointResult = interiorPointPoint(mp);
```

### Handling Empty Geometries

All functions return `null` for empty geometries:

```typescript
interiorPoint(null); // => null
interiorPoint({ type: "GeometryCollection", geometries: [] }); // => null
```

## Rust

### Installation

Add to your `Cargo.toml`:

```toml
[dependencies]
interior-point = "0.1"
```

### Usage

```rust
use interior_point::interior_point;
use geo::{Polygon, LineString};

let poly = Polygon::new(
    LineString::from(vec![
        (0.0, 0.0), (0.0, 10.0), (10.0, 10.0), (10.0, 0.0), (0.0, 0.0),
    ]),
    vec![],
);
let result = interior_point(&poly.into());
// => Some(Coord { x: 5.0, y: 5.0 })
```

Specialized functions are also available:

```rust
use interior_point::{interior_point_area, interior_point_line, interior_point_point};
```

### Handling Empty Geometries

All functions return `None` for empty geometries:

```rust
use geo::GeometryCollection;
let empty = GeometryCollection::<f64>(vec![]).into();
assert_eq!(interior_point::interior_point(&empty), None);
```
