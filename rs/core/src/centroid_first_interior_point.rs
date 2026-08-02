//! A centroid-first variant of `interior_point`. For an areal geometry it
//! returns the centroid whenever the centroid lies strictly inside that
//! geometry, and otherwise returns exactly what `interior_point` returns.
//! Dimensions 0 and 1 are handed straight to `interior_point`.
//!
//! The centroid is preferred because it is a stable, purely arithmetic function
//! of the input: two implementations that agree on the arithmetic agree on the
//! point. The scanline fallback is not — it depends on the scan line chosen and
//! on the widest interval found along it — so it is worth reaching for only when
//! the centroid is not inside the geometry, which for a convex shape is never.
//!
//! Acceptance is INTERIOR alone. A centroid that lands exactly on the boundary
//! is rejected, which keeps this function from ever returning a point the
//! geometry only touches.
//!
//! @jts-adapter InteriorPoint — an original surface with no JTS counterpart:
//!   JTS has no centroid-first entry point, and nothing here is ported. Every
//!   member it calls is.

use geo_types::{Coord, Geometry};

use crate::algorithm::centroid::get_centroid;
use crate::algorithm::interior_point::{dimension_non_empty, interior_point};
use crate::algorithm::locate::simple_point_in_area_locator::locate;
use crate::geom::location::INTERIOR;
use crate::geometry_adapter::is_geometry_empty;

/// Computes a representative point of a geometry, preferring its centroid.
///
/// Returns the centroid when it lies inside `geom`, otherwise whatever
/// `interior_point` returns, or `None` if the input is empty. The signature is
/// `interior_point`'s, so a caller swaps one call for the other. Which of the
/// two branches produced the point is not reported: a caller that needs to know
/// can compare the result against a centroid it computes itself.
///
/// Dimensions other than 2 delegate without computing a centroid at all. The
/// check could not pass there — the locator answers EXTERIOR for every point
/// against a puntal or lineal geometry, including that geometry's own vertices —
/// so computing a centroid only to discard it would be pure waste.
///
/// The predicate calls the locator directly rather than going through
/// `verify_interior_point`: at dimension 2 that function is this same locator
/// call plus a mapping onto its outcome enum, and it would also accept a point
/// on the boundary, which this function does not.
pub fn centroid_first_interior_point(geom: &Geometry<f64>) -> Option<Coord<f64>> {
    if is_geometry_empty(geom) {
        return None;
    }

    let dim = dimension_non_empty(geom);
    if dim != 2 {
        return interior_point(geom);
    }

    if let Some(centroid) = get_centroid(geom)
        && locate(centroid, geom) == INTERIOR
    {
        return Some(centroid);
    }
    interior_point(geom)
}

#[cfg(test)]
mod tests {
    use super::centroid_first_interior_point;
    use crate::algorithm::centroid::get_centroid;
    use crate::algorithm::interior_point::interior_point;
    use crate::algorithm::locate::simple_point_in_area_locator::locate;
    use crate::geom::location::{BOUNDARY, EXTERIOR, INTERIOR};
    use geo_types::{
        Coord, Geometry, GeometryCollection, LineString, MultiPoint, MultiPolygon, Point, Polygon,
    };

    /// A polygon from its rings, shell first.
    fn polygon(rings: Vec<Vec<(f64, f64)>>) -> Geometry<f64> {
        let mut rings = rings.into_iter();
        let shell = LineString::from(rings.next().expect("a polygon needs a shell"));
        Geometry::Polygon(Polygon::new(shell, rings.map(LineString::from).collect()))
    }

    fn coord(x: f64, y: f64) -> Coord<f64> {
        Coord { x, y }
    }

    fn triangle() -> Geometry<f64> {
        polygon(vec![vec![(0.0, 0.0), (10.0, 0.0), (0.0, 10.0), (0.0, 0.0)]])
    }

    fn square() -> Geometry<f64> {
        polygon(vec![vec![
            (0.0, 0.0),
            (10.0, 0.0),
            (10.0, 10.0),
            (0.0, 10.0),
            (0.0, 0.0),
        ]])
    }

    /// A square with a central hole. Its centroid falls in the hole.
    fn donut() -> Geometry<f64> {
        polygon(vec![
            vec![
                (0.0, 0.0),
                (10.0, 0.0),
                (10.0, 10.0),
                (0.0, 10.0),
                (0.0, 0.0),
            ],
            vec![(3.0, 3.0), (7.0, 3.0), (7.0, 7.0), (3.0, 7.0), (3.0, 3.0)],
        ])
    }

    /// A C, notched from the right between y = 2 and y = 8. Its centroid falls
    /// in the notch, which is outside the polygon.
    fn c_shape() -> Geometry<f64> {
        polygon(vec![vec![
            (0.0, 0.0),
            (10.0, 0.0),
            (10.0, 2.0),
            (3.0, 2.0),
            (3.0, 8.0),
            (10.0, 8.0),
            (10.0, 10.0),
            (0.0, 10.0),
            (0.0, 0.0),
        ]])
    }

    /// An L, notched from the upper right. Its centroid falls in the notch.
    fn l_shape() -> Geometry<f64> {
        polygon(vec![vec![
            (0.0, 0.0),
            (10.0, 0.0),
            (10.0, 3.0),
            (3.0, 3.0),
            (3.0, 10.0),
            (0.0, 10.0),
            (0.0, 0.0),
        ]])
    }

    /// A ring whose hole is its shell, so the polygon encloses no area at all.
    fn shell_identical_to_hole() -> Geometry<f64> {
        let ring = vec![(0.0, 0.0), (4.0, 0.0), (4.0, 4.0), (0.0, 4.0), (0.0, 0.0)];
        polygon(vec![ring.clone(), ring])
    }

    /// A ring whose vertices are collinear: dimension 2, zero area.
    fn collinear_ring() -> Geometry<f64> {
        polygon(vec![vec![(0.0, 0.0), (5.0, 0.0), (10.0, 0.0), (0.0, 0.0)]])
    }

    fn line() -> Geometry<f64> {
        Geometry::LineString(LineString::from(vec![(0.0, 0.0), (10.0, 10.0)]))
    }

    #[test]
    fn returns_the_centroid_when_it_lies_inside_an_areal_geometry() {
        let geom = triangle();
        let centroid = get_centroid(&geom).expect("a triangle has a centroid");
        assert_eq!(locate(centroid, &geom), INTERIOR);
        assert_eq!(centroid, coord(3.333333333333333, 3.333333333333333));
        assert_eq!(centroid_first_interior_point(&geom), Some(centroid));
        // And the point it did not return, so the two branches are visibly
        // different on this input.
        assert_eq!(interior_point(&geom), Some(coord(2.5, 5.0)));
    }

    /// The one shape where both branches agree. It is here so that a reader
    /// does not mistake agreement for the centroid branch never firing.
    #[test]
    fn returns_the_centroid_for_a_square_where_both_branches_agree() {
        let geom = square();
        let centroid = get_centroid(&geom).expect("a square has a centroid");
        assert_eq!(centroid, coord(5.0, 5.0));
        assert_eq!(centroid_first_interior_point(&geom), Some(centroid));
        assert_eq!(interior_point(&geom), Some(centroid));
    }

    #[test]
    fn returns_the_centroid_for_a_collection_whose_areal_part_accepts_it() {
        let geom = Geometry::GeometryCollection(GeometryCollection(vec![
            polygon(vec![vec![
                (0.0, 0.0),
                (4.0, 0.0),
                (4.0, 4.0),
                (0.0, 4.0),
                (0.0, 0.0),
            ]]),
            Geometry::LineString(LineString::from(vec![(0.0, 50.0), (10.0, 60.0)])),
        ]));
        let centroid = get_centroid(&geom).expect("the collection has a centroid");
        assert_eq!(centroid, coord(2.0, 2.0));
        assert_eq!(locate(centroid, &geom), INTERIOR);
        assert_eq!(centroid_first_interior_point(&geom), Some(centroid));
    }

    #[test]
    fn falls_back_when_the_centroid_lands_in_a_hole() {
        let geom = donut();
        assert_eq!(locate(get_centroid(&geom).unwrap(), &geom), EXTERIOR);
        assert_eq!(centroid_first_interior_point(&geom), interior_point(&geom));
        assert_eq!(centroid_first_interior_point(&geom), Some(coord(1.5, 5.0)));
    }

    #[test]
    fn falls_back_when_the_centroid_lands_in_a_notch() {
        for geom in [c_shape(), l_shape()] {
            let centroid = get_centroid(&geom).expect("both shapes have a centroid");
            assert_eq!(locate(centroid, &geom), EXTERIOR);
            assert_eq!(centroid_first_interior_point(&geom), interior_point(&geom));
            assert_ne!(centroid_first_interior_point(&geom), Some(centroid));
        }
    }

    #[test]
    fn falls_back_for_a_multi_polygon_whose_centroid_is_between_its_parts() {
        let geom = Geometry::MultiPolygon(MultiPolygon(vec![
            Polygon::new(
                LineString::from(vec![
                    (0.0, 0.0),
                    (10.0, 0.0),
                    (10.0, 10.0),
                    (0.0, 10.0),
                    (0.0, 0.0),
                ]),
                vec![],
            ),
            Polygon::new(
                LineString::from(vec![
                    (20.0, 0.0),
                    (30.0, 0.0),
                    (30.0, 10.0),
                    (20.0, 10.0),
                    (20.0, 0.0),
                ]),
                vec![],
            ),
        ]));
        assert_eq!(get_centroid(&geom), Some(coord(15.0, 5.0)));
        assert_eq!(locate(coord(15.0, 5.0), &geom), EXTERIOR);
        assert_eq!(centroid_first_interior_point(&geom), Some(coord(5.0, 5.0)));
    }

    #[test]
    fn falls_back_when_the_shell_is_its_own_hole() {
        let geom = shell_identical_to_hole();
        assert_eq!(get_centroid(&geom), Some(coord(2.0, 2.0)));
        assert_eq!(locate(coord(2.0, 2.0), &geom), EXTERIOR);
        assert_eq!(centroid_first_interior_point(&geom), Some(coord(0.0, 0.0)));
    }

    /// Acceptance is INTERIOR alone. This centroid sits exactly on the
    /// degenerate ring, which the locator answers BOUNDARY for, and a boundary
    /// point is not accepted.
    #[test]
    fn rejects_a_centroid_that_lands_on_the_boundary() {
        let geom = collinear_ring();
        let centroid = get_centroid(&geom).expect("a collinear ring has a centroid");
        assert_eq!(centroid, coord(5.0, 0.0));
        assert_eq!(locate(centroid, &geom), BOUNDARY);
        assert_eq!(centroid_first_interior_point(&geom), Some(coord(0.0, 0.0)));
        assert_eq!(centroid_first_interior_point(&geom), interior_point(&geom));
    }

    /// At dimension 2 with no area anywhere, the centroid falls through to the
    /// lineal branch and is pulled toward the line, far from the polygon.
    #[test]
    fn falls_back_for_a_collection_whose_centroid_is_dragged_off_by_a_line() {
        let geom = Geometry::GeometryCollection(GeometryCollection(vec![
            collinear_ring(),
            Geometry::LineString(LineString::from(vec![(0.0, 50.0), (10.0, 60.0)])),
        ]));
        assert_eq!(get_centroid(&geom), Some(coord(5.0, 22.781745930520227)));
        assert_eq!(centroid_first_interior_point(&geom), Some(coord(0.0, 0.0)));
    }

    #[test]
    fn delegates_every_dimension_below_two() {
        let point = Geometry::Point(Point::new(5.0, 5.0));
        let points = Geometry::MultiPoint(MultiPoint(vec![
            Point::new(0.0, 0.0),
            Point::new(10.0, 10.0),
        ]));
        let mixed = Geometry::GeometryCollection(GeometryCollection(vec![
            Geometry::Point(Point::new(5.0, 5.0)),
            line(),
        ]));
        for geom in [point, line(), points, mixed] {
            assert_eq!(centroid_first_interior_point(&geom), interior_point(&geom));
        }
    }

    /// The locator answers EXTERIOR for a lineal geometry's own vertices, so
    /// the dimension branch is not merely an optimisation of a check that would
    /// otherwise pass — the check could never pass there.
    #[test]
    fn a_lineal_centroid_would_have_been_rejected_anyway() {
        let geom = line();
        let centroid = get_centroid(&geom).expect("a line has a centroid");
        assert_eq!(centroid, coord(5.0, 5.0));
        assert_eq!(locate(centroid, &geom), EXTERIOR);
        assert_eq!(centroid_first_interior_point(&geom), Some(coord(0.0, 0.0)));
    }

    #[test]
    fn answers_none_for_every_empty_shape() {
        let empty_polygon = Geometry::Polygon(Polygon::new(LineString(vec![]), vec![]));
        let empty_multi_polygon = Geometry::MultiPolygon(MultiPolygon(vec![]));
        let multi_polygon_of_one_empty =
            Geometry::MultiPolygon(MultiPolygon(vec![Polygon::new(LineString(vec![]), vec![])]));
        let hole_without_a_shell = Geometry::Polygon(Polygon::new(
            LineString(vec![]),
            vec![LineString::from(vec![
                (0.0, 0.0),
                (4.0, 0.0),
                (4.0, 4.0),
                (0.0, 0.0),
            ])],
        ));
        for geom in [
            empty_polygon,
            empty_multi_polygon,
            multi_polygon_of_one_empty,
            hole_without_a_shell,
        ] {
            assert_eq!(centroid_first_interior_point(&geom), None);
            assert_eq!(interior_point(&geom), None);
        }
    }

    /// The result is one of exactly two points on every input, which is the
    /// whole contract restated as a property.
    #[test]
    fn always_returns_either_the_centroid_or_the_algorithms_own_point() {
        for geom in [
            triangle(),
            square(),
            donut(),
            c_shape(),
            l_shape(),
            shell_identical_to_hole(),
            collinear_ring(),
            line(),
        ] {
            let result = centroid_first_interior_point(&geom);
            assert!(result == get_centroid(&geom) || result == interior_point(&geom));
        }
    }
}
