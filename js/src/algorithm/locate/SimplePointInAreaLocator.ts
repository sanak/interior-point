import type { Geometry, Polygon } from "geojson";

import type { Coordinate } from "../../GeometryAdapter";
import {
  envelopeInternal,
  envelopeInternalGeometry,
  envelopeIntersectsCoordinate,
  isGeometryEmpty,
} from "../../GeometryAdapter";
import { BOUNDARY, EXTERIOR, INTERIOR } from "../../geom/Location";
import { locateInRing } from "../PointLocation";

/**
 * Computes the location of points relative to a polygonal geometry, using a
 * simple O(n) algorithm.
 *
 * The algorithm reports whether a point lies in the interior, exterior, or
 * exactly on the boundary of the geometry.
 *
 * This algorithm is suitable for use in cases where only a few points will be
 * tested.
 *
 * @jts SimplePointInAreaLocator
 */

/**
 * Determines the Location of a point in an areal geometry. The return value is
 * one of INTERIOR, BOUNDARY or EXTERIOR.
 *
 * @param p the point to test
 * @param geom the areal geometry to test
 * @return the Location of the point in the geometry
 * @jts SimplePointInAreaLocator#locate(Coordinate,Geometry)
 */
export function locate(p: Coordinate, geom: Geometry): number {
  if (isGeometryEmpty(geom)) return EXTERIOR;
  /*
   * Do a fast check against the geometry envelope first
   */
  if (!envelopeIntersectsCoordinate(envelopeInternalGeometry(geom), p)) return EXTERIOR;

  return locateInGeometry(p, geom);
}

/**
 * @jts SimplePointInAreaLocator#locateInGeometry(Coordinate,Geometry)
 * @jts-deviate GeometryCollectionIterator — JTS walks a collection with a deep
 *   preorder iterator that yields the collection itself first (hence its
 *   `g2 != geom` guard) and then its children recursively. This function returns
 *   as soon as it sees anything other than EXTERIOR, so visiting a nested
 *   collection before its leaves cannot change the answer: plain recursion over
 *   children is equivalent, and no fifth Java file has to be vendored.
 * @jts-deviate MultiPolygon — JTS reaches it through
 *   `MultiPolygon extends GeometryCollection`, a supertype GeoJSON does not have,
 *   so it is matched directly. An empty member needs no guard here because
 *   `locatePointInPolygon` begins with an emptiness check.
 */
function locateInGeometry(p: Coordinate, geom: Geometry): number {
  if (geom.type === "Polygon") {
    return locatePointInPolygon(p, geom);
  }

  if (geom.type === "MultiPolygon") {
    for (const coordinates of geom.coordinates) {
      const loc = locatePointInPolygon(p, { type: "Polygon", coordinates });
      if (loc !== EXTERIOR) return loc;
    }
  }

  if (geom.type === "GeometryCollection") {
    for (const g2 of geom.geometries) {
      const loc = locateInGeometry(p, g2);
      if (loc !== EXTERIOR) return loc;
    }
  }
  return EXTERIOR;
}

/**
 * Determines the Location of a point in a Polygon. The return value is one of
 * INTERIOR, BOUNDARY or EXTERIOR.
 *
 * @param p the point to test
 * @param poly the geometry to test
 * @return the Location of the point in the polygon
 * @jts SimplePointInAreaLocator#locatePointInPolygon(Coordinate,Polygon)
 */
export function locatePointInPolygon(p: Coordinate, poly: Polygon): number {
  if (isGeometryEmpty(poly)) return EXTERIOR;
  const shell = poly.coordinates[0];
  const shellLoc = locatePointInRing(p, shell);
  if (shellLoc !== INTERIOR) return shellLoc;

  // now test if the point lies in or on the holes
  for (let i = 1; i < poly.coordinates.length; i++) {
    const hole = poly.coordinates[i];
    const holeLoc = locatePointInRing(p, hole);
    if (holeLoc === BOUNDARY) return BOUNDARY;
    if (holeLoc === INTERIOR) return EXTERIOR;
    // if in EXTERIOR of this hole keep checking the other ones
  }
  // If not in any hole must be inside polygon
  return INTERIOR;
}

/**
 * Determines whether a point lies in a ring, using the ring envelope to
 * short-circuit if possible.
 *
 * @param p the point to test
 * @param ring a linear ring
 * @return the Location of the point relative to the ring
 * @jts SimplePointInAreaLocator#locatePointInRing(Coordinate,LinearRing)
 */
function locatePointInRing(p: Coordinate, ring: Coordinate[]): number {
  // short-circuit if point is not in ring envelope
  if (!envelopeIntersectsCoordinate(envelopeInternal(ring), p)) return EXTERIOR;
  return locateInRing(p, ring);
}

/**
 * An instance-based point-in-area locator over one areal geometry.
 *
 * JTS's static `locate(Coordinate,Geometry)` and instance `locate(Coordinate)`
 * both keep the bare JTS name under the factory/getter rule — a static method sharing a name
 * with an instance method is a factory/getter pair, not an overload set. The
 * module-level function above is the static one.
 *
 * @jts SimplePointInAreaLocator#SimplePointInAreaLocator(Geometry)
 */
export class SimplePointInAreaLocator {
  private geom: Geometry;

  constructor(geom: Geometry) {
    this.geom = geom;
  }

  /**
   * Determines the Location of a point in this areal geometry.
   *
   * @param p the point to test
   * @return the Location of the point in the geometry
   * @jts SimplePointInAreaLocator#locate(Coordinate)
   */
  locate(p: Coordinate): number {
    return locate(p, this.geom);
  }
}
