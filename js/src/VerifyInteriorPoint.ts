/**
 * Output verification for `interiorPoint`. Given a point this package computed
 * and the geometry it was computed from, report where that point sits relative
 * to that geometry.
 *
 * The areal case answers through the point-in-polygon locator, which descends
 * rings with a ray-crossing count and shares nothing with the scanline that
 * produced the point, so the two are independent code paths. Dimension 0 and 1
 * have no interior for a point to be in — a ray-crossing count answers EXTERIOR
 * for every point against a line, including the line's own vertices — so they
 * are checked structurally instead: the point must equal one of the coordinates
 * of the maximum-dimension non-empty elements, per ordinate.
 *
 * This is not OGC geometry validity. A self-intersecting shell or a hole outside
 * its shell can still yield a point that verifies, and a well-formed input can
 * still yield `Unverifiable`; the two properties are independent and neither
 * substitutes for the other.
 */
import type { Geometry } from "geojson";

import type { Coordinate } from "./GeometryAdapter.ts";
import { coordinatesAtDimension } from "./GeometryAdapter.ts";
import { dimensionNonEmpty } from "./algorithm/InteriorPoint.ts";
import { locate } from "./algorithm/locate/SimplePointInAreaLocator.ts";
import { BOUNDARY, INTERIOR } from "./geom/Location.ts";

/**
 * Where a computed point sits relative to the geometry it came from.
 *
 * `Interior` and `OnGeometry` are both passes, and they are not the same fact:
 * a point on the boundary is what the algorithm falls back to when an exact
 * interior point cannot be calculated. `Unverifiable` is a third thing entirely
 * — the absence of an answer rather than a failed one — which is why callers
 * that want a boolean go through `isVerified` and callers that want to know
 * where the point landed read the value.
 *
 * The four values are the strings the command-line surface prints, so they are
 * part of that surface rather than an internal spelling.
 *
 * @jts-adapter InteriorPointVerification
 */
export enum InteriorPointVerification {
  Interior = "interior",
  OnGeometry = "on-geometry",
  OffGeometry = "off-geometry",
  Unverifiable = "unverifiable",
}

/**
 * Checks a computed interior point against the geometry it came from.
 *
 * Both parameters are nullable so that composition is one line with no branch at
 * the call site: the point is exactly what `interiorPoint` returns, and the
 * geometry is exactly what it takes. A null on either side is `Unverifiable`.
 *
 * Dispatch is on `dimensionNonEmpty`, the same function `interiorPoint`
 * dispatches on, rather than on the adapter's `dimension`. The two disagree
 * whenever a collection holds an empty element of higher dimension than its
 * non-empty ones, and following the other one would contradict the algorithm.
 *
 * @param point the point to check, or null
 * @param geometry the geometry the point was computed from, or null
 * @return where the point sits relative to the geometry
 * @jts-adapter verifyInteriorPoint
 */
export function verifyInteriorPoint(point: Coordinate | null, geometry: Geometry | null): InteriorPointVerification {
  if (point === null || geometry === null) return InteriorPointVerification.Unverifiable;

  const dim = dimensionNonEmpty(geometry);
  // Every element is empty. A non-null point cannot arrive here, but answering
  // keeps the function total rather than relying on that argument.
  if (dim < 0) return InteriorPointVerification.Unverifiable;

  if (dim === 2) {
    const location = locate(point, geometry);
    if (location === INTERIOR) return InteriorPointVerification.Interior;
    if (location === BOUNDARY) return InteriorPointVerification.OnGeometry;
    return InteriorPointVerification.OffGeometry;
  }

  // Per ordinate, never by reference: the algorithm stores a fresh array for the
  // point it returns, so identity is never true. The comparison stays inline
  // because the adapter is the only place in this package that may define a
  // geometry-model helper, and its single addition here is the enumeration.
  for (const coordinate of coordinatesAtDimension(geometry, dim)) {
    if (coordinate.length === point.length && coordinate.every((ordinate, i) => ordinate === point[i])) {
      return InteriorPointVerification.OnGeometry;
    }
  }
  return InteriorPointVerification.OffGeometry;
}

/**
 * Whether an outcome is a pass. `Interior` and `OnGeometry` are; `OffGeometry`
 * is not, and neither is `Unverifiable` — though only the first of those two is
 * a failure, which is the distinction the command-line exit code draws.
 *
 * A free function, where Rust's counterpart is an inherent method on the enum.
 * A TypeScript `enum` declaration holds members and nothing else, so there is
 * nowhere on `InteriorPointVerification` for this to live, and the four values
 * are the strings the command line prints, which fixes that representation.
 * The difference in shape is a language constraint, not a difference in meaning.
 *
 * @param v an outcome
 * @return true when the point lies on or in its geometry
 * @jts-adapter isVerified
 */
export function isVerified(v: InteriorPointVerification): boolean {
  return v === InteriorPointVerification.Interior || v === InteriorPointVerification.OnGeometry;
}
