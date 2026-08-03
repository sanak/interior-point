---
layout: doc
---

# TypeScript API

Accepts [GeoJSON](https://datatracker.ietf.org/doc/html/rfc7946) geometry objects and returns a `Coordinate` (`[x, y]`) or `null`.

## `interiorPoint(geometry)`

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

## `centroidFirstInteriorPoint(geometry)`

Computes the geometry's centroid and returns it when it lies strictly inside the geometry; otherwise falls back to `interiorPoint`. A representative point is more useful when it is the centroid: the fallback returns whichever point the scanline algorithm lands on, which depends on how the algorithm is implemented, so this entry point reaches for it as rarely as it can.

**Parameters:**

- `geometry: Geometry | null` — A GeoJSON Geometry object, or `null`

**Returns:** `Coordinate | null` — `[x, y]` coordinates inside the geometry, or `null` if empty

Area geometries take the centroid only when it locates as interior. Strictly inside means the interior and nothing else: a centroid lying exactly on the boundary is rejected and `interiorPoint` runs. Line and point geometries delegate to `interiorPoint` unchanged, since at those dimensions it already returns the vertex nearest the centroid.

```typescript
import { centroidFirstInteriorPoint, interiorPoint } from "interior-point";

const triangle = {
  type: "Polygon",
  coordinates: [
    [
      [0, 0],
      [6, 0],
      [0, 6],
      [0, 0],
    ],
  ],
};

// The centroid lies inside this triangle, so it is the point returned.
centroidFirstInteriorPoint(triangle); // => [2, 2]
interiorPoint(triangle); // => [1.5, 3]
```

The L-shaped polygon in the `interiorPoint` example above is the other case: its centroid is `[2, 3]`, which lies exactly on the edge from `[2, 2]` to `[2, 8]`. That is not strictly inside, so it is rejected and `centroidFirstInteriorPoint` returns the same `[1, 5]` `interiorPoint` does.

The return value is the point alone; which of the two branches produced it is not reported. A caller that needs to know can compare the result against a centroid it computes itself. Every path that does not accept the centroid ends in `interiorPoint`, so a degenerate geometry behaves exactly as it does through `interiorPoint`.

## `verifyInteriorPoint(point, geometry)`

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
| `InteriorPointVerification.Unverifiable` | `point` is `null`, `geometry` is `null`, or every element of `geometry` is empty               |

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

## `isVerified(verification)`

**Parameters:**

- `verification: InteriorPointVerification` — an outcome from `verifyInteriorPoint`

**Returns:** `boolean` — `true` for `Interior` and `OnGeometry`, `false` for `OffGeometry` and `Unverifiable`

```typescript
isVerified(verifyInteriorPoint(interiorPoint(polygon), polygon)); // => true
```

`false` covers two different things: `OffGeometry` is a failed check, while `Unverifiable` is the absence of one. Read the value itself when that difference matters — the CLI does, which is why an `unverifiable` record leaves the exit code at 0.

## Type Reference

| Type                        | Definition                                                                       |
| --------------------------- | -------------------------------------------------------------------------------- |
| `Geometry`                  | GeoJSON `Geometry` from `@types/geojson`                                         |
| `Coordinate`                | `number[]` (an alias of GeoJSON `Position`)                                      |
| `InteriorPointVerification` | a string enum: `"interior"`, `"on-geometry"`, `"off-geometry"`, `"unverifiable"` |

`Coordinate` carries JTS's name for the type and is re-exported from the package
root. It is a plain alias of GeoJSON's `Position`, so existing code that annotates
results as `Position` keeps compiling unchanged.
