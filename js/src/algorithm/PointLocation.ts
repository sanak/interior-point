import type { Coordinate } from "../GeometryAdapter.ts";

import { EXTERIOR } from "../geom/Location.ts";
import { RayCrossingCounter } from "./RayCrossingCounter.ts";

/**
 * Functions for locating points within basic geometric structures such as line
 * segments, lines and rings.
 *
 * Only the ring half is ported: `isOnSegment` and both `isOnLine` overloads are
 * linear predicates outside the point-in-polygon stack.
 *
 * @jts PointLocation
 */

/**
 * Tests whether a point lies inside or on a ring. The ring may be oriented in
 * either direction. A point lying exactly on the ring boundary is considered to
 * be inside the ring.
 *
 * This function does *not* first check the point against the envelope of the
 * ring.
 *
 * @param p point to check for ring inclusion
 * @param ring an array of coordinates representing the ring (which must have
 *   first point identical to last point)
 * @return true if p is inside ring
 * @jts PointLocation#isInRing(Coordinate,Coordinate[])
 */
export function isInRing(p: Coordinate, ring: Coordinate[]): boolean {
  return locateInRing(p, ring) !== EXTERIOR;
}

/**
 * Determines whether a point lies in the interior, on the boundary, or in the
 * exterior of a ring. The ring may be oriented in either direction.
 *
 * This function does *not* first check the point against the envelope of the
 * ring.
 *
 * @param p point to check for ring inclusion
 * @param ring an array of coordinates representing the ring (which must have
 *   first point identical to last point)
 * @return the Location of p relative to the ring
 * @jts PointLocation#locateInRing(Coordinate,Coordinate[])
 */
export function locateInRing(p: Coordinate, ring: Coordinate[]): number {
  return RayCrossingCounter.locatePointInRingCoordinateCoordinates(p, ring);
}
