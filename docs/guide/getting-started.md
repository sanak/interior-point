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

### Handling Empty Geometries

All functions return `None` for empty geometries:

```rust
use geo::GeometryCollection;
let empty = GeometryCollection::<f64>(vec![]).into();
assert_eq!(interior_point::interior_point(&empty), None);
```
