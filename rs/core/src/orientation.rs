//! Functions to compute the orientation of basic geometric structures
//! including point triplets (triangles) and rings.
//!
//! Only the subset reachable from `Centroid.addShell` is ported; see
//! `portedMembers` for `upstream/jts/algorithm/Orientation.java` in
//! `upstream/jts/pin.json`.
//!
//! @jts Orientation

// See the note in `dd.rs`: this chain stays unreachable from the crate root
// until the retrofit wires `Centroid` into `InteriorPoint`.
#![allow(dead_code)]

use geo_types::Coord;

use crate::cg_algorithms_dd::orientation_index_coordinate;

/// A value that indicates an orientation of clockwise, or a right turn.
///
/// @jts Orientation#CLOCKWISE
pub(crate) const CLOCKWISE: i32 = -1;

/// A value that indicates an orientation of counterclockwise, or a left turn.
///
/// @jts Orientation#COUNTERCLOCKWISE
pub(crate) const COUNTERCLOCKWISE: i32 = 1;

/// A value that indicates an orientation of collinear, or no turn.
///
/// @jts Orientation#COLLINEAR
pub(crate) const COLLINEAR: i32 = 0;

/// Returns the orientation index of the direction of the point `q` relative to
/// a directed infinite line specified by `p1-p2`.
///
/// Returns -1 if q is clockwise (right) from p1-p2, 1 if q is counter-clockwise
/// (left) from p1-p2, and 0 if q is collinear with p1-p2.
///
/// @jts Orientation#index(Coordinate,Coordinate,Coordinate)
pub(crate) fn index(p1: Coord<f64>, p2: Coord<f64>, q: Coord<f64>) -> i32 {
    orientation_index_coordinate(p1, p2, q)
}

/// Tests if a ring defined by a slice of [`Coord`]s is oriented counter-clockwise.
///
/// The list of points is assumed to have the first and last points equal.
///
/// @jts Orientation#isCCW(Coordinate[])
pub(crate) fn is_ccw_coordinates(ring: &[Coord<f64>]) -> bool {
    // wrap with an XY CoordinateSequence
    is_ccw_coordinate_sequence(ring)
}

/// Tests if a ring defined by a CoordinateSequence is oriented counter-clockwise.
///
/// This algorithm is guaranteed to work with valid rings. It also works with
/// "mildly invalid" rings which contain collapsed (coincident) flat segments
/// along the top of the ring.
///
/// @jts Orientation#isCCW(CoordinateSequence)
/// @jts-adapter CoordinateSequence — the ports have no sequence abstraction, so
///   both overloads take the same slice and the array overload's
///   CoordinateArraySequence wrap is a no-op.
// The exact coordinate comparisons below are Java's `Coordinate.equals2D` and the
// ordinate equality in the falling-segment scan. The algorithm's correctness
// depends on exact vertex identity, so an epsilon must never be substituted —
// if `clippy::float_cmp` is ever enabled, allow it here rather than loosening it.
pub(crate) fn is_ccw_coordinate_sequence(ring: &[Coord<f64>]) -> bool {
    // # of points without closing endpoint
    let n_pts = ring.len() - 1;
    // return default value if ring is flat
    if n_pts < 3 {
        return false;
    }

    // Find first highest point after a lower point, if one exists
    // (e.g. a rising segment). If one does not exist, i_up_hi will remain 0
    // and the ring must be flat.
    let mut up_hi_pt = ring[0];
    let mut prev_y = up_hi_pt.y;
    let mut up_low_pt = None;
    let mut i_up_hi = 0;
    for i in 1..=n_pts {
        let py = ring[i].y;
        // If segment is upwards and endpoint is higher, record it
        if py > prev_y && py >= up_hi_pt.y {
            up_hi_pt = ring[i];
            i_up_hi = i;
            up_low_pt = Some(ring[i - 1]);
        }
        prev_y = py;
    }
    // Check if ring is flat and return default value if so
    if i_up_hi == 0 {
        return false;
    }

    // Find the next lower point after the high point (e.g. a falling segment).
    // This must exist since ring is not flat. Java spells this as a do/while;
    // Rust has no direct equivalent, so the condition is negated and broken out.
    let mut i_down_low = i_up_hi;
    loop {
        i_down_low = (i_down_low + 1) % n_pts;
        if i_down_low == i_up_hi || ring[i_down_low].y != up_hi_pt.y {
            break;
        }
    }

    let down_low_pt = ring[i_down_low];
    let i_down_hi = if i_down_low > 0 {
        i_down_low - 1
    } else {
        n_pts - 1
    };
    let down_hi_pt = ring[i_down_hi];

    // Two cases can occur:
    // 1) the hi_pt and the down_prev_pt are the same. This is the general
    //    position case of a "pointed cap". The ring orientation is determined
    //    by the orientation of the cap.
    // 2) The hi_pt and the down_prev_pt are different. In this case the top of
    //    the cap is flat, and the ring orientation is given by the direction of
    //    the flat segment.
    if up_hi_pt == down_hi_pt {
        // Check for the case where the cap has configuration A-B-A. This can
        // happen if the ring does not contain 3 distinct points (including the
        // case where the input slice has fewer than 4 elements), or it contains
        // coincident line segments.
        //
        // The `None` arm is an addition: Java reaches this branch only when
        // i_up_hi != 0, which implies up_low_pt was assigned, but the compiler
        // cannot see that. Returning false is what the A-B-A case returns anyway,
        // so no observable behaviour changes.
        let Some(up_low_pt) = up_low_pt else {
            return false;
        };
        if up_low_pt == up_hi_pt || down_low_pt == up_hi_pt || up_low_pt == down_low_pt {
            return false;
        }

        // It can happen that the top segments are coincident. This is an
        // invalid ring, which cannot be computed correctly. In this case the
        // orientation is 0, and the result is false.
        index(up_low_pt, up_hi_pt, down_low_pt) == COUNTERCLOCKWISE
    } else {
        // Flat cap - direction of flat top determines orientation
        let del_x = down_hi_pt.x - up_hi_pt.x;
        del_x < 0.0
    }
}

#[cfg(test)]
mod tests {
    use super::{CLOCKWISE, COLLINEAR, COUNTERCLOCKWISE, index, is_ccw_coordinates};
    use geo_types::Coord;

    fn ring(pts: &[(f64, f64)]) -> Vec<Coord<f64>> {
        pts.iter().map(|&(x, y)| Coord { x, y }).collect()
    }

    #[test]
    fn names_the_jts_constants() {
        assert_eq!(CLOCKWISE, -1);
        assert_eq!(COUNTERCLOCKWISE, 1);
        assert_eq!(COLLINEAR, 0);
    }

    #[test]
    fn classifies_a_counter_clockwise_ring() {
        let r = ring(&[(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0), (0.0, 0.0)]);
        assert!(is_ccw_coordinates(&r));
    }

    #[test]
    fn classifies_a_clockwise_ring() {
        let r = ring(&[(0.0, 0.0), (0.0, 1.0), (1.0, 1.0), (1.0, 0.0), (0.0, 0.0)]);
        assert!(!is_ccw_coordinates(&r));
    }

    #[test]
    fn returns_false_for_a_ring_with_too_few_points() {
        let r = ring(&[(0.0, 0.0), (1.0, 1.0), (0.0, 0.0)]);
        assert!(!is_ccw_coordinates(&r));
    }

    #[test]
    fn returns_false_for_a_flat_ring() {
        let r = ring(&[(0.0, 0.0), (1.0, 0.0), (2.0, 0.0), (1.0, 0.0), (0.0, 0.0)]);
        assert!(!is_ccw_coordinates(&r));
    }

    #[test]
    fn handles_a_ring_with_a_flat_top() {
        let r = ring(&[
            (0.0, 0.0),
            (2.0, 0.0),
            (2.0, 1.0),
            (1.0, 1.0),
            (0.0, 1.0),
            (0.0, 0.0),
        ]);
        assert!(is_ccw_coordinates(&r));
    }

    #[test]
    fn handles_repeated_points_along_the_top() {
        let r = ring(&[
            (0.0, 0.0),
            (2.0, 0.0),
            (2.0, 1.0),
            (2.0, 1.0),
            (0.0, 1.0),
            (0.0, 0.0),
        ]);
        assert!(is_ccw_coordinates(&r));
    }

    #[test]
    fn delegates_the_pointed_cap_case_to_the_robust_index() {
        let o = Coord { x: 0.0, y: 0.0 };
        let e = Coord { x: 1.0, y: 0.0 };
        assert_eq!(index(o, e, Coord { x: 0.0, y: 1.0 }), COUNTERCLOCKWISE);
        assert_eq!(index(o, e, Coord { x: 0.0, y: -1.0 }), CLOCKWISE);
        assert_eq!(index(o, e, Coord { x: 2.0, y: 0.0 }), COLLINEAR);
    }
}
