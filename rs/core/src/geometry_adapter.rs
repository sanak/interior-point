//! The adapter between JTS's geometry model and geo-types. The adapter boundary:
//! every geometry-model helper the ported algorithms need lives here, and
//! nothing else in `rs/core/src` may define one.
//!
//! `Coordinate` maps to `geo_types::Coord<f64>` and `Envelope` to
//! `geo_types::Rect<f64>`; both are named canonically by geo-types, so neither
//! gets an alias here, per the adapter boundary.

use geo_types::{Coord, Geometry, Rect};

/// Computes a ring's envelope in a single pass.
///
/// JTS caches this on the `LinearRing` and reads it back in both `scanRing` and
/// `ScanLineYOrdinateFinder`; computing it once here is what removes the
/// duplicate exterior-ring scan.
///
/// The `geo` crate's `BoundingRect` trait would do this, but `geo` is a
/// dev-dependency: `geo-types` is the only runtime dependency this crate has,
/// and the port adds none. `Rect` itself lives in `geo-types`, so the return
/// type is still the one the adapter boundary names for `Envelope`.
///
/// Returns `None` for an empty ring, which has no envelope. JTS returns an
/// empty `Envelope` there instead; both take the "intersects nothing" path at
/// every call site, and `Rect` cannot represent an empty extent.
///
/// @jts-adapter LinearRing.getEnvelopeInternal()
pub(crate) fn envelope_internal(ring: &[Coord<f64>]) -> Option<Rect<f64>> {
    let mut min_x = f64::INFINITY;
    let mut min_y = f64::INFINITY;
    let mut max_x = f64::NEG_INFINITY;
    let mut max_y = f64::NEG_INFINITY;
    if ring.is_empty() {
        return None;
    }
    for c in ring {
        if c.x < min_x {
            min_x = c.x;
        }
        if c.x > max_x {
            max_x = c.x;
        }
        if c.y < min_y {
            min_y = c.y;
        }
        if c.y > max_y {
            max_y = c.y;
        }
    }
    Some(Rect::new(
        Coord { x: min_x, y: min_y },
        Coord { x: max_x, y: max_y },
    ))
}

/// @jts-adapter Geometry.isEmpty()
pub(crate) fn is_geometry_empty(geometry: &Geometry<f64>) -> bool {
    match geometry {
        Geometry::Point(_) => false, // geo-types Point cannot be empty
        Geometry::MultiPoint(mp) => mp.0.is_empty(),
        Geometry::LineString(ls) => ls.0.is_empty(),
        Geometry::MultiLineString(mls) => {
            mls.0.is_empty() || mls.0.iter().all(|ls| ls.0.is_empty())
        }
        Geometry::Polygon(p) => p.exterior().0.is_empty(),
        Geometry::MultiPolygon(mp) => {
            mp.0.is_empty() || mp.0.iter().all(|p| p.exterior().0.is_empty())
        }
        Geometry::GeometryCollection(gc) => gc.0.is_empty() || gc.0.iter().all(is_geometry_empty),
        _ => true,
    }
}

/// The topological dimension of a geometry: 0 for puntal, 1 for lineal, 2 for
/// areal. A GeometryCollection takes the highest dimension among its members.
///
/// This is **not** `InteriorPoint::dimension_non_empty`, which additionally
/// skips empty elements.
///
/// @jts-adapter Geometry.getDimension()
pub(crate) fn dimension(geometry: &Geometry<f64>) -> i32 {
    match geometry {
        Geometry::Point(_) | Geometry::MultiPoint(_) => 0,
        Geometry::Line(_) | Geometry::LineString(_) | Geometry::MultiLineString(_) => 1,
        Geometry::Polygon(_)
        | Geometry::MultiPolygon(_)
        | Geometry::Rect(_)
        | Geometry::Triangle(_) => 2,
        Geometry::GeometryCollection(gc) => gc.0.iter().map(dimension).max().unwrap_or(-1),
    }
}

/// @jts-adapter Coordinate.distance(Coordinate)
pub(crate) fn distance(a: Coord<f64>, b: Coord<f64>) -> f64 {
    let dx = a.x - b.x;
    let dy = a.y - b.y;
    (dx * dx + dy * dy).sqrt()
}

#[cfg(test)]
mod tests {
    use super::{dimension, distance, is_geometry_empty};
    use geo_types::{Coord, Geometry, GeometryCollection, LineString, MultiPoint, Point, Polygon};

    fn square() -> Polygon<f64> {
        Polygon::new(
            LineString::from(vec![(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 0.0)]),
            vec![],
        )
    }

    #[test]
    fn reports_the_dimension_of_each_geometry_type() {
        assert_eq!(dimension(&Geometry::Point(Point::new(0.0, 0.0))), 0);
        assert_eq!(
            dimension(&Geometry::MultiPoint(MultiPoint(vec![Point::new(
                0.0, 0.0
            )]))),
            0
        );
        assert_eq!(
            dimension(&Geometry::LineString(LineString::from(vec![
                (0.0, 0.0),
                (1.0, 1.0)
            ]))),
            1
        );
        assert_eq!(dimension(&Geometry::Polygon(square())), 2);
    }

    #[test]
    fn gives_a_collection_the_highest_dimension_of_its_members() {
        let gc = GeometryCollection(vec![
            Geometry::Point(Point::new(0.0, 0.0)),
            Geometry::Polygon(square()),
        ]);
        assert_eq!(dimension(&Geometry::GeometryCollection(gc)), 2);
    }

    #[test]
    fn detects_empty_geometries() {
        assert!(is_geometry_empty(&Geometry::MultiPoint(MultiPoint(vec![]))));
        assert!(!is_geometry_empty(&Geometry::Point(Point::new(0.0, 0.0))));
        assert!(is_geometry_empty(&Geometry::GeometryCollection(
            GeometryCollection(vec![])
        )));
    }

    #[test]
    fn computes_euclidean_distance() {
        assert_eq!(
            distance(Coord { x: 0.0, y: 0.0 }, Coord { x: 3.0, y: 4.0 }),
            5.0
        );
        assert_eq!(
            distance(Coord { x: 1.0, y: 1.0 }, Coord { x: 1.0, y: 1.0 }),
            0.0
        );
    }
}
