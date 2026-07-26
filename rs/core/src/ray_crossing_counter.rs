//! Counts the number of segments crossed by a horizontal ray extending to the
//! right from a given point, in an incremental fashion. This can be used to
//! determine whether a point lies in a polygonal geometry. The class determines
//! the situation where the point lies exactly on a segment. When being used for
//! Point-In-Polygon determination, this case allows short-circuiting the
//! evaluation.
//!
//! This implementation uses the extended-precision orientation test, to provide
//! maximum robustness and consistency within other algorithms.
//!
//! @jts RayCrossingCounter

use geo_types::Coord;

use crate::location::{BOUNDARY, EXTERIOR, INTERIOR};
use crate::orientation::{COLLINEAR, LEFT, index};

pub(crate) struct RayCrossingCounter {
    p: Coord<f64>,
    crossing_count: i32,
    /// true if the test point lies on an input segment
    is_point_on_segment: bool,
}

// The exact coordinate comparisons below are Java's ordinate equality. The
// algorithm's correctness depends on exact vertex identity, so an epsilon must
// never be substituted — if `clippy::float_cmp` is ever enabled, allow it here
// rather than loosening it.
impl RayCrossingCounter {
    /// Determines the location of a point in a ring. This method is an exemplar
    /// of how to use this struct.
    ///
    /// @jts RayCrossingCounter#locatePointInRing(Coordinate,Coordinate[])
    /// @jts-adapter RayCrossingCounter#locatePointInRing(Coordinate,CoordinateSequence)
    ///   — the ports have no sequence abstraction, so only the slice overload is
    ///   ported and it stands in for both. The name carries every parameter type
    ///   because the overload-suffix rule decides the form from the whole Java overload set,
    ///   not from the subset that is ported.
    pub(crate) fn locate_point_in_ring_coordinate_coordinates(
        p: Coord<f64>,
        ring: &[Coord<f64>],
    ) -> i32 {
        let mut counter = RayCrossingCounter::new(p);

        for i in 1..ring.len() {
            let p1 = ring[i];
            let p2 = ring[i - 1];
            counter.count_segment(p1, p2);
            if counter.is_on_segment() {
                return counter.get_location();
            }
        }
        counter.get_location()
    }

    /// @jts RayCrossingCounter#RayCrossingCounter(Coordinate)
    pub(crate) fn new(p: Coord<f64>) -> Self {
        Self {
            p,
            crossing_count: 0,
            is_point_on_segment: false,
        }
    }

    /// Counts a segment.
    ///
    /// @jts RayCrossingCounter#countSegment(Coordinate,Coordinate)
    pub(crate) fn count_segment(&mut self, p1: Coord<f64>, p2: Coord<f64>) {
        // For each segment, check if it crosses a horizontal ray running from
        // the test point in the positive x direction.

        // check if the segment is strictly to the left of the test point
        if p1.x < self.p.x && p2.x < self.p.x {
            return;
        }

        // check if the point is equal to the current ring vertex
        if self.p.x == p2.x && self.p.y == p2.y {
            self.is_point_on_segment = true;
            return;
        }
        // For horizontal segments, check if the point is on the segment.
        // Otherwise, horizontal segments are not counted.
        if p1.y == self.p.y && p2.y == self.p.y {
            let mut minx = p1.x;
            let mut maxx = p2.x;
            if minx > maxx {
                minx = p2.x;
                maxx = p1.x;
            }
            if self.p.x >= minx && self.p.x <= maxx {
                self.is_point_on_segment = true;
            }
            return;
        }
        // Evaluate all non-horizontal segments which cross a horizontal ray to
        // the right of the test pt. To avoid double-counting shared vertices, we
        // use the convention that
        //  - an upward edge includes its starting endpoint, and excludes its final endpoint
        //  - a downward edge excludes its starting endpoint, and includes its final endpoint
        if ((p1.y > self.p.y) && (p2.y <= self.p.y)) || ((p2.y > self.p.y) && (p1.y <= self.p.y)) {
            let mut orient = index(p1, p2, self.p);
            if orient == COLLINEAR {
                self.is_point_on_segment = true;
                return;
            }
            // Re-orient the result if needed to ensure effective segment direction is upwards
            if p2.y < p1.y {
                orient = -orient;
            }
            // The upward segment crosses the ray if the test point lies to the left (CCW) of the segment.
            if orient == LEFT {
                self.crossing_count += 1;
            }
        }
    }

    /// Gets the count of crossings.
    ///
    /// Nothing in the ported subset calls this: `locate_point_in_ring_*` reads
    /// `get_location` instead. It is ported because `pin.json` scopes
    /// `RayCrossingCounter`'s `portedMembers` to the whole file.
    ///
    /// @jts RayCrossingCounter#getCount()
    #[allow(dead_code)]
    pub(crate) fn get_count(&self) -> i32 {
        self.crossing_count
    }

    /// Reports whether the point lies exactly on one of the supplied segments.
    ///
    /// @jts RayCrossingCounter#isOnSegment()
    pub(crate) fn is_on_segment(&self) -> bool {
        self.is_point_on_segment
    }

    /// Gets the location of the point relative to the ring, polygon or
    /// multipolygon from which the processed segments were provided.
    ///
    /// @jts RayCrossingCounter#getLocation()
    pub(crate) fn get_location(&self) -> i32 {
        if self.is_point_on_segment {
            return BOUNDARY;
        }

        // The point is in the interior of the ring if the number of X-crossings is odd.
        if (self.crossing_count % 2) == 1 {
            return INTERIOR;
        }
        EXTERIOR
    }

    /// Tests whether the point lies in or on the ring, polygon or multipolygon
    /// from which the processed segments were provided.
    ///
    /// Nothing in the ported subset calls this, for the same reason as
    /// `get_count`.
    ///
    /// @jts RayCrossingCounter#isPointInPolygon()
    #[allow(dead_code)]
    pub(crate) fn is_point_in_polygon(&self) -> bool {
        self.get_location() != EXTERIOR
    }
}
