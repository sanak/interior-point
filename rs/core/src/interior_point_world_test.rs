//! Comprehensive test using JTS world.wkt data.
//!
//! Verifies that for every geometry in world.wkt, the computed interior
//! point lies within the original geometry. This mirrors JTS
//! InteriorPointTest.testAll().
//!
//! @jts-deviate test placement — this lived in `rs/core/tests/` until the
//!   point-in-polygon port. An integration test links against the library built
//!   without `cfg(test)`, so it cannot see the `#[cfg(test)]` locator modules that
//!   supply the containment predicate. `centroid.rs` holds its TestCentroid.xml
//!   test inline for the same reason. The TypeScript world test stays in
//!   `js/test/`, since TypeScript tests can import unexported `js/src` modules
//!   directly.

use std::fs;
use std::str::FromStr;

use geo_types::Geometry;
use wkt::Wkt;

use crate::interior_point;
use crate::location::INTERIOR;
use crate::simple_point_in_area_locator::locate;

/// Parse a WKT string into a geo-types Geometry.
fn parse_wkt(wkt_str: &str) -> Option<Geometry<f64>> {
    let wkt = Wkt::from_str(wkt_str).ok()?;
    let geom: Geometry<f64> = wkt.try_into().ok()?;
    Some(geom)
}

/// Split a multi-line WKT file into individual WKT strings.
/// Each geometry starts with a keyword like POLYGON, MULTIPOLYGON, etc.
fn split_wkt_geometries(data: &str) -> Vec<String> {
    let mut geometries = Vec::new();
    let mut current = String::new();

    for line in data.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        // Check if this line starts a new geometry
        let starts_new = trimmed.starts_with("POINT")
            || trimmed.starts_with("LINESTRING")
            || trimmed.starts_with("POLYGON")
            || trimmed.starts_with("MULTIPOINT")
            || trimmed.starts_with("MULTILINESTRING")
            || trimmed.starts_with("MULTIPOLYGON")
            || trimmed.starts_with("GEOMETRYCOLLECTION");

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

/// @jts InteriorPointTest#testAll()
#[test]
fn test_world_wkt_interior_points() {
    let wkt_data = fs::read_to_string("../../upstream/jts/resources/testdata/world.wkt")
        .expect("Failed to read world.wkt — run from rs/ directory or repo root");

    let wkt_strings = split_wkt_geometries(&wkt_data);

    let mut count = 0;
    let mut failures = Vec::new();

    for (i, wkt_str) in wkt_strings.iter().enumerate() {
        let geom = match parse_wkt(wkt_str) {
            Some(g) => g,
            None => {
                // Skip unparseable entries
                continue;
            }
        };

        let ip = interior_point(&geom);
        if let Some(coord) = ip
            && locate(coord, &geom) != INTERIOR
        {
            failures.push(format!(
                "Geometry {}: interior point ({}, {}) not contained in geometry",
                i + 1,
                coord.x,
                coord.y,
            ));
        }
        // If ip is None, the geometry is empty — that's acceptable.

        count += 1;
    }

    assert!(
        failures.is_empty(),
        "Interior point containment failures ({} of {} geometries):\n{}",
        failures.len(),
        count,
        failures.join("\n"),
    );

    // Sanity check: we should have processed a significant number of geometries
    assert!(
        count > 100,
        "Expected >100 geometries in world.wkt, got {}",
        count,
    );
}
