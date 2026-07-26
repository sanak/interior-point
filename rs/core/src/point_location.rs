//! Functions for locating points within basic geometric structures such as line
//! segments, lines and rings.
//!
//! Only the ring half is ported: `isOnSegment` and both `isOnLine` overloads are
//! linear predicates outside the point-in-polygon stack.
//!
//! @jts PointLocation

use geo_types::Coord;

use crate::location::EXTERIOR;
use crate::ray_crossing_counter::RayCrossingCounter;

/// Tests whether a point lies inside or on a ring. The ring may be oriented in
/// either direction. A point lying exactly on the ring boundary is considered to
/// be inside the ring.
///
/// This function does *not* first check the point against the envelope of the
/// ring.
///
/// Nothing in the ported subset calls this: `SimplePointInAreaLocator` reaches
/// for `locate_in_ring`. It is ported because `pin.json` names it in `portedMembers`.
///
/// @jts PointLocation#isInRing(Coordinate,Coordinate[])
#[allow(dead_code)]
pub(crate) fn is_in_ring(p: Coord<f64>, ring: &[Coord<f64>]) -> bool {
    locate_in_ring(p, ring) != EXTERIOR
}

/// Determines whether a point lies in the interior, on the boundary, or in the
/// exterior of a ring. The ring may be oriented in either direction.
///
/// This function does *not* first check the point against the envelope of the
/// ring.
///
/// @jts PointLocation#locateInRing(Coordinate,Coordinate[])
pub(crate) fn locate_in_ring(p: Coord<f64>, ring: &[Coord<f64>]) -> i32 {
    RayCrossingCounter::locate_point_in_ring_coordinate_coordinates(p, ring)
}
