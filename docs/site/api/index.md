# API Reference

## TypeScript

Accepts [GeoJSON](https://datatracker.ietf.org/doc/html/rfc7946) geometry objects and returns a `Coordinate` (`[x, y]`) or `null`.

### `interiorPoint(geometry)`

Computes an interior point of the given geometry, dispatching to the appropriate algorithm based on geometry dimension:

- **Area** (Polygon/MultiPolygon): scanline algorithm
- **Line** (LineString/MultiLineString): vertex closest to length-weighted centroid
- **Point** (Point/MultiPoint): point closest to arithmetic-mean centroid
- **GeometryCollection**: uses the highest-dimension component

**Parameters:**

- `geometry: Geometry | null` — A GeoJSON Geometry object, or `null`

**Returns:** `Coordinate | null` — `[x, y]` coordinates inside the geometry, or `null` if empty

```typescript
import { interiorPoint } from "interior-point";

interiorPoint({
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
});
// => [1, 5]
```

Returns `null` for empty geometries:

```typescript
interiorPoint(null); // => null
interiorPoint({ type: "GeometryCollection", geometries: [] }); // => null
```

### `verifyInteriorPoint(point, geometry)`

Checks a point against the geometry it was computed from, using a point-in-polygon locator that shares no code with the algorithm that produced the point. It answers a question about this library's output, not about the input's OGC validity — an invalid geometry can still yield a point that verifies.

**Parameters:**

- `point: Coordinate | null` — the coordinate to check, normally the return value of `interiorPoint`
- `geometry: Geometry | null` — the geometry the point should lie on or in, or `null`

**Returns:** `InteriorPointVerification` — one of four outcomes:

| Value                                    | Reached when                                                                                   |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `InteriorPointVerification.Interior`     | an area geometry, and the point lies inside it                                                 |
| `InteriorPointVerification.OnGeometry`   | the point lies on the boundary of an area geometry, or is a vertex of a line or point geometry |
| `InteriorPointVerification.OffGeometry`  | the point lies outside an area geometry, or matches no vertex of a line or point geometry      |
| `InteriorPointVerification.Unverifiable` | `point` is `null`, or `geometry` is `null`                                                     |

```typescript
import { interiorPoint, isVerified, verifyInteriorPoint, InteriorPointVerification } from "interior-point";

const polygon = {
  type: "Polygon",
  coordinates: [
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ],
  ],
};

const point = interiorPoint(polygon);
verifyInteriorPoint(point, polygon); // => InteriorPointVerification.Interior
verifyInteriorPoint([100, 100], polygon); // => InteriorPointVerification.OffGeometry
verifyInteriorPoint(null, null); // => InteriorPointVerification.Unverifiable
```

### `isVerified(verification)`

**Parameters:**

- `verification: InteriorPointVerification` — an outcome from `verifyInteriorPoint`

**Returns:** `boolean` — `true` for `Interior` and `OnGeometry`, `false` for `OffGeometry` and `Unverifiable`

```typescript
isVerified(verifyInteriorPoint(interiorPoint(polygon), polygon)); // => true
```

`false` covers two different things: `OffGeometry` is a failed check, while `Unverifiable` is the absence of one. Read the value itself when that difference matters — the CLI does, which is why an `unverifiable` record leaves the exit code at 0.

### Type Reference

| Type                        | Definition                                                                       |
| --------------------------- | -------------------------------------------------------------------------------- |
| `Geometry`                  | GeoJSON `Geometry` from `@types/geojson`                                         |
| `Coordinate`                | `number[]` (an alias of GeoJSON `Position`)                                      |
| `InteriorPointVerification` | a string enum: `"interior"`, `"on-geometry"`, `"off-geometry"`, `"unverifiable"` |

`Coordinate` carries JTS's name for the type and is re-exported from the package
root. It is a plain alias of GeoJSON's `Position`, so existing code that annotates
results as `Position` keeps compiling unchanged.

---

## Rust

### `interior_point(geometry)`

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
// => Some(Coord { x: 5.0, y: 5.0 })
```

Returns `None` for empty geometries:

```rust
use geo_types::GeometryCollection;
let empty = GeometryCollection::<f64>(vec![]).into();
assert_eq!(interior_point::interior_point(&empty), None);
```

### `verify_interior_point(point, geometry)`

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
| `InteriorPointVerification::Unverifiable` | `point` is `None`, or `geometry` is `None`                                                     |

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

### Type Reference

| Type                        | Definition                                                       |
| --------------------------- | ---------------------------------------------------------------- |
| `Geometry<f64>`             | `geo_types::Geometry<f64>`                                       |
| `Coord<f64>`                | `geo_types::Coord { x: f64, y: f64 }`                            |
| `InteriorPointVerification` | an enum: `Interior`, `OnGeometry`, `OffGeometry`, `Unverifiable` |

`interior_point`, `verify_interior_point` and `InteriorPointVerification` are the crate's whole public surface; the locator behind the check is crate-internal and is not documented here as a callable item.
