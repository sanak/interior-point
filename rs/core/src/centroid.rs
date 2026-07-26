//! Computes the centroid of a Geometry of any dimension.
//! For collections the centroid is computed for the collection of
//! non-empty elements of highest dimension.
//! The centroid of an empty geometry is `None`.
//!
//! - **Dimension 2** - the centroid is computed as the weighted sum of the
//!   centroids of a decomposition of the area into (possibly overlapping)
//!   triangles. Holes and multipolygons are handled correctly.
//! - **Dimension 1** - Computes the average of the midpoints of all line
//!   segments weighted by the segment length. Zero-length lines are treated as
//!   points.
//! - **Dimension 0** - Compute the average coordinate over all points. Repeated
//!   points are all included in the average.
//!
//! @jts Centroid

use geo_types::{Coord, Geometry, Polygon};

use crate::geometry_adapter::{distance, is_geometry_empty};
use crate::orientation::is_ccw_coordinates;

pub(crate) struct Centroid {
    /// the point all triangles are based at
    area_base_pt: Option<Coord<f64>>,
    /// temporary variable to hold centroid of triangle
    triangle_cent3: Coord<f64>,
    /// Partial area sum
    areasum2: f64,
    /// partial centroid sum
    cg3: Coord<f64>,

    // data for linear centroid computation, if needed
    line_cent_sum: Coord<f64>,
    total_length: f64,

    pt_count: i32,
    pt_cent_sum: Coord<f64>,
}

impl Centroid {
    /// Creates a new instance for computing the centroid of a geometry
    ///
    /// @jts Centroid#Centroid(Geometry)
    pub(crate) fn new(geom: &Geometry<f64>) -> Centroid {
        let mut c = Centroid {
            area_base_pt: None,
            triangle_cent3: Coord { x: 0.0, y: 0.0 },
            areasum2: 0.0,
            cg3: Coord { x: 0.0, y: 0.0 },
            line_cent_sum: Coord { x: 0.0, y: 0.0 },
            total_length: 0.0,
            pt_count: 0,
            pt_cent_sum: Coord { x: 0.0, y: 0.0 },
        };
        c.add_geometry(geom);
        c
    }

    /// Adds a Geometry to the centroid total.
    ///
    /// @jts Centroid#add(Geometry)
    fn add_geometry(&mut self, geom: &Geometry<f64>) {
        if is_geometry_empty(geom) {
            return;
        }
        match geom {
            Geometry::Point(p) => self.add_point(p.0),
            Geometry::LineString(ls) => self.add_line_segments(&ls.0),
            Geometry::Polygon(poly) => self.add_polygon(poly),
            // JTS's MultiPoint, MultiLineString and MultiPolygon are all
            // GeometryCollections, so they fall through to the collection
            // branch there. geo-types' are not, so they are expanded here.
            Geometry::MultiPoint(mp) => {
                for p in &mp.0 {
                    self.add_point(p.0);
                }
            }
            Geometry::MultiLineString(mls) => {
                for ls in &mls.0 {
                    self.add_line_segments(&ls.0);
                }
            }
            Geometry::MultiPolygon(mp) => {
                for poly in &mp.0 {
                    self.add_polygon(poly);
                }
            }
            Geometry::GeometryCollection(gc) => {
                for g in &gc.0 {
                    self.add_geometry(g);
                }
            }
            _ => {}
        }
    }

    /// Gets the computed centroid.
    ///
    /// Returns the computed centroid, or `None` if the input is empty.
    ///
    /// @jts Centroid#getCentroid()
    pub(crate) fn get_centroid(&self) -> Option<Coord<f64>> {
        // The centroid is computed from the highest dimension components
        // present in the input. I.e. areas dominate lineal geometry, which
        // dominates points. Degenerate geometry are computed using their
        // effective dimension (e.g. areas may degenerate to lines or points).
        let mut cent = Coord { x: 0.0, y: 0.0 };
        if self.areasum2.abs() > 0.0 {
            // Input contains areal geometry
            cent.x = self.cg3.x / 3.0 / self.areasum2;
            cent.y = self.cg3.y / 3.0 / self.areasum2;
        } else if self.total_length > 0.0 {
            // Input contains lineal geometry
            cent.x = self.line_cent_sum.x / self.total_length;
            cent.y = self.line_cent_sum.y / self.total_length;
        } else if self.pt_count > 0 {
            // Input contains puntal geometry only
            cent.x = self.pt_cent_sum.x / f64::from(self.pt_count);
            cent.y = self.pt_cent_sum.y / f64::from(self.pt_count);
        } else {
            return None;
        }
        Some(cent)
    }

    /// @jts Centroid#setAreaBasePoint(Coordinate)
    fn set_area_base_point(&mut self, base_pt: Coord<f64>) {
        self.area_base_pt = Some(base_pt);
    }

    /// @jts Centroid#add(Polygon)
    fn add_polygon(&mut self, poly: &Polygon<f64>) {
        self.add_shell(&poly.exterior().0);
        for hole in poly.interiors() {
            self.add_hole(&hole.0);
        }
    }

    /// @jts Centroid#addShell(Coordinate[])
    fn add_shell(&mut self, pts: &[Coord<f64>]) {
        if !pts.is_empty() {
            self.set_area_base_point(pts[0]);
        }
        let is_positive_area = !is_ccw_coordinates(pts);
        let base = self.area_base_pt.unwrap_or(Coord { x: 0.0, y: 0.0 });
        for i in 0..pts.len().saturating_sub(1) {
            self.add_triangle(base, pts[i], pts[i + 1], is_positive_area);
        }
        self.add_line_segments(pts);
    }

    /// @jts Centroid#addHole(Coordinate[])
    fn add_hole(&mut self, pts: &[Coord<f64>]) {
        let is_positive_area = is_ccw_coordinates(pts);
        let base = self.area_base_pt.unwrap_or(Coord { x: 0.0, y: 0.0 });
        for i in 0..pts.len().saturating_sub(1) {
            self.add_triangle(base, pts[i], pts[i + 1], is_positive_area);
        }
        self.add_line_segments(pts);
    }

    /// @jts Centroid#addTriangle(Coordinate,Coordinate,Coordinate,boolean)
    fn add_triangle(
        &mut self,
        p0: Coord<f64>,
        p1: Coord<f64>,
        p2: Coord<f64>,
        is_positive_area: bool,
    ) {
        let sign = if is_positive_area { 1.0 } else { -1.0 };
        Centroid::centroid3(p0, p1, p2, &mut self.triangle_cent3);
        let area2 = Centroid::area2(p0, p1, p2);
        self.cg3.x += sign * area2 * self.triangle_cent3.x;
        self.cg3.y += sign * area2 * self.triangle_cent3.y;
        self.areasum2 += sign * area2;
    }

    /// Computes three times the centroid of the triangle p1-p2-p3.
    /// The factor of 3 is left in to permit division to be avoided until later.
    ///
    /// @jts Centroid#centroid3(Coordinate,Coordinate,Coordinate,Coordinate)
    fn centroid3(p1: Coord<f64>, p2: Coord<f64>, p3: Coord<f64>, c: &mut Coord<f64>) {
        c.x = p1.x + p2.x + p3.x;
        c.y = p1.y + p2.y + p3.y;
    }

    /// Returns twice the signed area of the triangle p1-p2-p3.
    /// The area is positive if the triangle is oriented CCW, and negative if CW.
    ///
    /// @jts Centroid#area2(Coordinate,Coordinate,Coordinate)
    fn area2(p1: Coord<f64>, p2: Coord<f64>, p3: Coord<f64>) -> f64 {
        (p2.x - p1.x) * (p3.y - p1.y) - (p3.x - p1.x) * (p2.y - p1.y)
    }

    /// Adds the line segments defined by an array of coordinates
    /// to the linear centroid accumulators.
    ///
    /// @jts Centroid#addLineSegments(Coordinate[])
    fn add_line_segments(&mut self, pts: &[Coord<f64>]) {
        let mut line_len = 0.0;
        for i in 0..pts.len().saturating_sub(1) {
            let segment_len = distance(pts[i], pts[i + 1]);
            if segment_len == 0.0 {
                continue;
            }

            line_len += segment_len;

            let midx = (pts[i].x + pts[i + 1].x) / 2.0;
            self.line_cent_sum.x += segment_len * midx;
            let midy = (pts[i].y + pts[i + 1].y) / 2.0;
            self.line_cent_sum.y += segment_len * midy;
        }
        self.total_length += line_len;
        if line_len == 0.0 && !pts.is_empty() {
            self.add_point(pts[0]);
        }
    }

    /// Adds a point to the point centroid accumulator.
    ///
    /// @jts Centroid#addPoint(Coordinate)
    fn add_point(&mut self, pt: Coord<f64>) {
        self.pt_count += 1;
        self.pt_cent_sum.x += pt.x;
        self.pt_cent_sum.y += pt.y;
    }
}

/// Computes the centroid point of a geometry.
///
/// Returns the centroid point, or `None` if the geometry is empty.
///
/// @jts Centroid#getCentroid(Geometry)
pub(crate) fn get_centroid(geom: &Geometry<f64>) -> Option<Coord<f64>> {
    let cent = Centroid::new(geom);
    cent.get_centroid()
}

/// @jts-deviate CentroidTest — `Centroid` is crate-internal, so `rs/core/tests/`
///   (an external crate) cannot reach it. The `TestCentroid.xml`-driven test
///   lives here instead, departing from the one-JTS-test-file-to-one-port-test-file
///   mapping, per the internal-type test-placement rule.
#[cfg(test)]
mod tests {
    use super::get_centroid;
    use geo_types::{
        Coord, Geometry, LineString, MultiLineString, MultiPoint, MultiPolygon, Polygon,
    };

    // The parser lives in the integration-test crate, which a `#[cfg(test)]`
    // module inside `src/` cannot `use`. `#[path] mod` cannot reach it either:
    // its base directory would be `core/src/centroid/`, and `..` traversal
    // through a directory that does not exist fails. `include!` resolves
    // against this file's own directory, `core/src/`, so it works.
    mod xml_test_parser {
        include!("../tests/utils/xml_test_parser.rs");
    }
    use xml_test_parser::parse_xml_test_cases;

    const FIXTURE: &str = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../upstream/jts/resources/testxml/general/TestCentroid.xml"
    );

    #[test]
    fn matches_jts_on_every_upstream_case() {
        let cases = parse_xml_test_cases(FIXTURE, "getCentroid");
        assert_eq!(cases.len(), 38, "TestCentroid.xml should yield 38 cases");
        for case in &cases {
            let actual = case.input.as_ref().and_then(get_centroid);
            // Exact comparison, per the exact-comparison rule.
            assert_eq!(actual, case.expected, "case: {}", case.desc);
        }
    }

    #[test]
    fn treats_zero_length_lines_as_points() {
        // Zero-length-line centroid defect: JTS 1.19.0 gives (6.666…, 6.666…) here; the
        // pre-retrofit inline centroid gave (0, 0).
        let mls = MultiLineString(vec![
            LineString::from(vec![(0.0, 0.0), (0.0, 0.0)]),
            LineString::from(vec![(10.0, 10.0), (10.0, 10.0)]),
            LineString::from(vec![(10.0, 10.0), (10.0, 10.0)]),
        ]);
        let c = get_centroid(&Geometry::MultiLineString(mls)).unwrap();
        assert!((c.x - 6.666_666_666_666_667).abs() < 1e-12);
        assert!((c.y - 6.666_666_666_666_667).abs() < 1e-12);
    }

    #[test]
    fn returns_none_for_an_empty_geometry() {
        assert_eq!(
            get_centroid(&Geometry::MultiPoint(MultiPoint(vec![]))),
            None
        );
    }

    /// @jts-adapter CentroidTest#TOLERANCE
    const TOLERANCE: f64 = 1e-10;

    /// The area of a ring, transcribed from JTS `Area.ofRing(Coordinate[])` —
    /// which is what `Geometry.getArea()` calls. Test-local: no ported source
    /// module needs `Geometry.getArea()`, so it does not belong in the adapter.
    ///
    /// The translation by `x0` is load-bearing, not a micro-optimisation. This
    /// test's rings are slivers whose coordinates differ only around the 12th
    /// decimal place, so the textbook shoelace form
    /// `x[i] * y[i + 1] - x[i + 1] * y[i]` loses every significant digit to
    /// cancellation: it returns exactly 0 for two of the three rings here and
    /// overstates the third by eleven orders of magnitude.
    ///
    /// @jts-adapter Geometry.getArea()
    fn ring_area(ring: &[Coord<f64>]) -> f64 {
        if ring.len() < 3 {
            return 0.0;
        }
        let mut sum = 0.0;
        let x0 = ring[0].x;
        for i in 1..ring.len() - 1 {
            let x = ring[i].x - x0;
            let y1 = ring[i + 1].y;
            let y2 = ring[i - 1].y;
            sum += x * (y2 - y1);
        }
        (sum / 2.0).abs()
    }

    /// @jts CentroidTest#areaWeightedCentroid(Geometry)
    fn area_weighted_centroid(polys: &[Polygon<f64>]) -> Coord<f64> {
        let total_area: f64 = polys.iter().map(|p| ring_area(&p.exterior().0)).sum();
        let mut cx = 0.0;
        let mut cy = 0.0;
        for poly in polys {
            let area_fraction = ring_area(&poly.exterior().0) / total_area;
            let component_centroid = get_centroid(&Geometry::Polygon(poly.clone())).unwrap();
            cx += area_fraction * component_centroid.x;
            cy += area_fraction * component_centroid.y;
        }
        Coord { x: cx, y: cy }
    }

    /// @jts CentroidTest#testCentroidMultiPolygon()
    #[test]
    fn computes_a_multipolygon_centroid_as_the_area_weighted_average() {
        // Verify that the computed centroid of a MultiPolygon is equivalent to
        // the area-weighted average of its components.
        let polys = vec![
            Polygon::new(
                LineString::from(vec![
                    (-92.661322, 36.589_949_000_000_03),
                    (-92.661_321_999_999_93, 36.589_949_000_000_05),
                    (-92.661_321_999_999_93, 36.589_949_000_000_004),
                    (-92.661322, 36.589949),
                    (-92.661322, 36.589_949_000_000_03),
                ]),
                vec![],
            ),
            Polygon::new(
                LineString::from(vec![
                    (-92.655_605_000_000_08, 36.587_088_000_000_05),
                    (-92.655_604_999_999_92, 36.587_088_000_000_05),
                    (-92.655_604_999_987_45, 36.587_087_999_992_576),
                    (-92.655605, 36.587088),
                    (-92.655_605_000_000_08, 36.587_088_000_000_05),
                ]),
                vec![],
            ),
            Polygon::new(
                LineString::from(vec![
                    (-92.655_124_500_000_65, 36.586_800_000_000_466),
                    (-92.655_124_499_999_94, 36.586_800_000_000_04),
                    (-92.655_124_499_986_66, 36.586_799_999_990_5),
                    (-92.655_124_500_000_65, 36.586_800_000_000_466),
                ]),
                vec![],
            ),
        ];
        let expected = area_weighted_centroid(&polys);
        let actual = get_centroid(&Geometry::MultiPolygon(MultiPolygon(polys.clone()))).unwrap();
        assert!((actual.x - expected.x).abs() < TOLERANCE);
        assert!((actual.y - expected.y).abs() < TOLERANCE);
    }
}
