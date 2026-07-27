//! Ports `CentroidTest.java`.
//!
//! @jts-deviate CentroidTest — `Centroid` is crate-internal, so `rs/core/tests/`
//!   (an external crate) cannot reach it. The `TestCentroid.xml`-driven test lives
//!   under `src/test/algorithm/` instead, in its own file: an integration test
//!   links against the library built without `cfg(test)`, so it cannot see the
//!   `#[cfg(test)]` locator stack this test needs.

use geo_types::{Coord, Geometry, LineString, MultiLineString, MultiPoint, MultiPolygon, Polygon};

use crate::algorithm::centroid::get_centroid;

// The parser lives in the integration-test crate, which a `#[cfg(test)]`
// module inside `src/` cannot `use`. `#[path] mod` cannot reach it either:
// its base directory would be a directory that does not exist. `include!`
// resolves against this file's own directory, `core/src/test/algorithm/`,
// so it works.
mod xml_test_parser {
    include!("../../../tests/utils/xml_test_parser.rs");
}
use xml_test_parser::parse_xml_test_cases;

const FIXTURE: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../upstream/jts/resources/testxml/general/TestCentroid.xml"
);

#[test]
fn matches_jts_on_every_upstream_case() {
    let cases = parse_xml_test_cases(FIXTURE, "getCentroid");
    assert_eq!(cases.len(), 38, "TestCentroid.xml should yield 38 cases");
    for case in &cases {
        let actual = case.input.as_ref().and_then(get_centroid);
        // Exact comparison, per the exact-comparison rule.
        assert_eq!(actual, case.expected, "case: {}", case.desc);
    }
}

#[test]
fn treats_zero_length_lines_as_points() {
    // Zero-length-line centroid defect: JTS 1.19.0 gives (6.666…, 6.666…) here; the
    // pre-retrofit inline centroid gave (0, 0).
    let mls = MultiLineString(vec![
        LineString::from(vec![(0.0, 0.0), (0.0, 0.0)]),
        LineString::from(vec![(10.0, 10.0), (10.0, 10.0)]),
        LineString::from(vec![(10.0, 10.0), (10.0, 10.0)]),
    ]);
    let c = get_centroid(&Geometry::MultiLineString(mls)).unwrap();
    assert!((c.x - 6.666_666_666_666_667).abs() < 1e-12);
    assert!((c.y - 6.666_666_666_666_667).abs() < 1e-12);
}

#[test]
fn returns_none_for_an_empty_geometry() {
    assert_eq!(
        get_centroid(&Geometry::MultiPoint(MultiPoint(vec![]))),
        None
    );
}

/// @jts-adapter CentroidTest#TOLERANCE
const TOLERANCE: f64 = 1e-10;

/// The area of a ring, transcribed from JTS `Area.ofRing(Coordinate[])` —
/// which is what `Geometry.getArea()` calls. Test-local: no ported source
/// module needs `Geometry.getArea()`, so it does not belong in the adapter.
///
/// The translation by `x0` is load-bearing, not a micro-optimisation. This
/// test's rings are slivers whose coordinates differ only around the 12th
/// decimal place, so the textbook shoelace form
/// `x[i] * y[i + 1] - x[i + 1] * y[i]` loses every significant digit to
/// cancellation: it returns exactly 0 for two of the three rings here and
/// overstates the third by eleven orders of magnitude.
///
/// @jts-adapter Geometry.getArea()
fn ring_area(ring: &[Coord<f64>]) -> f64 {
    if ring.len() < 3 {
        return 0.0;
    }
    let mut sum = 0.0;
    let x0 = ring[0].x;
    for i in 1..ring.len() - 1 {
        let x = ring[i].x - x0;
        let y1 = ring[i + 1].y;
        let y2 = ring[i - 1].y;
        sum += x * (y2 - y1);
    }
    (sum / 2.0).abs()
}

/// @jts CentroidTest#areaWeightedCentroid(Geometry)
fn area_weighted_centroid(polys: &[Polygon<f64>]) -> Coord<f64> {
    let total_area: f64 = polys.iter().map(|p| ring_area(&p.exterior().0)).sum();
    let mut cx = 0.0;
    let mut cy = 0.0;
    for poly in polys {
        let area_fraction = ring_area(&poly.exterior().0) / total_area;
        let component_centroid = get_centroid(&Geometry::Polygon(poly.clone())).unwrap();
        cx += area_fraction * component_centroid.x;
        cy += area_fraction * component_centroid.y;
    }
    Coord { x: cx, y: cy }
}

/// @jts CentroidTest#testCentroidMultiPolygon()
#[test]
fn computes_a_multipolygon_centroid_as_the_area_weighted_average() {
    // Verify that the computed centroid of a MultiPolygon is equivalent to
    // the area-weighted average of its components.
    let polys = vec![
        Polygon::new(
            LineString::from(vec![
                (-92.661322, 36.589_949_000_000_03),
                (-92.661_321_999_999_93, 36.589_949_000_000_05),
                (-92.661_321_999_999_93, 36.589_949_000_000_004),
                (-92.661322, 36.589949),
                (-92.661322, 36.589_949_000_000_03),
            ]),
            vec![],
        ),
        Polygon::new(
            LineString::from(vec![
                (-92.655_605_000_000_08, 36.587_088_000_000_05),
                (-92.655_604_999_999_92, 36.587_088_000_000_05),
                (-92.655_604_999_987_45, 36.587_087_999_992_576),
                (-92.655605, 36.587088),
                (-92.655_605_000_000_08, 36.587_088_000_000_05),
            ]),
            vec![],
        ),
        Polygon::new(
            LineString::from(vec![
                (-92.655_124_500_000_65, 36.586_800_000_000_466),
                (-92.655_124_499_999_94, 36.586_800_000_000_04),
                (-92.655_124_499_986_66, 36.586_799_999_990_5),
                (-92.655_124_500_000_65, 36.586_800_000_000_466),
            ]),
            vec![],
        ),
    ];
    let expected = area_weighted_centroid(&polys);
    let actual = get_centroid(&Geometry::MultiPolygon(MultiPolygon(polys.clone()))).unwrap();
    assert!((actual.x - expected.x).abs() < TOLERANCE);
    assert!((actual.y - expected.y).abs() < TOLERANCE);
}
