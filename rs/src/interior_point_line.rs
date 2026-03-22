//! Interior point computation for line geometries (LineString/MultiLineString).
//!
//! Finds the vertex closest to the centroid.
//! Ported from JTS InteriorPointLine.java.

use geo_types::{Coord, Geometry, LineString};

/// Computes an interior point of line geometries within the given geometry.
///
/// Algorithm:
/// 1. Compute the length-weighted centroid of all linear components.
/// 2. Find the interior vertex (not an endpoint) closest to the centroid.
/// 3. If no interior vertices exist, fall back to the closest endpoint.
///
/// Returns `None` if the geometry contains no line segments.
pub(crate) fn interior_point_line(geometry: &Geometry<f64>) -> Option<Coord<f64>> {
    let lines = collect_lines(geometry);
    if lines.is_empty() {
        return None;
    }

    let centroid = compute_line_centroid(&lines);

    // Phase 1: try interior vertices (indices 1..n-1, exclusive of endpoints)
    let mut best: Option<Coord<f64>> = None;
    let mut best_dist = f64::INFINITY;

    for line in &lines {
        let coords: Vec<Coord<f64>> = line.coords().copied().collect();
        for coord in coords.iter().skip(1).take(coords.len().saturating_sub(2)) {
            let dist = distance_sq(*coord, centroid);
            if dist < best_dist {
                best_dist = dist;
                best = Some(*coord);
            }
        }
    }

    // Phase 2: fall back to endpoints if no interior vertices found
    if best.is_none() {
        for line in &lines {
            let coords: Vec<Coord<f64>> = line.coords().copied().collect();
            if coords.is_empty() {
                continue;
            }
            for &p in &[coords[0], coords[coords.len() - 1]] {
                let dist = distance_sq(p, centroid);
                if dist < best_dist {
                    best_dist = dist;
                    best = Some(p);
                }
            }
        }
    }

    best
}

/// Recursively collect all LineStrings from the geometry.
fn collect_lines(geometry: &Geometry<f64>) -> Vec<&LineString<f64>> {
    match geometry {
        Geometry::LineString(ls) => {
            if ls.0.is_empty() {
                vec![]
            } else {
                vec![ls]
            }
        }
        Geometry::MultiLineString(mls) => mls.0.iter().filter(|ls| !ls.0.is_empty()).collect(),
        Geometry::GeometryCollection(gc) => gc.0.iter().flat_map(collect_lines).collect(),
        _ => vec![],
    }
}

/// Compute the length-weighted centroid of line segments.
/// Each segment's midpoint is weighted by its length.
fn compute_line_centroid(lines: &[&LineString<f64>]) -> Coord<f64> {
    let mut total_len = 0.0_f64;
    let mut cx = 0.0_f64;
    let mut cy = 0.0_f64;

    for line in lines {
        let coords: Vec<Coord<f64>> = line.coords().copied().collect();
        for i in 0..coords.len().saturating_sub(1) {
            let dx = coords[i + 1].x - coords[i].x;
            let dy = coords[i + 1].y - coords[i].y;
            let len = (dx * dx + dy * dy).sqrt();
            total_len += len;
            cx += len * (coords[i].x + coords[i + 1].x) / 2.0;
            cy += len * (coords[i].y + coords[i + 1].y) / 2.0;
        }
    }

    if total_len == 0.0 {
        // Degenerate: all zero-length segments — use first point
        let first_line = lines[0];
        return first_line.0[0];
    }

    Coord {
        x: cx / total_len,
        y: cy / total_len,
    }
}

fn distance_sq(a: Coord<f64>, b: Coord<f64>) -> f64 {
    let dx = a.x - b.x;
    let dy = a.y - b.y;
    dx * dx + dy * dy
}
