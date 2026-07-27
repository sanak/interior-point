import type { Coordinate } from "../GeometryAdapter";

import { BOUNDARY, EXTERIOR, INTERIOR } from "../geom/Location";
import { COLLINEAR, LEFT, index } from "./Orientation";

/**
 * Counts the number of segments crossed by a horizontal ray extending to the
 * right from a given point, in an incremental fashion. This can be used to
 * determine whether a point lies in a polygonal geometry. The class determines
 * the situation where the point lies exactly on a segment. When being used for
 * Point-In-Polygon determination, this case allows short-circuiting the
 * evaluation.
 *
 * This class handles polygonal geometries with any number of shells and holes.
 * The orientation of the shell and hole rings is unimportant.
 *
 * This implementation uses the extended-precision orientation test, to provide
 * maximum robustness and consistency within other algorithms.
 *
 * @jts RayCrossingCounter
 */
export class RayCrossingCounter {
  /**
   * Determines the Location of a point in a ring. This method is an exemplar of
   * how to use this class.
   *
   * @param p the point to test
   * @param ring an array of Coordinates forming a ring
   * @return the location of the point in the ring
   * @jts RayCrossingCounter#locatePointInRing(Coordinate,Coordinate[])
   * @jts-adapter RayCrossingCounter#locatePointInRing(Coordinate,CoordinateSequence)
   *   — the ports have no sequence abstraction, so only the array overload is
   *   ported and it stands in for both. The name carries every parameter type
   *   because the overload-suffix rule decides the form from the whole Java overload set, not
   *   from the subset that is ported.
   */
  static locatePointInRingCoordinateCoordinates(p: Coordinate, ring: Coordinate[]): number {
    const counter = new RayCrossingCounter(p);

    for (let i = 1; i < ring.length; i++) {
      const p1 = ring[i];
      const p2 = ring[i - 1];
      counter.countSegment(p1, p2);
      if (counter.isOnSegment()) return counter.getLocation();
    }
    return counter.getLocation();
  }

  private p: Coordinate;
  private crossingCount = 0;
  // true if the test point lies on an input segment
  private isPointOnSegment = false;

  /** @jts RayCrossingCounter#RayCrossingCounter(Coordinate) */
  constructor(p: Coordinate) {
    this.p = p;
  }

  /**
   * Counts a segment.
   *
   * @param p1 an endpoint of the segment
   * @param p2 another endpoint of the segment
   * @jts RayCrossingCounter#countSegment(Coordinate,Coordinate)
   */
  countSegment(p1: Coordinate, p2: Coordinate): void {
    /*
     * For each segment, check if it crosses a horizontal ray running from the
     * test point in the positive x direction.
     */

    // check if the segment is strictly to the left of the test point
    if (p1[0] < this.p[0] && p2[0] < this.p[0]) return;

    // check if the point is equal to the current ring vertex
    if (this.p[0] === p2[0] && this.p[1] === p2[1]) {
      this.isPointOnSegment = true;
      return;
    }
    /*
     * For horizontal segments, check if the point is on the segment.
     * Otherwise, horizontal segments are not counted.
     */
    if (p1[1] === this.p[1] && p2[1] === this.p[1]) {
      let minx = p1[0];
      let maxx = p2[0];
      if (minx > maxx) {
        minx = p2[0];
        maxx = p1[0];
      }
      if (this.p[0] >= minx && this.p[0] <= maxx) {
        this.isPointOnSegment = true;
      }
      return;
    }
    /*
     * Evaluate all non-horizontal segments which cross a horizontal ray to the
     * right of the test pt. To avoid double-counting shared vertices, we use the
     * convention that
     *  - an upward edge includes its starting endpoint, and excludes its final endpoint
     *  - a downward edge excludes its starting endpoint, and includes its final endpoint
     */
    if ((p1[1] > this.p[1] && p2[1] <= this.p[1]) || (p2[1] > this.p[1] && p1[1] <= this.p[1])) {
      let orient = index(p1, p2, this.p);
      if (orient === COLLINEAR) {
        this.isPointOnSegment = true;
        return;
      }
      // Re-orient the result if needed to ensure effective segment direction is upwards
      if (p2[1] < p1[1]) {
        orient = -orient;
      }
      // The upward segment crosses the ray if the test point lies to the left (CCW) of the segment.
      if (orient === LEFT) {
        this.crossingCount++;
      }
    }
  }

  /**
   * Gets the count of crossings.
   *
   * @return the crossing count
   * @jts RayCrossingCounter#getCount()
   */
  getCount(): number {
    return this.crossingCount;
  }

  /**
   * Reports whether the point lies exactly on one of the supplied segments.
   * This method may be called at any time as segments are processed. If the
   * result of this method is true, no further segments need be supplied, since
   * the result will never change again.
   *
   * @return true if the point lies exactly on a segment
   * @jts RayCrossingCounter#isOnSegment()
   */
  isOnSegment(): boolean {
    return this.isPointOnSegment;
  }

  /**
   * Gets the Location of the point relative to the ring, polygon or
   * multipolygon from which the processed segments were provided.
   *
   * This method only determines the correct location if all relevant segments
   * have been processed.
   *
   * @return the Location of the point
   * @jts RayCrossingCounter#getLocation()
   */
  getLocation(): number {
    if (this.isPointOnSegment) return BOUNDARY;

    // The point is in the interior of the ring if the number of X-crossings is odd.
    if (this.crossingCount % 2 === 1) {
      return INTERIOR;
    }
    return EXTERIOR;
  }

  /**
   * Tests whether the point lies in or on the ring, polygon or multipolygon from
   * which the processed segments were provided.
   *
   * This method only determines the correct location if all relevant segments
   * have been processed.
   *
   * @return true if the point lies in or on the supplied polygon
   * @jts RayCrossingCounter#isPointInPolygon()
   */
  isPointInPolygon(): boolean {
    return this.getLocation() !== EXTERIOR;
  }
}
