import type { Geometry } from "geojson";

import { getCentroid } from "./Centroid";
import type { Coordinate } from "../GeometryAdapter";
import { distance, isGeometryEmpty } from "../GeometryAdapter";

/**
 * Computes a point in the interior of an linear geometry.
 * <h2>Algorithm</h2>
 * <ul>
 * <li>Find an interior vertex which is closest to the centroid of the linestring.
 * <li>If there is no interior vertex, find the endpoint which is closest to the centroid.
 * </ul>
 *
 * @jts InteriorPointLine
 */
export class InteriorPointLine {
  private centroid: Coordinate | null;
  private minDistance = Number.MAX_VALUE;
  private interiorPoint: Coordinate | null = null;

  /** @jts InteriorPointLine#InteriorPointLine(Geometry) */
  constructor(g: Geometry) {
    this.centroid = getCentroid(g);
    this.addInteriorGeometry(g);
    if (this.interiorPoint === null) this.addEndpointsGeometry(g);
  }

  /** @jts InteriorPointLine#getInteriorPoint() */
  getInteriorPoint(): Coordinate | null {
    return this.interiorPoint;
  }

  /**
   * Tests the interior vertices (if any)
   * defined by a linear Geometry for the best inside point.
   * If a Geometry is not of dimension 1 it is not tested.
   *
   * @param geom the geometry to add
   * @jts InteriorPointLine#addInterior(Geometry)
   */
  private addInteriorGeometry(geom: Geometry): void {
    if (isGeometryEmpty(geom)) return;

    switch (geom.type) {
      case "LineString":
        this.addInteriorCoordinates(geom.coordinates);
        break;
      // JTS's MultiLineString is a GeometryCollection; GeoJSON's is not.
      case "MultiLineString":
        for (const c of geom.coordinates) {
          // Stands in for the `geom.isEmpty()` guard JTS applies to each child
          // LineString on the way down; flattening the recursion would lose it.
          if (c.length === 0) continue;
          this.addInteriorCoordinates(c);
        }
        break;
      case "GeometryCollection":
        for (const g of geom.geometries) this.addInteriorGeometry(g);
        break;
      default:
        break;
    }
  }

  /** @jts InteriorPointLine#addInterior(Coordinate[]) */
  private addInteriorCoordinates(pts: Coordinate[]): void {
    for (let i = 1; i < pts.length - 1; i++) {
      this.add(pts[i]);
    }
  }

  /**
   * Tests the endpoint vertices
   * defined by a linear Geometry for the best inside point.
   * If a Geometry is not of dimension 1 it is not tested.
   *
   * @param geom the geometry to add
   * @jts InteriorPointLine#addEndpoints(Geometry)
   */
  private addEndpointsGeometry(geom: Geometry): void {
    if (isGeometryEmpty(geom)) return;

    switch (geom.type) {
      case "LineString":
        this.addEndpointsCoordinates(geom.coordinates);
        break;
      // JTS's MultiLineString is a GeometryCollection; GeoJSON's is not.
      case "MultiLineString":
        for (const c of geom.coordinates) {
          // As above: JTS's recursion checks each child LineString for
          // emptiness. Without this, `pts[0]` below would be undefined.
          if (c.length === 0) continue;
          this.addEndpointsCoordinates(c);
        }
        break;
      case "GeometryCollection":
        for (const g of geom.geometries) this.addEndpointsGeometry(g);
        break;
      default:
        break;
    }
  }

  /** @jts InteriorPointLine#addEndpoints(Coordinate[]) */
  private addEndpointsCoordinates(pts: Coordinate[]): void {
    this.add(pts[0]);
    this.add(pts[pts.length - 1]);
  }

  /** @jts InteriorPointLine#add(Coordinate) */
  private add(point: Coordinate): void {
    // `centroid` is null only for an empty input, which returns from the
    // traversals above before this is reachable.
    const dist = distance(point, this.centroid as Coordinate);
    if (dist < this.minDistance) {
      this.interiorPoint = [...point];
      this.minDistance = dist;
    }
  }
}

/**
 * Computes an interior point for the linear components of a Geometry.
 *
 * @param geom the geometry to compute
 * @return the computed interior point, or null if the geometry has no linear components
 * @jts InteriorPointLine#getInteriorPoint(Geometry)
 * @jts-deviate module-level name — `getInteriorPoint` would collide with the
 *   same static factory in the other three modules.
 */
export function interiorPointLine(geom: Geometry): Coordinate | null {
  const intPt = new InteriorPointLine(geom);
  return intPt.getInteriorPoint();
}
