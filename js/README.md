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

Supported geometry types are `Polygon`, `MultiPolygon`, `LineString`, `MultiLineString`, `Point`, `MultiPoint` and `GeometryCollection`. An empty geometry returns `null`.

## API

| Export                       | Signature                                                                 | Returns                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `interiorPoint`              | `(geometry: Geometry \| null) => Coordinate \| null`                      | a point inside the geometry, or on it for lines and points                                 |
| `verifyInteriorPoint`        | `(point: Coordinate \| null, geometry: Geometry \| null) => Verification` | one of `"interior"`, `"on-geometry"`, `"off-geometry"`, `"unverifiable"`                   |
| `centroidFirstInteriorPoint` | `(geometry: Geometry \| null) => Coordinate \| null`                      | the geometry's centroid when it lies strictly inside, and `interiorPoint` when it does not |

`Coordinate` is the package's re-exported alias of GeoJSON's `Position`. Verification runs through a point-in-polygon locator that shares no code with the algorithm that produced the point, and checks this library's own output rather than the input's OGC validity.

Full signatures, the four verification outcomes and the reasoning behind each entry point: [API reference](https://sanak.github.io/interior-point/api/typescript).

## CLI

The package also installs an `interior-point` command:

```bash
npm install -g interior-point
interior-point -i "POLYGON ((0 0, 10 0, 10 10, 0 10, 0 0))"
# => {"type":"Point","coordinates":[5,5]}
```

It reads WKT or GeoJSON — as a literal, a file, or on stdin — and writes GeoJSON by default or one WKT geometry per line. See the [CLI page](https://sanak.github.io/interior-point/cli) for every flag, the output shapes and the exit codes.

## Documentation

Full documentation: https://sanak.github.io/interior-point/

## Development

This library was developed with the assistance of [Claude Code](https://claude.com/claude-code); every ported member is anchored to its JTS counterpart and checked against JTS's own test resources.

## License

[MIT](./LICENSE)

This library contains algorithms ported from JTS (EPL 2.0 / [EDL 1.0](./LICENSE_EDLv1.txt)).
