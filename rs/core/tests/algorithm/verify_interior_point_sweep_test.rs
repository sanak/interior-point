//! Sweeps every upstream fixture through `interior_point` and asserts that each
//! computed point verifies against the geometry it came from.
//!
//! This reaches the crate through its public API alone — `interior_point`,
//! `verify_interior_point` and `is_verified` — so unlike the world test it can
//! live here rather than under `src/test/`.
//!
//! @jts InteriorPointTest#checkInteriorPoint(Geometry)
//! @jts-deviate predicate — JTS asserts `g.contains(ip)`; this asserts
//!   `is_verified()`, because `contains` is false for `LINESTRING (0 0, 10 10)`:
//!   its interior point is the endpoint, i.e. the line's boundary.

// The shared parser also carries each case's expected point, which this sweep
// has no use for: TestCentroid.xml's expected value is a centroid, not an
// interior point, so asserting on it here would be wrong.
#[allow(dead_code)]
#[path = "../utils/mod.rs"]
mod utils;

use std::fs;
use std::str::FromStr;

use geo_types::Geometry;
use interior_point::{InteriorPointVerification, interior_point, verify_interior_point};
use utils::xml_test_parser::parse_xml_test_cases;
use wkt::Wkt;

/// Asserts one geometry and returns a failure line when its point does not
/// verify. An absent point is an empty input and is not a failure.
fn failure(label: &str, geometry: &Geometry<f64>) -> Option<String> {
    let point = interior_point(geometry)?;
    let verification = verify_interior_point(Some(point), Some(geometry));
    if verification.is_verified() {
        return None;
    }
    Some(format!(
        "{label}: interior point ({}, {}) is {verification}",
        point.x, point.y
    ))
}

fn sweep_xml(path: &str, op: &str, expected_cases: usize) {
    let cases = parse_xml_test_cases(path, op);
    assert_eq!(cases.len(), expected_cases, "{path}: unexpected case count");
    let failures: Vec<String> = cases
        .iter()
        .filter_map(|case| {
            let geometry = case.input.as_ref()?;
            failure(&case.desc, geometry)
        })
        .collect();
    assert!(
        failures.is_empty(),
        "{} of {} cases in {path} did not verify:\n{}",
        failures.len(),
        cases.len(),
        failures.join("\n"),
    );
}

#[test]
fn verifies_every_interior_point_fixture_case() {
    sweep_xml(
        "../../upstream/jts/resources/testxml/general/TestInteriorPoint.xml",
        "getInteriorPoint",
        24,
    );
}

#[test]
fn verifies_every_centroid_fixture_case() {
    sweep_xml(
        "../../upstream/jts/resources/testxml/general/TestCentroid.xml",
        "getCentroid",
        38,
    );
}

/// Splits a multi-line WKT file into individual WKT strings. Each geometry
/// starts with a type keyword at the beginning of a line.
fn split_wkt_geometries(data: &str) -> Vec<String> {
    let mut geometries = Vec::new();
    let mut current = String::new();
    for line in data.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let starts_new = [
            "POINT",
            "LINESTRING",
            "POLYGON",
            "MULTIPOINT",
            "MULTILINESTRING",
            "MULTIPOLYGON",
            "GEOMETRYCOLLECTION",
        ]
        .iter()
        .any(|keyword| trimmed.starts_with(keyword));
        if starts_new && !current.is_empty() {
            geometries.push(current.trim().to_string());
            current = String::new();
        }
        if !current.is_empty() {
            current.push(' ');
        }
        current.push_str(trimmed);
    }
    if !current.trim().is_empty() {
        geometries.push(current.trim().to_string());
    }
    geometries
}

#[test]
fn verifies_every_world_geometry() {
    let data = fs::read_to_string("../../upstream/jts/resources/testdata/world.wkt")
        .expect("Failed to read world.wkt — run cargo from rs/");
    let wkt_strings = split_wkt_geometries(&data);
    assert_eq!(
        wkt_strings.len(),
        244,
        "unexpected world.wkt geometry count"
    );

    let mut failures = Vec::new();
    for (index, wkt_str) in wkt_strings.iter().enumerate() {
        let Ok(parsed) = Wkt::from_str(wkt_str) else {
            continue;
        };
        let Ok(geometry) = Geometry::<f64>::try_from(parsed) else {
            continue;
        };
        if let Some(message) = failure(&format!("geometry {}", index + 1), &geometry) {
            failures.push(message);
        }
    }
    assert!(
        failures.is_empty(),
        "{} of {} world.wkt geometries did not verify:\n{}",
        failures.len(),
        wkt_strings.len(),
        failures.join("\n"),
    );
}

/// The three sweeps above skip what they cannot verify: an XML case whose
/// `input` is absent is dropped by `filter_map`, and a `world.wkt` string that
/// fails to parse or convert is skipped by `continue`. None of their case-count
/// assertions catches a regression that made `interior_point` return `None` for
/// every geometry, because those counts are over what was loaded, not what was
/// verified.
///
/// This test tallies every one of the 306 fixture entries instead — an XML case
/// with no input still counts, as `Unverifiable`, and every `world.wkt` string
/// is required to parse and convert rather than being skipped — so a
/// regression of that shape moves this tally instead of passing silently.
/// Mirrors `js/test/VerifyInteriorPointSweepTest.ts`'s `countOutcomes` totals
/// assertion.
#[test]
fn tallies_every_outcome_across_all_306_fixture_geometries() {
    let interior_point_cases = parse_xml_test_cases(
        "../../upstream/jts/resources/testxml/general/TestInteriorPoint.xml",
        "getInteriorPoint",
    );
    assert_eq!(
        interior_point_cases.len(),
        24,
        "unexpected TestInteriorPoint.xml case count"
    );

    let centroid_cases = parse_xml_test_cases(
        "../../upstream/jts/resources/testxml/general/TestCentroid.xml",
        "getCentroid",
    );
    assert_eq!(
        centroid_cases.len(),
        38,
        "unexpected TestCentroid.xml case count"
    );

    let data = fs::read_to_string("../../upstream/jts/resources/testdata/world.wkt")
        .expect("Failed to read world.wkt — run cargo from rs/");
    let wkt_strings = split_wkt_geometries(&data);
    assert_eq!(
        wkt_strings.len(),
        244,
        "unexpected world.wkt geometry count"
    );
    let world_geometries: Vec<Option<Geometry<f64>>> = wkt_strings
        .iter()
        .map(|wkt_str| {
            let parsed = Wkt::from_str(wkt_str)
                .unwrap_or_else(|e| panic!("failed to parse world.wkt geometry {wkt_str}: {e}"));
            let geometry = Geometry::<f64>::try_from(parsed)
                .unwrap_or_else(|_| panic!("failed to convert world.wkt geometry {wkt_str}"));
            Some(geometry)
        })
        .collect();

    let all: Vec<Option<Geometry<f64>>> = interior_point_cases
        .into_iter()
        .map(|case| case.input)
        .chain(centroid_cases.into_iter().map(|case| case.input))
        .chain(world_geometries)
        .collect();
    assert_eq!(all.len(), 306, "unexpected total fixture geometry count");

    let mut interior = 0usize;
    let mut on_geometry = 0usize;
    let mut off_geometry = 0usize;
    let mut unverifiable = 0usize;
    for geometry in &all {
        let point = geometry.as_ref().and_then(interior_point);
        match verify_interior_point(point, geometry.as_ref()) {
            InteriorPointVerification::Interior => interior += 1,
            InteriorPointVerification::OnGeometry => on_geometry += 1,
            InteriorPointVerification::OffGeometry => off_geometry += 1,
            InteriorPointVerification::Unverifiable => unverifiable += 1,
        }
    }

    assert_eq!(
        (interior, on_geometry, off_geometry, unverifiable),
        (260, 39, 0, 7),
        "outcome tally across all 306 fixture geometries"
    );
}
