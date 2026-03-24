//! Interior point computation for area geometries (Polygon/MultiPolygon).
//!
//! Uses a scanline algorithm ported from JTS InteriorPointArea.java.
//! The computed point is guaranteed to lie inside the polygon
//! (except for certain degenerate/zero-area cases).

use geo_types::{Coord, Geometry, LineString, Polygon};

/// Computes an interior point of area geometries within the given geometry.
///
/// Uses a scanline algorithm: picks a Y-coordinate that bisects the bounding
/// box, computes edge intersections, and returns the midpoint of the longest
/// interior interval.
///
/// Returns `None` if the geometry contains no area components.
pub(crate) fn interior_point_area(geometry: &Geometry<f64>) -> Option<Coord<f64>> {
    let mut state = AreaState {
        interior_point: None,
        max_width: -1.0,
    };
    process_geometry(geometry, &mut state);
    state.interior_point
}

struct AreaState {
    interior_point: Option<Coord<f64>>,
    max_width: f64,
}

fn process_geometry(geometry: &Geometry<f64>, state: &mut AreaState) {
    match geometry {
        Geometry::Polygon(p) => process_polygon(p, state),
        Geometry::MultiPolygon(mp) => {
            for p in &mp.0 {
                process_polygon(p, state);
            }
        }
        Geometry::GeometryCollection(gc) => {
            for g in &gc.0 {
                process_geometry(g, state);
            }
        }
        _ => {}
    }
}

fn process_polygon(polygon: &Polygon<f64>, state: &mut AreaState) {
    let exterior = polygon.exterior();
    if exterior.0.is_empty() {
        return;
    }

    // Default interior point for zero-area polygons
    let default_point = exterior.0[0];

    let scan_y = find_scan_line_y(exterior, polygon.interiors());
    let mut crossings: Vec<f64> = Vec::new();

    scan_ring(exterior, scan_y, &mut crossings);
    for hole in polygon.interiors() {
        scan_ring(hole, scan_y, &mut crossings);
    }

    // Find best midpoint from crossings
    if crossings.is_empty() {
        // Zero-area polygon — use default point (first coordinate)
        if state.max_width < 0.0 {
            state.max_width = 0.0;
            state.interior_point = Some(default_point);
        }
        return;
    }

    crossings.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));

    let mut best_width = 0.0_f64;
    let mut best_point = default_point;

    let mut i = 0;
    while i + 1 < crossings.len() {
        let x1 = crossings[i];
        let x2 = crossings[i + 1];
        let width = x2 - x1;
        if width > best_width {
            best_width = width;
            best_point = Coord {
                x: (x1 + x2) / 2.0,
                y: scan_y,
            };
        }
        i += 2;
    }

    if best_width > state.max_width {
        state.max_width = best_width;
        state.interior_point = Some(best_point);
    }
}

// ---------------------------------------------------------------------------
// Ring scanning
// ---------------------------------------------------------------------------

/// Scan a ring's edges for intersections with a horizontal line at the given Y.
fn scan_ring(ring: &LineString<f64>, scan_y: f64, crossings: &mut Vec<f64>) {
    if !ring_intersects_y(ring, scan_y) {
        return;
    }

    let coords = &ring.0;
    for i in 1..coords.len() {
        let p0 = coords[i - 1];
        let p1 = coords[i];
        add_edge_crossing(p0, p1, scan_y, crossings);
    }
}

fn add_edge_crossing(p0: Coord<f64>, p1: Coord<f64>, scan_y: f64, crossings: &mut Vec<f64>) {
    if !segment_intersects_y(p0, p1, scan_y) {
        return;
    }
    if !is_edge_crossing_counted(p0, p1, scan_y) {
        return;
    }
    crossings.push(intersection_x(p0, p1, scan_y));
}

/// Determines if an edge crossing contributes to the crossing count.
/// Implements consistent topology rules to ensure correct inside/outside detection.
fn is_edge_crossing_counted(p0: Coord<f64>, p1: Coord<f64>, scan_y: f64) -> bool {
    let y0 = p0.y;
    let y1 = p1.y;
    // Skip horizontal lines
    if y0 == y1 {
        return false;
    }
    // Downward segment does not include start point
    if y0 == scan_y && y1 < scan_y {
        return false;
    }
    // Upward segment does not include endpoint
    if y1 == scan_y && y0 < scan_y {
        return false;
    }
    true
}

/// Compute the X-coordinate where a segment crosses a horizontal line at Y.
fn intersection_x(p0: Coord<f64>, p1: Coord<f64>, y: f64) -> f64 {
    let x0 = p0.x;
    let x1 = p1.x;
    if x0 == x1 {
        return x0;
    }

    let seg_dx = x1 - x0;
    let seg_dy = p1.y - p0.y;
    let m = seg_dy / seg_dx;
    x0 + (y - p0.y) / m
}

/// Tests if a ring's Y-extent includes the given Y.
fn ring_intersects_y(ring: &LineString<f64>, y: f64) -> bool {
    let mut min_y = f64::INFINITY;
    let mut max_y = f64::NEG_INFINITY;
    for coord in &ring.0 {
        if coord.y < min_y {
            min_y = coord.y;
        }
        if coord.y > max_y {
            max_y = coord.y;
        }
    }
    y >= min_y && y <= max_y
}

/// Tests if a segment's Y-extent includes the given Y.
fn segment_intersects_y(p0: Coord<f64>, p1: Coord<f64>, y: f64) -> bool {
    if p0.y > y && p1.y > y {
        return false;
    }
    if p0.y < y && p1.y < y {
        return false;
    }
    true
}

// ---------------------------------------------------------------------------
// ScanLineYOrdinateFinder
// ---------------------------------------------------------------------------

/// Finds a Y-ordinate for the scan line that bisects the polygon's Y-extent
/// while avoiding all vertex Y-coordinates.
///
/// Algorithm: start with the center of the bounding box Y-extent, then
/// narrow the interval [lo_y, hi_y] to the closest vertex below and above
/// the center. Return the midpoint of that interval.
fn find_scan_line_y(exterior: &LineString<f64>, interiors: &[LineString<f64>]) -> f64 {
    let mut min_y = f64::INFINITY;
    let mut max_y = f64::NEG_INFINITY;

    for coord in &exterior.0 {
        if coord.y < min_y {
            min_y = coord.y;
        }
        if coord.y > max_y {
            max_y = coord.y;
        }
    }

    let centre_y = (min_y + max_y) / 2.0;

    // Initialize interval to full extent
    let mut lo_y = min_y;
    let mut hi_y = max_y;

    // Narrow interval by scanning all vertices
    update_interval(&exterior.0, centre_y, &mut lo_y, &mut hi_y);
    for ring in interiors {
        update_interval(&ring.0, centre_y, &mut lo_y, &mut hi_y);
    }

    (hi_y + lo_y) / 2.0
}

fn update_interval(coords: &[Coord<f64>], centre: f64, lo_y: &mut f64, hi_y: &mut f64) {
    for coord in coords {
        let y = coord.y;
        if y <= centre {
            if y > *lo_y {
                *lo_y = y;
            }
        } else if y < *hi_y {
            *hi_y = y;
        }
    }
}
