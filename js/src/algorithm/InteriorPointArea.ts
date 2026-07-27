import type { Geometry, Polygon } from "geojson";

import { assertTrue } from "../Assert";
import type { Coordinate, Envelope } from "../GeometryAdapter";
import { envelopeInternal, isGeometryEmpty } from "../GeometryAdapter";

/**
 * Computes a point in the interior of an areal geometry.
 * The point will lie in the geometry interior in all except degenerate cases.
 * <h2>Algorithm</h2>
 * For each constituent polygon:
 * <ul>
 * <li>Determine a horizontal scan line on which the interior point will be located.
 * <li>Compute the sections of the scan line which lie in the interior of the polygon.
 * <li>Choose the widest interior section and take its midpoint as the interior point.
 * </ul>
 * The best interior point is the one with the widest scan line section.
 *
 * @jts InteriorPointArea
 */
export class InteriorPointArea {
  private interiorPoint: Coordinate | null = null;
  private maxWidth = -1;

  /**
   * Creates a new interior point finder for an areal geometry.
   *
   * @param g an areal geometry
   * @jts InteriorPointArea#InteriorPointArea(Geometry)
   */
  constructor(g: Geometry) {
    this.process(g);
  }

  /**
   * Gets the computed interior point.
   *
   * @return the coordinate of an interior point, or null if the input geometry is empty
   * @jts InteriorPointArea#getInteriorPoint()
   */
  getInteriorPoint(): Coordinate | null {
    return this.interiorPoint;
  }

  /**
   * Processes a geometry to determine the best interior point for all
   * component polygons.
   *
   * @param geom the geometry to process
   * @jts InteriorPointArea#process(Geometry)
   */
  private process(geom: Geometry): void {
    if (isGeometryEmpty(geom)) return;

    switch (geom.type) {
      case "Polygon":
        this.processPolygon(geom);
        break;
      // JTS's MultiPolygon is a GeometryCollection and falls through to the
      // collection branch there; GeoJSON's is not, so it is expanded here.
      case "MultiPolygon":
        for (const coordinates of geom.coordinates) {
          this.processPolygon({ type: "Polygon", coordinates });
        }
        break;
      case "GeometryCollection":
        for (const g of geom.geometries) this.process(g);
        break;
      default:
        break;
    }
  }

  /**
   * Computes an interior point of a component Polygon and updates the current
   * best interior point if appropriate.
   *
   * @param polygon the polygon to process
   * @jts InteriorPointArea#processPolygon(Polygon)
   */
  private processPolygon(polygon: Polygon): void {
    const intPtPoly = new InteriorPointPolygon(polygon);
    intPtPoly.process();
    const width = intPtPoly.getWidth();
    if (width > this.maxWidth) {
      this.maxWidth = width;
      this.interiorPoint = intPtPoly.getInteriorPoint();
    }
  }
}

/** @jts InteriorPointArea#avg(double,double) */
function avg(a: number, b: number): number {
  return (a + b) / 2.0;
}

/**
 * Computes an interior point for the polygonal components of a Geometry.
 *
 * @param geom the geometry to compute
 * @return the computed interior point, or null if the geometry has no polygonal components
 * @jts InteriorPointArea#getInteriorPoint(Geometry)
 * @jts-deviate module-level name — `getInteriorPoint` would collide with the
 *   same static factory in the other three modules.
 */
export function interiorPointArea(geom: Geometry): Coordinate | null {
  const intPt = new InteriorPointArea(geom);
  return intPt.getInteriorPoint();
}

/**
 * Computes an interior point in a single {@link Polygon},
 * as well as the width of the scan-line section it occurs in
 * to allow choosing the widest section occurrence.
 *
 * @jts InteriorPointArea.InteriorPointPolygon
 */
export class InteriorPointPolygon {
  private polygon: Polygon;
  /**
   * The shell's envelope, computed once and shared with
   * {@link ScanLineYOrdinateFinder} and {@link InteriorPointPolygon#scanRing}.
   *
   * @jts-deviate JTS's InteriorPointPolygon has no such field: it reads a cached
   *   `getEnvelopeInternal()` from the geometry, so both readers get the value
   *   for free. A GeoJSON Polygon cannot carry that cache, so the value is
   *   computed here once and passed down.
   */
  private shellEnvelope: Envelope;
  private interiorPointY: number;
  private interiorSectionWidth = 0.0;
  private interiorPoint: Coordinate | null = null;

  /**
   * Creates a new InteriorPointPolygon instance.
   *
   * @param polygon the polygon to test
   * @jts InteriorPointArea.InteriorPointPolygon#InteriorPointPolygon(Polygon)
   */
  constructor(polygon: Polygon) {
    this.polygon = polygon;
    // JTS reads `poly.getEnvelopeInternal()`, which for a Polygon is the
    // shell's envelope; `coordinates[0]` is that shell.
    this.shellEnvelope = envelopeInternal(polygon.coordinates[0]);
    this.interiorPointY = getScanLineY(polygon, this.shellEnvelope);
  }

  /**
   * Gets the computed interior point.
   *
   * @return the interior point coordinate, or null if the input geometry is empty
   * @jts InteriorPointArea.InteriorPointPolygon#getInteriorPoint()
   */
  getInteriorPoint(): Coordinate | null {
    return this.interiorPoint;
  }

  /**
   * Gets the width of the scanline section containing the interior point.
   * Used to determine the best point to use.
   *
   * @return the width
   * @jts InteriorPointArea.InteriorPointPolygon#getWidth()
   */
  getWidth(): number {
    return this.interiorSectionWidth;
  }

  /**
   * Compute the interior point.
   *
   * @jts InteriorPointArea.InteriorPointPolygon#process()
   */
  process(): void {
    // This results in returning a null Coordinate
    if (isGeometryEmpty(this.polygon)) return;

    // set default interior point in case polygon has zero area
    this.interiorPoint = [...this.polygon.coordinates[0][0]];

    const crossings: number[] = [];
    const rings = this.polygon.coordinates;
    this.scanRing(rings[0], this.shellEnvelope, crossings);
    for (let i = 1; i < rings.length; i++) {
      this.scanRing(rings[i], envelopeInternal(rings[i]), crossings);
    }
    this.findBestMidpoint(crossings);
  }

  /**
   * @jts InteriorPointArea.InteriorPointPolygon#scanRing(LinearRing,List<Double>)
   * @jts-deviate extra `env` parameter — JTS reads the ring's cached
   *   `getEnvelopeInternal()`. A GeoJSON ring is a bare coordinate array and
   *   cannot carry that cache, so the caller computes it and passes it in.
   */
  private scanRing(ring: Coordinate[], env: Envelope, crossings: number[]): void {
    // skip rings which don't cross scan line
    if (!this.intersectsHorizontalLineEnvelope(env, this.interiorPointY)) return;

    for (let i = 1; i < ring.length; i++) {
      const ptPrev = ring[i - 1];
      const pt = ring[i];
      this.addEdgeCrossing(ptPrev, pt, this.interiorPointY, crossings);
    }
  }

  /** @jts InteriorPointArea.InteriorPointPolygon#addEdgeCrossing(Coordinate,Coordinate,double,List<Double>) */
  private addEdgeCrossing(p0: Coordinate, p1: Coordinate, scanY: number, crossings: number[]): void {
    // skip non-crossing segments
    if (!this.intersectsHorizontalLineCoordinate(p0, p1, scanY)) return;
    if (!this.isEdgeCrossingCounted(p0, p1, scanY)) return;

    // edge intersects scan line, so add a crossing
    const xInt = this.intersection(p0, p1, scanY);
    crossings.push(xInt);
  }

  /**
   * Finds the midpoint of the widest interior section.
   * Sets the {@link #interiorPoint} location and the {@link #interiorSectionWidth}.
   *
   * @param crossings the list of scan-line crossing X ordinates
   * @jts InteriorPointArea.InteriorPointPolygon#findBestMidpoint(List<Double>)
   */
  private findBestMidpoint(crossings: number[]): void {
    // zero-area polygons will have no crossings
    if (crossings.length === 0) return;

    assertTrue(0 === crossings.length % 2, "Interior Point robustness failure: odd number of scanline crossings");

    // JTS sorts with Double::compare; JavaScript's default sort is
    // lexicographic, so the numeric comparator is mandatory here.
    crossings.sort((a, b) => a - b);
    /*
     * Entries in crossings list are expected to occur in pairs representing a
     * section of the scan line interior to the polygon (which may be zero-length)
     */
    for (let i = 0; i < crossings.length; i += 2) {
      const x1 = crossings[i];
      // crossings count must be even so this should be safe
      const x2 = crossings[i + 1];

      const width = x2 - x1;
      if (width > this.interiorSectionWidth) {
        this.interiorSectionWidth = width;
        const interiorPointX = avg(x1, x2);
        this.interiorPoint = [interiorPointX, this.interiorPointY];
      }
    }
  }

  /**
   * Tests if an edge intersection contributes to the crossing count.
   * Some crossing situations are not counted, to ensure that the list of
   * crossings captures strict inside/outside topology.
   *
   * @param p0 an endpoint of the segment
   * @param p1 an endpoint of the segment
   * @param scanY the Y-ordinate of the horizontal line
   * @return true if the edge crossing is counted
   * @jts InteriorPointArea.InteriorPointPolygon#isEdgeCrossingCounted(Coordinate,Coordinate,double)
   */
  private isEdgeCrossingCounted(p0: Coordinate, p1: Coordinate, scanY: number): boolean {
    const y0 = p0[1];
    const y1 = p1[1];
    // skip horizontal lines
    if (y0 === y1) return false;
    // handle cases where vertices lie on scan-line
    // downward segment does not include start point
    if (y0 === scanY && y1 < scanY) return false;
    // upward segment does not include endpoint
    if (y1 === scanY && y0 < scanY) return false;
    return true;
  }

  /**
   * Computes the intersection of a segment with a horizontal line.
   * The segment is expected to cross the horizontal line — this condition is
   * not checked. Computation uses regular double-precision arithmetic.
   *
   * @param p0 an endpoint of the segment
   * @param p1 an endpoint of the segment
   * @param y the Y-ordinate of the horizontal line
   * @jts InteriorPointArea.InteriorPointPolygon#intersection(Coordinate,Coordinate,double)
   */
  private intersection(p0: Coordinate, p1: Coordinate, y: number): number {
    const x0 = p0[0];
    const x1 = p1[0];

    if (x0 === x1) return x0;

    // Assert: segDX is non-zero, due to previous equality test
    const segDX = x1 - x0;
    const segDY = p1[1] - p0[1];
    const m = segDY / segDX;
    const x = x0 + (y - p0[1]) / m;
    return x;
  }

  /**
   * Tests if an envelope intersects a horizontal line.
   *
   * @param env the envelope to test
   * @param y the Y-ordinate of the horizontal line
   * @return true if the envelope and line intersect
   * @jts InteriorPointArea.InteriorPointPolygon#intersectsHorizontalLine(Envelope,double)
   */
  private intersectsHorizontalLineEnvelope(env: Envelope, y: number): boolean {
    if (y < env.minY) return false;
    if (y > env.maxY) return false;
    return true;
  }

  /**
   * Tests if a line segment intersects a horizontal line.
   *
   * @param p0 a segment endpoint
   * @param p1 a segment endpoint
   * @param y the Y-ordinate of the horizontal line
   * @return true if the segment and line intersect
   * @jts InteriorPointArea.InteriorPointPolygon#intersectsHorizontalLine(Coordinate,Coordinate,double)
   */
  private intersectsHorizontalLineCoordinate(p0: Coordinate, p1: Coordinate, y: number): boolean {
    // both ends above?
    if (p0[1] > y && p1[1] > y) return false;
    // both ends below?
    if (p0[1] < y && p1[1] < y) return false;
    // segment must intersect line
    return true;
  }
}

/**
 * Finds a safe scan line Y ordinate by projecting
 * the polygon segments to the Y axis and finding the
 * Y-axis interval which contains the centre of the Y extent.
 * The centre of this interval is returned as the scan line Y-ordinate.
 * <p>
 * Note that in the case of (degenerate, invalid) zero-area polygons the
 * computed Y value may be equal to a vertex Y-ordinate.
 *
 * @jts InteriorPointArea.ScanLineYOrdinateFinder
 */
export class ScanLineYOrdinateFinder {
  private poly: Polygon;
  private centreY: number;
  private hiY = Number.MAX_VALUE;
  private loY = -Number.MAX_VALUE;

  /**
   * @jts InteriorPointArea.ScanLineYOrdinateFinder#ScanLineYOrdinateFinder(Polygon)
   * @jts-deviate extra `shellEnvelope` parameter — JTS reads the cached
   *   `poly.getEnvelopeInternal()` here, which `InteriorPointPolygon` has
   *   already computed. Passing it in is what keeps the shell from being
   *   scanned twice.
   */
  constructor(poly: Polygon, shellEnvelope: Envelope) {
    this.poly = poly;

    // initialize using extremal values
    this.hiY = shellEnvelope.maxY;
    this.loY = shellEnvelope.minY;
    this.centreY = avg(this.loY, this.hiY);
  }

  /** @jts InteriorPointArea.ScanLineYOrdinateFinder#getScanLineY() */
  getScanLineY(): number {
    this.process(this.poly.coordinates[0]);
    for (let i = 1; i < this.poly.coordinates.length; i++) {
      this.process(this.poly.coordinates[i]);
    }
    const scanLineY = avg(this.hiY, this.loY);
    return scanLineY;
  }

  /** @jts InteriorPointArea.ScanLineYOrdinateFinder#process(LineString) */
  private process(line: Coordinate[]): void {
    for (const pt of line) {
      const y = pt[1];
      this.updateInterval(y);
    }
  }

  /** @jts InteriorPointArea.ScanLineYOrdinateFinder#updateInterval(double) */
  private updateInterval(y: number): void {
    if (y <= this.centreY) {
      if (y > this.loY) this.loY = y;
    } else if (y > this.centreY) {
      if (y < this.hiY) {
        this.hiY = y;
      }
    }
  }
}

/**
 * @jts InteriorPointArea.ScanLineYOrdinateFinder#getScanLineY(Polygon)
 * @jts-deviate module-level function — the factory/getter rule maps a static factory to a
 *   module level and the instance getter to a method; in Rust an associated
 *   function and a method of the same name would collide, so both languages
 *   place it here for symmetry. The extra `shellEnvelope` parameter forwards
 *   the value `InteriorPointPolygon` computed; see the constructor above.
 */
function getScanLineY(poly: Polygon, shellEnvelope: Envelope): number {
  const finder = new ScanLineYOrdinateFinder(poly, shellEnvelope);
  return finder.getScanLineY();
}
