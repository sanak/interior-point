//! Computes a point in the interior of an areal geometry.
//! The point will lie in the geometry interior in all except degenerate cases.
//!
//! # Algorithm
//!
//! For each constituent polygon:
//!
//! - Determine a horizontal scan line on which the interior point will be located.
//! - Compute the sections of the scan line which lie in the interior of the polygon.
//! - Choose the widest interior section and take its midpoint as the interior point.
//!
//! The best interior point is the one with the widest scan line section.
//!
//! @jts InteriorPointArea

use geo_types::{Coord, Geometry, Polygon, Rect};

use crate::geometry_adapter::{envelope_internal, is_geometry_empty};

pub(crate) struct InteriorPointArea {
    interior_point: Option<Coord<f64>>,
    max_width: f64,
}

impl InteriorPointArea {
    /// Creates a new interior point finder for an areal geometry.
    ///
    /// @jts InteriorPointArea#InteriorPointArea(Geometry)
    pub(crate) fn new(g: &Geometry<f64>) -> Self {
        let mut int_pt = Self {
            interior_point: None,
            max_width: -1.0,
        };
        int_pt.process(g);
        int_pt
    }

    /// Gets the computed interior point.
    ///
    /// Returns the coordinate of an interior point, or `None` if the input
    /// geometry is empty.
    ///
    /// @jts InteriorPointArea#getInteriorPoint()
    pub(crate) fn get_interior_point(&self) -> Option<Coord<f64>> {
        self.interior_point
    }

    /// Processes a geometry to determine the best interior point for all
    /// component polygons.
    ///
    /// @jts InteriorPointArea#process(Geometry)
    fn process(&mut self, geom: &Geometry<f64>) {
        if is_geometry_empty(geom) {
            return;
        }
        match geom {
            Geometry::Polygon(p) => self.process_polygon(p),
            // JTS's MultiPolygon is a GeometryCollection and falls through to
            // the collection branch there; geo-types' is not, so it is
            // expanded here.
            Geometry::MultiPolygon(mp) => {
                for p in &mp.0 {
                    self.process_polygon(p);
                }
            }
            Geometry::GeometryCollection(gc) => {
                for g in &gc.0 {
                    self.process(g);
                }
            }
            _ => {}
        }
    }

    /// Computes an interior point of a component Polygon and updates the
    /// current best interior point if appropriate.
    ///
    /// @jts InteriorPointArea#processPolygon(Polygon)
    fn process_polygon(&mut self, polygon: &Polygon<f64>) {
        let mut int_pt_poly = InteriorPointPolygon::new(polygon);
        int_pt_poly.process();
        let width = int_pt_poly.get_width();
        if width > self.max_width {
            self.max_width = width;
            self.interior_point = int_pt_poly.get_interior_point();
        }
    }
}

/// @jts InteriorPointArea#avg(double,double)
fn avg(a: f64, b: f64) -> f64 {
    (a + b) / 2.0
}

/// Computes an interior point for the polygonal components of a Geometry.
///
/// Returns the computed interior point, or `None` if the geometry has no
/// polygonal components.
///
/// @jts InteriorPointArea#getInteriorPoint(Geometry)
/// @jts-deviate module-level name — `get_interior_point` would collide with the
///   same static factory in the other three modules.
pub(crate) fn interior_point_area(geom: &Geometry<f64>) -> Option<Coord<f64>> {
    let int_pt = InteriorPointArea::new(geom);
    int_pt.get_interior_point()
}

/// Computes an interior point in a single [`Polygon`], as well as the width of
/// the scan-line section it occurs in to allow choosing the widest section
/// occurrence.
///
/// @jts InteriorPointArea.InteriorPointPolygon
pub(crate) struct InteriorPointPolygon<'a> {
    polygon: &'a Polygon<f64>,
    interior_point_y: f64,
    interior_section_width: f64,
    interior_point: Option<Coord<f64>>,
}

impl<'a> InteriorPointPolygon<'a> {
    /// Creates a new InteriorPointPolygon instance.
    ///
    /// @jts InteriorPointArea.InteriorPointPolygon#InteriorPointPolygon(Polygon)
    pub(crate) fn new(polygon: &'a Polygon<f64>) -> Self {
        Self {
            polygon,
            interior_point_y: get_scan_line_y(polygon),
            interior_section_width: 0.0,
            interior_point: None,
        }
    }

    /// Gets the computed interior point.
    ///
    /// Returns the interior point coordinate, or `None` if the input geometry
    /// is empty.
    ///
    /// @jts InteriorPointArea.InteriorPointPolygon#getInteriorPoint()
    pub(crate) fn get_interior_point(&self) -> Option<Coord<f64>> {
        self.interior_point
    }

    /// Gets the width of the scanline section containing the interior point.
    /// Used to determine the best point to use.
    ///
    /// @jts InteriorPointArea.InteriorPointPolygon#getWidth()
    pub(crate) fn get_width(&self) -> f64 {
        self.interior_section_width
    }

    /// Compute the interior point.
    ///
    /// @jts InteriorPointArea.InteriorPointPolygon#process()
    pub(crate) fn process(&mut self) {
        // This results in returning a null Coordinate
        let Some(&first) = self.polygon.exterior().0.first() else {
            return;
        };

        // set default interior point in case polygon has zero area
        self.interior_point = Some(first);

        let mut crossings: Vec<f64> = Vec::new();
        self.scan_ring(&self.polygon.exterior().0, &mut crossings);
        for ring in self.polygon.interiors() {
            self.scan_ring(&ring.0, &mut crossings);
        }
        self.find_best_midpoint(&mut crossings);
    }

    /// @jts InteriorPointArea.InteriorPointPolygon#scanRing(LinearRing,List<Double>)
    fn scan_ring(&self, ring: &[Coord<f64>], crossings: &mut Vec<f64>) {
        // skip rings which don't cross scan line
        let Some(env) = envelope_internal(ring) else {
            // An empty ring has no envelope; JTS's empty Envelope intersects
            // nothing, so this takes the same path as "does not intersect".
            return;
        };
        if !Self::intersects_horizontal_line_envelope(&env, self.interior_point_y) {
            return;
        }

        for i in 1..ring.len() {
            let pt_prev = ring[i - 1];
            let pt = ring[i];
            Self::add_edge_crossing(pt_prev, pt, self.interior_point_y, crossings);
        }
    }

    /// @jts InteriorPointArea.InteriorPointPolygon#addEdgeCrossing(Coordinate,Coordinate,double,List<Double>)
    fn add_edge_crossing(p0: Coord<f64>, p1: Coord<f64>, scan_y: f64, crossings: &mut Vec<f64>) {
        // skip non-crossing segments
        if !Self::intersects_horizontal_line_coordinate(p0, p1, scan_y) {
            return;
        }
        if !Self::is_edge_crossing_counted(p0, p1, scan_y) {
            return;
        }

        // edge intersects scan line, so add a crossing
        let x_int = Self::intersection(p0, p1, scan_y);
        crossings.push(x_int);
    }

    /// Finds the midpoint of the widest interior section. Sets the
    /// `interior_point` location and the `interior_section_width`.
    ///
    /// @jts InteriorPointArea.InteriorPointPolygon#findBestMidpoint(List<Double>)
    fn find_best_midpoint(&mut self, crossings: &mut [f64]) {
        // zero-area polygons will have no crossings
        if crossings.is_empty() {
            return;
        }

        // JTS: `Assert.isTrue(0 == crossings.size() % 2, ...)`. Spelled with
        // `is_multiple_of` because `clippy::manual_is_multiple_of` rejects the
        // remainder form; the TypeScript port keeps Java's `% 2` literally.
        assert!(
            crossings.len().is_multiple_of(2),
            "Interior Point robustness failure: odd number of scanline crossings"
        );

        crossings.sort_by(|a, b| a.partial_cmp(b).unwrap());
        // Entries in crossings list are expected to occur in pairs representing
        // a section of the scan line interior to the polygon (which may be
        // zero-length)
        for pair in crossings.chunks_exact(2) {
            let x1 = pair[0];
            // crossings count must be even so this should be safe
            let x2 = pair[1];

            let width = x2 - x1;
            if width > self.interior_section_width {
                self.interior_section_width = width;
                let interior_point_x = avg(x1, x2);
                self.interior_point = Some(Coord {
                    x: interior_point_x,
                    y: self.interior_point_y,
                });
            }
        }
    }

    /// Tests if an edge intersection contributes to the crossing count. Some
    /// crossing situations are not counted, to ensure that the list of
    /// crossings captures strict inside/outside topology.
    ///
    /// @jts InteriorPointArea.InteriorPointPolygon#isEdgeCrossingCounted(Coordinate,Coordinate,double)
    fn is_edge_crossing_counted(p0: Coord<f64>, p1: Coord<f64>, scan_y: f64) -> bool {
        let y0 = p0.y;
        let y1 = p1.y;
        // skip horizontal lines
        if y0 == y1 {
            return false;
        }
        // handle cases where vertices lie on scan-line
        // downward segment does not include start point
        if y0 == scan_y && y1 < scan_y {
            return false;
        }
        // upward segment does not include endpoint
        if y1 == scan_y && y0 < scan_y {
            return false;
        }
        true
    }

    /// Computes the intersection of a segment with a horizontal line. The
    /// segment is expected to cross the horizontal line — this condition is not
    /// checked. Computation uses regular double-precision arithmetic.
    ///
    /// @jts InteriorPointArea.InteriorPointPolygon#intersection(Coordinate,Coordinate,double)
    fn intersection(p0: Coord<f64>, p1: Coord<f64>, y: f64) -> f64 {
        let x0 = p0.x;
        let x1 = p1.x;

        if x0 == x1 {
            return x0;
        }

        // Assert: seg_dx is non-zero, due to previous equality test
        let seg_dx = x1 - x0;
        let seg_dy = p1.y - p0.y;
        let m = seg_dy / seg_dx;
        x0 + (y - p0.y) / m
    }

    /// Tests if an envelope intersects a horizontal line.
    ///
    /// @jts InteriorPointArea.InteriorPointPolygon#intersectsHorizontalLine(Envelope,double)
    fn intersects_horizontal_line_envelope(env: &Rect<f64>, y: f64) -> bool {
        if y < env.min().y {
            return false;
        }
        if y > env.max().y {
            return false;
        }
        true
    }

    /// Tests if a line segment intersects a horizontal line.
    ///
    /// @jts InteriorPointArea.InteriorPointPolygon#intersectsHorizontalLine(Coordinate,Coordinate,double)
    fn intersects_horizontal_line_coordinate(p0: Coord<f64>, p1: Coord<f64>, y: f64) -> bool {
        // both ends above?
        if p0.y > y && p1.y > y {
            return false;
        }
        // both ends below?
        if p0.y < y && p1.y < y {
            return false;
        }
        // segment must intersect line
        true
    }
}

/// Finds a safe scan line Y ordinate by projecting the polygon segments to the
/// Y axis and finding the Y-axis interval which contains the centre of the Y
/// extent. The centre of this interval is returned as the scan line Y-ordinate.
///
/// Note that in the case of (degenerate, invalid) zero-area polygons the
/// computed Y value may be equal to a vertex Y-ordinate.
///
/// @jts InteriorPointArea.ScanLineYOrdinateFinder
pub(crate) struct ScanLineYOrdinateFinder<'a> {
    poly: &'a Polygon<f64>,
    centre_y: f64,
    hi_y: f64,
    lo_y: f64,
}

impl<'a> ScanLineYOrdinateFinder<'a> {
    /// @jts InteriorPointArea.ScanLineYOrdinateFinder#ScanLineYOrdinateFinder(Polygon)
    pub(crate) fn new(poly: &'a Polygon<f64>) -> Self {
        // initialize using extremal values
        // JTS reads `poly.getEnvelopeInternal()`, which for a Polygon is the
        // shell's envelope.
        let (lo_y, hi_y) = match envelope_internal(&poly.exterior().0) {
            Some(env) => (env.min().y, env.max().y),
            None => (-f64::MAX, f64::MAX),
        };
        Self {
            poly,
            centre_y: avg(lo_y, hi_y),
            hi_y,
            lo_y,
        }
    }

    /// @jts InteriorPointArea.ScanLineYOrdinateFinder#getScanLineY()
    pub(crate) fn get_scan_line_y(&mut self) -> f64 {
        // `poly` is a `&'a Polygon` whose lifetime outlives `self`, so copying
        // the reference out frees it from `self`'s borrow. Reading it through
        // `self` while `process` holds `&mut self` would not compile, and
        // cloning the rings to dodge that would allocate the whole ring.
        let poly = self.poly;
        self.process(&poly.exterior().0);
        for ring in poly.interiors() {
            self.process(&ring.0);
        }
        avg(self.hi_y, self.lo_y)
    }

    /// @jts InteriorPointArea.ScanLineYOrdinateFinder#process(LineString)
    fn process(&mut self, line: &[Coord<f64>]) {
        for pt in line {
            let y = pt.y;
            self.update_interval(y);
        }
    }

    /// @jts InteriorPointArea.ScanLineYOrdinateFinder#updateInterval(double)
    fn update_interval(&mut self, y: f64) {
        if y <= self.centre_y {
            if y > self.lo_y {
                self.lo_y = y;
            }
        } else if y > self.centre_y && y < self.hi_y {
            self.hi_y = y;
        }
    }
}

/// @jts InteriorPointArea.ScanLineYOrdinateFinder#getScanLineY(Polygon)
/// @jts-deviate module-level function — the factory/getter rule maps a static factory to a
///   module level and the instance getter to a method; in Rust an associated
///   function and a method of the same name would collide, so both languages
///   place it here for symmetry.
fn get_scan_line_y(poly: &Polygon<f64>) -> f64 {
    let mut finder = ScanLineYOrdinateFinder::new(poly);
    finder.get_scan_line_y()
}

/// @jts-deviate The even-crossing assertion has no end-to-end input on this side:
///   `geo_types::Polygon::new` closes every ring, so an odd crossing count is
///   unreachable through `interior_point`. `InteriorPointPolygon` is
///   crate-internal, so `rs/core/tests/` cannot reach it either. The direct
///   unit test therefore lives here, the same arrangement `centroid.rs` uses.
#[cfg(test)]
mod tests {
    use super::{InteriorPointPolygon, avg};
    use geo_types::{LineString, Polygon};

    fn unit_square() -> Polygon<f64> {
        Polygon::new(
            LineString::from(vec![
                (0.0, 0.0),
                (10.0, 0.0),
                (10.0, 10.0),
                (0.0, 10.0),
                (0.0, 0.0),
            ]),
            vec![],
        )
    }

    #[test]
    #[should_panic(
        expected = "Interior Point robustness failure: odd number of scanline crossings"
    )]
    fn rejects_an_odd_number_of_crossings() {
        let poly = unit_square();
        let mut int_pt = InteriorPointPolygon::new(&poly);
        int_pt.find_best_midpoint(&mut [1.0, 2.0, 3.0]);
    }

    #[test]
    fn accepts_an_even_number_of_crossings() {
        let poly = unit_square();
        let mut int_pt = InteriorPointPolygon::new(&poly);
        int_pt.find_best_midpoint(&mut [1.0, 2.0, 10.0, 30.0]);
        // The widest section is 10..30, so the midpoint is x = 20.
        assert_eq!(int_pt.get_width(), 20.0);
        assert_eq!(int_pt.get_interior_point().map(|c| c.x), Some(20.0));
    }

    #[test]
    fn treats_an_empty_crossing_list_as_a_zero_area_polygon() {
        // JTS returns before the assertion when there are no crossings, so a
        // zero-area polygon keeps the default interior point rather than
        // failing.
        let poly = unit_square();
        let mut int_pt = InteriorPointPolygon::new(&poly);
        int_pt.find_best_midpoint(&mut []);
        assert_eq!(int_pt.get_width(), 0.0);
    }

    #[test]
    fn averages_two_ordinates() {
        assert_eq!(avg(1.0, 3.0), 2.0);
        assert_eq!(avg(-4.0, 4.0), 0.0);
    }
}
