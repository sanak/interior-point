//! Integration tests for interior_point() dispatcher.
//!
//! Loads test cases directly from JTS TestInteriorPoint.xml (24 cases from XML)
//! plus extra cases from InteriorPointTest.java that are not in the XML.
//! Mirrors JTS InteriorPointTest.java: single test file, all via dispatcher.

mod utils;

use geo_types::{Coord, Geometry, LineString, MultiLineString, Polygon};
use interior_point::interior_point;
use utils::xml_test_parser::parse_test_interior_point_xml;

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
    let cases = parse_test_interior_point_xml("../testdata/xml/TestInteriorPoint.xml");
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
