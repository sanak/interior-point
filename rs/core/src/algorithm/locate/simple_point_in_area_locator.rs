//! Computes the location of points relative to a polygonal geometry, using a
//! simple O(n) algorithm.
//!
//! The algorithm reports whether a point lies in the interior, exterior, or
//! exactly on the boundary of the geometry.
//!
//! @jts SimplePointInAreaLocator

use geo_types::{Coord, Geometry, Polygon};

use crate::algorithm::point_location::locate_in_ring;
use crate::geom::location::{BOUNDARY, EXTERIOR, INTERIOR};
use crate::geometry_adapter::{
    envelope_internal, envelope_internal_geometry, envelope_intersects_coordinate,
    is_geometry_empty,
};

/// Determines the location of a point in an areal geometry. The return value is
/// one of `INTERIOR`, `BOUNDARY` or `EXTERIOR`.
///
/// @jts SimplePointInAreaLocator#locate(Coordinate,Geometry)
pub(crate) fn locate(p: Coord<f64>, geom: &Geometry<f64>) -> i32 {
    if is_geometry_empty(geom) {
        return EXTERIOR;
    }
    // Do a fast check against the geometry envelope first
    if !envelope_intersects_coordinate(envelope_internal_geometry(geom), p) {
        return EXTERIOR;
    }

    locate_in_geometry(p, geom)
}

/// @jts SimplePointInAreaLocator#locateInGeometry(Coordinate,Geometry)
/// @jts-deviate GeometryCollectionIterator — JTS walks a collection with a deep
///   preorder iterator that yields the collection itself first (hence its
///   `g2 != geom` guard) and then its children recursively. This function returns
///   as soon as it sees anything other than EXTERIOR, so visiting a nested
///   collection before its leaves cannot change the answer: plain recursion over
///   children is equivalent, and no fifth Java file has to be vendored.
/// @jts-deviate MultiPolygon — JTS reaches it through
///   `MultiPolygon extends GeometryCollection`, a supertype geo-types does not
///   have, so it is matched directly. An empty member needs no guard here because
///   `locate_point_in_polygon` begins with an emptiness check.
fn locate_in_geometry(p: Coord<f64>, geom: &Geometry<f64>) -> i32 {
    if let Geometry::Polygon(poly) = geom {
        return locate_point_in_polygon(p, poly);
    }

    if let Geometry::MultiPolygon(mp) = geom {
        for poly in &mp.0 {
            let loc = locate_point_in_polygon(p, poly);
            if loc != EXTERIOR {
                return loc;
            }
        }
    }

    if let Geometry::GeometryCollection(gc) = geom {
        for g2 in &gc.0 {
            let loc = locate_in_geometry(p, g2);
            if loc != EXTERIOR {
                return loc;
            }
        }
    }
    EXTERIOR
}

/// Determines the location of a point in a polygon. The return value is one of
/// `INTERIOR`, `BOUNDARY` or `EXTERIOR`.
///
/// @jts SimplePointInAreaLocator#locatePointInPolygon(Coordinate,Polygon)
pub(crate) fn locate_point_in_polygon(p: Coord<f64>, poly: &Polygon<f64>) -> i32 {
    // Inlined rather than calling `is_geometry_empty`'s identical `Polygon` arm
    // (`p.exterior().0.is_empty()`) to avoid the `Geometry` clone that call would
    // require here, where only a `&Polygon` is on hand.
    if poly.exterior().0.is_empty() {
        return EXTERIOR;
    }
    let shell = &poly.exterior().0;
    let shell_loc = locate_point_in_ring(p, shell);
    if shell_loc != INTERIOR {
        return shell_loc;
    }

    // now test if the point lies in or on the holes
    for hole in poly.interiors() {
        let hole_loc = locate_point_in_ring(p, &hole.0);
        if hole_loc == BOUNDARY {
            return BOUNDARY;
        }
        if hole_loc == INTERIOR {
            return EXTERIOR;
        }
        // if in EXTERIOR of this hole keep checking the other ones
    }
    // If not in any hole must be inside polygon
    INTERIOR
}

/// Determines whether a point lies in a ring, using the ring envelope to
/// short-circuit if possible.
///
/// @jts SimplePointInAreaLocator#locatePointInRing(Coordinate,LinearRing)
fn locate_point_in_ring(p: Coord<f64>, ring: &[Coord<f64>]) -> i32 {
    // short-circuit if point is not in ring envelope
    if !envelope_intersects_coordinate(envelope_internal(ring), p) {
        return EXTERIOR;
    }
    locate_in_ring(p, ring)
}

/// An instance-based point-in-area locator over one areal geometry.
///
/// JTS's static `locate(Coordinate,Geometry)` and instance `locate(Coordinate)`
/// both keep the bare JTS name under the factory/getter rule — a static method sharing a name
/// with an instance method is a factory/getter pair, not an overload set. Rust
/// cannot put both in one inherent `impl`, so the static one is the free function
/// above; the two live in different namespaces and neither needs a suffix.
///
/// Nothing in the ported subset constructs it: `verify_interior_point` reaches
/// the free `locate` directly, and the case-table test is the only caller. It is
/// ported because `pin.json` names the constructor and the instance method in
/// `portedMembers`.
#[allow(dead_code)]
pub(crate) struct SimplePointInAreaLocator<'a> {
    geom: &'a Geometry<f64>,
}

/// Both items are unreached for the reason given on the struct above.
#[allow(dead_code)]
impl<'a> SimplePointInAreaLocator<'a> {
    /// @jts SimplePointInAreaLocator#SimplePointInAreaLocator(Geometry)
    pub(crate) fn new(geom: &'a Geometry<f64>) -> Self {
        Self { geom }
    }

    /// Determines the location of a point in this areal geometry.
    ///
    /// @jts SimplePointInAreaLocator#locate(Coordinate)
    pub(crate) fn locate(&self, p: Coord<f64>) -> i32 {
        locate(p, self.geom)
    }
}
