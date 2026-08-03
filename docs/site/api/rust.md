---
layout: doc
---

# Rust API

Accepts `geo_types` geometries and returns an `Option<Coord<f64>>`.

## `interior_point(geometry)`

Computes an interior point of the given geometry, dispatching by dimension.

**Parameters:**

- `geometry: &Geometry<f64>` — A reference to a `geo_types::Geometry`

**Returns:** `Option<Coord<f64>>` — The interior point coordinate, or `None` if empty

```rust
use interior_point::interior_point;
use geo_types::{Geometry, Polygon, LineString};

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

Returns `None` for empty geometries:

```rust
use geo_types::{Geometry, GeometryCollection};
let empty = Geometry::GeometryCollection(GeometryCollection::<f64>(vec![]));
assert_eq!(interior_point::interior_point(&empty), None);
```

## `centroid_first_interior_point(geometry)`

Computes the geometry's centroid and returns it when it lies strictly inside the geometry; otherwise falls back to `interior_point`. A representative point is more useful when it is the centroid: the fallback returns whichever point the scanline algorithm lands on, which depends on how the algorithm is implemented, so this entry point reaches for it as rarely as it can.

**Parameters:**

- `geometry: &Geometry<f64>` — A reference to a `geo_types::Geometry`

**Returns:** `Option<Coord<f64>>` — The point, or `None` if empty

Area geometries take the centroid only when it locates as interior. Strictly inside means the interior and nothing else: a centroid lying exactly on the boundary is rejected and `interior_point` runs. Line and point geometries delegate to `interior_point` unchanged, since at those dimensions it already returns the vertex nearest the centroid.

```rust
use geo_types::{Geometry, LineString, Polygon};
use interior_point::{centroid_first_interior_point, interior_point};

let triangle: Geometry<f64> = Polygon::new(
    LineString::from(vec![(0.0, 0.0), (6.0, 0.0), (0.0, 6.0), (0.0, 0.0)]),
    vec![],
)
.into();

centroid_first_interior_point(&triangle); // => Some(Coord { x: 2.0, y: 2.0 })
interior_point(&triangle); // => Some(Coord { x: 1.5, y: 3.0 })
```

The return value is the point alone; which of the two branches produced it is not reported. A caller that needs to know can compare the result against a centroid it computes itself. Every path that does not accept the centroid ends in `interior_point`, so a degenerate geometry behaves exactly as it does through `interior_point`.

## `verify_interior_point(point, geometry)`

Checks a point against the geometry it was computed from, using a point-in-polygon locator that shares no code with the algorithm that produced the point. It answers a question about this crate's output, not about the input's OGC validity — an invalid geometry can still yield a point that verifies.

**Parameters:**

- `point: Option<Coord<f64>>` — the coordinate to check, normally the return value of `interior_point`
- `geometry: Option<&Geometry<f64>>` — the geometry the point should lie on or in, or `None`

**Returns:** `InteriorPointVerification` — one of four outcomes:

| Value                                     | Reached when                                                                                   |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `InteriorPointVerification::Interior`     | an area geometry, and the point lies inside it                                                 |
| `InteriorPointVerification::OnGeometry`   | the point lies on the boundary of an area geometry, or is a vertex of a line or point geometry |
| `InteriorPointVerification::OffGeometry`  | the point lies outside an area geometry, or matches no vertex of a line or point geometry      |
| `InteriorPointVerification::Unverifiable` | `point` is `None`, `geometry` is `None`, or every element of `geometry` is empty               |

`InteriorPointVerification::is_verified` collapses those to a `bool`: `true` for `Interior` and `OnGeometry`, `false` for `OffGeometry` and `Unverifiable`. `false` covers two different things — `OffGeometry` is a failed check, `Unverifiable` the absence of one — so read the value itself when that difference matters. Its `Display` output is the four kebab-case strings `interior`, `on-geometry`, `off-geometry` and `unverifiable`, which is what the CLI prints.

```rust
use interior_point::{interior_point, verify_interior_point};
use geo_types::{Geometry, LineString, Polygon};

let geometry: Geometry<f64> = Polygon::new(
    LineString::from(vec![(0.0, 0.0), (10.0, 0.0), (10.0, 10.0), (0.0, 10.0), (0.0, 0.0)]),
    vec![],
)
.into();

let point = interior_point(&geometry);
assert!(verify_interior_point(point, Some(&geometry)).is_verified());
```

`Some(&geometry)` rather than `&geometry`: one signature serves both the library caller and the CLI, whose records carry an optional geometry because GeoJSON permits a Feature with none.

## Type Reference

| Type                        | Definition                                                       |
| --------------------------- | ---------------------------------------------------------------- |
| `Geometry<f64>`             | `geo_types::Geometry<f64>`                                       |
| `Coord<f64>`                | `geo_types::Coord { x: f64, y: f64 }`                            |
| `InteriorPointVerification` | an enum: `Interior`, `OnGeometry`, `OffGeometry`, `Unverifiable` |

With the default features, `interior_point`, `centroid_first_interior_point`, `verify_interior_point` and `InteriorPointVerification` are the crate's whole public surface; the locator behind the check is crate-internal and is not documented here as a callable item.
