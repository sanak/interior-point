//! Computes a point in the interior of an point geometry.
//!
//! # Algorithm
//!
//! Find a point which is closest to the centroid of the geometry.
//!
//! @jts InteriorPointPoint

use geo_types::{Coord, Geometry};

use crate::algorithm::centroid::get_centroid;
use crate::geometry_adapter::{distance, is_geometry_empty};

pub(crate) struct InteriorPointPoint {
    centroid: Option<Coord<f64>>,
    min_distance: f64,
    interior_point: Option<Coord<f64>>,
}

impl InteriorPointPoint {
    /// @jts InteriorPointPoint#InteriorPointPoint(Geometry)
    pub(crate) fn new(g: &Geometry<f64>) -> Self {
        let mut int_pt = Self {
            centroid: get_centroid(g),
            min_distance: f64::MAX,
            interior_point: None,
        };
        int_pt.add_geometry(g);
        int_pt
    }

    /// Tests the point(s) defined by a Geometry for the best inside point.
    /// If a Geometry is not of dimension 0 it is not tested.
    ///
    /// @jts InteriorPointPoint#add(Geometry)
    fn add_geometry(&mut self, geom: &Geometry<f64>) {
        if is_geometry_empty(geom) {
            return;
        }
        match geom {
            Geometry::Point(p) => self.add_coordinate(p.0),
            // JTS's MultiPoint is a GeometryCollection and falls through to the
            // collection branch there; geo-types' is not, so it is expanded here.
            Geometry::MultiPoint(mp) => {
                for p in &mp.0 {
                    self.add_coordinate(p.0);
                }
            }
            Geometry::GeometryCollection(gc) => {
                for g in &gc.0 {
                    self.add_geometry(g);
                }
            }
            _ => {}
        }
    }

    /// @jts InteriorPointPoint#add(Coordinate)
    fn add_coordinate(&mut self, point: Coord<f64>) {
        // `centroid` is None only for an empty input, which returns from
        // `add_geometry` before this is reachable.
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

    /// Gets the computed interior point.
    ///
    /// Returns the computed interior point, or `None` if the input geometry is empty.
    ///
    /// @jts InteriorPointPoint#getInteriorPoint()
    pub(crate) fn get_interior_point(&self) -> Option<Coord<f64>> {
        self.interior_point
    }
}

/// Computes an interior point for the puntal components of a Geometry.
///
/// Returns the computed interior point, or `None` if the geometry has no
/// puntal components.
///
/// @jts InteriorPointPoint#getInteriorPoint(Geometry)
/// @jts-deviate module-level name — `get_interior_point` would collide with the
///   same static factory in the other three modules.
pub(crate) fn interior_point_point(geom: &Geometry<f64>) -> Option<Coord<f64>> {
    let int_pt = InteriorPointPoint::new(geom);
    int_pt.get_interior_point()
}
