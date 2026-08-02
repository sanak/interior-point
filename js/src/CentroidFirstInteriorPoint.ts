/**
 * A centroid-first variant of `interiorPoint`. For an areal geometry it returns
 * the centroid whenever the centroid lies strictly inside that geometry, and
 * otherwise returns exactly what `interiorPoint` returns. Dimensions 0 and 1
 * are handed straight to `interiorPoint`.
 *
 * The centroid is preferred because it is a stable, purely arithmetic function
 * of the input: two implementations that agree on the arithmetic agree on the
 * point. The scanline fallback is not — it depends on the scan line chosen and
 * on the widest interval found along it — so it is worth reaching for only when
 * the centroid is not inside the geometry, which for a convex shape is never.
 *
 * Acceptance is INTERIOR alone. A centroid that lands exactly on the boundary is
 * rejected, which keeps this function from ever returning a point that the
 * geometry only touches, and keeps a degenerate input on the fallback path where
 * it can still carry the Z ordinate its seed vertex had.
 */
import type { Geometry } from "geojson";

import type { Coordinate } from "./GeometryAdapter.ts";
import { isGeometryEmpty } from "./GeometryAdapter.ts";
import { getCentroid } from "./algorithm/Centroid.ts";
import { dimensionNonEmpty, interiorPoint } from "./algorithm/InteriorPoint.ts";
import { locate } from "./algorithm/locate/SimplePointInAreaLocator.ts";
import { INTERIOR } from "./geom/Location.ts";

/**
 * Computes a representative point of a geometry, preferring its centroid.
 *
 * The signature is `interiorPoint`'s, so a caller swaps one call for the other.
 * Which of the two branches produced the point is not reported: a caller that
 * needs to know can compare the result against a centroid it computes itself.
 *
 * Dimensions other than 2 delegate without computing a centroid at all. The
 * check could not pass there — the locator answers EXTERIOR for every point
 * against a puntal or lineal geometry, including that geometry's own vertices —
 * so computing a centroid only to discard it would be pure waste.
 *
 * The predicate calls the locator directly rather than going through
 * `verifyInteriorPoint`: at dimension 2 that function is this same locator call
 * plus a mapping onto its outcome enum, and it would also accept a point on the
 * boundary, which this function does not.
 *
 * @param geom a geometry in which to find a representative point
 * @return the centroid when it lies inside `geom`, otherwise `interiorPoint(geom)`,
 *   or `null` if the input is empty
 * @jts-adapter centroidFirstInteriorPoint
 */
export function centroidFirstInteriorPoint(geom: Geometry | null): Coordinate | null {
  if (geom === null) return null;
  if (isGeometryEmpty(geom)) return null;

  const dim = dimensionNonEmpty(geom);
  if (dim !== 2) return interiorPoint(geom);

  const cent = getCentroid(geom);
  if (cent !== null && locate(cent, geom) === INTERIOR) return cent;
  return interiorPoint(geom);
}
