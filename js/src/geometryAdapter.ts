// The single sanctioned `Position` import in `js/src`: the alias below is what
// every other module uses in its place, so this file must name the underlying
// GeoJSON type once to define it.
// eslint-disable-next-line no-restricted-imports
import type { Geometry, Position } from "geojson";

/**
 * The adapter between JTS's geometry model and GeoJSON. The adapter boundary:
 * every geometry-model helper the ported algorithms need lives here, and
 * nothing else in `js/src` may define one.
 */

/**
 * JTS's `Coordinate`. GeoJSON names the same thing `Position`; because that is
 * a structural alias (`number[]`) rather than a nominal type, this alias
 * introduces a second label for one type rather than renaming anyone's type.
 *
 * @jts-adapter Coordinate
 */
export type Coordinate = Position;

/**
 * JTS's `Envelope`, reduced to what the ported algorithms read. GeoJSON has no
 * named record for this — a `bbox` is a positional `number[]` — so the adapter
 * defines it, and per the adapter boundary it therefore keeps the JTS name.
 *
 * @jts-adapter Envelope
 */
export interface Envelope {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Computes a ring's envelope in a single pass.
 *
 * JTS caches this on the `LinearRing` and reads it back in both `scanRing` and
 * `ScanLineYOrdinateFinder`; computing it once here is what removes the
 * duplicate exterior-ring scan.
 *
 * @jts-adapter LinearRing.getEnvelopeInternal()
 */
export function envelopeInternal(ring: Coordinate[]): Envelope {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  // Indexed rather than `for (const [x, y] of ring)`. This runs once per ring
  // per scan, and destructuring each Position allocates: measured 4.8x slower
  // on a 100,000-point ring, which showed up as a whole-benchmark regression
  // when the retrofit put this on the areal path.
  for (let i = 0; i < ring.length; i++) {
    const x = ring[i][0];
    const y = ring[i][1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * @jts-adapter Geometry.isEmpty()
 */
export function isGeometryEmpty(geometry: Geometry): boolean {
  switch (geometry.type) {
    case "Point":
      return geometry.coordinates.length === 0;
    case "MultiPoint":
    case "LineString":
      return geometry.coordinates.length === 0;
    case "MultiLineString":
    case "Polygon":
      return geometry.coordinates.length === 0;
    case "MultiPolygon":
      return geometry.coordinates.length === 0;
    case "GeometryCollection":
      return geometry.geometries.length === 0 || geometry.geometries.every(isGeometryEmpty);
  }
}

/**
 * The topological dimension of a geometry: 0 for puntal, 1 for lineal, 2 for
 * areal. A GeometryCollection takes the highest dimension among its members,
 * matching JTS's `GeometryCollection.getDimension()`.
 *
 * This is **not** `InteriorPoint.dimensionNonEmpty`, which additionally skips
 * empty elements; that lives in `interiorPoint.ts` as a port of the JTS filter.
 *
 * @jts-adapter Geometry.getDimension()
 */
export function dimension(geometry: Geometry): number {
  switch (geometry.type) {
    case "Point":
    case "MultiPoint":
      return 0;
    case "LineString":
    case "MultiLineString":
      return 1;
    case "Polygon":
    case "MultiPolygon":
      return 2;
    case "GeometryCollection": {
      let maxDim = -1;
      for (const g of geometry.geometries) {
        const d = dimension(g);
        if (d > maxDim) maxDim = d;
      }
      return maxDim;
    }
  }
}

/**
 * @jts-adapter Coordinate.distance(Coordinate)
 */
export function distance(a: Coordinate, b: Coordinate): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return Math.sqrt(dx * dx + dy * dy);
}
