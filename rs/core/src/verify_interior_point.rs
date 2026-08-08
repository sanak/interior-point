//! Verifies a computed interior point against the geometry it came from.
//!
//! `interior_point` claims its result lies on or in its input, and nothing else
//! in this crate lets a caller confirm that. This module answers it for one
//! result, through the point-in-polygon locator — an independent code path that
//! shares nothing with the scanline that produced the point.
//!
//! This is not a geometry-validity check. An input whose rings self-intersect or
//! whose hole lies outside its shell can still yield a point that verifies; the
//! two properties are unrelated and neither substitutes for the other.
//!
//! @jts-adapter InteriorPoint — an original surface with no JTS counterpart:
//!   JTS ships no result-verification API, and nothing here is ported.

use std::fmt;

use geo_types::{Coord, Geometry};

use crate::algorithm::interior_point::dimension_non_empty;
use crate::algorithm::locate::simple_point_in_area_locator::locate;
use crate::geom::location::{BOUNDARY, INTERIOR};
use crate::geometry_adapter::coordinates_at_dimension;

/// Where a computed interior point sits relative to its geometry.
///
/// `Interior` and `OnGeometry` are both passes and are not the same fact:
/// an areal point that lands exactly on the boundary is what
/// `InteriorPoint`'s own contract falls back to when an exact interior point
/// cannot be calculated. `Unverifiable` is the absence of an answer rather than
/// a failed one, which is why the command line treats `OffGeometry` alone as a
/// failure.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Verification {
    /// The point lies in the interior of an areal geometry.
    Interior,
    /// The point lies on the boundary of an areal geometry, or equals a
    /// coordinate of a dimension 0 or 1 geometry.
    OnGeometry,
    /// The point lies outside the geometry.
    OffGeometry,
    /// No point, no geometry, or a geometry whose every element is empty.
    Unverifiable,
}

/// The four spellings are what reach a caller's output, so they are fixed here
/// rather than derived from the variant names: the TypeScript port prints the
/// same four strings, and the two command lines are held to byte-for-byte
/// agreement.
impl fmt::Display for Verification {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::Interior => "interior",
            Self::OnGeometry => "on-geometry",
            Self::OffGeometry => "off-geometry",
            Self::Unverifiable => "unverifiable",
        })
    }
}

/// Reports where `point` sits relative to `geometry`.
///
/// Both arguments are optional because both callers already hold optionals:
/// `interior_point` returns `None` for an empty input, and a GeoJSON Feature may
/// carry a null geometry. Either `None` is `Unverifiable`.
///
/// Dispatch is on `dimension_non_empty`, the same function `interior_point`
/// dispatches on, and not on the adapter's `dimension`. The two disagree when a
/// collection holds an empty element of higher dimension than its non-empty
/// ones — `GEOMETRYCOLLECTION (POINT (5 5), LINESTRING EMPTY)` is dimension 1
/// and non-empty dimension 0 — and following `dimension` there would contradict
/// the point that was actually computed.
pub fn verify_interior_point(
    point: Option<Coord<f64>>,
    geometry: Option<&Geometry<f64>>,
) -> Verification {
    let (Some(point), Some(geometry)) = (point, geometry) else {
        return Verification::Unverifiable;
    };
    let dim = dimension_non_empty(geometry);
    if dim < 0 {
        return Verification::Unverifiable;
    }
    if dim == 2 {
        let location = locate(point, geometry);
        if location == INTERIOR {
            return Verification::Interior;
        }
        if location == BOUNDARY {
            return Verification::OnGeometry;
        }
        return Verification::OffGeometry;
    }
    // Dimension 0 and 1 have no interior for the locator to find: a ray cast at
    // a LineString's own vertex still counts zero crossings. What the algorithm
    // guarantees there is that the point is one of the coordinates of the
    // non-empty elements of that dimension, compared ordinate by ordinate.
    // `interior_point_line` and `interior_point_point` both copy the coordinate
    // they choose, so identity comparison would never hold; the exact ordinate
    // comparison is the intended one and must not be loosened to an epsilon.
    if coordinates_at_dimension(geometry, dim)
        .iter()
        .any(|c| c.x == point.x && c.y == point.y)
    {
        Verification::OnGeometry
    } else {
        Verification::OffGeometry
    }
}

#[cfg(test)]
mod tests {
    use super::{Verification, verify_interior_point};
    use crate::interior_point;
    use geo_types::{
        Coord, Geometry, GeometryCollection, LineString, MultiLineString, MultiPoint, Point,
        Polygon,
    };

    fn polygon(ring: &[(f64, f64)]) -> Geometry<f64> {
        Geometry::Polygon(Polygon::new(LineString::from(ring.to_vec()), vec![]))
    }

    /// Verifies the point the algorithm actually returned for `geometry`.
    fn verify_computed(geometry: &Geometry<f64>) -> Verification {
        verify_interior_point(interior_point(geometry), Some(geometry))
    }

    #[test]
    fn reports_interior_for_a_point_inside_an_areal_geometry() {
        let square = polygon(&[
            (0.0, 0.0),
            (10.0, 0.0),
            (10.0, 10.0),
            (0.0, 10.0),
            (0.0, 0.0),
        ]);
        assert_eq!(interior_point(&square), Some(Coord { x: 5.0, y: 5.0 }));
        assert_eq!(verify_computed(&square), Verification::Interior);
    }

    #[test]
    fn reports_on_geometry_for_a_zero_area_polygon() {
        let collapsed = polygon(&[(10.0, 10.0), (10.0, 10.0), (10.0, 10.0), (10.0, 10.0)]);
        assert_eq!(verify_computed(&collapsed), Verification::OnGeometry);
    }

    #[test]
    fn reports_on_geometry_for_a_polygon_collapsed_to_a_segment() {
        let collapsed = polygon(&[(0.0, 0.0), (10.0, 0.0), (0.0, 0.0)]);
        assert_eq!(verify_computed(&collapsed), Verification::OnGeometry);
    }

    #[test]
    fn reports_on_geometry_for_a_point() {
        let point = Geometry::Point(Point::new(5.0, 5.0));
        assert_eq!(verify_computed(&point), Verification::OnGeometry);
    }

    #[test]
    fn reports_on_geometry_for_a_line_string() {
        let line = Geometry::LineString(LineString::from(vec![(0.0, 0.0), (10.0, 10.0)]));
        assert_eq!(interior_point(&line), Some(Coord { x: 0.0, y: 0.0 }));
        assert_eq!(verify_computed(&line), Verification::OnGeometry);
    }

    #[test]
    fn reports_on_geometry_for_a_multi_point() {
        let points = Geometry::MultiPoint(MultiPoint(vec![
            Point::new(0.0, 0.0),
            Point::new(10.0, 10.0),
        ]));
        assert_eq!(verify_computed(&points), Verification::OnGeometry);
    }

    #[test]
    fn reports_on_geometry_for_a_collection_of_a_point_and_a_line() {
        let collection = Geometry::GeometryCollection(GeometryCollection(vec![
            Geometry::Point(Point::new(5.0, 5.0)),
            Geometry::LineString(LineString::from(vec![(0.0, 0.0), (10.0, 10.0)])),
        ]));
        assert_eq!(verify_computed(&collection), Verification::OnGeometry);
    }

    /// The dispatch is on the non-empty dimension, not the adapter's dimension.
    /// This collection is dimension 1 and non-empty dimension 0, so the point
    /// comes from the Point and the vertex comparison must run against the
    /// dimension 0 elements. Dispatching on the plain dimension would look for
    /// vertices in the empty LineString and answer off-geometry for a correct
    /// point.
    #[test]
    fn follows_the_non_empty_dimension_for_a_collection_holding_an_empty_line() {
        let collection = Geometry::GeometryCollection(GeometryCollection(vec![
            Geometry::Point(Point::new(5.0, 5.0)),
            Geometry::LineString(LineString(vec![])),
        ]));
        assert_eq!(interior_point(&collection), Some(Coord { x: 5.0, y: 5.0 }));
        assert_eq!(verify_computed(&collection), Verification::OnGeometry);
    }

    /// The algorithm never produces one, so the only way here is a fabricated
    /// point — which is why the point is a parameter rather than something this
    /// function recomputes.
    #[test]
    fn reports_off_geometry_for_a_fabricated_point_outside_an_areal_geometry() {
        let square = polygon(&[(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0), (0.0, 0.0)]);
        assert_eq!(
            verify_interior_point(Some(Coord { x: 100.0, y: 100.0 }), Some(&square)),
            Verification::OffGeometry
        );
    }

    #[test]
    fn reports_off_geometry_for_a_fabricated_point_off_a_line_string() {
        let line = Geometry::LineString(LineString::from(vec![(0.0, 0.0), (10.0, 10.0)]));
        assert_eq!(
            verify_interior_point(Some(Coord { x: 100.0, y: 100.0 }), Some(&line)),
            Verification::OffGeometry
        );
    }

    #[test]
    fn reports_unverifiable_for_an_empty_geometry() {
        let empty = Geometry::Polygon(Polygon::new(LineString(vec![]), vec![]));
        assert_eq!(interior_point(&empty), None);
        assert_eq!(verify_computed(&empty), Verification::Unverifiable);
    }

    #[test]
    fn reports_unverifiable_for_a_multi_line_string_of_one_empty_line() {
        let empty = Geometry::MultiLineString(MultiLineString::new(vec![LineString(vec![])]));
        assert_eq!(verify_computed(&empty), Verification::Unverifiable);
    }

    #[test]
    fn reports_unverifiable_when_either_argument_is_absent() {
        let square = polygon(&[(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0), (0.0, 0.0)]);
        assert_eq!(
            verify_interior_point(None, Some(&square)),
            Verification::Unverifiable
        );
        assert_eq!(
            verify_interior_point(Some(Coord { x: 0.0, y: 0.0 }), None),
            Verification::Unverifiable
        );
        assert_eq!(
            verify_interior_point(None, None),
            Verification::Unverifiable
        );
    }

    #[test]
    fn prints_the_four_outcome_words() {
        assert_eq!(Verification::Interior.to_string(), "interior");
        assert_eq!(Verification::OnGeometry.to_string(), "on-geometry");
        assert_eq!(Verification::OffGeometry.to_string(), "off-geometry");
        assert_eq!(Verification::Unverifiable.to_string(), "unverifiable");
    }
}
