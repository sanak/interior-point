//! Implements various fundamental Computational Geometric algorithms using
//! [`DD`] arithmetic.
//!
//! Only the subset reachable from [`crate::orientation::is_ccw_coordinates`] is
//! ported; see `portedMembers` for `upstream/jts/algorithm/CGAlgorithmsDD.java`
//! in `upstream/jts/pin.json`.
//!
//! @jts CGAlgorithmsDD

use geo_types::Coord;

use crate::dd::DD;

/// Returns the index of the direction of the point `q` relative to
/// a vector specified by `p1-p2`.
///
/// Returns 1 if q is counter-clockwise (left) from p1-p2,
/// -1 if q is clockwise (right) from p1-p2,
/// 0 if q is collinear with p1-p2.
///
/// @jts CGAlgorithmsDD#orientationIndex(Coordinate,Coordinate,Coordinate)
pub(crate) fn orientation_index_coordinate(p1: Coord<f64>, p2: Coord<f64>, q: Coord<f64>) -> i32 {
    orientation_index_double(p1.x, p1.y, p2.x, p2.y, q.x, q.y)
}

/// Returns the index of the direction of the point `q` relative to
/// a vector specified by `p1-p2`.
///
/// @jts CGAlgorithmsDD#orientationIndex(double,double,double,double,double,double)
pub(crate) fn orientation_index_double(
    p1x: f64,
    p1y: f64,
    p2x: f64,
    p2y: f64,
    qx: f64,
    qy: f64,
) -> i32 {
    // fast filter for orientation index
    // avoids use of slow extended-precision arithmetic in many cases
    let index = orientation_index_filter(p1x, p1y, p2x, p2y, qx, qy);
    if index <= 1 {
        return index;
    }

    // normalize coordinates
    let mut dx1 = DD::value_of_double(p2x);
    dx1.self_add_double(-p1x);
    let mut dy1 = DD::value_of_double(p2y);
    dy1.self_add_double(-p1y);
    let mut dx2 = DD::value_of_double(qx);
    dx2.self_add_double(-p2x);
    let mut dy2 = DD::value_of_double(qy);
    dy2.self_add_double(-p2y);

    // sign of determinant - unrolled for performance
    dx1.self_multiply_dd(dy2);
    dy1.self_multiply_dd(dx2);
    dx1.self_subtract_dd(dy1);
    dx1.signum()
}

/// @jts CGAlgorithmsDD#DP_SAFE_EPSILON
const DP_SAFE_EPSILON: f64 = 1e-15;

/// A filter for computing the orientation index of three coordinates.
///
/// If the orientation can be computed safely using standard DP arithmetic,
/// this routine returns the orientation index. Otherwise, a value i > 1 is
/// returned, and the orientation index must be computed using some other more
/// robust method.
///
/// Uses an approach due to Jonathan Shewchuk, which is in the public domain.
///
/// @jts CGAlgorithmsDD#orientationIndexFilter(double,double,double,double,double,double)
fn orientation_index_filter(pax: f64, pay: f64, pbx: f64, pby: f64, pcx: f64, pcy: f64) -> i32 {
    let detsum;

    let detleft = (pax - pcx) * (pby - pcy);
    let detright = (pay - pcy) * (pbx - pcx);
    let det = detleft - detright;

    if detleft > 0.0 {
        if detright <= 0.0 {
            return signum(det);
        } else {
            detsum = detleft + detright;
        }
    } else if detleft < 0.0 {
        if detright >= 0.0 {
            return signum(det);
        } else {
            detsum = -detleft - detright;
        }
    } else {
        return signum(det);
    }

    let errbound = DP_SAFE_EPSILON * detsum;
    if (det >= errbound) || (-det >= errbound) {
        return signum(det);
    }

    2
}

/// @jts CGAlgorithmsDD#signum(double)
fn signum(x: f64) -> i32 {
    if x > 0.0 {
        return 1;
    }
    if x < 0.0 {
        return -1;
    }
    0
}

#[cfg(test)]
mod tests {
    use super::{orientation_index_coordinate, orientation_index_double};
    use geo_types::Coord;

    /// The triples JTS's own OrientationIndexFailureTest documents as defeating
    /// non-robust predicates.
    const HARD: [[[f64; 2]; 3]; 9] = [
        [
            [1.4540766091864998, -7.989685402102996],
            [23.131039116367354, -7.004368924503866],
            [1.4540766091865, -7.989685402102996],
        ],
        [[0.0, 100.0], [1.0, 102.1082], [3.0, 106.3246]],
        [
            [219.3649559090992, 140.84159161824724],
            [168.9018919682399, -5.713787599646864],
            [186.80814046338352, 46.28973405831556],
        ],
        [
            [279.56857838488514, -186.3790522565901],
            [-20.43142161511487, 13.620947743409914],
            [0.0, 0.0],
        ],
        [[-26.2, 188.7], [37.0, 290.7], [21.2, 265.2]],
        [[-5.9, 163.1], [76.1, 250.7], [14.6, 185.0]],
        [[-0.9575, 0.4511], [-0.9295, 0.3291], [-0.8945, 0.1766]],
        [[-9575.0, 4511.0], [-9295.0, 3291.0], [-8945.0, 1766.0]],
        [[0.0, 0.0], [0.0, 1.0], [1.0, 1.0]],
    ];

    const PERMS: [[usize; 3]; 6] = [
        [0, 1, 2],
        [0, 2, 1],
        [1, 0, 2],
        [1, 2, 0],
        [2, 0, 1],
        [2, 1, 0],
    ];

    /// Produced by running CGAlgorithmsDD.orientationIndex from
    /// jts-core-1.19.0.jar under Java 17 — the same 54 values the TypeScript
    /// test asserts. Regenerate with the reference jar if the pin moves.
    ///
    /// Rows 7 and 8 are all zeros: those are JTS's testBadCCW7 and testBadCCW7_2,
    /// where the DD chain reports the three points as exactly collinear in every
    /// permutation.
    const JTS_EXPECTED: [i32; 54] = [
        -1, 1, 1, -1, -1, 1, //
        1, -1, -1, 1, 1, -1, //
        -1, 1, 1, -1, -1, 1, //
        1, -1, -1, 1, 1, -1, //
        1, -1, -1, 1, 1, -1, //
        1, -1, -1, 1, 1, -1, //
        0, 0, 0, 0, 0, 0, //
        0, 0, 0, 0, 0, 0, //
        -1, 1, 1, -1, -1, 1,
    ];

    fn c(p: [f64; 2]) -> Coord<f64> {
        Coord { x: p[0], y: p[1] }
    }

    #[test]
    fn agrees_with_real_jts_on_every_permutation() {
        let mut actual = Vec::new();
        for t in HARD.iter() {
            for p in PERMS.iter() {
                actual.push(orientation_index_coordinate(
                    c(t[p[0]]),
                    c(t[p[1]]),
                    c(t[p[2]]),
                ));
            }
        }
        assert_eq!(actual, JTS_EXPECTED.to_vec());
    }

    #[test]
    fn is_antisymmetric_under_swapping_the_first_two_arguments() {
        for t in HARD.iter() {
            let forward = orientation_index_coordinate(c(t[0]), c(t[1]), c(t[2]));
            let reversed = orientation_index_coordinate(c(t[1]), c(t[0]), c(t[2]));
            assert_eq!(reversed, -forward);
        }
    }

    #[test]
    fn takes_the_same_answer_through_both_entry_points() {
        for t in HARD.iter() {
            assert_eq!(
                orientation_index_double(t[0][0], t[0][1], t[1][0], t[1][1], t[2][0], t[2][1]),
                orientation_index_coordinate(c(t[0]), c(t[1]), c(t[2])),
            );
        }
    }

    #[test]
    fn returns_the_plain_orientation_for_well_conditioned_input() {
        // The Shewchuk filter answers these without reaching the DD path.
        let o = Coord { x: 0.0, y: 0.0 };
        let e = Coord { x: 1.0, y: 0.0 };
        assert_eq!(
            orientation_index_coordinate(o, e, Coord { x: 0.0, y: 1.0 }),
            1
        );
        assert_eq!(
            orientation_index_coordinate(o, e, Coord { x: 0.0, y: -1.0 }),
            -1
        );
        assert_eq!(
            orientation_index_coordinate(o, e, Coord { x: 2.0, y: 0.0 }),
            0
        );
    }
}
