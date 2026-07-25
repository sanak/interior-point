import type { Geometry } from "geojson";

import { getCentroid } from "./centroid";
import type { Coordinate } from "./geometryAdapter";
import { distance, isGeometryEmpty } from "./geometryAdapter";

/**
 * Computes a point in the interior of an point geometry.
 * <h2>Algorithm</h2>
 * Find a point which is closest to the centroid of the geometry.
 *
 * @jts InteriorPointPoint
 */
export class InteriorPointPoint {
  private centroid: Coordinate | null;
  private minDistance = Number.MAX_VALUE;
  private interiorPoint: Coordinate | null = null;

  /** @jts InteriorPointPoint#InteriorPointPoint(Geometry) */
  constructor(g: Geometry) {
    this.centroid = getCentroid(g);
    this.addGeometry(g);
  }

  /**
   * Tests the point(s) defined by a Geometry for the best inside point.
   * If a Geometry is not of dimension 0 it is not tested.
   *
   * @param geom the geometry to add
   * @jts InteriorPointPoint#add(Geometry)
   */
  private addGeometry(geom: Geometry): void {
    if (isGeometryEmpty(geom)) return;

    switch (geom.type) {
      case "Point":
        this.addCoordinate(geom.coordinates);
        break;
      // JTS's MultiPoint is a GeometryCollection and falls through to the
      // collection branch there; GeoJSON's is not, so it is expanded here.
      case "MultiPoint":
        for (const c of geom.coordinates) this.addCoordinate(c);
        break;
      case "GeometryCollection":
        for (const g of geom.geometries) this.addGeometry(g);
        break;
      default:
        break;
    }
  }

  /** @jts InteriorPointPoint#add(Coordinate) */
  private addCoordinate(point: Coordinate): void {
    // `centroid` is null only for an empty input, which returns from
    // addGeometry before this is reachable.
    const dist = distance(point, this.centroid as Coordinate);
    if (dist < this.minDistance) {
      this.interiorPoint = [...point];
      this.minDistance = dist;
    }
  }

  /**
   * Gets the computed interior point.
   *
   * @return the computed interior point, or null if the input geometry is empty
   * @jts InteriorPointPoint#getInteriorPoint()
   */
  getInteriorPoint(): Coordinate | null {
    return this.interiorPoint;
  }
}

/**
 * Computes an interior point for the puntal components of a Geometry.
 *
 * @param geom the geometry to compute
 * @return the computed interior point, or null if the geometry has no puntal components
 * @jts InteriorPointPoint#getInteriorPoint(Geometry)
 * @jts-deviate module-level name — `getInteriorPoint` would collide with the
 *   same static factory in the other three modules.
 */
export function interiorPointPoint(geom: Geometry): Coordinate | null {
  const intPt = new InteriorPointPoint(geom);
  return intPt.getInteriorPoint();
}
