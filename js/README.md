# interior-point

Compute an interior point (representative point) of any GeoJSON geometry.

Ported from the [JTS Topology Suite](https://github.com/locationtech/jts) `InteriorPoint` algorithm. GeoJSON-native, zero runtime dependencies.

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

## License

[MIT](./LICENSE)

This library contains algorithms ported from JTS (EPL 2.0 / [EDL 1.0](./LICENSE_EDLv1.txt)).
