import type { Coordinate } from "../GeometryAdapter";

import { DD } from "../math/DD";

/**
 * Implements various fundamental Computational Geometric algorithms using
 * {@link DD} arithmetic.
 *
 * Only the subset reachable from `Orientation.isCCW` is ported; see
 * `portedMembers` for `upstream/jts/main/algorithm/CGAlgorithmsDD.java` in
 * `upstream/jts/pin.json`.
 *
 * @jts CGAlgorithmsDD
 */

/**
 * Returns the index of the direction of the point <code>q</code> relative to
 * a vector specified by <code>p1-p2</code>.
 *
 * @param p1 the origin point of the vector
 * @param p2 the final point of the vector
 * @param q the point to compute the direction to
 * @return 1 if q is counter-clockwise (left) from p1-p2
 *        -1 if q is clockwise (right) from p1-p2
 *         0 if q is collinear with p1-p2
 * @jts CGAlgorithmsDD#orientationIndex(Coordinate,Coordinate,Coordinate)
 */
export function orientationIndexCoordinate(p1: Coordinate, p2: Coordinate, q: Coordinate): number {
  return orientationIndexDouble(p1[0], p1[1], p2[0], p2[1], q[0], q[1]);
}

/**
 * Returns the index of the direction of the point <code>q</code> relative to
 * a vector specified by <code>p1-p2</code>.
 *
 * @return 1 if q is counter-clockwise (left) from p1-p2
 *        -1 if q is clockwise (right) from p1-p2
 *         0 if q is collinear with p1-p2
 * @jts CGAlgorithmsDD#orientationIndex(double,double,double,double,double,double)
 */
export function orientationIndexDouble(
  p1x: number,
  p1y: number,
  p2x: number,
  p2y: number,
  qx: number,
  qy: number,
): number {
  // fast filter for orientation index
  // avoids use of slow extended-precision arithmetic in many cases
  const index = orientationIndexFilter(p1x, p1y, p2x, p2y, qx, qy);
  if (index <= 1) return index;

  // normalize coordinates
  const dx1 = DD.valueOfDouble(p2x).selfAddDouble(-p1x);
  const dy1 = DD.valueOfDouble(p2y).selfAddDouble(-p1y);
  const dx2 = DD.valueOfDouble(qx).selfAddDouble(-p2x);
  const dy2 = DD.valueOfDouble(qy).selfAddDouble(-p2y);

  // sign of determinant - unrolled for performance
  return dx1.selfMultiplyDD(dy2).selfSubtractDD(dy1.selfMultiplyDD(dx2)).signum();
}

/** @jts CGAlgorithmsDD#DP_SAFE_EPSILON */
const DP_SAFE_EPSILON = 1e-15;

/**
 * A filter for computing the orientation index of three coordinates.
 * <p>
 * If the orientation can be computed safely using standard DP
 * arithmetic, this routine returns the orientation index.
 * Otherwise, a value i > 1 is returned.
 * In this case the orientation index must
 * be computed using some other more robust method.
 * <p>
 * Uses an approach due to Jonathan Shewchuk, which is in the public domain.
 *
 * @return the orientation index if it can be computed safely, or i > 1 if it cannot
 * @jts CGAlgorithmsDD#orientationIndexFilter(double,double,double,double,double,double)
 */
function orientationIndexFilter(pax: number, pay: number, pbx: number, pby: number, pcx: number, pcy: number): number {
  let detsum: number;

  const detleft = (pax - pcx) * (pby - pcy);
  const detright = (pay - pcy) * (pbx - pcx);
  const det = detleft - detright;

  if (detleft > 0.0) {
    if (detright <= 0.0) {
      return signum(det);
    } else {
      detsum = detleft + detright;
    }
  } else if (detleft < 0.0) {
    if (detright >= 0.0) {
      return signum(det);
    } else {
      detsum = -detleft - detright;
    }
  } else {
    return signum(det);
  }

  const errbound = DP_SAFE_EPSILON * detsum;
  if (det >= errbound || -det >= errbound) {
    return signum(det);
  }

  return 2;
}

/** @jts CGAlgorithmsDD#signum(double) */
function signum(x: number): number {
  if (x > 0) return 1;
  if (x < 0) return -1;
  return 0;
}
