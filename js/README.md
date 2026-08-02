# interior-point

Compute an interior point (representative point) of any GeoJSON geometry.

Ported from the [JTS Topology Suite](https://github.com/locationtech/jts) `InteriorPoint` algorithm. GeoJSON-native. The library itself has no runtime dependencies; the bundled `interior-point` CLI uses [betterknown](https://github.com/placemark/betterknown) for WKT conversion.

## Installation

```bash
npm install interior-point
```

## Usage

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

## API

### `interiorPoint(geometry: Geometry | null): Position | null`

Returns a `[x, y]` position guaranteed to lie inside the geometry (for polygons) or on the geometry (for lines/points). Returns `null` for empty geometries.

**Supported geometry types:**

- `Polygon`, `MultiPolygon` — scanline interior point
- `LineString`, `MultiLineString` — vertex nearest to centroid
- `Point`, `MultiPoint` — point nearest to centroid
- `GeometryCollection` — uses highest-dimension non-empty component

### `centroidFirstInteriorPoint(geometry: Geometry | null): Coordinate | null`

Computes the geometry's centroid and returns it when it lies strictly inside the geometry, falling back to `interiorPoint` when it does not. A representative point is more useful when it is the centroid, because the fallback returns a point that depends on how the algorithm is implemented.

Strictly inside means the interior and nothing else: a centroid exactly on the boundary is rejected. `LineString`, `MultiLineString`, `Point` and `MultiPoint` delegate to `interiorPoint` unchanged, and an empty or `null` geometry returns `null`.

The return value is the point alone — which of the two produced it is not reported. The bundled `interior-point` command applies the same entry point to every record when given `--centroid-first`.

### `verifyInteriorPoint(point: Coordinate | null, geometry: Geometry | null): InteriorPointVerification`

Checks a point against the geometry it was computed from, through a point-in-polygon locator that shares no code with the algorithm that produced the point. Returns one of `Interior`, `OnGeometry`, `OffGeometry` or `Unverifiable`, whose values are the strings `"interior"`, `"on-geometry"`, `"off-geometry"` and `"unverifiable"`.

`Interior` and `OnGeometry` are passes, `OffGeometry` is the only failure, and `Unverifiable` means there was no point to check or no geometry to check it against. `Coordinate` is the package's re-exported alias of GeoJSON's `Position`.

This verifies the library's own output. It is not an OGC geometry validity check: an invalid geometry can still yield a point that verifies.

### `isVerified(verification: InteriorPointVerification): boolean`

`true` for `Interior` and `OnGeometry`, `false` for `OffGeometry` and `Unverifiable`.

The bundled `interior-point` command runs the same check over every record when given `--verify`.

## License

[MIT](./LICENSE)

This library contains algorithms ported from JTS (EPL 2.0 / [EDL 1.0](./LICENSE_EDLv1.txt)).
