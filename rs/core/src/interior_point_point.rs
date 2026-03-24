//! Interior point computation for point geometries (Point/MultiPoint).
//!
//! Finds the point closest to the centroid.
//! Ported from JTS InteriorPointPoint.java.

use geo_types::{Coord, Geometry};

/// Computes an interior point of point geometries within the given geometry.
///
/// Returns the point closest to the centroid, or `None` if the geometry
/// contains no points.
pub(crate) fn interior_point_point(geometry: &Geometry<f64>) -> Option<Coord<f64>> {
    let points = collect_points(geometry);
    if points.is_empty() {
        return None;
    }

    let centroid = compute_centroid(&points);
    find_closest(&points, centroid)
}

/// Recursively collect all Point coordinates from the geometry.
fn collect_points(geometry: &Geometry<f64>) -> Vec<Coord<f64>> {
    match geometry {
        Geometry::Point(p) => vec![p.0],
        Geometry::MultiPoint(mp) => mp.0.iter().map(|p| p.0).collect(),
        Geometry::GeometryCollection(gc) => gc.0.iter().flat_map(collect_points).collect(),
        _ => vec![],
    }
}

/// Compute the arithmetic-mean centroid of a set of coordinates.
fn compute_centroid(points: &[Coord<f64>]) -> Coord<f64> {
    let n = points.len() as f64;
    let sum_x: f64 = points.iter().map(|p| p.x).sum();
    let sum_y: f64 = points.iter().map(|p| p.y).sum();
    Coord {
        x: sum_x / n,
        y: sum_y / n,
    }
}

/// Find the point closest to the target using squared Euclidean distance.
fn find_closest(points: &[Coord<f64>], target: Coord<f64>) -> Option<Coord<f64>> {
    points
        .iter()
        .min_by(|a, b| {
            let da = distance_sq(**a, target);
            let db = distance_sq(**b, target);
            da.partial_cmp(&db).unwrap_or(std::cmp::Ordering::Equal)
        })
        .copied()
}

fn distance_sq(a: Coord<f64>, b: Coord<f64>) -> f64 {
    let dx = a.x - b.x;
    let dy = a.y - b.y;
    dx * dx + dy * dy
}
