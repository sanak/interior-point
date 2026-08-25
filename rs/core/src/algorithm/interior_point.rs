//! Ports `InteriorPoint.java`.
//!
//! @jts InteriorPoint

use geo_types::{Coord, Geometry};

use crate::algorithm::interior_point_area::interior_point_area;
use crate::algorithm::interior_point_line::interior_point_line;
use crate::algorithm::interior_point_point::interior_point_point;
use crate::geometry_adapter::{dimension, is_geometry_empty};

/// Computes a location of an interior point in a `Geometry`.
/// Handles all geometry types.
///
/// For collections, the interior point is computed for the collection of
/// non-empty elements of highest dimension:
///
/// - **Dimension 2** (Polygon/MultiPolygon) — the point is in the interior of
///   the widest scan-line section.
/// - **Dimension 1** (LineString/MultiLineString) — the point is the interior
///   vertex closest to the centroid.
/// - **Dimension 0** (Point/MultiPoint) — the point is the point closest to
///   the centroid.
///
/// Returns the location of an interior point, or `None` if the input is empty.
///
/// @jts InteriorPoint#getInteriorPoint(Geometry)
/// @jts-deviate module-level name — `get_interior_point` would collide with the
///   same static factory in the other three modules.
pub fn interior_point(geom: &Geometry<f64>) -> Option<Coord<f64>> {
    if is_geometry_empty(geom) {
        return None;
    }

    // JTS declares `interiorPt` ahead of the branches and returns it at the end. An
    // if-expression is the Rust shape, but it would stop lining up with InteriorPoint.java,
    // so the declaration stays where JTS puts it and the lint is silenced here.
    #[allow(clippy::needless_late_init)]
    let interior_pt;
    let dim = dimension_non_empty(geom);
    // this should not happen, but just in case...
    if dim < 0 {
        return None;
    }
    if dim == 0 {
        interior_pt = interior_point_point(geom);
    } else if dim == 1 {
        interior_pt = interior_point_line(geom);
    } else {
        interior_pt = interior_point_area(geom);
    }
    interior_pt
}

/// @jts InteriorPoint#dimensionNonEmpty(Geometry)
pub(crate) fn dimension_non_empty(geom: &Geometry<f64>) -> i32 {
    // JTS builds the filter and applies it; here the filter is the traversal,
    // so this is a single call.
    dimension_non_empty_filter(geom)
}

/// @jts InteriorPoint.DimensionNonEmptyFilter#filter(Geometry)
/// @jts InteriorPoint.DimensionNonEmptyFilter#getDimension()
/// @jts-deviate GeometryFilter / Geometry.apply() are not part of the adapted
///   geometry model, so the filter becomes a recursive traversal with identical
///   semantics. The receptacle is preserved, per the structure rule: the function
///   keeps the filter's name and its body mirrors `filter(Geometry elem)`,
///   returning what `getDimension()` would have reported.
fn dimension_non_empty_filter(elem: &Geometry<f64>) -> i32 {
    let mut dim = -1;
    if let Geometry::GeometryCollection(gc) = elem {
        for g in &gc.0 {
            let elem_dim = dimension_non_empty_filter(g);
            if elem_dim > dim {
                dim = elem_dim;
            }
        }
        return dim;
    }
    if !is_geometry_empty(elem) {
        let elem_dim = dimension(elem);
        if elem_dim > dim {
            dim = elem_dim;
        }
    }
    dim
}
