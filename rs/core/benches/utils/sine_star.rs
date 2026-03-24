//! SineStar polygon generator and precision reducer.
//! Ported from JTS SineStarFactory.java and GeometryPrecisionReducer.

use geo_types::{Coord, LineString, Polygon};
use std::f64::consts::PI;

/// Generate a SineStar polygon (port of JTS SineStarFactory.createSineStar).
///
/// Creates a polygon shaped like a star with sinusoidal arms.
pub fn create_sine_star(
    centre_x: f64,
    centre_y: f64,
    size: f64,
    n_pts: usize,
    n_arms: usize,
    arm_ratio: f64,
) -> Polygon<f64> {
    let radius = size / 2.0;
    let clamped_ratio = arm_ratio.clamp(0.0, 1.0);
    let arm_max_len = clamped_ratio * radius;
    let inside_radius = (1.0 - clamped_ratio) * radius;

    let mut coords = Vec::with_capacity(n_pts + 1);
    for i in 0..n_pts {
        let pt_arc_frac = (i as f64 / n_pts as f64) * n_arms as f64;
        let arm_ang_frac = pt_arc_frac - pt_arc_frac.floor();
        let arm_ang = 2.0 * PI * arm_ang_frac;
        let arm_len_frac = (arm_ang.cos() + 1.0) / 2.0;
        let curve_radius = inside_radius + arm_max_len * arm_len_frac;

        let ang = i as f64 * (2.0 * PI / n_pts as f64);
        let x = curve_radius * ang.cos() + centre_x;
        let y = curve_radius * ang.sin() + centre_y;
        coords.push(Coord { x, y });
    }
    // Close the ring
    coords.push(coords[0]);

    Polygon::new(LineString(coords), vec![])
}

/// Reduce coordinate precision (port of JTS GeometryPrecisionReducer).
/// Rounds each coordinate to: round(coord * scale) / scale
pub fn reduce_precision(polygon: &Polygon<f64>, scale: f64) -> Polygon<f64> {
    let reduce = |c: &Coord<f64>| Coord {
        x: (c.x * scale).round() / scale,
        y: (c.y * scale).round() / scale,
    };

    let exterior: Vec<Coord<f64>> = polygon.exterior().0.iter().map(reduce).collect();
    let interiors: Vec<LineString<f64>> = polygon
        .interiors()
        .iter()
        .map(|ring| LineString(ring.0.iter().map(reduce).collect()))
        .collect();

    Polygon::new(LineString(exterior), interiors)
}
