//! Ports of JTS's AbstractPointInRingTest, run through both entry points.
//!
//! JUnit expresses this as one abstract test class and two subclasses, each
//! binding the shared cases to a different entry point. `cargo test` has no
//! counterpart, so the cases become a table and each subclass's `runPtInRing`
//! becomes a function in its own module.
//!
//! @jts-adapter AbstractPointInRingTest — JUnit's abstract-test-class-plus-two-
//!   subclasses shape becomes a shared case table plus one entry-point function
//!   per subclass.

use geo_types::Coord;

use crate::location::{BOUNDARY, EXTERIOR, INTERIOR};

pub(super) struct Case {
    pub(super) expected: i32,
    pub(super) pt: Coord<f64>,
    pub(super) wkt: &'static str,
}

const fn c(expected: i32, x: f64, y: f64, wkt: &'static str) -> Case {
    Case {
        expected,
        pt: Coord { x, y },
        wkt,
    }
}

const BOX: &str = "POLYGON ((0 0, 0 20, 20 20, 20 0, 0 0))";

const COMPLEX_RING: &str = "POLYGON ((-40 80, -40 -80, 20 0, 20 -100, 40 40, 80 -80, 100 80, 140 -20, 120 140, 40 180, 60 40, 0 120, -20 -20, -40 80))";

const COMB: &str = "POLYGON ((0 0, 0 10, 4 5, 6 10, 7 5, 9 10, 10 5, 13 5, 15 10, 16 3, 17 10, 18 3, 25 10, 30 10, 30 0, 15 0, 14 5, 13 0, 9 0, 8 5, 6 0, 0 0))";

const REPEATED_PTS: &str = "POLYGON ((0 0, 0 10, 2 5, 2 5, 2 5, 2 5, 2 5, 3 10, 6 10, 8 5, 8 5, 8 5, 8 5, 10 10, 10 5, 10 5, 10 5, 10 5, 10 0, 0 0))";

/// @jts AbstractPointInRingTest#testBox()
pub(super) const TEST_BOX: [Case; 1] = [c(INTERIOR, 10.0, 10.0, BOX)];

/// @jts AbstractPointInRingTest#testComplexRing()
pub(super) const TEST_COMPLEX_RING: [Case; 1] = [c(INTERIOR, 0.0, 0.0, COMPLEX_RING)];

/// @jts AbstractPointInRingTest#testComb()
pub(super) const TEST_COMB: [Case; 13] = [
    c(BOUNDARY, 0.0, 0.0, COMB),
    c(BOUNDARY, 0.0, 1.0, COMB),
    // at vertex
    c(BOUNDARY, 4.0, 5.0, COMB),
    c(BOUNDARY, 8.0, 5.0, COMB),
    // on horizontal segment
    c(BOUNDARY, 11.0, 5.0, COMB),
    // on vertical segment
    c(BOUNDARY, 30.0, 5.0, COMB),
    // on angled segment
    c(BOUNDARY, 22.0, 7.0, COMB),
    c(INTERIOR, 1.0, 5.0, COMB),
    c(INTERIOR, 5.0, 5.0, COMB),
    c(INTERIOR, 1.0, 7.0, COMB),
    c(EXTERIOR, 12.0, 10.0, COMB),
    c(EXTERIOR, 16.0, 5.0, COMB),
    c(EXTERIOR, 35.0, 5.0, COMB),
];

/// @jts AbstractPointInRingTest#testRepeatedPts()
pub(super) const TEST_REPEATED_PTS: [Case; 7] = [
    c(BOUNDARY, 0.0, 0.0, REPEATED_PTS),
    c(BOUNDARY, 0.0, 1.0, REPEATED_PTS),
    // at vertex
    c(BOUNDARY, 2.0, 5.0, REPEATED_PTS),
    c(BOUNDARY, 8.0, 5.0, REPEATED_PTS),
    c(BOUNDARY, 10.0, 5.0, REPEATED_PTS),
    c(INTERIOR, 1.0, 5.0, REPEATED_PTS),
    c(INTERIOR, 3.0, 5.0, REPEATED_PTS),
];

/// @jts AbstractPointInRingTest#testRobustStressTriangles()
pub(super) const TEST_ROBUST_STRESS_TRIANGLES: [Case; 2] = [
    c(
        EXTERIOR,
        25.374625374625374,
        128.35564435564436,
        "POLYGON ((0.0 0.0, 0.0 172.0, 100.0 0.0, 0.0 0.0))",
    ),
    c(
        INTERIOR,
        97.96039603960396,
        782.0,
        "POLYGON ((642.0 815.0, 69.0 764.0, 394.0 966.0, 642.0 815.0))",
    ),
];

/// @jts AbstractPointInRingTest#testRobustTriangle()
pub(super) const TEST_ROBUST_TRIANGLE: [Case; 1] = [c(
    EXTERIOR,
    3.166572116932842,
    48.5390194687463,
    "POLYGON ((2.152214146946829 50.470470727186765, 18.381941666723034 19.567250592139274, 2.390837642830135 49.228045261718165, 2.152214146946829 50.470470727186765))",
)];

/// Parses one of the table's WKT polygons. The `wkt` crate is a dev-dependency,
/// which a `#[cfg(test)]` module may use.
pub(super) fn parse_polygon(wkt_str: &str) -> geo_types::Polygon<f64> {
    use std::str::FromStr;
    let parsed = wkt::Wkt::from_str(wkt_str).expect("the table's WKT must parse");
    let geom: geo_types::Geometry<f64> = parsed.try_into().expect("the table holds only polygons");
    match geom {
        geo_types::Geometry::Polygon(p) => p,
        other => panic!("expected a Polygon, got {other:?}"),
    }
}

/// Parses one of the table's WKT strings as a whole geometry, for the entry point
/// that takes a geometry rather than a ring.
pub(super) fn parse_geometry(wkt_str: &str) -> geo_types::Geometry<f64> {
    use std::str::FromStr;
    let parsed = wkt::Wkt::from_str(wkt_str).expect("the table's WKT must parse");
    parsed.try_into().expect("the table's WKT must convert")
}

#[test]
fn runs_all_25_of_jts_assertions() {
    // A guard, not a behaviour test: it fails loudly if a case is dropped while
    // editing the table above.
    let total = TEST_BOX.len()
        + TEST_COMPLEX_RING.len()
        + TEST_COMB.len()
        + TEST_REPEATED_PTS.len()
        + TEST_ROBUST_STRESS_TRIANGLES.len()
        + TEST_ROBUST_TRIANGLE.len();
    assert_eq!(total, 25);
}

mod ray_crossing_counter_test {
    use super::{
        Case, TEST_BOX, TEST_COMB, TEST_COMPLEX_RING, TEST_REPEATED_PTS,
        TEST_ROBUST_STRESS_TRIANGLES, TEST_ROBUST_TRIANGLE, parse_polygon,
    };
    use crate::ray_crossing_counter::RayCrossingCounter;

    /// Entry point 1. JTS passes `geom.getCoordinates()`, which for these
    /// single-ring polygons is the shell; the ports have no whole-geometry
    /// coordinate accessor, so the shell is read directly.
    ///
    /// @jts RayCrossingCounterTest#runPtInRing(int,Coordinate,String)
    fn run_pt_in_ring(cases: &[Case]) {
        for (i, case) in cases.iter().enumerate() {
            let poly = parse_polygon(case.wkt);
            let actual = RayCrossingCounter::locate_point_in_ring_coordinate_coordinates(
                case.pt,
                &poly.exterior().0,
            );
            assert_eq!(
                actual, case.expected,
                "case {i}: ({}, {}) in {}",
                case.pt.x, case.pt.y, case.wkt
            );
        }
    }

    #[test]
    fn test_box() {
        run_pt_in_ring(&TEST_BOX);
    }

    #[test]
    fn test_complex_ring() {
        run_pt_in_ring(&TEST_COMPLEX_RING);
    }

    #[test]
    fn test_comb() {
        run_pt_in_ring(&TEST_COMB);
    }

    #[test]
    fn test_repeated_pts() {
        run_pt_in_ring(&TEST_REPEATED_PTS);
    }

    #[test]
    fn test_robust_stress_triangles() {
        run_pt_in_ring(&TEST_ROBUST_STRESS_TRIANGLES);
    }

    #[test]
    fn test_robust_triangle() {
        run_pt_in_ring(&TEST_ROBUST_TRIANGLE);
    }
}

mod simple_point_in_area_locator_test {
    use super::{
        Case, TEST_BOX, TEST_COMB, TEST_COMPLEX_RING, TEST_REPEATED_PTS,
        TEST_ROBUST_STRESS_TRIANGLES, TEST_ROBUST_TRIANGLE, parse_geometry,
    };
    use crate::location::{BOUNDARY, EXTERIOR, INTERIOR};
    use crate::simple_point_in_area_locator::{SimplePointInAreaLocator, locate};
    use geo_types::{
        Coord, Geometry, GeometryCollection, LineString, MultiPolygon, Point, Polygon,
    };

    /// Entry point 2, which additionally exercises the polygon/hole walk and both
    /// envelope short-circuits.
    ///
    /// @jts SimplePointInAreaLocatorTest#runPtInRing(int,Coordinate,String)
    fn run_pt_in_ring(cases: &[Case]) {
        for (i, case) in cases.iter().enumerate() {
            let geom = parse_geometry(case.wkt);
            let actual = SimplePointInAreaLocator::new(&geom).locate(case.pt);
            assert_eq!(
                actual, case.expected,
                "case {i}: ({}, {}) in {}",
                case.pt.x, case.pt.y, case.wkt
            );
        }
    }

    #[test]
    fn test_box() {
        run_pt_in_ring(&TEST_BOX);
    }

    #[test]
    fn test_complex_ring() {
        run_pt_in_ring(&TEST_COMPLEX_RING);
    }

    #[test]
    fn test_comb() {
        run_pt_in_ring(&TEST_COMB);
    }

    #[test]
    fn test_repeated_pts() {
        run_pt_in_ring(&TEST_REPEATED_PTS);
    }

    #[test]
    fn test_robust_stress_triangles() {
        run_pt_in_ring(&TEST_ROBUST_STRESS_TRIANGLES);
    }

    #[test]
    fn test_robust_triangle() {
        run_pt_in_ring(&TEST_ROBUST_TRIANGLE);
    }

    fn with_hole() -> Polygon<f64> {
        Polygon::new(
            LineString::from(vec![
                (0.0, 0.0),
                (10.0, 0.0),
                (10.0, 10.0),
                (0.0, 10.0),
                (0.0, 0.0),
            ]),
            vec![LineString::from(vec![
                (2.0, 2.0),
                (6.0, 2.0),
                (6.0, 6.0),
                (2.0, 6.0),
                (2.0, 2.0),
            ])],
        )
    }

    // The 25 shared cases are all single-ring polygons, so the hole walk, the
    // multipolygon branch, and the collection recursion need their own coverage.
    #[test]
    fn walks_holes_and_reports_them_as_jts_does() {
        let geom = Geometry::Polygon(with_hole());
        assert_eq!(locate(Coord { x: 4.0, y: 4.0 }, &geom), EXTERIOR);
        assert_eq!(locate(Coord { x: 2.0, y: 4.0 }, &geom), BOUNDARY);
        assert_eq!(locate(Coord { x: 1.0, y: 1.0 }, &geom), INTERIOR);
    }

    #[test]
    fn finds_the_containing_member_of_a_multipolygon() {
        // Mirrors js/test/pointInRing.test.ts's "finds the containing member of
        // a multipolygon" fixture exactly (two disjoint unit-ish squares), which
        // is itself verified against real JTS 1.19.0 (SimplePointInAreaLocator,
        // WKT `MULTIPOLYGON (((0 0, 1 0, 1 1, 0 1, 0 0)), ((5 5, 8 5, 8 8, 5 8,
        // 5 5)))`): (6,6) -> INTERIOR, (0.5,0.5) -> INTERIOR, (3,3) -> EXTERIOR.
        // An earlier version of this test reused `with_hole()` as member 1 and
        // probed points near its hole's corner, which either landed on that
        // corner (a real JTS BOUNDARY, not the INTERIOR asserted) or — after a
        // first fix — inside `with_hole()`'s own shell, so member 1 answered
        // before the loop ever reached member 2. Neither ever exercised
        // `locate_in_geometry`'s non-first-member branch. This fixture does:
        // see the per-assertion trace below.
        let near = Polygon::new(
            LineString::from(vec![
                (0.0, 0.0),
                (1.0, 0.0),
                (1.0, 1.0),
                (0.0, 1.0),
                (0.0, 0.0),
            ]),
            vec![],
        );
        let far = Polygon::new(
            LineString::from(vec![
                (5.0, 5.0),
                (8.0, 5.0),
                (8.0, 8.0),
                (5.0, 8.0),
                (5.0, 5.0),
            ]),
            vec![],
        );
        let geom = Geometry::MultiPolygon(MultiPolygon(vec![near, far]));
        // (6, 6): member 1 (`near`) is EXTERIOR, so the loop proceeds to member 2
        // (`far`), which is INTERIOR — the non-first-member branch, reached.
        assert_eq!(locate(Coord { x: 6.0, y: 6.0 }, &geom), INTERIOR);
        // (0.5, 0.5): member 1 (`near`) alone answers INTERIOR; the loop never
        // reaches member 2.
        assert_eq!(locate(Coord { x: 0.5, y: 0.5 }, &geom), INTERIOR);
        // (3, 3): both members answer EXTERIOR.
        assert_eq!(locate(Coord { x: 3.0, y: 3.0 }, &geom), EXTERIOR);
    }

    #[test]
    fn recurses_into_a_nested_collection() {
        let inner = GeometryCollection(vec![Geometry::Polygon(with_hole())]);
        let geom = Geometry::GeometryCollection(GeometryCollection(vec![
            Geometry::GeometryCollection(inner),
            Geometry::Point(Point::new(100.0, 100.0)),
        ]));
        assert_eq!(locate(Coord { x: 1.0, y: 1.0 }, &geom), INTERIOR);
        assert_eq!(locate(Coord { x: 4.0, y: 4.0 }, &geom), EXTERIOR);
    }

    #[test]
    fn reports_empty_and_far_away_points_as_exterior() {
        assert_eq!(
            locate(
                Coord { x: 0.0, y: 0.0 },
                &Geometry::MultiPolygon(MultiPolygon(vec![]))
            ),
            EXTERIOR
        );
        // The fast path in locate(), before locate_in_geometry is reached at all.
        assert_eq!(
            locate(
                Coord {
                    x: 1000.0,
                    y: 1000.0
                },
                &Geometry::Polygon(with_hole())
            ),
            EXTERIOR
        );
    }
}
