import type { Geometry, Position } from "geojson";
import { interiorPointArea } from "./interiorPointArea";
import { interiorPointLine } from "./interiorPointLine";
import { interiorPointPoint } from "./interiorPointPoint";

/**
 * Computes an interior point (representative point) of a geometry.
 * Ported from JTS InteriorPoint.java.
 *
 * For collections, the interior point is computed for the collection of
 * non-empty elements of highest dimension:
 * - Dimension 2 (Area): Polygon, MultiPolygon → scanline algorithm
 * - Dimension 1 (Line): LineString, MultiLineString → nearest vertex to centroid
 * - Dimension 0 (Point): Point, MultiPoint → nearest point to centroid
 *
 * @param geometry - A GeoJSON Geometry, or null (representing an empty geometry)
 * @returns A position [x, y] inside the geometry, or null if the geometry is empty
 */
export function interiorPoint(geometry: Geometry | null): Position | null {
  if (geometry === null) return null;

  const dim = dimensionNonEmpty(geometry);
  if (dim < 0) return null;

  if (dim === 2) return interiorPointArea(geometry);
  if (dim === 1) return interiorPointLine(geometry);
  return interiorPointPoint(geometry);
}

/**
 * Determines the highest dimension of non-empty components in a geometry.
 * Returns -1 if no non-empty components exist.
 */
function dimensionNonEmpty(geometry: Geometry): number {
  if (isGeometryEmpty(geometry)) return -1;

  switch (geometry.type) {
    case "Point":
    case "MultiPoint":
      return 0;
    case "LineString":
    case "MultiLineString":
      return 1;
    case "Polygon":
    case "MultiPolygon":
      return 2;
    case "GeometryCollection": {
      let maxDim = -1;
      for (const g of geometry.geometries) {
        const d = dimensionNonEmpty(g);
        if (d > maxDim) maxDim = d;
      }
      return maxDim;
    }
  }
}

/** Check if a GeoJSON geometry is empty. */
function isGeometryEmpty(geometry: Geometry): boolean {
  switch (geometry.type) {
    case "Point":
      return geometry.coordinates.length === 0;
    case "MultiPoint":
    case "LineString":
      return geometry.coordinates.length === 0;
    case "MultiLineString":
    case "Polygon":
      return geometry.coordinates.length === 0;
    case "MultiPolygon":
      return geometry.coordinates.length === 0;
    case "GeometryCollection":
      return geometry.geometries.length === 0 || geometry.geometries.every(isGeometryEmpty);
  }
}
