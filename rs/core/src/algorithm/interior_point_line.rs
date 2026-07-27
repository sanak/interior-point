//! Computes a point in the interior of an linear geometry.
//!
//! # Algorithm
//!
//! - Find an interior vertex which is closest to the centroid of the linestring.
//! - If there is no interior vertex, find the endpoint which is closest to the
//!   centroid.
//!
//! @jts InteriorPointLine

use geo_types::{Coord, Geometry};

use crate::algorithm::centroid::get_centroid;
use crate::geometry_adapter::{distance, is_geometry_empty};

pub(crate) struct InteriorPointLine {
    centroid: Option<Coord<f64>>,
    min_distance: f64,
    interior_point: Option<Coord<f64>>,
}

impl InteriorPointLine {
    /// @jts InteriorPointLine#InteriorPointLine(Geometry)
    pub(crate) fn new(g: &Geometry<f64>) -> Self {
        let mut int_pt = Self {
            centroid: get_centroid(g),
            min_distance: f64::MAX,
            interior_point: None,
        };
        int_pt.add_interior_geometry(g);
        if int_pt.interior_point.is_none() {
            int_pt.add_endpoints_geometry(g);
        }
        int_pt
    }

    /// @jts InteriorPointLine#getInteriorPoint()
    pub(crate) fn get_interior_point(&self) -> Option<Coord<f64>> {
        self.interior_point
    }

    /// Tests the interior vertices (if any) defined by a linear Geometry for
    /// the best inside point. If a Geometry is not of dimension 1 it is not
    /// tested.
    ///
    /// @jts InteriorPointLine#addInterior(Geometry)
    fn add_interior_geometry(&mut self, geom: &Geometry<f64>) {
        if is_geometry_empty(geom) {
            return;
        }
        match geom {
            Geometry::LineString(ls) => self.add_interior_coordinates(&ls.0),
            // JTS's MultiLineString is a GeometryCollection; geo-types' is not.
            Geometry::MultiLineString(mls) => {
                for ls in &mls.0 {
                    // Stands in for the `geom.isEmpty()` guard JTS applies to
                    // each child LineString on the way down; flattening the
                    // recursion would lose it.
                    if ls.0.is_empty() {
                        continue;
                    }
                    self.add_interior_coordinates(&ls.0);
                }
            }
            Geometry::GeometryCollection(gc) => {
                for g in &gc.0 {
                    self.add_interior_geometry(g);
                }
            }
            _ => {}
        }
    }

    /// @jts InteriorPointLine#addInterior(Coordinate[])
    fn add_interior_coordinates(&mut self, pts: &[Coord<f64>]) {
        // JTS: `for (int i = 1; i < pts.length - 1; i++)`. Written as an
        // iterator because `clippy::needless_range_loop` rejects the index
        // form; `saturating_sub` reproduces Java's empty range for len < 2.
        for &pt in pts.iter().take(pts.len().saturating_sub(1)).skip(1) {
            self.add(pt);
        }
    }

    /// Tests the endpoint vertices defined by a linear Geometry for the best
    /// inside point. If a Geometry is not of dimension 1 it is not tested.
    ///
    /// @jts InteriorPointLine#addEndpoints(Geometry)
    fn add_endpoints_geometry(&mut self, geom: &Geometry<f64>) {
        if is_geometry_empty(geom) {
            return;
        }
        match geom {
            Geometry::LineString(ls) => self.add_endpoints_coordinates(&ls.0),
            // JTS's MultiLineString is a GeometryCollection; geo-types' is not.
            Geometry::MultiLineString(mls) => {
                for ls in &mls.0 {
                    // As above: JTS's recursion checks each child LineString
                    // for emptiness. Without this, `pts[0]` below would panic.
                    if ls.0.is_empty() {
                        continue;
                    }
                    self.add_endpoints_coordinates(&ls.0);
                }
            }
            Geometry::GeometryCollection(gc) => {
                for g in &gc.0 {
                    self.add_endpoints_geometry(g);
                }
            }
            _ => {}
        }
    }

    /// @jts InteriorPointLine#addEndpoints(Coordinate[])
    fn add_endpoints_coordinates(&mut self, pts: &[Coord<f64>]) {
        self.add(pts[0]);
        self.add(pts[pts.len() - 1]);
    }

    /// @jts InteriorPointLine#add(Coordinate)
    fn add(&mut self, point: Coord<f64>) {
        // `centroid` is None only for an empty input, which returns from the
        // traversals above before this is reachable.
        let dist = distance(
            point,
            self.centroid
                .expect("centroid is set for a non-empty input"),
        );
        if dist < self.min_distance {
            self.interior_point = Some(point);
            self.min_distance = dist;
        }
    }
}

/// Computes an interior point for the linear components of a Geometry.
///
/// Returns the computed interior point, or `None` if the geometry has no
/// linear components.
///
/// @jts InteriorPointLine#getInteriorPoint(Geometry)
/// @jts-deviate module-level name — `get_interior_point` would collide with the
///   same static factory in the other three modules.
pub(crate) fn interior_point_line(geom: &Geometry<f64>) -> Option<Coord<f64>> {
    let int_pt = InteriorPointLine::new(geom);
    int_pt.get_interior_point()
}
