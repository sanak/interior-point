---
layout: doc
---

# Getting Started

Interior Point computes a representative point guaranteed to lie inside a geometry. It is a faithful port of the [JTS (Java Topology Suite)](https://github.com/locationtech/jts) InteriorPoint algorithm, available as both a TypeScript library and a Rust crate.

## Why not the centroid?

A polygon's centroid is not guaranteed to lie inside the polygon. The C-shaped one below has its centroid at `(2.5, 4)`, in the gap between the two arms — outside the polygon altogether. What this library returns is inside it:

```sh
interior-point -f wkt -i "POLYGON ((0 0, 6 0, 6 2, 2 2, 2 6, 6 6, 6 8, 0 8, 0 0))"
# POINT (1 4)
```

Taking the centroid when it does happen to lie inside is still worth doing, and a second entry point does exactly that. For this polygon it changes nothing, because the centroid is rejected:

```sh
interior-point -c -f wkt -i "POLYGON ((0 0, 6 0, 6 2, 2 2, 2 6, 6 6, 6 8, 0 8, 0 0))"
# POINT (1 4)
```

Which of the two entry points to reach for, and what each returns for a degenerate geometry, is covered in the API reference ([TypeScript](/api/typescript) | [Rust](/api/rust)).

## Installation

::: code-group

```bash [TypeScript]
npm install interior-point
```

```sh [Rust]
cargo add interior-point
cargo add geo-types
```

:::

Or pin the versions in `Cargo.toml`:

```toml
[dependencies]
interior-point = "0.3"
geo-types = "0.7"
```

## Usage

### Compute an interior point

::: code-group

```typescript [TypeScript]
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

```rust [Rust]
use geo_types::{Geometry, LineString, Polygon};
use interior_point::interior_point;

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
let geometry: Geometry<f64> = poly.into();
let result = interior_point(&geometry);
// => Some(Coord { x: 1.0, y: 5.0 })
```

:::

### Verify the result

Check that result against the geometry it came from, through a point-in-polygon locator that shares no code with the algorithm above. Each tab goes on using the bindings its own snippet introduced.

::: code-group

```typescript [TypeScript]
import { verifyInteriorPoint, Verification } from "interior-point";

console.log(verifyInteriorPoint(point, polygon) === Verification.Interior);
// => true
```

```rust [Rust]
use interior_point::{verify_interior_point, Verification};

assert_eq!(verify_interior_point(result, Some(&geometry)), Verification::Interior);
```

:::

This verifies the library's own output. It is not an OGC geometry validity check: an invalid geometry can still yield a point that verifies. See the API reference ([TypeScript](/api/typescript) | [Rust](/api/rust)) for the four outcomes it distinguishes, and the [CLI page](/cli) for the same check as a flag.

### Prefer the centroid

Or ask for the centroid instead, falling back to the algorithm above only when the centroid is not strictly inside:

::: code-group

```typescript [TypeScript]
import { centroidFirstInteriorPoint } from "interior-point";

// This polygon's centroid [2, 3] sits exactly on an edge, so it is rejected.
console.log(centroidFirstInteriorPoint(polygon));
// => [1, 5]
```

```rust [Rust]
use interior_point::centroid_first_interior_point;

// This polygon's centroid (2, 3) sits exactly on an edge, so it is rejected.
let point = centroid_first_interior_point(&geometry);
// => Some(Coord { x: 1.0, y: 5.0 })
```

:::
