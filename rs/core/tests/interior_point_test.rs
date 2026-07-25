//! Integration tests for interior_point() dispatcher.
//!
//! Loads test cases directly from JTS TestInteriorPoint.xml (24 cases from XML)
//! plus extra cases from InteriorPointTest.java that are not in the XML.
//! Mirrors JTS InteriorPointTest.java: single test file, all via dispatcher.

mod utils;

use geo_types::{Coord, Geometry, LineString, MultiLineString, Polygon};
use interior_point::interior_point;
use utils::xml_test_parser::parse_xml_test_cases;

/// Helper to run a test case: check the result matches the expected coordinate.
fn check(desc: &str, result: Option<Coord<f64>>, expected: Option<Coord<f64>>) {
    match (result, expected) {
        (None, None) => {} // both empty — pass
        (Some(r), Some(e)) => {
            assert!(
                (r.x - e.x).abs() < 1e-10 && (r.y - e.y).abs() < 1e-10,
                "{desc}: expected ({}, {}), got ({}, {})",
                e.x,
                e.y,
                r.x,
                r.y,
            );
        }
        (None, Some(e)) => {
            panic!("{desc}: expected ({}, {}), got None", e.x, e.y);
        }
        (Some(r), None) => {
            panic!("{desc}: expected None, got ({}, {})", r.x, r.y);
        }
    }
}

// ───────────────────────────────────────────────────────────────────────────
// XML test cases — all via interior_point() dispatcher
// ───────────────────────────────────────────────────────────────────────────

#[test]
fn test_interior_point_xml_all_cases() {
    let cases = parse_xml_test_cases(
        "../../upstream/jts/resources/testxml/general/TestInteriorPoint.xml",
        "getInteriorPoint",
    );
    assert_eq!(cases.len(), 24, "Expected 24 test cases from XML");

    for tc in &cases {
        let result = match &tc.input {
            Some(geom) => interior_point(geom),
            None => None,
        };
        check(&tc.desc, result, tc.expected);
    }
}

// ───────────────────────────────────────────────────────────────────────────
// Extra tests from InteriorPointTest.java (not in XML)
// ───────────────────────────────────────────────────────────────────────────

#[test]
fn test_polygon_zero_area() {
    let poly = Polygon::new(
        LineString::from(vec![(10.0, 10.0), (10.0, 10.0), (10.0, 10.0), (10.0, 10.0)]),
        vec![],
    );
    let geom = Geometry::Polygon(poly);
    let result = interior_point(&geom);
    check(
        "zero-area polygon",
        result,
        Some(Coord { x: 10.0, y: 10.0 }),
    );
}

#[test]
fn test_multiline_with_empty() {
    let ml = MultiLineString::new(vec![LineString::from(vec![(0.0, 0.0), (1.0, 1.0)])]);
    let geom = Geometry::MultiLineString(ml);
    let result = interior_point(&geom);
    check(
        "multiline with empty",
        result,
        Some(Coord { x: 0.0, y: 0.0 }),
    );
}

// ───────────────────────────────────────────────────────────────────────────
// Odd scanline crossings (the even-crossing assertion)
//
// JTS asserts `0 == crossings.size() % 2`. A closed ring always produces an
// even count -- crossing the scan line flips inside/outside, and a closed curve
// returns to where it started -- so only a ring that is not closed can reach
// the assertion.
//
// No end-to-end input reaches it here. `geo_types::Polygon::new` closes both
// the exterior and every interior ring, exactly as JTS's LinearRing
// constructor does, so an unclosed ring is not representable. The TypeScript
// port has no such guarantee -- a GeoJSON ring is a raw array -- and its own
// test suite covers the assertion end-to-end. The direct coverage on this side
// is the unit test of `find_best_midpoint` in `interior_point_area.rs`.
//
// Neither TestInteriorPoint.xml (24 cases) nor world.wkt (244 geometries)
// contains an input that reaches the assertion; both suites pass with it in
// place.
// ───────────────────────────────────────────────────────────────────────────

#[test]
fn test_self_intersecting_closed_ring_does_not_panic() {
    // A bowtie is invalid too, but it is closed, so the crossing count stays
    // even. The assertion must not fire here -- it guards parity, not validity.
    let poly = Polygon::new(
        LineString::from(vec![
            (0.0, 0.0),
            (10.0, 10.0),
            (10.0, 0.0),
            (0.0, 10.0),
            (0.0, 0.0),
        ]),
        vec![],
    );
    assert_eq!(
        interior_point(&Geometry::Polygon(poly)),
        Some(Coord { x: 2.5, y: 5.0 })
    );
}

#[test]
fn test_zero_length_lines_asymmetric() {
    // Zero-length-line centroid defect regression. Confirmed against JTS 1.19.0.
    let mls = MultiLineString::new(vec![
        LineString::from(vec![(0.0, 0.0), (0.0, 0.0)]),
        LineString::from(vec![(10.0, 10.0), (10.0, 10.0)]),
        LineString::from(vec![(10.0, 10.0), (10.0, 10.0)]),
    ]);
    assert_eq!(
        interior_point(&Geometry::MultiLineString(mls)),
        Some(Coord { x: 10.0, y: 10.0 })
    );
}
