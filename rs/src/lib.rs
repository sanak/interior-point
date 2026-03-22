//! JTS InteriorPoint algorithm ported to Rust.
//!
//! Computes an interior point (representative point) of a geometry.
//! The point is guaranteed to lie inside the geometry for area geometries.

mod interior_point_area;
mod interior_point_line;
mod interior_point_point;

#[cfg(feature = "wasm")]
mod wasm;

use geo_types::{Coord, Geometry};

use interior_point_area::interior_point_area;
use interior_point_line::interior_point_line;
use interior_point_point::interior_point_point;

/// Computes an interior point of the given geometry.
///
/// For different geometry dimensions:
/// - Area (Polygon/MultiPolygon): uses scanline algorithm
/// - Line (LineString/MultiLineString): finds vertex closest to centroid
/// - Point (Point/MultiPoint): finds point closest to centroid
///
/// For GeometryCollections, uses the highest-dimension component.
///
/// Returns `None` if the geometry is empty.
pub fn interior_point(geometry: &Geometry<f64>) -> Option<Coord<f64>> {
    let dim = dimension_non_empty(geometry);
    if dim < 0 {
        return None;
    }

    match dim {
        2 => interior_point_area(geometry),
        1 => interior_point_line(geometry),
        _ => interior_point_point(geometry),
    }
}

/// Determines the highest dimension of non-empty components in a geometry.
/// Returns -1 if no non-empty components exist.
fn dimension_non_empty(geometry: &Geometry<f64>) -> i32 {
    if is_geometry_empty(geometry) {
        return -1;
    }

    match geometry {
        Geometry::Point(_) | Geometry::MultiPoint(_) => 0,
        Geometry::LineString(_) | Geometry::MultiLineString(_) => 1,
        Geometry::Polygon(_) | Geometry::MultiPolygon(_) => 2,
        Geometry::GeometryCollection(gc) => {
            gc.0.iter().map(dimension_non_empty).max().unwrap_or(-1)
        }
        _ => -1,
    }
}

/// Check if a geometry is empty.
fn is_geometry_empty(geometry: &Geometry<f64>) -> bool {
    match geometry {
        Geometry::Point(_) => false, // geo-types Point cannot be empty
        Geometry::MultiPoint(mp) => mp.0.is_empty(),
        Geometry::LineString(ls) => ls.0.is_empty(),
        Geometry::MultiLineString(mls) => {
            mls.0.is_empty() || mls.0.iter().all(|ls| ls.0.is_empty())
        }
        Geometry::Polygon(p) => p.exterior().0.is_empty(),
        Geometry::MultiPolygon(mp) => {
            mp.0.is_empty() || mp.0.iter().all(|p| p.exterior().0.is_empty())
        }
        Geometry::GeometryCollection(gc) => gc.0.is_empty() || gc.0.iter().all(is_geometry_empty),
        _ => true,
    }
}
