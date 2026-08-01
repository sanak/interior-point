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
 * JTS caches this on the `LinearRing`, so `scanRing` and
 * `ScanLineYOrdinateFinder` both read it for free. A GeoJSON ring cannot carry
 * that cache, so this recomputes on every call and the sharing happens in the
 * caller instead: `InteriorPointPolygon` computes the shell's envelope once and
 * passes it to both readers.
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
 * Widens `a` to cover `b`. A private helper of `envelopeInternalGeometry`, not a
 * substitute for any JTS member the port reaches: JTS builds a geometry's
 * envelope inside each subclass's `computeEnvelopeInternal`, and the
 * `Geometry.getEnvelopeInternal()` tag below records that substitution whole.
 */
function union(a: Envelope, b: Envelope): Envelope {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

/**
 * A whole geometry's envelope.
 *
 * `envelopeInternal` above takes a ring; this takes a geometry. JTS has one
 * `Geometry.getEnvelopeInternal()` that `LinearRing` inherits, so this is not a
 * Java overload and the overload-suffix rule does not apply — the split into two functions
 * exists because neither target model has a supertype spanning rings and
 * geometries. The two are told apart by their tags.
 *
 * A polygon's envelope is its shell's: holes lie inside the shell and cannot
 * widen it, which is what JTS's `Polygon.computeEnvelopeInternal` relies on.
 *
 * An empty geometry yields `envelopeInternal([])`, whose reversed bounds make
 * `envelopeIntersectsCoordinate` false for every point — the same "intersects
 * nothing" answer JTS's empty `Envelope` gives.
 *
 * @jts-adapter Geometry.getEnvelopeInternal()
 */
export function envelopeInternalGeometry(geometry: Geometry): Envelope {
  switch (geometry.type) {
    case "Point":
      return envelopeInternal([geometry.coordinates]);
    case "MultiPoint":
    case "LineString":
      return envelopeInternal(geometry.coordinates);
    case "MultiLineString":
      return geometry.coordinates.map((line) => envelopeInternal(line)).reduce(union, envelopeInternal([]));
    case "Polygon":
      return envelopeInternal(geometry.coordinates[0] ?? []);
    case "MultiPolygon":
      return geometry.coordinates.map((poly) => envelopeInternal(poly[0] ?? [])).reduce(union, envelopeInternal([]));
    case "GeometryCollection":
      return geometry.geometries.map(envelopeInternalGeometry).reduce(union, envelopeInternal([]));
  }
}

/**
 * Tests whether an envelope contains a point, boundary included.
 *
 * JTS spells this `!(x > maxx || x < minx || y > maxy || y < miny)`; the
 * positive form below is the same predicate.
 *
 * @jts-adapter Envelope.intersects(Coordinate)
 */
export function envelopeIntersectsCoordinate(env: Envelope, p: Coordinate): boolean {
  return p[0] >= env.minX && p[0] <= env.maxX && p[1] >= env.minY && p[1] <= env.maxY;
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
 * The coordinates of every non-empty element whose own `dimension` equals `dim`,
 * in traversal order, descending through a `GeometryCollection`. Empty elements
 * contribute nothing, and neither does an element of any other dimension.
 *
 * Walking a geometry to collect coordinates is a geometry-model helper, so it
 * lives here with the rest of them. The dimension is a parameter rather than
 * something this function computes: the one its caller needs is
 * `InteriorPoint`'s `dimensionNonEmpty`, which additionally skips empty
 * elements and which lives in a module that already imports this one, so
 * computing it here would close an import cycle.
 *
 * @jts-adapter Geometry.getCoordinates()
 */
export function coordinatesAtDimension(geometry: Geometry, dim: number): Coordinate[] {
  if (geometry.type === "GeometryCollection") {
    const found: Coordinate[] = [];
    for (const g of geometry.geometries) {
      for (const coordinate of coordinatesAtDimension(g, dim)) found.push(coordinate);
    }
    return found;
  }
  if (isGeometryEmpty(geometry) || dimension(geometry) !== dim) return [];
  switch (geometry.type) {
    case "Point":
      return [geometry.coordinates];
    case "MultiPoint":
    case "LineString":
      return geometry.coordinates;
    case "MultiLineString":
    case "Polygon":
      return geometry.coordinates.flat();
    case "MultiPolygon":
      return geometry.coordinates.flat(2);
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
