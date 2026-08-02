//! Sweeps every upstream fixture through `centroid_first_interior_point` and
//! asserts two things per geometry: the result verifies, and its verification
//! outcome is the same as the outcome of the point `interior_point` would have
//! returned.
//!
//! The last of those is the real invariant. Swapping the function changes which
//! point comes back for 199 of these geometries and changes the verdict on none
//! of them.
//!
//! This reaches the crate through its public API alone, so unlike the world test
//! it can live here rather than under `src/test/`.

// The shared parser also carries each case's expected point, which this sweep
// has no use for: it compares two computed points against each other rather
// than against a fixture value.
#[allow(dead_code)]
#[path = "../utils/mod.rs"]
mod utils;

use std::fs;
use std::str::FromStr;

use geo_types::Geometry;
use interior_point::{centroid_first_interior_point, interior_point, verify_interior_point};
use utils::xml_test_parser::parse_xml_test_cases;
use wkt::Wkt;

/// How one fixture came out: how many geometries were swept, and how many of
/// them the centroid branch answered differently from `interior_point`.
#[derive(Default, PartialEq, Eq, Debug)]
struct Sweep {
    swept: usize,
    differs: usize,
}

/// Asserts one geometry and folds it into the running counts. Returns a failure
/// line instead of panicking, so one run reports every bad geometry at once.
fn sweep_one(label: &str, geometry: &Geometry<f64>, counts: &mut Sweep) -> Option<String> {
    counts.swept += 1;
    let result = centroid_first_interior_point(geometry);
    let plain = interior_point(geometry);
    if result != plain {
        counts.differs += 1;
    }
    if result.is_none() {
        // An empty input, where both functions answer None. Nothing to verify.
        return (plain.is_some()).then(|| format!("{label}: empty where interior_point was not"));
    }
    let verification = verify_interior_point(result, Some(geometry));
    if !verification.is_verified() {
        return Some(format!("{label}: result is {verification}"));
    }
    let plain_verification = verify_interior_point(plain, Some(geometry));
    if verification != plain_verification {
        return Some(format!(
            "{label}: result is {verification} where the algorithm's own point is {plain_verification}"
        ));
    }
    None
}

fn report(failures: Vec<String>, label: &str) {
    assert!(
        failures.is_empty(),
        "{} geometries in {label} failed:\n{}",
        failures.len(),
        failures.join("\n"),
    );
}

fn sweep_xml(path: &str, op: &str, expected_cases: usize, expected: Sweep) {
    let cases = parse_xml_test_cases(path, op);
    assert_eq!(cases.len(), expected_cases, "{path}: unexpected case count");
    let mut counts = Sweep::default();
    let mut failures = Vec::new();
    for case in &cases {
        let Some(geometry) = case.input.as_ref() else {
            continue;
        };
        if let Some(message) = sweep_one(&case.desc, geometry, &mut counts) {
            failures.push(message);
        }
    }
    report(failures, path);
    assert_eq!(counts, expected, "{path}: unexpected branch counts");
}

/// Not every fixture case carries an input this parser can build, which is why
/// `swept` is below the case count for both XML files.
#[test]
fn sweeps_every_interior_point_fixture_case() {
    sweep_xml(
        "../../upstream/jts/resources/testxml/general/TestInteriorPoint.xml",
        "getInteriorPoint",
        24,
        Sweep {
            swept: 21,
            differs: 3,
        },
    );
}

#[test]
fn sweeps_every_centroid_fixture_case() {
    sweep_xml(
        "../../upstream/jts/resources/testxml/general/TestCentroid.xml",
        "getCentroid",
        38,
        Sweep {
            swept: 36,
            differs: 2,
        },
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
fn sweeps_every_world_geometry() {
    let data = fs::read_to_string("../../upstream/jts/resources/testdata/world.wkt")
        .expect("Failed to read world.wkt — run cargo from rs/");
    let wkt_strings = split_wkt_geometries(&data);
    assert_eq!(
        wkt_strings.len(),
        244,
        "unexpected world.wkt geometry count"
    );

    let mut counts = Sweep::default();
    let mut failures = Vec::new();
    for (index, wkt_str) in wkt_strings.iter().enumerate() {
        let parsed = Wkt::from_str(wkt_str).expect("every world.wkt geometry parses");
        let geometry = Geometry::<f64>::try_from(parsed).expect("and converts");
        if let Some(message) = sweep_one(&format!("geometry {}", index + 1), &geometry, &mut counts)
        {
            failures.push(message);
        }
    }
    report(failures, "world.wkt");
    // Every one of the 244 is areal, so none is skipped, and the centroid is
    // accepted often enough that the fallback fires for only 50 of them.
    assert_eq!(
        counts,
        Sweep {
            swept: 244,
            differs: 194,
        }
    );
}
