//! Comprehensive test using JTS world.wkt data.
//!
//! Verifies that for every geometry in world.wkt, the computed interior
//! point lies within the original geometry. This mirrors JTS
//! InteriorPointTest.testAll().
//!
//! @jts-deviate test placement — this lives in `rs/core/src/test/algorithm/`
//!   instead of `rs/core/tests/`. An integration test links against the library
//!   built without `cfg(test)`, so it cannot see the `#[cfg(test)]` locator
//!   modules that supply the containment predicate. The TypeScript world test
//!   stays in `js/test/`, since TypeScript tests can import unexported `js/src`
//!   modules directly.
//!
//! Why hand-roll point-in-polygon instead of keeping a maintained dependency: this port was
//! cross-checked against real JTS 1.19.0 over 263,944 probes across all
//! 8,397 rings of world.wkt (outcome mix 89,390 INTERIOR / 84,792 BOUNDARY / 89,762
//! EXTERIOR). Both ports' `locate` vs JTS `geomLoc` and both ports'
//! `locatePointInRing` vs JTS `ringLoc`: 0 mismatches. `geo::Contains` (the
//! dependency this branch removed from this crate): 0 mismatches.
//! `point-in-polygon-hao` (the TypeScript port's equivalent dependency): 2
//! mismatches, both at exact edge midpoints — geometry 197 (173.705525, 0.03665),
//! where hao returns 0 ("on the edge") and JTS says INTERIOR, and geometry 221
//! (98.260525, 0.0090335), where hao returns 0 and JTS says EXTERIOR. Cause: hao
//! translates every coordinate by the query point before calling its exact
//! orient2d, and that subtraction is inexact in IEEE 754, so the translated cross
//! product collapses to exactly -0; untranslated, the orientations are 3.773e-21
//! and -6.841e-21 — genuinely nonzero, so JTS is right.

use std::fs;
use std::str::FromStr;

use geo_types::Geometry;
use wkt::Wkt;

use crate::algorithm::locate::simple_point_in_area_locator::locate;
use crate::geom::location::INTERIOR;
use crate::interior_point;

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
