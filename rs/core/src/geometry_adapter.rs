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
/// JTS caches this on the `LinearRing`, so `scan_ring` and
/// `ScanLineYOrdinateFinder` both read it for free. A `geo_types` ring cannot
/// carry that cache, so this recomputes on every call and the sharing happens in
/// the caller instead: `InteriorPointPolygon` computes the shell's envelope once
/// and passes it to both readers.
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

/// Widens `a` to cover `b`, treating `None` as the empty envelope.
///
/// A private helper of [`envelope_internal_geometry`], not a substitute for any
/// JTS member the port reaches: JTS builds a geometry's envelope inside each
/// subclass's `computeEnvelopeInternal`, and the `Geometry.getEnvelopeInternal()`
/// tag below records that substitution whole.
///
/// `#[cfg(test)]` for the same reason as `envelope_internal_geometry` below: its
/// only caller is that function.
#[cfg(test)]
fn union(a: Option<Rect<f64>>, b: Option<Rect<f64>>) -> Option<Rect<f64>> {
    match (a, b) {
        (None, other) | (other, None) => other,
        (Some(a), Some(b)) => Some(Rect::new(
            Coord {
                x: a.min().x.min(b.min().x),
                y: a.min().y.min(b.min().y),
            },
            Coord {
                x: a.max().x.max(b.max().x),
                y: a.max().y.max(b.max().y),
            },
        )),
    }
}

/// A whole geometry's envelope.
///
/// [`envelope_internal`] above takes a ring; this takes a geometry. JTS has one
/// `Geometry.getEnvelopeInternal()` that `LinearRing` inherits, so this is not a
/// Java overload and the overload-suffix rule does not apply — the split into two functions
/// exists because neither target model has a supertype spanning rings and
/// geometries. The two are told apart by their tags.
///
/// A polygon's envelope is its shell's: holes lie inside the shell and cannot
/// widen it, which is what JTS's `Polygon.computeEnvelopeInternal` relies on.
///
/// Returns `None` for an empty geometry, the "intersects nothing" contract
/// [`envelope_internal`] already uses.
///
/// @jts-adapter Geometry.getEnvelopeInternal()
// `SimplePointInAreaLocator::locate` is this function's only non-test
// caller, and it lives in a `#[cfg(test)] mod` — that is what keeps the whole
// point-in-polygon stack out of the published API, per the note on
// `rs/core/src/lib.rs`'s gated module group. That makes this function itself
// unreachable outside test builds too, so it carries the same `#[cfg(test)]`
// rather than an `#[allow(dead_code)]` CLAUDE.md bans.
#[cfg(test)]
pub(crate) fn envelope_internal_geometry(geometry: &Geometry<f64>) -> Option<Rect<f64>> {
    match geometry {
        Geometry::Point(p) => envelope_internal(&[p.0]),
        Geometry::MultiPoint(mp) => {
            envelope_internal(&mp.0.iter().map(|p| p.0).collect::<Vec<Coord<f64>>>())
        }
        Geometry::Line(l) => envelope_internal(&[l.start, l.end]),
        Geometry::LineString(ls) => envelope_internal(&ls.0),
        Geometry::MultiLineString(mls) => mls
            .0
            .iter()
            .fold(None, |acc, ls| union(acc, envelope_internal(&ls.0))),
        Geometry::Polygon(p) => envelope_internal(&p.exterior().0),
        Geometry::MultiPolygon(mp) => mp.0.iter().fold(None, |acc, p| {
            union(acc, envelope_internal(&p.exterior().0))
        }),
        Geometry::Rect(r) => Some(*r),
        Geometry::Triangle(t) => envelope_internal(&t.to_array()),
        Geometry::GeometryCollection(gc) => {
            gc.0.iter()
                .fold(None, |acc, g| union(acc, envelope_internal_geometry(g)))
        }
    }
}

/// Tests whether an envelope contains a point, boundary included.
///
/// JTS spells this `!(x > maxx || x < minx || y > maxy || y < miny)`; the
/// positive form below is the same predicate. `None` is the empty envelope and
/// intersects nothing.
///
/// @jts-adapter Envelope.intersects(Coordinate)
// Same reasoning as `envelope_internal_geometry` above: its only callers are
// `locate` and `locate_point_in_ring` in `simple_point_in_area_locator`, and
// that module is itself `#[cfg(test)]` — so this function is unreachable
// outside test builds too, and carries the same gate rather than the
// `#[allow(dead_code)]` CLAUDE.md bans.
#[cfg(test)]
pub(crate) fn envelope_intersects_coordinate(env: Option<Rect<f64>>, p: Coord<f64>) -> bool {
    match env {
        None => false,
        Some(r) => p.x >= r.min().x && p.x <= r.max().x && p.y >= r.min().y && p.y <= r.max().y,
    }
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
    use super::{
        dimension, distance, envelope_internal, envelope_internal_geometry,
        envelope_intersects_coordinate, is_geometry_empty,
    };
    use geo_types::{
        Coord, Geometry, GeometryCollection, LineString, MultiPoint, MultiPolygon, Point, Polygon,
        Rect,
    };

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

    #[test]
    fn tests_a_point_against_an_envelope() {
        let env = envelope_internal(&[Coord { x: 0.0, y: 0.0 }, Coord { x: 10.0, y: 4.0 }]);
        assert!(envelope_intersects_coordinate(
            env,
            Coord { x: 5.0, y: 2.0 }
        ));
        // The boundary counts as intersecting, as it does in JTS.
        assert!(envelope_intersects_coordinate(
            env,
            Coord { x: 0.0, y: 0.0 }
        ));
        assert!(envelope_intersects_coordinate(
            env,
            Coord { x: 10.0, y: 4.0 }
        ));
        assert!(!envelope_intersects_coordinate(
            env,
            Coord { x: -1.0, y: 2.0 }
        ));
        assert!(!envelope_intersects_coordinate(
            env,
            Coord { x: 11.0, y: 2.0 }
        ));
        assert!(!envelope_intersects_coordinate(
            env,
            Coord { x: 5.0, y: -1.0 }
        ));
        assert!(!envelope_intersects_coordinate(
            env,
            Coord { x: 5.0, y: 5.0 }
        ));
        // None is the empty envelope, which intersects nothing.
        assert!(!envelope_intersects_coordinate(
            None,
            Coord { x: 0.0, y: 0.0 }
        ));
    }

    #[test]
    fn takes_a_whole_geometrys_envelope() {
        // A polygon's envelope comes from its shell: the hole is inside it.
        let poly = Polygon::new(
            LineString::from(vec![
                (0.0, 0.0),
                (10.0, 0.0),
                (10.0, 10.0),
                (0.0, 10.0),
                (0.0, 0.0),
            ]),
            vec![LineString::from(vec![
                (2.0, 2.0),
                (3.0, 2.0),
                (3.0, 3.0),
                (2.0, 2.0),
            ])],
        );
        assert_eq!(
            envelope_internal_geometry(&Geometry::Polygon(poly.clone())),
            Some(Rect::new(
                Coord { x: 0.0, y: 0.0 },
                Coord { x: 10.0, y: 10.0 }
            ))
        );

        let far = Polygon::new(
            LineString::from(vec![(5.0, 5.0), (7.0, 5.0), (7.0, 8.0), (5.0, 5.0)]),
            vec![],
        );
        assert_eq!(
            envelope_internal_geometry(&Geometry::MultiPolygon(MultiPolygon(vec![poly, far]))),
            Some(Rect::new(
                Coord { x: 0.0, y: 0.0 },
                Coord { x: 10.0, y: 10.0 }
            ))
        );

        let gc = GeometryCollection(vec![
            Geometry::Point(Point::new(-3.0, 1.0)),
            Geometry::LineString(LineString::from(vec![(0.0, 0.0), (4.0, 9.0)])),
        ]);
        assert_eq!(
            envelope_internal_geometry(&Geometry::GeometryCollection(gc)),
            Some(Rect::new(
                Coord { x: -3.0, y: 0.0 },
                Coord { x: 4.0, y: 9.0 }
            ))
        );

        assert_eq!(
            envelope_internal_geometry(&Geometry::MultiPoint(MultiPoint(vec![]))),
            None
        );
    }
}
