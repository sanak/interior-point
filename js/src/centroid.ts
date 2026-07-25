import type { Geometry, Polygon } from "geojson";

import type { Coordinate } from "./geometryAdapter";
import { distance, isGeometryEmpty } from "./geometryAdapter";
import { isCCWCoordinates } from "./orientation";

/**
 * Computes the centroid of a Geometry of any dimension.
 * For collections the centroid is computed for the collection of
 * non-empty elements of highest dimension.
 * The centroid of an empty geometry is `null`.
 *
 * <h3>Algorithm</h3>
 *
 * - **Dimension 2** - the centroid is computed as the weighted sum of the
 *   centroids of a decomposition of the area into (possibly overlapping)
 *   triangles. Holes and multipolygons are handled correctly.
 * - **Dimension 1** - Computes the average of the midpoints of all line
 *   segments weighted by the segment length. Zero-length lines are treated as
 *   points.
 * - **Dimension 0** - Compute the average coordinate over all points. Repeated
 *   points are all included in the average.
 *
 * @jts Centroid
 */
export class Centroid {
  private areaBasePt: Coordinate | null = null; // the point all triangles are based at
  private triangleCent3: Coordinate = [0, 0]; // temporary variable to hold centroid of triangle
  private areasum2 = 0; /* Partial area sum */
  private cg3: Coordinate = [0, 0]; // partial centroid sum

  // data for linear centroid computation, if needed
  private lineCentSum: Coordinate = [0, 0];
  private totalLength = 0.0;

  private ptCount = 0;
  private ptCentSum: Coordinate = [0, 0];

  /**
   * Creates a new instance for computing the centroid of a geometry
   *
   * @jts Centroid#Centroid(Geometry)
   */
  constructor(geom: Geometry) {
    this.areaBasePt = null;
    this.addGeometry(geom);
  }

  /**
   * Adds a Geometry to the centroid total.
   *
   * @param geom the geometry to add
   * @jts Centroid#add(Geometry)
   */
  private addGeometry(geom: Geometry): void {
    if (isGeometryEmpty(geom)) return;
    switch (geom.type) {
      case "Point":
        this.addPoint(geom.coordinates);
        break;
      case "LineString":
        this.addLineSegments(geom.coordinates);
        break;
      case "Polygon":
        this.addPolygon(geom);
        break;
      // JTS's MultiPoint, MultiLineString and MultiPolygon are all
      // GeometryCollections, so they fall through to the collection branch
      // there. GeoJSON's are not, so the adapter expands them here.
      case "MultiPoint":
        for (const c of geom.coordinates) this.addPoint(c);
        break;
      case "MultiLineString":
        for (const c of geom.coordinates) this.addLineSegments(c);
        break;
      case "MultiPolygon":
        for (const rings of geom.coordinates) this.addPolygon({ type: "Polygon", coordinates: rings });
        break;
      case "GeometryCollection":
        for (const g of geom.geometries) this.addGeometry(g);
        break;
    }
  }

  /**
   * Gets the computed centroid.
   *
   * @return the computed centroid, or null if the input is empty
   * @jts Centroid#getCentroid()
   */
  getCentroid(): Coordinate | null {
    /*
     * The centroid is computed from the highest dimension components present in the input.
     * I.e. areas dominate lineal geometry, which dominates points.
     * Degenerate geometry are computed using their effective dimension
     * (e.g. areas may degenerate to lines or points)
     */
    const cent: Coordinate = [0, 0];
    if (Math.abs(this.areasum2) > 0.0) {
      /*
       * Input contains areal geometry
       */
      cent[0] = this.cg3[0] / 3 / this.areasum2;
      cent[1] = this.cg3[1] / 3 / this.areasum2;
    } else if (this.totalLength > 0.0) {
      /*
       * Input contains lineal geometry
       */
      cent[0] = this.lineCentSum[0] / this.totalLength;
      cent[1] = this.lineCentSum[1] / this.totalLength;
    } else if (this.ptCount > 0) {
      /*
       * Input contains puntal geometry only
       */
      cent[0] = this.ptCentSum[0] / this.ptCount;
      cent[1] = this.ptCentSum[1] / this.ptCount;
    } else {
      return null;
    }
    return cent;
  }

  /** @jts Centroid#setAreaBasePoint(Coordinate) */
  private setAreaBasePoint(basePt: Coordinate): void {
    this.areaBasePt = basePt;
  }

  /** @jts Centroid#add(Polygon) */
  private addPolygon(poly: Polygon): void {
    this.addShell(poly.coordinates[0]);
    for (let i = 0; i < poly.coordinates.length - 1; i++) {
      this.addHole(poly.coordinates[i + 1]);
    }
  }

  /** @jts Centroid#addShell(Coordinate[]) */
  private addShell(pts: Coordinate[]): void {
    if (pts.length > 0) this.setAreaBasePoint(pts[0]);
    const isPositiveArea = !isCCWCoordinates(pts);
    for (let i = 0; i < pts.length - 1; i++) {
      this.addTriangle(this.areaBasePt!, pts[i], pts[i + 1], isPositiveArea);
    }
    this.addLineSegments(pts);
  }

  /** @jts Centroid#addHole(Coordinate[]) */
  private addHole(pts: Coordinate[]): void {
    const isPositiveArea = isCCWCoordinates(pts);
    for (let i = 0; i < pts.length - 1; i++) {
      this.addTriangle(this.areaBasePt!, pts[i], pts[i + 1], isPositiveArea);
    }
    this.addLineSegments(pts);
  }

  /** @jts Centroid#addTriangle(Coordinate,Coordinate,Coordinate,boolean) */
  private addTriangle(p0: Coordinate, p1: Coordinate, p2: Coordinate, isPositiveArea: boolean): void {
    const sign = isPositiveArea ? 1.0 : -1.0;
    Centroid.centroid3(p0, p1, p2, this.triangleCent3);
    const area2 = Centroid.area2(p0, p1, p2);
    this.cg3[0] += sign * area2 * this.triangleCent3[0];
    this.cg3[1] += sign * area2 * this.triangleCent3[1];
    this.areasum2 += sign * area2;
  }

  /**
   * Computes three times the centroid of the triangle p1-p2-p3.
   * The factor of 3 is
   * left in to permit division to be avoided until later.
   *
   * @jts Centroid#centroid3(Coordinate,Coordinate,Coordinate,Coordinate)
   */
  private static centroid3(p1: Coordinate, p2: Coordinate, p3: Coordinate, c: Coordinate): void {
    c[0] = p1[0] + p2[0] + p3[0];
    c[1] = p1[1] + p2[1] + p3[1];
    return;
  }

  /**
   * Returns twice the signed area of the triangle p1-p2-p3.
   * The area is positive if the triangle is oriented CCW, and negative if CW.
   *
   * @jts Centroid#area2(Coordinate,Coordinate,Coordinate)
   */
  private static area2(p1: Coordinate, p2: Coordinate, p3: Coordinate): number {
    return (p2[0] - p1[0]) * (p3[1] - p1[1]) - (p3[0] - p1[0]) * (p2[1] - p1[1]);
  }

  /**
   * Adds the line segments defined by an array of coordinates
   * to the linear centroid accumulators.
   *
   * @param pts an array of Coordinates
   * @jts Centroid#addLineSegments(Coordinate[])
   */
  private addLineSegments(pts: Coordinate[]): void {
    let lineLen = 0.0;
    for (let i = 0; i < pts.length - 1; i++) {
      const segmentLen = distance(pts[i], pts[i + 1]);
      if (segmentLen === 0.0) continue;

      lineLen += segmentLen;

      const midx = (pts[i][0] + pts[i + 1][0]) / 2;
      this.lineCentSum[0] += segmentLen * midx;
      const midy = (pts[i][1] + pts[i + 1][1]) / 2;
      this.lineCentSum[1] += segmentLen * midy;
    }
    this.totalLength += lineLen;
    if (lineLen === 0.0 && pts.length > 0) this.addPoint(pts[0]);
  }

  /**
   * Adds a point to the point centroid accumulator.
   *
   * @param pt a Coordinate
   * @jts Centroid#addPoint(Coordinate)
   */
  private addPoint(pt: Coordinate): void {
    this.ptCount += 1;
    this.ptCentSum[0] += pt[0];
    this.ptCentSum[1] += pt[1];
  }
}

/**
 * Computes the centroid point of a geometry.
 *
 * @param geom the geometry to use
 * @return the centroid point, or null if the geometry is empty
 * @jts Centroid#getCentroid(Geometry)
 */
export function getCentroid(geom: Geometry): Coordinate | null {
  const cent = new Centroid(geom);
  return cent.getCentroid();
}
