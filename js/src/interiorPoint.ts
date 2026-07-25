import type { Geometry } from "geojson";

import type { Coordinate } from "./geometryAdapter";
import { dimension, isGeometryEmpty } from "./geometryAdapter";
import { interiorPointArea } from "./interiorPointArea";
import { interiorPointLine } from "./interiorPointLine";
import { interiorPointPoint } from "./interiorPointPoint";

/**
 * Computes a location of an interior point in a {@link Geometry}.
 * Handles all geometry types.
 *
 * @param geom a geometry in which to find an interior point
 * @return the location of an interior point, or <code>null</code> if the input is empty
 * @jts InteriorPoint#getInteriorPoint(Geometry)
 * @jts-deviate module-level name — `getInteriorPoint` would collide with the
 *   same static factory in the other three modules. This is the
 *   package's only public entry point, so it also takes `null` for an absent
 *   geometry, which JTS expresses as an empty Geometry instance.
 */
export function interiorPoint(geom: Geometry | null): Coordinate | null {
  if (geom === null) return null;
  if (isGeometryEmpty(geom)) return null;

  let interiorPt: Coordinate | null = null;
  const dim = dimensionNonEmpty(geom);
  // this should not happen, but just in case...
  if (dim < 0) {
    return null;
  }
  if (dim === 0) {
    interiorPt = interiorPointPoint(geom);
  } else if (dim === 1) {
    interiorPt = interiorPointLine(geom);
  } else {
    interiorPt = interiorPointArea(geom);
  }
  return interiorPt;
}

/** @jts InteriorPoint#dimensionNonEmpty(Geometry) */
function dimensionNonEmpty(geom: Geometry): number {
  // JTS builds the filter and applies it; here the filter is the traversal,
  // so this is a single call.
  return dimensionNonEmptyFilter(geom);
}

/**
 * @jts InteriorPoint.DimensionNonEmptyFilter#filter(Geometry)
 * @jts InteriorPoint.DimensionNonEmptyFilter#getDimension()
 * @jts-deviate GeometryFilter / Geometry.apply() are not part of the adapted
 *   geometry model, so the filter becomes a recursive traversal with identical
 *   semantics. The receptacle is preserved: the function keeps the filter's
 *   name and its body mirrors `filter(Geometry elem)`, returning what
 *   `getDimension()` would have reported, per the structure rule.
 */
function dimensionNonEmptyFilter(elem: Geometry): number {
  let dim = -1;
  if (elem.type === "GeometryCollection") {
    for (const g of elem.geometries) {
      const elemDim = dimensionNonEmptyFilter(g);
      if (elemDim > dim) dim = elemDim;
    }
    return dim;
  }
  if (!isGeometryEmpty(elem)) {
    const elemDim = dimension(elem);
    if (elemDim > dim) dim = elemDim;
  }
  return dim;
}
