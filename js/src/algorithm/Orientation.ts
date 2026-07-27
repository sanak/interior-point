import type { Coordinate } from "../GeometryAdapter";

import { orientationIndexCoordinate } from "./CGAlgorithmsDD";

/**
 * Functions to compute the orientation of basic geometric structures
 * including point triplets (triangles) and rings.
 *
 * Only the subset reachable from `Centroid.addShell` is ported; see
 * `portedMembers` for `upstream/jts/main/algorithm/Orientation.java` in
 * `upstream/jts/pin.json`.
 *
 * @jts Orientation
 */

/**
 * A value that indicates an orientation of clockwise, or a right turn.
 * @jts Orientation#CLOCKWISE
 */
export const CLOCKWISE = -1;

/**
 * A value that indicates an orientation of counterclockwise, or a left turn.
 * @jts Orientation#COUNTERCLOCKWISE
 */
export const COUNTERCLOCKWISE = 1;

/**
 * A value that indicates an orientation of collinear, or no turn.
 * @jts Orientation#COLLINEAR
 */
export const COLLINEAR = 0;

/**
 * A value that indicates an orientation of clockwise, or a right turn.
 * @jts Orientation#RIGHT
 */
export const RIGHT = CLOCKWISE;

/**
 * A value that indicates an orientation of counterclockwise, or a left turn.
 * @jts Orientation#LEFT
 */
export const LEFT = COUNTERCLOCKWISE;

/**
 * A value that indicates an orientation of collinear, or no turn.
 * @jts Orientation#STRAIGHT
 */
export const STRAIGHT = COLLINEAR;

/**
 * Returns the orientation index of the direction of the point <code>q</code> relative to
 * a directed infinite line specified by <code>p1-p2</code>.
 *
 * @param p1 the origin point of the line vector
 * @param p2 the final point of the line vector
 * @param q the point to compute the direction to
 * @return -1 if q is clockwise (right) from p1-p2;
 *          1 if q is counter-clockwise (left) from p1-p2;
 *          0 if q is collinear with p1-p2
 * @jts Orientation#index(Coordinate,Coordinate,Coordinate)
 */
export function index(p1: Coordinate, p2: Coordinate, q: Coordinate): number {
  return orientationIndexCoordinate(p1, p2, q);
}

/**
 * Tests if a ring defined by an array of {@link Coordinate}s is
 * oriented counter-clockwise.
 *
 * @param ring an array of Coordinates forming a ring (with first and last point identical)
 * @return true if the ring is oriented counter-clockwise.
 * @jts Orientation#isCCW(Coordinate[])
 */
export function isCCWCoordinates(ring: Coordinate[]): boolean {
  // wrap with an XY CoordinateSequence
  return isCCWCoordinateSequence(ring);
}

/**
 * Tests if a ring defined by a CoordinateSequence is
 * oriented counter-clockwise.
 *
 * This algorithm is guaranteed to work with valid rings.
 * It also works with "mildly invalid" rings which contain collapsed
 * (coincident) flat segments along the top of the ring.
 *
 * @param ring a ring (with first and last point identical)
 * @return true if the ring is oriented counter-clockwise.
 * @jts Orientation#isCCW(CoordinateSequence)
 * @jts-adapter CoordinateSequence — the ports have no sequence abstraction, so
 *   both overloads take the same coordinate array and the array overload's
 *   CoordinateArraySequence wrap is a no-op.
 */
export function isCCWCoordinateSequence(ring: Coordinate[]): boolean {
  // # of points without closing endpoint
  const nPts = ring.length - 1;
  // return default value if ring is flat
  if (nPts < 3) return false;

  /*
   * Find first highest point after a lower point, if one exists
   * (e.g. a rising segment)
   * If one does not exist, hiIndex will remain 0
   * and the ring must be flat.
   * Note this relies on the convention that
   * rings have the same start and end point.
   */
  let upHiPt = ring[0];
  let prevY = upHiPt[1];
  let upLowPt: Coordinate | null = null;
  let iUpHi = 0;
  for (let i = 1; i <= nPts; i++) {
    const py = ring[i][1];
    /*
     * If segment is upwards and endpoint is higher, record it
     */
    if (py > prevY && py >= upHiPt[1]) {
      upHiPt = ring[i];
      iUpHi = i;
      upLowPt = ring[i - 1];
    }
    prevY = py;
  }
  /*
   * Check if ring is flat and return default value if so
   */
  if (iUpHi === 0) return false;

  /*
   * Find the next lower point after the high point
   * (e.g. a falling segment).
   * This must exist since ring is not flat.
   */
  let iDownLow = iUpHi;
  do {
    iDownLow = (iDownLow + 1) % nPts;
  } while (iDownLow !== iUpHi && ring[iDownLow][1] === upHiPt[1]);

  const downLowPt = ring[iDownLow];
  const iDownHi = iDownLow > 0 ? iDownLow - 1 : nPts - 1;
  const downHiPt = ring[iDownHi];

  /*
   * Two cases can occur:
   * 1) the hiPt and the downPrevPt are the same.
   *    This is the general position case of a "pointed cap".
   *    The ring orientation is determined by the orientation of the cap
   * 2) The hiPt and the downPrevPt are different.
   *    In this case the top of the cap is flat.
   *    The ring orientation is given by the direction of the flat segment
   */
  if (equals2D(upHiPt, downHiPt)) {
    /*
     * Check for the case where the cap has configuration A-B-A.
     * This can happen if the ring does not contain 3 distinct points
     * (including the case where the input array has fewer than 4 elements), or
     * it contains coincident line segments.
     *
     * The `upLowPt === null` test is an addition: Java reaches this branch only
     * when iUpHi !== 0, which implies upLowPt was assigned, but TypeScript's flow
     * analysis cannot see that. Returning false is what the A-B-A case returns
     * anyway, so no observable behaviour changes.
     */
    if (upLowPt === null || equals2D(upLowPt, upHiPt) || equals2D(downLowPt, upHiPt) || equals2D(upLowPt, downLowPt)) {
      return false;
    }

    /*
     * It can happen that the top segments are coincident.
     * This is an invalid ring, which cannot be computed correctly.
     * In this case the orientation is 0, and the result is false.
     */
    return index(upLowPt, upHiPt, downLowPt) === COUNTERCLOCKWISE;
  } else {
    /*
     * Flat cap - direction of flat top determines orientation
     */
    const delX = downHiPt[0] - upHiPt[0];
    return delX < 0;
  }
}

/**
 * @jts-adapter Coordinate#equals2D(Coordinate) — the geometry model has no
 *   Coordinate class, so 2D equality is a local helper.
 */
function equals2D(a: Coordinate, b: Coordinate): boolean {
  return a[0] === b[0] && a[1] === b[1];
}
